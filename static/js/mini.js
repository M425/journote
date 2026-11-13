'use strict';

/**
 * mini.js — Small browser framework built around four cooperating services.
 *
 * SERVICES
 * - mn.ev: keyed publish/subscribe event bus.
 * - mn.st: shared models with synchronous updates and lazy async loading.
 * - mn.vu: DOM view registration, rendering, subscriptions, and cleanup.
 * - mn.rt: hash router that stores the current destination in model "page".
 *
 * MODULE CONTRACT
 * Each file returned by GET /modules must export a default view definition.
 * Its filename without ".js" becomes its view key.
 *
 * Supported module properties:
 * - mnStates: model definition or array of model definitions.
 *   Each model uses { key, value, load? }. The model loader is still "load".
 * - mnCss(): returns CSS text injected globally during registration.
 * - mnLoad(view): optional preparation hook, awaited before content creation.
 * - mnContent(view): required hook returning HTML or DOM-compatible children.
 * - mnRender(view): optional hook called after content is inserted.
 * - mnSubscribe(view): returns a synchronous { eventId: callback } object.
 * - mnRerender: array of model keys whose changes trigger a full rerender.
 * - mnRendered(view): optional hook called after descendant views finish.
 *
 * RUNTIME VIEW API
 * Each render creates a new shallow copy of the module definition and adds:
 * - mnProps: the host element's miniProps value, or an empty object.
 * - mnDom: the host element.
 * - mnKey: the host element's mini-key attribute.
 * - mnSignal: AbortSignal aborted when this render instance is disposed.
 * - mnIsActive(): whether this is still the current connected instance.
 * - mnCleanup(fn): registers a cleanup function for this render instance.
 * - mnRefresh(): starts a full rerender if this instance is still active.
 *
 * Hooks are invoked as view methods with the view also passed as an argument.
 * mnRender and mnRendered may return a cleanup function, synchronously or
 * asynchronously. mnCleanup is an injected registration method, not a
 * module lifecycle hook.
 *
 * RENDER ORDER
 * Dispose previous instance and descendants -> mnLoad -> mnContent ->
 * insert content -> mnRender -> register subscriptions -> mark rendered ->
 * render descendants -> mnRendered.
 *
 * Rendering replaces content; there is no virtual DOM or DOM diffing.
 * Instance identity checks prevent obsolete async renders from continuing
 * framework-managed work. Application async work should also use mnSignal
 * or mnIsActive() before performing its own delayed side effects.
 *
 * BOOTSTRAP
 * await mn.init({ router: { '/': destination, '*': fallback } });
 * await mn.run();
 *
 * Hosts use <element mini-key="moduleName"></element>.
 * Pass host properties through element.miniProps; hooks read view.mnProps.
 * Import this file as an ES module. It also exposes window.mn.
 */
const mn = {
  /* ==============================================================
   * EVENTS
   * ============================================================== */

  ev: {
    // eventId -> Map(subscriberKey -> subscription record).
    // Registering the same subscriber key replaces its callback.
    _eventmap: new Map(),

    // Replace this handler to customize subscriber error reporting.
    onError(error, eventId) {
      console.error('[event] Evento:', eventId, error);
    },

    // Register a callback and return an identity-safe unsubscribe function.
    sub(eventId, subscriberKey, callback) {
      if (typeof callback !== 'function') {
        throw new TypeError('La callback deve essere una funzione');
      }

      let subscribers = this._eventmap.get(eventId);

      if (!subscribers) {
        subscribers = new Map();
        this._eventmap.set(eventId, subscribers);
      }

      const subscription = {
        callback,
        subscriberKey,
        eventId
      };

      subscribers.set(subscriberKey, subscription);

      return () => {
        // An old unsubscribe must not remove a replacement subscription.
        if (subscribers.get(subscriberKey) !== subscription) {
          return;
        }

        subscribers.delete(subscriberKey);

        if (
          subscribers.size === 0 &&
          this._eventmap.get(eventId) === subscribers
        ) {
          this._eventmap.delete(eventId);
        }
      };
    },

    /**
     * Notify a snapshot of subscribers sequentially.
     *
     * New subscriptions are excluded from this publication. Subscriptions
     * removed or replaced before their turn are skipped. Callback errors
     * are reported without stopping the remaining callbacks.
     *
     * Separate pub() calls can overlap; there is no global event queue.
     */
    async pub(eventId, payload) {
      console.log(
        `%c[event] pub %c${eventId}`,
        'color: #519d7b;',
        'background: #fffde3; color: #519d7b;',
        payload
      );

      const subscribers = this._eventmap.get(eventId);
      if (!subscribers) return;

      const snapshot = Array.from(subscribers.entries());

      for (const [key, subscription] of snapshot) {
        if (subscribers.get(key) !== subscription) continue;

        try {
          console.log(
            `%c[event] %cfire%c %c${key.key}`,
            'color: #519d7b;',
            'background: #519d7b; color: white;',
            'background: white; color: black;',
            'background: #fffde3; color: #519d7b;',
          );

          const result = subscription.callback(payload);

          await Promise.resolve(result).catch(error => {
            mn.miniReportError(this, error, eventId);
          });
        } catch (error) {
          mn.miniReportError(this, error, eventId);
        }
      }
    }
  },

  /* ==============================================================
   * MODELS
   * ============================================================== */

  st: {
    // Model keys map to internal state records, not directly to values.
    model: Object.create(null),

    // Resolve an existing model; reads and writes never create models.
    _state(key) {
      if (typeof key !== 'string') {
        throw new TypeError('La chiave del modello deve essere una stringa');
      }

      if (!Object.hasOwn(this.model, key)) {
        throw new Error(`Modello non inizializzato: ${key}`);
      }

      return this.model[key];
    },

    /**
     * Register one model definition or an array of definitions.
     *
     * Definition: { key: string, value: any, load?: function }.
     * Existing keys are preserved. Model "key" and "load" are distinct
     * from runtime view "mnKey" and lifecycle hook "mnLoad".
     */
    init(input) {
      const definitions = Array.isArray(input) ? input : [input];

      // Validate all definitions before changing the registry.
      for (const definition of definitions) {
        if (!definition || typeof definition.key !== 'string') {
          throw new TypeError('Ogni modello deve avere una chiave stringa');
        }

        if (
          definition.load != null &&
          typeof definition.load !== 'function'
        ) {
          throw new TypeError(`Loader non valido: ${definition.key}`);
        }
      }

      for (const { key, value, load } of definitions) {
        if (Object.hasOwn(this.model, key)) continue;

        this.model[key] = {
          _v: value,
          load,
          // Every committed write advances the revision, even if unchanged.
          revision: 0,
          // Shared in-flight lazy load, or null when no load is tracked.
          pending: null
        };
      }
    },

    // Return the current value by reference; objects are not cloned.
    get(key) {
      return this._state(key)._v;
    },

    // Compatibility shorthand for a single-model update.
    _set(key, value) {
      return this.set({ key, value });
    },

    /**
     * Synchronously update one model or a batch of models.
     *
     * Each update uses { key, value }, where value may be an updater:
     * previousValue => nextValue.
     *
     * To store a function as data, wrap it: value: () => functionValue.
     * Repeated keys in a batch are evaluated in order.
     *
     * Updaters should not mutate their inputs: computation happens before
     * assignment, but shared object mutations cannot be rolled back.
     *
     * All values are committed before events are published. Only values
     * different under Object.is produce "model-set-${key}" events.
     * Event completion is not awaited by set().
     */
    set(input) {
      console.log('[mini] mModel set', input);

      const updates = Array.isArray(input) ? input : [input];
      const nextValues = new Map();

      // Phase 1: calculate final values without assigning model state.
      for (const update of updates) {
        if (!update || typeof update !== 'object') {
          throw new TypeError('Aggiornamento del modello non valido');
        }

        const { key, value } = update;
        const state = this._state(key);

        const previous = nextValues.has(key)
          ? nextValues.get(key)
          : state._v;

        const next = typeof value === 'function'
          ? value(previous)
          : value;

        nextValues.set(key, next);
      }

      // Phase 2: commit every value before notifying subscribers.
      const changes = [];

      for (const [key, value] of nextValues) {
        const state = this._state(key);
        const changed = !Object.is(state._v, value);

        state._v = value;
        state.revision += 1;

        // A write invalidates an older load's result without cancelling
        // the underlying loader operation.
        state.pending = null;

        if (changed) {
          changes.push({
            key,
            value,
            revision: state.revision
          });
        }
      }

      // Phase 3: publish only changes whose revisions are still current.
      for (const change of changes) {
        const state = this._state(change.key);

        // A subscriber from an earlier publication may have written again.
        if (state.revision !== change.revision) continue;

        mn.ev.pub(`model-set-${change.key}`, change.value);
      }

      // Repeated keys receive their final computed value at each position.
      if (Array.isArray(input)) {
        return updates.map(update => nextValues.get(update.key));
      }

      return nextValues.get(input.key);
    },

    /**
     * Lazily load a null/undefined value, sharing concurrent loader work.
     *
     * Values such as false, 0, and "" are already loaded.
     * The loader receives the internal state record as "this".
     * A newer write prevents an older result from overwriting that write.
     * Loader errors propagate to the caller.
     */
    async load(key) {
      const state = this._state(key);

      if (state._v != null || !state.load) {
        return state._v;
      }

      if (state.pending) {
        return state.pending;
      }

      const revisionAtStart = state.revision;

      const request = Promise.resolve()
        .then(() => {
          // A write may occur before this deferred loader invocation.
          if (state.revision !== revisionAtStart) {
            return state._v;
          }

          return state.load.call(state);
        })
        .then(value => {
          if (state.revision === revisionAtStart) {
            // Store function-valued results as data, not updater callbacks.
            this.set({ key, value: () => value });
          }

          return state._v;
        })
        .finally(() => {
          // An older request must not clear a newer tracked request.
          if (state.pending === request) {
            state.pending = null;
          }
        });

      state.pending = request;
      return request;
    },

    /**
     * Clear the cached value and wait for load().
     *
     * The direct reset does not publish an event or advance the revision.
     * An already pending request is reused. This method returns no value.
     */
    async reload(key) {
      this.model[key]._v = null;
      await this.load(key);
    }
  },

  /* ==============================================================
   * VIEWS
   * ============================================================== */

  vu: {
    // Shared module definitions indexed by mini-key.
    _views: Object.create(null),

    // Host DOM element -> current render record.
    // Multiple elements may use the same definition independently.
    _instances: new Map(),

    _observer: null,

    // Replace this handler to customize cleanup and DOM callback errors.
    onError(error) {
      console.error('[mini] Vista:', error);
    },

    /**
     * Register definitions and inject their optional global CSS.
     *
     * mnContent is required. Other lifecycle hooks are optional.
     * mnCss is evaluated synchronously during registration, not per render.
     * Styles are not scoped or removed on unmount.
     */
    init(views) {
      const definitions = Object.entries(views);

      for (const [key, definition] of definitions) {
        if (!definition || typeof definition.mnContent !== 'function') {
          throw new TypeError(`mnContent mancante o non valido: ${key}`);
        }

        for (const hook of [
          'mnLoad',
          'mnRender',
          'mnSubscribe',
          'mnRendered'
        ]) {
          if (
            definition[hook] != null &&
            typeof definition[hook] !== 'function'
          ) {
            throw new TypeError(`Hook ${hook} non valido: ${key}`);
          }
        }

        if (Object.hasOwn(definition, 'mnCss')) {
          const style = document.createElement('style');
          style.textContent = definition.mnCss();
          document.head.prepend(style);
        }
      }

      Object.assign(this._views, views);
    },

    // Dispose instances removed by external DOM operations.
    // The observer handles removal only; it does not render inserted nodes.
    _observe() {
      if (this._observer) return;

      this._observer = new MutationObserver(() => {
        for (const dom of Array.from(this._instances.keys())) {
          if (!dom.isConnected) {
            this.unmount(dom);
          }
        }
      });

      this._observer.observe(document, {
        childList: true,
        subtree: true
      });
    },

    // Invoke cleanup and isolate failures without blocking other cleanups.
    // Async completion is handled but is not awaited.
    _runCleanup(cleanup) {
      try {
        const result = cleanup();

        Promise.resolve(result).catch(error => {
          mn.miniReportError(this, error);
        });
      } catch (error) {
        mn.miniReportError(this, error);
      }
    },

    // Abort application work first, then invoke cleanups in reverse order.
    _cleanup(record) {
      record.controller.abort();

      const cleanups = record.cleanups.splice(0).reverse();

      for (const cleanup of cleanups) {
        this._runCleanup(cleanup);
      }
    },

    /**
     * Dispose registered views in a subtree, deepest hosts first.
     *
     * This releases resources; it does not remove DOM nodes or clear their
     * mini-rendered attributes.
     */
    unmount(root) {
      const records = [];

      for (const [dom, record] of this._instances) {
        if (dom !== root && !root.contains(dom)) continue;

        let depth = 0;
        let parent = dom.parentNode;

        while (parent) {
          depth += 1;
          parent = parent.parentNode;
        }

        records.push({ dom, record, depth });
      }

      // Registration order does not necessarily match DOM nesting order.
      records.sort((a, b) => b.depth - a.depth);

      // Invalidate all affected instances before invoking application code.
      for (const { dom } of records) {
        this._instances.delete(dom);
      }

      for (const { record } of records) {
        this._cleanup(record);
      }
    },

    // Stop observation and dispose all instances.
    // Definitions, injected styles, and DOM nodes remain in place.
    destroy() {
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }

      for (const dom of Array.from(this._instances.keys())) {
        this.unmount(dom);
      }
    },

    /**
     * Render eligible top-level view descendants in parallel.
     *
     * The root itself is excluded. Nested hosts are delegated to their
     * nearest view parent's render cycle. Already marked hosts are skipped.
     * Use render(host) to explicitly rerender a marked host.
     */
    async cycle(root = document) {
      const candidates = Array.from(
        root.querySelectorAll('[mini-key]:not([mini-rendered="true"])')
      );

      const roots = candidates.filter(dom => {
        const parentView = dom.parentElement?.closest('[mini-key]');

        return (
          !parentView ||
          parentView === root ||
          !root.contains(parentView)
        );
      });

      console.debug(
        `%c[cycle] starts ${
          root.attributes
            ? root.attributes['mini-key'].value
            : 'document'
        }`,
        'color: #c17be6;',
        roots
      );

      await Promise.all(roots.map(dom => this.render(dom)));
    },

    // Resolve a host element or a view key appearing exactly once.
    // Pass an element when several hosts share the same mini-key.
    _findDom(keyOrDom) {
      if (typeof keyOrDom !== 'string') {
        if (!keyOrDom?.matches?.('[mini-key]')) {
          throw new TypeError('Nodo vista non valido');
        }

        return keyOrDom;
      }

      // Avoid interpolating view keys into CSS selectors.
      const matches = Array.from(
        document.querySelectorAll('[mini-key]')
      ).filter(dom => {
        return dom.getAttribute('mini-key') === keyOrDom;
      });

      if (matches.length !== 1) {
        throw new Error(
          `Vista ${keyOrDom}: trovati ${matches.length} nodi; passa il nodo DOM per identificare una singola istanza`
        );
      }

      return matches[0];
    },

    /**
     * Register explicit events and model-driven rerenders.
     *
     * mnSubscribe returns a synchronous event-to-callback object.
     * mnRerender entries subscribe to corresponding model-set events.
     * Each subscription has its own identity and is disposed with the view.
     * Callbacks receive payload and run with the view as "this".
     */
    _subscribe(view) {
      const declared = view.mnSubscribe?.(view) ?? {};
      const rerendering = view.mnRerender ?? [];

      if (
        typeof declared !== 'object' ||
        Array.isArray(declared) ||
        typeof declared.then === 'function'
      ) {
        throw new TypeError(
          'mnSubscribe deve restituire un oggetto sincrono { eventid: callback }'
        );
      }

      if (!Array.isArray(rerendering)) {
        throw new TypeError('mnRerender deve essere un array');
      }

      const subscriptions = [
        ...Object.entries(declared),
        ...rerendering.map(modelkey => [
          `model-set-${modelkey}`,
          () => view.mnRefresh()
        ])
      ];

      // Validate every callback before registering any subscription.
      for (const [eventId, callback] of subscriptions) {
        if (typeof callback !== 'function') {
          throw new TypeError(
            `Callback non valida per l'evento: ${eventId}`
          );
        }
      }

      for (const [eventId, callback] of subscriptions) {
        if (!view.mnIsActive()) return;

        // Object identity is the subscription key; "key" is a log label.
        const subscriberKey = {
          key: `${view.mnKey}-${eventId}`
        };

        const unsubscribe = mn.ev.sub(
          eventId,
          subscriberKey,
          payload => {
            if (view.mnIsActive()) {
              return callback.call(view, payload);
            }
          }
        );

        view.mnCleanup(unsubscribe);
      }
    },

    /**
     * Perform a full render of one host and its descendant views.
     *
     * The manager API remains mn.vu.render(); mnRender is a module hook.
     * Every render replaces the previous instance and its subscriptions.
     * Async checkpoints stop obsolete instances from advancing.
     */
    async render(keyOrDom) {
      const dom = this._findDom(keyOrDom);
      if (!dom.isConnected) return;

      const key = dom.getAttribute('mini-key');
      const definition = this._views[key];

      if (!definition) {
        console.error(`[mini] render: Vista non registrata: ${key}`);
        return;
      }

      this._observe();
      this.unmount(dom);

      const record = {
        controller: new AbortController(),
        cleanups: []
      };

      this._instances.set(dom, record);

      const manager = this;

      // Record identity distinguishes this render from later renders
      // targeting the same DOM element.
      const mnIsActive = () => {
        return (
          manager._instances.get(dom) === record &&
          dom.isConnected &&
          !record.controller.signal.aborted
        );
      };

      const view = {
        // This is a shallow copy: nested definition objects remain shared.
        ...definition,

        mnProps: dom.miniProps ?? {},
        mnDom: dom,
        mnKey: key,
        mnSignal: record.controller.signal,
        mnIsActive,

        // Register cleanup for this instance. If already inactive, invoke
        // it immediately, including cleanup returned by a late async hook.
        mnCleanup(cleanup) {
          if (typeof cleanup !== 'function') {
            throw new TypeError('Il cleanup deve essere una funzione');
          }

          if (mnIsActive()) {
            record.cleanups.push(cleanup);
          } else {
            manager._runCleanup(cleanup);
          }
        },

        // Refresh only the current instance; stale references become no-ops.
        mnRefresh() {
          if (!mnIsActive()) return Promise.resolve();
          return manager.render(dom);
        }
      };

      try {
        // 1. Prepare data or resources before producing content.
        if (view.mnLoad) {
          await view.mnLoad(view);
        }

        if (!mnIsActive()) return;

        // 2. Obtain HTML or children. Async content hooks are supported.
        const content = await view.mnContent(view);

        if (!mnIsActive()) return;

        // HTML strings are inserted as supplied. Escape untrusted text
        // explicitly with escapeHTML(), or use DOM nodes/text children.
        if (typeof content === 'string') {
          dom.innerHTML = content;
        } else {
          dom.replaceChildren(...mn.miniChildren(content));
        }

        // 3. Configure the inserted DOM before rendering child views.
        if (view.mnRender) {
          const cleanup = await view.mnRender(view);

          if (typeof cleanup === 'function') {
            view.mnCleanup(cleanup);
          }
        }

        if (!mnIsActive()) return;

        // 4. Activate subscriptions before starting descendant renders.
        this._subscribe(view);
        dom.setAttribute('mini-rendered', 'true');

        if (!mnIsActive()) return;

        // 5. Await all descendants, including their mnRendered hooks.
        await this.cycle(dom);

        if (!mnIsActive()) return;

        // 6. Run the final hook with the descendant tree rendered.
        if (view.mnRendered) {
          const cleanup = await view.mnRendered(view);

          if (typeof cleanup === 'function') {
            view.mnCleanup(cleanup);
          }
        }
      } catch (error) {
        // A failed obsolete render must not dispose its replacement.
        if (this._instances.get(dom) !== record) return;

        const wasActive = mnIsActive();
        this.unmount(dom);

        // Propagate active-render errors; suppress inactive-render errors.
        if (wasActive) throw error;
      }
    },

    // Escape text for HTML interpolation. This is not an HTML sanitizer.
    escapeHTML(value) {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };

      return String(value ?? '').replace(
        /[&<>"']/g,
        character => entities[character]
      );
    },

    // Null removes an attribute. For non-ARIA/data attributes, false removes
    // it and true creates an empty attribute. ARIA/data booleans are text.
    _setAttribute(element, name, value) {
      const normalizedName = name.toLowerCase();

      const isTextAttribute =
        normalizedName.startsWith('aria-') ||
        normalizedName.startsWith('data-');

      if (value == null || (value === false && !isTextAttribute)) {
        element.removeAttribute(name);
        return;
      }

      const attributeValue =
        value === true && !isTextAttribute ? '' : String(value);

      element.setAttribute(name, attributeValue);
    },

    /**
     * Create a DOM element without parsing an HTML string.
     *
     * Special options:
     * - style: CSS text or an object of CSS property values.
     * - dataset: object copied to element.dataset.
     * - attrs: attribute map processed by _setAttribute().
     * - aria-*, data-*, role: assigned directly as string attributes.
     * - tabindex: assigned to the tabIndex DOM property.
     * - on*: function registered as an event listener, e.g. onclick.
     *
     * Other options are assigned as DOM properties, including miniProps.
     * Children may be nested arrays; null and undefined are ignored.
     * String children become text nodes rather than parsed HTML.
     *
     * Example child view host:
     * mn.vu.el('div', {
     *   attrs: { 'mini-key': 'child' },
     *   miniProps: { itemId: 123 }
     * });
     * The child module receives these properties through view.mnProps.
     */
    el(tag, options = {}, children = []) {
      const element = document.createElement(tag);

      for (const [key, value] of Object.entries(options)) {
        if (value == null) continue;

        if (key === 'style') {
          if (typeof value === 'object') {
            for (const [property, cssValue] of Object.entries(value)) {
              if (cssValue == null) continue;

              if (property.includes('-')) {
                element.style.setProperty(property, String(cssValue));
              } else {
                element.style[property] = cssValue;
              }
            }
          } else {
            element.style.cssText = value;
          }

          continue;
        }

        if (key === 'dataset') {
          Object.assign(element.dataset, value);
          continue;
        }

        if (key === 'attrs') {
          for (const [name, attribute] of Object.entries(value)) {
            this._setAttribute(element, name, attribute);
          }

          continue;
        }

        if (
          key.startsWith('aria-') ||
          key.startsWith('data-') ||
          key === 'role'
        ) {
          element.setAttribute(key, String(value));
          continue;
        }

        if (key === 'tabindex') {
          element.tabIndex = value;
          continue;
        }

        if (key.startsWith('on') && typeof value === 'function') {
          const eventName = key.slice(2).toLowerCase();

          element.addEventListener(eventName, function (event) {
            try {
              // Preserve native listener semantics: "this" is the element.
              const result = value.call(this, event);

              Promise.resolve(result).catch(error => {
                mn.miniReportError(mn.vu, error);
              });
            } catch (error) {
              mn.miniReportError(mn.vu, error);
            }
          });

          continue;
        }

        element[key] = value;
      }

      element.append(...mn.miniChildren(children));
      return element;
    }
  },

  /* ==============================================================
   * ROUTER
   * ============================================================== */

  rt: {
    destinationMap: Object.create(null),
    _handler: null,
    _running: null,
    _session: null,

    // Configure exact hash-path destinations and ensure model "page" exists.
    init(destinations) {
      this.destinationMap = Object.assign(
        Object.create(null),
        destinations
      );

      mn.st.init({
        key: 'page',
        value: undefined
      });
    },

    /**
     * Resolve the hash path and write its destination to model "page".
     *
     * An empty hash maps to "/"; "*" is the optional fallback.
     * Destinations are stored as values, not invoked or rendered directly.
     * Views react through mnRerender: ['page'] or mnSubscribe().
     */
    async route() {
      const path = location.hash.slice(1) || '/';

      const routeKey = Object.hasOwn(this.destinationMap, path)
        ? path
        : '*';

      if (!Object.hasOwn(this.destinationMap, routeKey)) {
        throw new Error(`Rotta non trovata: ${path}`);
      }

      const destination = this.destinationMap[routeKey];

      return mn.st.set({
        key: 'page',
        // Preserve function-valued destinations as data.
        value: () => destination
      });
    },

    /**
     * Start hash listening, apply the initial route, then render the document.
     *
     * Repeated calls share the startup promise until stop() resets it.
     * Session identity prevents stale startup work from affecting a restart.
     * Model event subscribers triggered by route() are not awaited by set().
     */
    run() {
      if (this._running) return this._running;

      const session = {};
      this._session = session;

      this._handler = () => {
        if (this._session !== session) return;

        this.route().catch(error => {
          if (this._session === session) {
            mn.miniReportError(mn.vu, error);
          }
        });
      };

      window.addEventListener('hashchange', this._handler);

      // Defer startup so stop() can invalidate a session before it begins.
      this._running = Promise.resolve()
        .then(async () => {
          if (this._session !== session) return;

          await this.route();

          if (this._session !== session) return;

          await mn.vu.cycle();
        })
        .catch(error => {
          // Failure from an old session must not stop a newer session.
          if (this._session === session) {
            this.stop();
          }

          throw error;
        });

      return this._running;
    },

    // Remove hash listening and invalidate pending startup.
    // This does not cancel an active view cycle or unmount views.
    stop() {
      if (this._handler) {
        window.removeEventListener('hashchange', this._handler);
      }

      this._handler = null;
      this._running = null;
      this._session = null;
    }
  },

  /* ==============================================================
   * INTERNAL UTILITIES
   * ============================================================== */

  // Flatten nested children and omit only null/undefined.
  // Other primitive values are left for native DOM insertion to convert.
  miniChildren(children) {
    const list = Array.isArray(children) ? children : [children];

    return list.flat(Infinity).filter(child => child != null);
  },

  // Isolate custom error-handler failures, including async rejections.
  miniReportError(source, error, context) {
    try {
      const result = source.onError(error, context);

      Promise.resolve(result).catch(reportingError => {
        console.error(
          '[mini] Errore nel gestore onError:',
          reportingError
        );
      });
    } catch (reportingError) {
      console.error(
        '[mini] Errore nel gestore onError:',
        reportingError
      );
    }
  },

  /* ==============================================================
   * APPLICATION BOOTSTRAP
   * ============================================================== */

  /**
   * Discover and import modules, then initialize models, views, and routing.
   *
   * GET /modules must return a JSON array of module filenames.
   * Imports resolve under ./modules/ relative to this framework file.
   * Every default export is registered as a view definition.
   * mnStates declarations are flattened one level before model registration.
   *
   * This prepares the application; run() starts routing and rendering.
   */
  async init(params) {
    const response = await fetch('/modules');

    if (!response.ok) {
      throw new Error('Errore nel caricamento dei moduli');
    }

    const files = await response.json();

    const modules = await Promise.all(
      files.map(async file => {
        const url = new URL(`./modules/${file}`, import.meta.url);
        const { default: module } = await import(url.href);

        return [file.replace(/\.js$/, ''), module];
      })
    );

    mn.st.init(
      modules
        .map(([, definition]) => definition.mnStates)
        .filter(Boolean)
        .flat()
    );

    mn.vu.init(Object.fromEntries(modules));
    mn.rt.init(params.router);
  },

  // Start the initialized application and return its startup promise.
  run() {
    return mn.rt.run();
  }
};

// Support both global access and standard ES module imports.
window.mn = mn;

export default mn;