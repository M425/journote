/*
 * STRUTTURA E FLUSSO DELL'APPLICAZIONE
 *
 * router(): legge l'hash dell'URL e apre la pagina richiesta.
 * Per home e calendario esegue load() prima di render(); un contatore
 * impedisce alle navigazioni superate di proseguire con il rendering.
 *
 * page: coordina le pagine e le operazioni sulle schede.
 * Carica i dati, prepara la struttura principale e richiama le view.
 * page.home gestisce anche schede aperte, filtri e refresh dei metadati.
 *
 * model: conserva lo stato condiviso (tag, task, schede e visibilità).
 * get() legge un valore; set() lo aggiorna e richiama le view in subs.
 * I metodi reload() caricano i dati senza notificare automaticamente le view.
 *
 * api: centralizza le richieste HTTP, la serializzazione JSON
 * e la gestione degli errori restituiti dal server.
 *
 * businessLogic: raccoglie le operazioni applicative, come salvare note,
 * modificare proprietà, costruire l'albero dei tag e gestire le azioni
 * richieste. Usa api e helper senza costruire direttamente il DOM.
 *
 * view: costruisce e aggiorna l'interfaccia e collega gli eventi alle azioni.
 * el() crea elementi DOM; mount() recupera e svuota il contenitore.
 * I componenti gestiscono editor, schede, sidebar, calendari ed explorer.
 *
 * modal: gestisce finestre sovrapposte per modifica, filtri, immagini
 * e scorciatoie. Richiama le operazioni applicative e aggiorna le viste.
 *
 * helper: contiene funzioni di supporto per tag, categorie e date.
 *
 * Flusso tipico: evento UI → page/businessLogic → api → aggiornamento
 * dello stato → aggiornamento delle view. Alcuni handler chiamano api
 * direttamente; il rendering avviene tramite subs o richiami espliciti.
 */

//#region HELPER
const h = {
  eid(el) {
    return document.getElementById(el);
  },
  sanitizeRenderedMarkdown(root) {
    // URL policy only: this is not a complete HTML sanitizer.
    // For untrusted Markdown, sanitize converter output with DOMPurify before DOM insertion.
    for (const element of root.querySelectorAll('a[href], img[src]')) {
      const attribute = element.tagName === 'IMG' ? 'src' : 'href';
      try {
        const url = new URL(element.getAttribute(attribute), location.href);
        const allowed = element.tagName === 'IMG'
          ? ['http:', 'https:']
          : ['http:', 'https:', 'mailto:'];
        if (!allowed.includes(url.protocol)) element.removeAttribute(attribute);
      } catch {
        element.removeAttribute(attribute);
      }
    }
  },
  getClassfromTag(tag) {
    if (tag.startsWith('#')) return 'Projects';
    if (tag.startsWith('@')) return 'Persons';
    if (tag.startsWith('>')) return 'Events';
    if (tag.startsWith('+')) return 'Generic';
    if (/^\d{4}-\d{2}-\d{2}$/.test(tag)) return 'Journal';
    return 'FullText';
  },
  getAnonymizedTag(tag) {
    return /^[#@>+]/.test(tag) ? tag.slice(1) : tag;
  },
  localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  extractTagsFromText(text, trailing_space = true) {
    const tagsfound = new Set();
    let tagRx = /(?<=^|\s)([#@>\+])([A-Za-z0-9_\-\.]+)[ ,\.;:]/g;
    if (!trailing_space) {
      tagRx = /(?:^|\s)([#@>+])([A-Za-z0-9_.-]+)/g;
    }
    let m;
    while ((m = tagRx.exec(text)) !== null) {
      tagsfound.add(m[1] + m[2]);
    }
    return Array.from(tagsfound);
  },
  diffToToday(date1) {
    const today = new Date();
    // Note dates are ISO date-only strings parsed as UTC by the callers.
    const start = Date.UTC(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate());
    const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((end - start) / 86400000);
  },
  escapeHTML(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
        }[character]));
  }
}

//#region API
const api = {
  async api(url, opts = {}) {
    console.log('[fn] api ' + url);
    opts = {...opts, headers: new Headers(opts.headers)};
    if (opts.body instanceof FormData) {
      opts.headers.delete('Content-Type');
    } else if (opts.body != null && typeof opts.body === 'object' &&
               !(opts.body instanceof Blob) && !(opts.body instanceof URLSearchParams) &&
               !(opts.body instanceof ArrayBuffer) && !ArrayBuffer.isView(opts.body)) {
      opts.headers.set('Content-Type', 'application/json');
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    console.debug('[fn] api ' + url + ' executed', res.status);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || (typeof err.error === 'string' && err.error) || res.statusText || `HTTP ${res.status}`);
    }
    if (res.status !== 204) {
      return res.json();
    }
    return null;
  },
  tagPath(tag) {
    // Accetta un nome completo, come "#progetto", oppure un oggetto tag.
    const name = typeof tag === 'string' ? tag : tag.name;
    const category = typeof tag === 'string'
      ? h.getClassfromTag(name)
      : tag.category ?? h.getClassfromTag(name);

    return [
      encodeURIComponent(category),
      encodeURIComponent(h.getAnonymizedTag(name))
    ].join('/');
  },

  // NOTE

  loadNotes(tag) {
    return api.api(`/api/notes/${api.tagPath(tag)}`);
  },

  getNote(id) {
    return api.api(`/api/notes/${encodeURIComponent(id)}`);
  },

  async createNote(text, date) {
    const response = await api.api('/api/notes', {
      method: 'POST',
      body: {text, date}
    });
    if (!response?.note?.id && response?.kind !== 'tag_property') { throw new Error('Error saving note'); }
    return response;
  },

  async updateNote({id, text, date}) {
    const response = await api.api(`/api/notes/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: {text, date} }
    );
    if (!response?.note?.id) { throw new Error('Error saving note'); }
    return response.note;
  },

  deleteNote(id) {
    return api.api(`/api/notes/${encodeURIComponent(id)}`,
    { method: 'DELETE' });
  },

  filterNotes(rule) {
    return api.api('/api/notes/filter',
      { method: 'POST', body: {rule} });
  },

  getMonthlyNoteCounts(year, month) {
    // month: numero del mese da 1 a 12.
    const monthString = String(month).padStart(2, '0');
    return api.api(
      `/api/notes/${encodeURIComponent(year)}/${encodeURIComponent(monthString)}/count`
    );
  },

  // TAG

  getTags() {
    return api.api('/api/tags');
  },

  updateTag(tag, changes) {
    return api.api(`/api/tags/${api.tagPath(tag)}`, {
      method: 'PATCH',
      body: changes
    });
  },

  updateTagDate(tag, date) {
    return api.updateTag(tag, {date});
  },

  updateTagVisibility(tag, treed) {
    return api.updateTag(tag, {
      treed,
      parent: tag.parent || '',
      content: tag.content || ''
    });
  },

  async previewProjectFile(tag, relative, signal) {
    const response = await fetch(`/api/tags/${api.tagPath(tag)}/folder/preview`, {
      method: 'POST', signal,
      headers: {'Content-Type': 'application/json', 'X-Journote-Local': '1'},
      body: JSON.stringify({relative})
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'Impossibile caricare l’anteprima.');
    }
    return {kind: response.headers.get('X-Journote-Preview'), blob: await response.blob()};
  },

  // LOCAL PROJECT FOLDERS
  projectFolder(tag, action, body = {}) {
    return api.api(`/api/tags/${api.tagPath(tag)}/folder/${action}`, {
      method: 'POST',
      headers: {'X-Journote-Local': '1'},
      body
    });
  },

  // PROPRIETÀ DEI TAG

  getTagProperties(tag) {
    return api.api(`/api/tags/${api.tagPath(tag)}/properties`);
  },

  setTagProperty(tag, key, value) {
    return api.api(`/api/tags/${api.tagPath(tag)}/properties`, {
      method: 'PATCH',
      body: {key, value}
    });
  },

  sortTagProperties(tag, order) {
    return api.api(
      `/api/tags/${api.tagPath(tag)}/properties/order`,
      {
        method: 'PUT',
        body: {order}
      }
    );
  },

  // TASK

  getTasks() {
    return api.api('/api/tasks');
  },

  // IMMAGINI

  uploadImage(formData) {
    return api.api('/api/images', {
      method: 'POST',
      body: formData
    });
  },

  // EXPLORER

  getExplorerTables() {
    return api.api('/api/explorer/tables');
  },

  runExplorerQuery(query) {
    return api.api('/api/explorer/query', {
      method: 'POST',
      body: {query}
    });
  }
};
//#endregion

//#region MODEL
const model = {
  set(key, valueOrUpdater) {
    const state = this[key];
    console.debug(`model set "${key}"`, valueOrUpdater);
    if (typeof valueOrUpdater === 'function') {
      state._v = valueOrUpdater(state._v);
    } else {
      state._v = valueOrUpdater;
    }
    for (const viewName of state.subs) {
      view[viewName].render();
    }
    return state._v;
  },

  get(key) {
    const value = this[key]._v;
    console.debug(`model get "${key}"`, value);
    return value;
  },
  tags: {
    _v: null,
    subs: ['TagsBoxList'],
    async reload() {
      this._v = await api.getTags();
      this._v.sort((a, b) => {
        const nameA = a.name.toUpperCase();
        const nameB = b.name.toUpperCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
    }
  },
  tasks: {
    _v: null,
    subs: ['TagsBoxList', 'Calendar'],
    async reload() {
      this._v = await api.getTasks();
      const tags = new Map((model.get('tags') || []).map(tag => [tag.name, tag]));
      for (const task of this._v) {
        // Preserve the previous rule: the last eligible tag wins.
        task.firstTag = null;
        for (const name of task.tags || []) {
          if (['Projects', 'Generic', 'Events'].includes(tags.get(name)?.category)) {
            task.firstTag = name;
          }
        }
      }
    }
  },
  tagsBox_projects: {_v: false, subs: ['TagsBoxList', 'TagsBoxSubHeader']},
  tagsBox_task: {_v: true, subs: ['TagsBoxList', 'TagsBoxSubHeader']},
  tagsBox_events: {_v: false, subs: ['TagsBoxList', 'TagsBoxSubHeader']},
  tagsBox_persons: {_v: false, subs: ['TagsBoxList', 'TagsBoxSubHeader']},
  tagsBox_generic: {_v: false, subs: ['TagsBoxList', 'TagsBoxSubHeader']},
  tagsVisible: {_v: [], subs: []},
  tagsActive: {_v: null, subs: ['ProjectFiles']},
  leftBarVisible: {_v: true, subs: ['LeftBar']}
};
//#endregion

//#region BUSINESS-LOGIC
const businessLogic = {
  async reloadMetadata() {
    // Il calcolo di firstTag nei task dipende dai tag aggiornati.
    await model.tags.reload();
    await model.tasks.reload();
  },
  parsePropertyAssignment(text) {
    const match = text.trim().match(
      /^(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]+)\][ \t\r\n]+(\S[\s\S]*)$/
    );
    if (!match) return null;
    const [, tagName, rawKey, rawValue] = match;
    const key = rawKey.trim();
    if (!key) return null;
    return {
      tagName,
      key,
      value: rawValue.trim()
    };
  },

  async saveNote(text, date) {
    if (!text.trim()) return null;
    const property = businessLogic.parsePropertyAssignment(text);
    if (property) {
      return api.setTagProperty(
        property.tagName,
        property.key,
        property.value
      );
    }
    return api.createNote(text, date || h.localDate());
  },

  async sortTagProperties(tag, order) {
    return api.sortTagProperties(tag, order);
  },

  editNote(note) {
    return api.updateNote(note);
  },

  buildTagTree(tags = [], tasks = []) {
    // 1. Crea nodi indipendenti dagli oggetti tag originali.
    const nodesByName = new Map(
      tags.map(tag => [
        tag.name,
        {
          ...tag,
          tasks: [],
          children: []
        }
      ])
    );
    const roots = [];
    // 2. Collega i nodi ai genitori, evitando collegamenti ciclici.
    for (const node of nodesByName.values()) {
      const visitedNames = new Set([node.name]);
      let ancestor = nodesByName.get(node.parent);
      let hasCycle = false;
      while (ancestor) {
        if (visitedNames.has(ancestor.name)) {
          hasCycle = true;
          break;
        }
        visitedNames.add(ancestor.name);
        ancestor = nodesByName.get(ancestor.parent);
      }
      const parent = nodesByName.get(node.parent);
      if (parent && !hasCycle) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    // 3. Associa ogni task al tag selezionato durante il caricamento.
    for (const task of tasks) {
      const node = nodesByName.get(task.firstTag);
      node?.tasks.push(task);
    }
    return roots;
  },

  getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return {
      firstDay: firstDay === 0 ? 6 : firstDay - 1,
      daysInMonth
    };
  },

  getNewTags(text, existingTags = model.get('tags') || []) {
    const existingTagNames = new Set(existingTags.map(tag => tag.name));
    return h.extractTagsFromText(text, false).filter(
      tag => !existingTagNames.has(tag)
    );
  },

  getActionRequiredItems() {
    try {
      const items = JSON.parse(localStorage.getItem('journoteActionRequiredTags') || '[]');
      return Array.isArray(items) ? items.filter(item => typeof item === 'string') : [];
    } catch (error) {
      console.error('Error reading action required tags:', error);
      return [];
    }
  },

  addActionRequiredTags(tags) {
    const pendingTags = new Set(this.getActionRequiredItems());
    tags.forEach(tag => pendingTags.add(tag));
    localStorage.setItem(
      'journoteActionRequiredTags',
      JSON.stringify([...pendingTags])
    );
  },

  completeActionRequiredTag(tag) {
    const pendingTags = this.getActionRequiredItems().filter(
      item => item !== tag
    );
    localStorage.setItem(
      'journoteActionRequiredTags',
      JSON.stringify(pendingTags)
    );
  },

  updateTagDate(tag, newDate) { return api.updateTagDate(tag, newDate); }
};
//#endregion

//#region PAGE
const page = {
  renderShell(component, mainId) {
    modal.filePreview.close();
    view.ProjectFiles.dispose();
    view.EditorWrap.dispose();
    if (!view.mount(component, 'app')) return;
    component.el.append(view.el('aside', {id: 'LeftBar'}), view.el('div', {id: mainId}));
    view.LeftBar.render();
  },

  home: {
    filterViews: {},
    pendingTabs: new Map(),
    async render() {
      const visible = [...model.get('tagsVisible')];
      this.pendingTabs = new Map();
      page.renderShell(this, 'Main');
      view.Main.render();
      const root = h.eid('Main');
      model.set('tagsVisible', []);
      model.set('tagsActive', null);

      for (const key of new Set([h.localDate(), ...visible])) {
        if (h.eid('Main') !== root) return;
        try {
          const filterRule = this.filterViews[key];
          if (filterRule) {
            await this.addFilterview(filterRule, null, key);
          } else {
            await this.addTagview(key);
          }
        } catch (error) {
          if (h.eid('Main') === root) console.error('Impossibile aprire la scheda:', key, error);
        }
      }
      return root;
    },

    async load() {
      await businessLogic.reloadMetadata();
    },

    async refreshMetadata() {
      await businessLogic.reloadMetadata();
      view.TagsBoxList.render();
      view.Main.refreshTagDetails();
      view.Calendar.render();
      await view.JournalBox.render();
      for (const [key, rule] of Object.entries(this.filterViews)) {
        if (!model.get('tagsVisible').includes(key)) continue;
        const notes = await api.filterNotes(rule);
        if (h.eid('Main') && model.get('tagsVisible').includes(key)) view.Main.updateTab(key, notes);
      }
    },

    async ensureHome() {
      if (h.eid('Main')) return;
      history.pushState(null, '', '#/home');
      await router();
      if (!h.eid('Main')) throw new Error('Navigazione alla home interrotta');
    },

    async openTab(key, load, label = key) {
      await this.ensureHome();
      if (model.get('tagsVisible').includes(key)) {
        this.activateTagview(key);
        return;
      }
      const pending = this.pendingTabs;
      if (pending.has(key)) return pending.get(key);
      const root = h.eid('Main');
      view.EditorWrap.addStatus(
        `Apertura scheda: ${label}`,
        'loading'
      );
      const request = (async () => {
        const resp = await load();
        const notes = resp.notes || [];
        const events = resp.events || [];
        if (root !== h.eid('Main') || this.pendingTabs !== pending || pending.get(key) !== request) return;
        model.set('tagsVisible', visible => [...visible, key]);
        view.TopBar.addTab(key, notes, label);
        view.Main.addTab(key, notes, events, label);
        view.EditorWrap.addStatus(
          `Scheda aperta: ${label}`,
          'success'
        );
      })();
      pending.set(key, request);
      try {
        return await request;
      } catch (error) {
        if (root === eid('Main') && this.pendingTabs === pending) {
          view.EditorWrap.addStatus(
            `Apertura di ${label} non riuscita: ${error.message}`,
            'error'
          );
        }

        throw error;
      } finally {
        if (pending.get(key) === request) {
          pending.delete(key);
        }
      }
    },

    async addTagview(tag) {
      if (!tag) return;
      return this.openTab(tag, () => api.loadNotes(tag));
    },

    async focusTask(task) {
      const panelTag =
        task.firstTag ||
        task.tags?.find(tag => tag.startsWith('#')) ||
        task.date;
      if (!panelTag) return;

      await this.addTagview(panelTag);
      this.activateTagview(panelTag);

      const column = Array.from(document.querySelectorAll('.column'))
        .find(item => item.dataset.key === panelTag);
      const note = Array.from(column?.querySelectorAll('.noteItem') || [])
        .find(item => item.dataset.id === String(task.id));
      note?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    },

    async addFilterview(rule, notes = null, key = null) {
      const filterKey = key || `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.filterViews[filterKey] = rule;
      return this.openTab(
        filterKey,
        () => notes ?? api.filterNotes(rule),
        `Filtro: ${rule}`
      );
    },

    activateTagview(key) {
      if (key == undefined) {
        model.set('tagsActive', null);
      } else {
        model.set('tagsActive', key);
        view.TopBar.activateTab(key);
        view.Main.activateTab(key);
      }
    },

    removeTagview(tag) {
      console.log('[fn] removeTagview', tag);
      if (h.localDate() == tag) {
        console.log('[fn] removeTagview - dont remove today', tag);
        return;
      }
      this.pendingTabs?.delete(tag);
      delete this.filterViews[tag];
      const tagsVisible = model.set(
        'tagsVisible',
        tags => tags.filter(t => t !== tag)
      );
      console.log(tagsVisible);
      view.TopBar.removeTab(tag);
      view.Main.removeTab(tag);
      view.Main.resetFullWidth();
      if (model.get('tagsActive') == tag) {
        page.home.activateTagview(tagsVisible[tagsVisible.length - 1]);
      }
    }
  },

  calendar: {
    render() {
      page.renderShell(this, 'CalendarMain');
      view.Calendar.render();
    },
    async load() {
      await businessLogic.reloadMetadata();
    }
  }
};
//#endregion

//#region VIEW
const view = {
  el(type, options = {}, children = []) {
    const element = document.createElement(type);
    for (const [key, value] of Object.entries(options)) {
      if (value == null) continue;
      if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key === 'dataset') {
        Object.assign(element.dataset, value);
      } else if (key === 'attrs') {
        for (const [name, attribute] of Object.entries(value)) {
          if (attribute != null) element.setAttribute(name, String(attribute));
        }
      } else if (key.startsWith('aria-') || key.startsWith('data-') || key === 'role') {
        element.setAttribute(key, String(value));
      } else if (key === 'tabindex') {
        element.tabIndex = value;
      } else if (key === 'style') {
        element.style.cssText = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        element[key] = function(event) {
          return view.run(() => value.call(this, event));
        };
      } else {
        element[key] = value;
      }
    }
    element.append(...(Array.isArray(children) ? children : [children]));
    return element;
  },

  // render(): acquire root, clear it, build children, render child views.
  mount(component, id) {
    component.el = h.eid(id);
    if (!component.el) return null;
    component.el.replaceChildren();
    return component.el;
  },

  async run(action) {
    return action();
  },

  resizeColumn(element, handle, min, max, onEnd = () => {}) {
    handle.onpointerdown = event => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startWidth = element.offsetWidth;
      handle.setPointerCapture(event.pointerId);
      handle.onpointermove = move => {
        const width = Math.min(max, Math.max(min, startWidth + move.clientX - startX));
        element.style.flex = `0 0 ${width}px`;
      };
      handle.onlostpointercapture = () => {
        handle.onpointermove = null;
        onEnd();
      };
      event.preventDefault();
    };
  },
  EditorWrap: {
    languageId: 'journote-markdown',
    tagTypes: {
      '#': {label: 'Progetto', kind: 'Folder', className: 'jn-project'},
      '@': {label: 'Persona', kind: 'User', className: 'jn-person'},
      '>': {label: 'Evento', kind: 'Event', className: 'jn-event'},
      '+': {label: 'Tag generico', kind: 'Keyword', className: 'jn-generic'}
    },
    tagPattern: /(?:^|\s)([#@+>][A-Za-z0-9_.-]+)/g,
    replyPattern: /^<R:[A-Za-z0-9_-]+(?=\s|$)/,

    editorOptions: {
      fontSize: 14,
      lineHeight: 22,
      fontFamily: '"IBM Plex Mono", monospace',
      minimap: {enabled: false},
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      glyphMargin: false,
      folding: false,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 8,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      renderLineHighlight: 'all',
      renderLineHighlightOnlyWhenFocus: true,
      roundedSelection: true,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: false,
      multiCursorModifier: 'alt',
      multiCursorMergeOverlapping: true,
      padding: {top: 0, bottom: 0},
      ariaLabel: 'Testo della nota in Markdown',
      scrollbar: {
        vertical: 'auto',
        horizontal: 'hidden',
        alwaysConsumeMouseWheel: false
      },
      suggestOnTriggerCharacters: true,
      quickSuggestions: {
        other: true,
        comments: true,
        strings: true
      },
      quickSuggestionsDelay: 100,
      wordBasedSuggestions: 'off',
      acceptSuggestionOnEnter: 'on',
      acceptSuggestionOnCommitCharacter: true,
      tabCompletion: 'on',
      snippetSuggestions: 'none',
      suggest: {
        insertMode: 'replace',
        showWords: false,
        showSnippets: false,
        preview: false,
        selectionMode: 'always'
      },
      fixedOverflowWidgets: true,
    },

    async render() {
      this.dispose();
      const generation = this.generation;
      this.currentNote = null;
      if (!view.mount(this, 'EditorWrap')) return;

      this.renderEditorFields();
      this.renderEditorControls();
      this.bindEditorEvents(generation);
      await this.mountMonaco(generation);
    },

    renderEditorFields() {
      this.editorField = this.el.appendChild(
        view.el('div', {className: 'editor-field'})
      );

      this.ed = this.editorField.appendChild(
        view.el('textarea', {
          id: 'Editor',
          className: 'editor-area',
          placeholder: 'Scrivi una nota in Markdown...',
          rows: 5,
          spellcheck: false,
          'aria-label': 'Testo della nota in Markdown'
        })
      );

      this.status = this.editorField.appendChild(
        view.el('div', {
          id: 'EditorStatus',
          className: 'editor-status-history',
          role: 'log',
          'aria-label': 'Cronologia aggiornamenti editor',
          'aria-live': 'polite',
          'aria-relevant': 'additions',
          'aria-atomic': 'false',
          tabindex: 0
        })
      );
      this.pendingImageUploads = 0;
    },

    renderEditorControls() {
      const buttons = [
        {id: 'EditorSaveBtn', className: 'btn primary', textContent: 'Save',
          onclick: () => this.submitNote('save')},
        {id: 'EditorMaximizeBtn', className: 'btn secondary', textContent: 'Maximize',
          'aria-label': 'Maximize editor', onclick: () => this.toggleMaximize()},
        {id: 'EditorUpdateBtn', className: 'btn primary', textContent: 'Update',
          style: 'display:none;', onclick: () => this.submitNote('edit')},
        {id: 'EditorClearBtn', className: 'btn info', textContent: 'Clear',
          style: 'display:none;', onclick: () => this.clear()}
      ];
      this.el.appendChild(view.el('div', {id: 'EditorCtrl'},
        buttons.map(button => view.el('button', button))
      ));
    },

    submitNote(mode = this.currentNote ? 'edit' : 'save') {
      if (this.pendingImageUploads) return;
      return mode === 'edit' ? this.editNote() : this.saveNote();
    },

    bindEditorEvents(generation) {
      this.editorEvents = new AbortController();
      const options = {capture: true, signal: this.editorEvents.signal};
      this.editorField.addEventListener('paste', ev => this.pasteImage(ev, generation), options);
      this.editorField.addEventListener('keydown', ev => this.handleEditorKeydown(ev), options);
    },

    replacePlaceholder(placeholder, replacement) {
      const start = this.ed.value.indexOf(placeholder);
      if (start < 0) return;
      this.ed.setRangeText(replacement, start, start + placeholder.length, 'preserve');
    },

    async pasteImage(ev, generation) {
      const imageItem = Array.from(ev.clipboardData?.items || []).find(
        item => item.kind === 'file' && item.type.startsWith('image/')
      );
      const imageFile = imageItem?.getAsFile();
      if (!imageFile) return;

      ev.preventDefault();
      ev.stopImmediatePropagation();

      const token =
        `journote-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const placeholder =
        `![Immagine in caricamento](pending:${token})`;

      this.ed.setRangeText(
        placeholder,
        this.ed.selectionStart,
        this.ed.selectionEnd,
        'end'
      );
      this.pendingImageUploads += 1;
      this.updateImageUploadState();

      const formData = new FormData();
      formData.append(
        'image',
        imageFile,
        imageFile.name || 'clipboard-image'
      );

      try {
        const uploaded = await api.uploadImage(formData);
        if (this.generation !== generation) return;

        this.replacePlaceholder(placeholder, uploaded.markdown);
        this.addStatus('Immagine inserita nella nota.', 'success');
      } catch (error) {
        if (this.generation !== generation) return;

        this.replacePlaceholder(placeholder, '');
        this.addStatus( `Immagine non inserita: ${error.message}`, 'error');
      } finally {
        if (this.generation === generation) {
          this.pendingImageUploads -= 1;
          this.updateImageUploadState();
        }
      }
    },

    async handleEditorKeydown(ev) {
      if (ev.isComposing) return;

      if (ev.key === 'Enter' && ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        const tag = this.getTagAtCursor();
        if (!tag) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (!ev.repeat) await this.openTagPanel(tag.name);
        return;
      }

      if (ev.key === 'Enter' && ev.ctrlKey && !ev.altKey) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        await this.submitNote();
        return;
      }

      if (ev.key === 'Tab' && !this.monacoEditor) {
        ev.preventDefault();
        this.ed.setRangeText(
          '  ',
          this.ed.selectionStart,
          this.ed.selectionEnd,
          'end'
        );
        return;
      }

      if (ev.key === 'd' && ev.ctrlKey && !ev.altKey && !ev.shiftKey) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        this.ed.setRangeText(
          h.localDate(),
          this.ed.value.length,
          this.ed.value.length,
          'end'
        );
        return;
      }

      if (['b', 'i', 'k'].includes(ev.key) && ev.ctrlKey && !ev.altKey) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const marker = {b: '**', i: '*', k: '`'}[ev.key];
        this.insertMarkdown(marker, marker);
      }
    },

    async ensureEditorLanguage(monaco) {
      const id = this.languageId;
      const registered = () => monaco.languages.getLanguages().some(item => item.id === id);
      if (registered()) return;
      const markdown = monaco.languages.getLanguages().find(item => item.id === 'markdown');
      const {language, conf} = await markdown.loader();
      // Un altro render potrebbe aver registrato il linguaggio durante il caricamento.
      if (registered()) return;
      monaco.languages.register({id});
      monaco.languages.setLanguageConfiguration(id, conf);
      monaco.languages.setMonarchTokensProvider(id, {
        ...language,
        tokenizer: {
          ...language.tokenizer,
          root: [
            [/^ {0,3}#+(?![# ])/, ''],
            [this.replyPattern, 'reply-reference'],
            ...language.tokenizer.root
          ]
        }
      });
    },

    async mountMonaco(generation) {
      const textarea = this.ed;
      const field = this.editorField;
      const active = () => this.generation === generation && field.isConnected;
      let editor, textModel, host, popupHost;
      const resources = [];
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        for (const resource of resources.splice(0)) resource.dispose();
        popupHost?.remove();
        host?.remove();
      };

      try {
        const monaco = await this.loadMonaco();
        if (!active() || !textarea.isConnected) return;
        await this.ensureEditorLanguage(monaco);
        if (!active() || !textarea.isConnected) return;

        this.installEditorTheme(monaco);
        // Leggi testo, selezione e focus dopo tutti gli await.
        const focused = document.activeElement === textarea;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        host = view.el('div', {id: 'Editor', className: 'journote-code-editor'});
        textarea.before(host);
        popupHost = document.createElement('div');
        popupHost.className = 'monaco-editor monaco-component vs';
        document.body.appendChild(popupHost);
        textModel = monaco.editor.createModel(textarea.value, this.languageId);
        editor = monaco.editor.create(host, {
          ...this.editorOptions,
          theme: this.languageId,
          model: textModel,
          overflowWidgetsDomNode: popupHost
        });
        editor.onDidDispose(cleanup);

        const loadPropertyCommand = editor.addCommand(0, () => this.loadProperty(editor));
        resources.push(this.registerTagCompletions(editor, monaco));
        resources.push(this.registerPropertyCompletions(editor, monaco, loadPropertyCommand));
        resources.push(this.bindTagNavigation(editor, monaco, generation));
        this.bindDecorations(editor, monaco, resources);
        resources.push(editor.addAction({
          id: 'journote.next-occurrence',
          label: 'Aggiungi cursore alla prossima occorrenza',
          keybindings: [
            monaco.KeyMod.CtrlCmd |
            monaco.KeyMod.Alt |
            monaco.KeyCode.KeyD
          ],
          run: ed => ed.getAction(
            'editor.action.addSelectionToNextFindMatch'
          ).run()
        }));

        const adapter = this.createEditorAdapter(editor, host, monaco);
        adapter.setSelectionRange(start, end);
        textarea.remove();
        this.monacoModel = textModel;
        this.monacoEditor = editor;
        this.ed = adapter;
        if (focused) editor.focus();

        document.fonts?.ready.then(() => {
          if (active() && host.isConnected) monaco.editor.remeasureFonts();
        });
      } catch (error) {
        // Rilascia soltanto le risorse di questa inizializzazione.
        editor?.dispose();
        cleanup();
        textModel?.dispose();
        if (this.generation !== generation) return;
        this.monacoEditor = null;
        this.monacoModel = null;
        this.ed = textarea;
        if (!field.isConnected) return;
        if (!textarea.isConnected) field.prepend(textarea);
        console.warn('Monaco initialization failed:', error);
        this.addStatus('Impossibile caricare Monaco.', 'error');
      }
    },

    async loadProperty(editor) {
      if (this.currentNote || this.pendingImageUploads || this.saving) return;

      const textModel = editor.getModel();
      if (!textModel) return;

      const raw = textModel.getValue();
      const match = raw.match(
        /^(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]+)\]\s*$/
      );
      if (!match) return;

      const [, tagName, key] = match;
      const version = textModel.getVersionId();
      const generation = this.generation;

      try {
        const response = await api.getTagProperties(tagName);

        // Non sostituire testo modificato durante la richiesta.
        if (
          textModel.isDisposed() ||
          this.generation !== generation ||
          editor.getModel() !== textModel ||
          textModel.getVersionId() !== version ||
          this.currentNote ||
          this.pendingImageUploads ||
          this.saving
        ) return;

        const property = response.properties?.find(p => p.key === key);
        if (!property) return;

        this.startPropertyEdit(tagName, property.key, property.value);
        this.addStatus(`Modifica proprietà: ${tagName}[${key}]`, 'success');
      } catch (error) {
        if (this.generation === generation) {
          this.addStatus(
            `Caricamento proprietà fallito: ${error.message}`,
            'error'
          );
        }
      }
    },

    registerTagCompletions(editor, monaco) {
      const categories = this.tagTypes;
      return monaco.languages.registerCompletionItemProvider(
        editor.getModel().getLanguageId(),
        {
          triggerCharacters: Object.keys(categories),

          provideCompletionItems(textModel, position, context, cancellation) {
            // Restrict this provider to this Journote editor.
            if (
              cancellation.isCancellationRequested ||
              textModel !== editor.getModel()
            ) {
              return {suggestions: []};
            }

            const line = textModel.getLineContent(position.lineNumber);
            const beforeCursor = line.slice(0, position.column - 1);

            // Match only a tag at the start of a line or after whitespace.
            // Markdown headings ("# Title"), quotes ("> text"), lists ("+ item"),
            // email addresses and property references do not match.
            const match = beforeCursor.match(
              /(?:^|\s)([#@+>][A-Za-z0-9_.-]*)$/
            );

            if (!match) return {suggestions: []};

            const typedTag = match[1];
            const prefix = typedTag[0];
            const query = typedTag.toLowerCase();
            const category = categories[prefix];

            // Replace the complete tag even when the cursor is in its middle.
            // Leave surrounding punctuation, whitespace and [property] intact.
            const suffix = line
              .slice(position.column - 1)
              .match(/^[A-Za-z0-9_.-]*/)[0];

            const range = new monaco.Range(
              position.lineNumber,
              position.column - typedTag.length,
              position.lineNumber,
              position.column + suffix.length
            );

            // Read the current application model on every request.
            // Metadata refreshes therefore become available automatically.
            const tags = model.get('tags') || [];
            const seen = new Set();
            const suggestions = [];

            for (const tag of tags) {
              const name = tag?.name;

              if (
                typeof name !== 'string' ||
                name[0] !== prefix ||
                !/^[#@+>][A-Za-z0-9_.-]+$/.test(name) ||
                !name.toLowerCase().startsWith(query) ||
                seen.has(name)
              ) {
                continue;
              }

              seen.add(name);

              const details = [category.label];
              if (tag.parent) details.push(`Parent: ${tag.parent}`);

              suggestions.push({
                label: {
                  label: name,
                  description: category.label
                },
                kind: monaco.languages.CompletionItemKind[category.kind],
                detail: details.join(' · '),
                filterText: name,
                sortText: name.toLowerCase(),
                insertText: name,
                range
              });
            }
            return {
              suggestions,
              incomplete: true
            };
          }
        }
      );
    },

    registerPropertyCompletions(editor, monaco, loadPropertyCommand) {
      const owner = this;
      return monaco.languages.registerCompletionItemProvider(
        editor.getModel().getLanguageId(),
        {
          triggerCharacters: ['['],
          provideCompletionItems(textModel, position, context, cancellation) {
            if (
              cancellation.isCancellationRequested ||
              textModel !== editor.getModel() ||
              owner.currentNote ||
              position.lineNumber !== 1 ||
              textModel.getLineCount() !== 1
            ) return { suggestions: [] };

            const line = textModel.getLineContent(1);
            const before = line.slice(0, position.column - 1);
            const match = before.match(
              /^(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]*)$/
            );
            if (!match) return { suggestions: [] };

            // Accetta anche la parentesi chiusa automaticamente da Monaco.
            const after = line.slice(position.column - 1);
            if (!/^[^\[\]\r\n]*\]?\s*$/.test(after)) {
              return { suggestions: [] };
            }

            const [, tagName, query] = match;
            const tag = (model.get('tags') || [])
              .find(item => item.name === tagName);
            return {
              suggestions: (tag?.properties || [])
                .filter(p => p.key.toLowerCase().startsWith(query.toLowerCase()))
                .map(p => ({
                  label: p.key,
                  kind: monaco.languages.CompletionItemKind.Property,
                  filterText: p.key,
                  insertText: `${p.key}]`,
                  range: {
                    insert: new monaco.Range(
                      1,
                      position.column - query.length,
                      1,
                      position.column
                    ),
                    replace: new monaco.Range(
                      1,
                      position.column - query.length,
                      1,
                      line.length + 1
                    )
                  },
                  command: {
                    id: loadPropertyCommand,
                    title: 'Carica proprietà'
                  }
                }))
            };
          }
        }
      );
    },

    findTags(text) {
      return Array.from(text.matchAll(new RegExp(this.tagPattern)), match => ({
        name: match[1],
        start: match.index + match[0].length - match[1].length
      }));
    },

    getTagAt(text, offset, includeEnd = false) {
      return this.findTags(text).find(tag => {
        const end = tag.start + tag.name.length;
        return offset >= tag.start && (offset < end || (includeEnd && offset === end));
      });
    },

    getTagAtCursor() {
      if (this.monacoEditor) {
        const textModel = this.monacoEditor.getModel();
        const position = this.monacoEditor.getPosition();
        if (!textModel || !position) return;
        return this.getTagAt(
          textModel.getLineContent(position.lineNumber), position.column - 1, true
        );
      }
      if (!this.ed) return;
      const offset = this.ed.selectionDirection === 'backward'
        ? this.ed.selectionStart : this.ed.selectionEnd;
      return this.getTagAt(this.ed.value, offset, true);
    },

    async openTagPanel(tagName, generation = this.generation) {
      if (this.generation !== generation) return;
      try {
        await page.home.addTagview(tagName);
        if (this.generation !== generation) return;
        page.home.activateTagview(tagName);
      } catch (error) {
        if (this.generation === generation) {
          this.addStatus(`Impossibile aprire ${tagName}: ${error.message}`, 'error');
        }
      }
    },

    bindTagNavigation(editor, monaco, generation) {
      return editor.onMouseDown(async e => {
        if (!e.event.ctrlKey || !e.event.leftButton ||
            e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT ||
            !e.target.position) return;
        const {lineNumber, column} = e.target.position;
        const textModel = editor.getModel();
        if (!textModel) return;
        const tag = this.getTagAt(textModel.getLineContent(lineNumber), column - 1);
        if (!tag) return;
        e.event.preventDefault();
        e.event.stopPropagation();
        await this.openTagPanel(tag.name, generation);
      });
    },

    bindDecorations(editor, monaco, resources) {
      const tags = editor.createDecorationsCollection();
      const reply = editor.createDecorationsCollection();
      const update = () => {
        const textModel = editor.getModel();
        if (!textModel) return;
        tags.set(this.findTags(textModel.getValue()).map(tag => {
          const a = textModel.getPositionAt(tag.start);
          const b = textModel.getPositionAt(tag.start + tag.name.length);
          return {
            range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column),
            options: {inlineClassName: this.tagTypes[tag.name[0]].className}
          };
        }));
        const match = textModel.getLineContent(1).match(this.replyPattern);
        reply.set(match ? [{
          range: new monaco.Range(1, 1, 1, match[0].length + 1),
          options: {
            inlineClassName: 'reply-reference-bg',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
          }
        }] : []);
      };
      resources.push(editor.onDidChangeModelContent(update));
      update();
    },

    addStatus(message, state = 'info') {
      if (!message || !this.status?.isConnected) return;

      const now = new Date();
      const time = now.toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const item = view.el('div', {
        className: 'editor-status-item',
        dataset: {state}
      }, [
        view.el('time', {
          className: 'editor-status-time',
          dateTime: now.toISOString(),
          textContent: time
        }),
        view.el('span', {
          textContent: message
        })
      ]);

      const container = this.status;
      container.appendChild(item);

      requestAnimationFrame(() => {
        if (container.isConnected) {
          container.scrollLeft = container.scrollWidth;
        }
      });
    },

    loadMonaco() {
      // Monaco belongs to this view; only the runtime load is shared across renders.
      // Optional override: window.JOURNOTE_MONACO_VS = '/vendor/monaco/min/vs'.
      if (window.monaco?.editor) return Promise.resolve(window.monaco);
      if (this.loading) return this.loading;
      this.loading = new Promise((resolve, reject) => {
        const vs = (
          window.JOURNOTE_MONACO_VS ||
          'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'
        ).replace(/\/$/, '');

        if (!window.MonacoEnvironment) {
          const worker = new Blob([
            `self.MonacoEnvironment={baseUrl:${JSON.stringify(vs + '/')}};importScripts(${JSON.stringify(vs + '/base/worker/workerMain.js')});`
          ], {type: 'text/javascript'});
          const workerUrl = URL.createObjectURL(worker);
          window.MonacoEnvironment = {getWorkerUrl: () => workerUrl};
          window.addEventListener('pagehide', event => {
            if (!event.persisted) URL.revokeObjectURL(workerUrl);
          }, {once: true});
        }

        const timer = setTimeout(
          () => reject(new Error('Timeout caricamento Monaco')),
          20000
        );
        const fail = error => {
          clearTimeout(timer);
          reject(error);
        };
        const start = () => {
          try {
            window.require.config({paths: {vs}});
            window.require(['vs/editor/editor.main'], () => {
              clearTimeout(timer);
              resolve(window.monaco);
            }, fail);
          } catch (error) {
            fail(error);
          }
        };

        if (window.require?.config) {
          start();
        } else {
          const script = view.el('script', {
            src: `${vs}/loader.js`,
            onload: start
          });
          script.onerror = () => fail(
            new Error('Monaco non disponibile; editor semplice attivo')
          );
          document.head.appendChild(script);
        }
      }).catch(error => {
        this.loading = null;
        throw error;
      });
      return this.loading;
    },

    readEditorToken(name, fallback) {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim() || fallback;
    },

    readEditorColor(name, fallback) {
      const value = this.readEditorToken(name, fallback);
      return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
    },

    installEditorTheme(monaco) {
      const colors = {
        paper: this.readEditorColor('--paper', '#ffffff'),
        paperMuted: this.readEditorColor('--paper-muted', '#f6f9f7'),
        ink: this.readEditorColor('--ink', '#25332d'),
        muted: this.readEditorColor('--muted', '#68766f'),
        border: this.readEditorColor('--border', '#d8e2dc'),
        accent: this.readEditorColor('--accent', '#286b56'),
        accentStrong: this.readEditorColor('--accent-strong', '#1b5744'),
        accentSoft: this.readEditorColor('--accent-soft', '#e1eee7'),
        error: this.readEditorColor('--c-error', '#d34e4e'),
        event: this.readEditorColor('--c-event', '#366f91'),
        generic: this.readEditorColor('--c-generic', '#a7503b')
      };

      monaco.editor.defineTheme('journote-markdown', {
        base: 'vs',
        inherit: true,
        rules: [
          ['', colors.ink],
          ['keyword', colors.accentStrong, 'bold'],
          ['strong', colors.ink, 'bold'],
          ['emphasis', colors.ink, 'italic'],
          ['string', colors.generic],
          ['string.link', colors.event],
          ['variable', colors.event],
          ['comment', colors.muted],
          ['tag', colors.accent]
        ].map(([token, color, fontStyle]) => ({
          token, foreground: color.slice(1), ...(fontStyle ? {fontStyle} : {})
        })),
        colors: {
          'editor.background': colors.paper,
          'editor.foreground': colors.ink,
          'editorCursor.foreground': colors.accentStrong,

          'editor.selectionBackground': '#c9dfd2',
          'editor.inactiveSelectionBackground': colors.accentSoft,
          'editor.selectionHighlightBackground': '#e1eee780',
          'editor.selectionHighlightBorder': '#a5c6b4',

          'editor.wordHighlightBackground': '#e1eee780',
          'editor.wordHighlightStrongBackground': '#c9dfd280',
          'editor.findMatchBackground': '#ead8a3',
          'editor.findMatchHighlightBackground': '#f8f0d9',
          'editor.findMatchBorder': '#bd8b22',

          'editor.lineHighlightBackground': colors.paperMuted,
          'editorLineNumber.foreground': colors.muted,
          'editorLineNumber.activeForeground': colors.accentStrong,
          'editorGutter.background': colors.paper,
          'editorWhitespace.foreground': '#c5d2ca',
          'editorIndentGuide.background1': '#edf1ee',
          'editorIndentGuide.activeBackground1': '#a5c6b4',

          'editorBracketMatch.background': colors.accentSoft,
          'editorBracketMatch.border': '#a5c6b4',
          'editorLink.activeForeground': colors.event,
          'editorError.foreground': colors.error,

          'editorWidget.background': colors.paperMuted,
          'editorWidget.foreground': colors.ink,
          'editorWidget.border': colors.border,
          'editorHoverWidget.background': colors.paper,
          'editorHoverWidget.foreground': colors.ink,
          'editorHoverWidget.border': colors.border,

          'input.background': colors.paper,
          'input.foreground': colors.ink,
          'input.border': colors.border,
          'input.placeholderForeground': colors.muted,
          'inputOption.activeBackground': colors.accentSoft,
          'inputOption.activeForeground': colors.accentStrong,
          'inputOption.activeBorder': '#a5c6b4',

          'list.activeSelectionBackground': colors.accentSoft,
          'list.activeSelectionForeground': colors.accentStrong,
          'list.focusBackground': colors.accentSoft,
          'list.focusForeground': colors.accentStrong,
          'list.hoverBackground': colors.paperMuted,
          'list.hoverForeground': colors.ink,

          'menu.background': colors.paper,
          'menu.foreground': colors.ink,
          'menu.border': colors.border,
          'menu.selectionBackground': colors.accentSoft,
          'menu.selectionForeground': colors.accentStrong,
          'menu.separatorBackground': colors.border,

          'scrollbarSlider.background': '#bccbc280',
          'scrollbarSlider.hoverBackground': '#a5b9adc0',
          'scrollbarSlider.activeBackground': '#86ad96',
          'scrollbar.shadow': '#00000000',

          'focusBorder': '#86ad96',
          'widget.shadow': '#223e2f18'
        }
      });
    },

    createEditorAdapter(editor, host, monaco) {
      const model = editor.getModel();
      return {
        style: host.style,
        get value() {
          return model.getValue();
        },
        set value(value) {
          editor.setValue(String(value ?? ''));
        },
        get selectionStart() {
          return model.getOffsetAt(editor.getSelection().getStartPosition());
        },
        get selectionEnd() {
          return model.getOffsetAt(editor.getSelection().getEndPosition());
        },
        focus() {
          editor.focus();
        },
        setSelectionRange(start, end) {
          const a = model.getPositionAt(start);
          const b = model.getPositionAt(end);
          editor.setSelection(
            new monaco.Selection(a.lineNumber, a.column, b.lineNumber, b.column)
          );
          editor.revealPositionInCenterIfOutsideViewport(b);
        },
        setRangeText(text, start, end, mode = 'preserve') {
          const a = model.getPositionAt(start);
          const b = model.getPositionAt(end);
          editor.pushUndoStop();
          editor.executeEdits('journote.replace', [{
            range: new monaco.Range(
              a.lineNumber, a.column, b.lineNumber, b.column
            ),
            text,
            forceMoveMarkers: true
          }]);

          if (mode === 'end') {
            this.setSelectionRange(start + text.length, start + text.length);
          } else if (mode === 'select') {
            this.setSelectionRange(start, start + text.length);
          }
          // Without an explicit cursor state Monaco tracks existing selections.
          editor.pushUndoStop();
        }
      };
    },

    dispose() {
      this.generation = (this.generation || 0) + 1;
      this.saving = false;
      this.editorEvents?.abort();
      this.editorEvents = null;
      this.monacoEditor?.dispose();
      this.monacoModel?.dispose();
      this.monacoEditor = null;
      this.monacoModel = null;
    },

    toggleMaximize() {
      const wrap = h.eid('EditorWrap');
      if (!wrap) return;

      const maximized = wrap.classList.toggle('editor-maximized');
      h.eid('NotesWorkspace')?.classList.toggle('editor-maximized', maximized);

      h.eid('ColumnsWrap')?.classList.toggle(
        'editor-maximized',
        maximized
      );

      const btn = h.eid('EditorMaximizeBtn');
      if (btn) {
        const label = maximized ? 'Minimize' : 'Maximize';
        btn.textContent = label;
        btn.title = `${label} editor`;
        btn.setAttribute('aria-label', `${label} editor`);
      }

      requestAnimationFrame(() => {
        this.monacoEditor?.layout();

        if (maximized) {
          if (this.monacoEditor) this.monacoEditor.focus();
          else this.ed?.focus();
        }
      });
    },

    updateImageUploadState() {
      const busy = this.pendingImageUploads > 0;
      h.eid('EditorSaveBtn').disabled = busy;
      h.eid('EditorUpdateBtn').disabled = busy;
      if (busy) {
        this.addStatus(`Immagini in caricamento: ${this.pendingImageUploads}`, 'loading');
      }
    },

    insertMarkdown(prefix, suffix) {
      if (this.monacoEditor) {
        const editor = this.monacoEditor;
        const textModel = editor.getModel();

        editor.pushUndoStop();
        editor.executeEdits(
          'journote.markdown',
          editor.getSelections().map(range => ({
            range,
            text: prefix + textModel.getValueInRange(range) + suffix,
            forceMoveMarkers: true
          })),
          inverseEdits => inverseEdits.map(edit => {
            const start =
              textModel.getOffsetAt(edit.range.getStartPosition()) +
              prefix.length;
            const end =
              textModel.getOffsetAt(edit.range.getEndPosition()) -
              suffix.length;
            const a = textModel.getPositionAt(start);
            const b = textModel.getPositionAt(end);
            return new window.monaco.Selection(
              a.lineNumber, a.column, b.lineNumber, b.column
            );
          })
        );
        editor.pushUndoStop();
        editor.focus();
        return;
      }

      const start = this.ed.selectionStart;
      const end = this.ed.selectionEnd;
      const selectedText = this.ed.value.slice(start, end);
      this.ed.setRangeText(
        `${prefix}${selectedText}${suffix}`,
        start,
        end,
        'select'
      );
      if (!selectedText) {
        const cursor = start + prefix.length;
        this.ed.setSelectionRange(cursor, cursor);
      }
      this.ed.focus();
    },

    clear() {
      if (this.pendingImageUploads) return false;
      this.ed.value = '';
      this.currentNote = null;
      h.eid('EditorSaveBtn').style.display = 'block';
      h.eid('EditorUpdateBtn').style.display = 'none';
      h.eid('EditorClearBtn').style.display = 'none';
      return true;
    },

    startPropertyEdit(tagName, key, value) {
      if (!this.clear()) return;
      this.ed.value = `${tagName}[${key}]\n${value ?? ''}`;
      this.ed.focus();
      this.ed.setSelectionRange(this.ed.value.length, this.ed.value.length);
    },

    async startReply(note) {
      await page.home.ensureHome();
      if (!this.clear()) return;
      this.ed.value = `<R:${note.id} `;
      this.ed.focus();
      this.ed.setSelectionRange(this.ed.value.length, this.ed.value.length);
    },

    renderEditNote(note) {
      if (this.pendingImageUploads) return;
      this.currentNote = note;
      const text = note.text ?? '';
      const replyPrefix = note.replied_to
        ? `<R:${note.replied_to}`
        : '';

      this.ed.value = replyPrefix && !(
        text === replyPrefix || text.startsWith(`${replyPrefix} `) ||
        text.startsWith(`${replyPrefix}\n`)
      )
        ? `${replyPrefix} ${text}`
        : text;
      this.ed.focus();
      h.eid('EditorSaveBtn').style.display = 'none';
      h.eid('EditorUpdateBtn').style.display = 'block';
      h.eid('EditorClearBtn').style.display = 'block';
      this.ed.setSelectionRange(this.ed.value.length, this.ed.value.length);
    },

    async saveNote() {
      if (this.saving || this.pendingImageUploads || !this.ed.value.trim()) return;
      const generation = this.generation;
      const current = this.currentNote;
      this.saving = true;
      const raw = this.ed.value;
      const newTags = businessLogic.getNewTags(raw);
      let saved = false;
      this.addStatus('Salvataggio in corso…', 'loading');
      try {
        const response = await businessLogic.saveNote(
          raw,
          this.parseLeadingDate(raw)
        );
        saved = true;
        if (this.generation !== generation) return;
        const isProperty = response.kind === 'tag_property';

        if (isProperty) {
          if (this.currentNote === current && this.ed.value === raw) this.ed.value = '';
          this.addStatus(`Proprietà salvata per ${response.tag}.`, 'success');
        } else {
          view.Main.pushNote(response.note);
          const leadingTags = [];
          for (const word of raw.split(/\s+/)) {
            if (/^[#@>+]/.test(word)) leadingTags.push(word);
            else break;
          }
          if (this.currentNote === current && this.ed.value === raw) {
            this.ed.value = leadingTags.length
              ? `${leadingTags.join(' ')} `
              : '';
          }
          this.ed.setSelectionRange(this.ed.value.length, this.ed.value.length);
          this.addStatus('Nota salvata.', 'success');
        }
        businessLogic.addActionRequiredTags(
          isProperty
            ? newTags.filter(tag => tag === response.tag)
            : newTags
        );
        await page.home.refreshMetadata();
        await view.ActionRequiredBox.render();
      } catch (error) {
        if (this.generation !== generation) return;
        this.addStatus(
          saved
            ? `Salvato, ma aggiornamento della vista fallito: ${error.message}`
            : `Salvataggio non riuscito: ${error.message}`,
          'error'
        );
      } finally {
        if (this.generation === generation) {
          this.saving = false;
        }
      }
    },

    async editNote() {
      if (this.saving || this.pendingImageUploads || !this.currentNote || !this.ed.value.trim()) return;
      const generation = this.generation;
      const current = this.currentNote;
      const raw = this.ed.value;
      const previousTags = [...(current.tags || [])];
      const previousDate = current.date;
      this.saving = true;
      let saved = false;
      this.addStatus('Aggiornamento della nota…', 'loading');
      try {
        const note = await businessLogic.editNote({
          ...current, text: raw, date: this.parseLeadingDate(raw) || current.date
        });
        saved = true;
        if (this.generation !== generation) return;
        this.addStatus('Nota aggiornata.', 'success');
        view.Main.editedNote(note, previousTags, previousDate);
        if (this.currentNote === current && this.ed.value === raw) this.clear();
        else if (this.currentNote === current) this.currentNote = note;
        await page.home.refreshMetadata();
      } catch (error) {
        if (this.generation !== generation) return;
        this.addStatus(
          saved
            ? `Nota salvata, aggiornamento fallito: ${error.message}`
            : `Salvataggio non riuscito: ${error.message}`,
          'error'
        );
      } finally {
        if (this.generation === generation) this.saving = false;
      }
    },

    parseLeadingDate(text) {
      const m = text.trim().match(/^(\d{4}-\d{2}-\d{2})\b/);
      return m ? m[1] : null;
    },
    focus() {
      if (this.monacoEditor) this.monacoEditor.focus();
      else this.ed?.focus();
    },
    isFocused() {
      if (this.monacoEditor) return this.monacoEditor.hasTextFocus();
      return document.activeElement === this.ed;
    }
  },

  TopBar: {
    render() {
      if (!view.mount(this, 'TopBar')) return;

      const navBtnsWrap = this.el.appendChild(
        view.el('div', {className: 'navBtnsWrap'})
      );

      const navigation = [
        ['HamburgerBtn', 'bars', 'Menu', 'standard', () => model.set('leftBarVisible', !model.get('leftBarVisible'))],
        ['HomeBtn', 'home', 'Home', 'secondary', () => { location.hash = '/home'; }],
        ['calendarBtn', 'calendar', 'Calendario', 'secondary', () => { location.hash = '/calendar'; }],
        ['explorerBtn', 'database', 'Explorer', 'secondary', () => { location.hash = '/explorer'; }]
      ];
      for (const [id, icon, label, variant, onclick] of navigation) {
        navBtnsWrap.appendChild(view.el('button', {
          type: 'button', id, className: `navBtn btn ${variant}`,
          title: label, 'aria-label': label,
          innerHTML: `<i class="fa-xs fa-fw fa-solid fa-${icon} fa-middle" aria-hidden="true"></i>`,
          style: {
            top: '10px', left: '10px', zIndex: '1000', fontSize: '20px', height: '36px',
            display: id === 'HamburgerBtn' && !h.eid('LeftBar') ? 'none' : ''
          },
          onclick
        }));
      }

      this.tc = this.el.appendChild(
        view.el('div', {
          id: 'TopBarContainer',
          className: 'scrollable-x'
        })
      );
    },

    addTab(tag, notes, label = tag) {
      const elPill = this.tc.appendChild(view.el('div', {
        className: 'tabPill',
        title: label,
        dataset: {key: tag},
        onclick: () => page.home.activateTagview(tag)
      }));
      const elPillLabel = elPill.appendChild(view.el('span', {
        textContent: label
      }));
      const elPillCloseBtn = elPill.appendChild(view.el('span', {
        className: 'x',
        textContent: '×',
        onclick: ev => {
          ev.stopPropagation();
          page.home.removeTagview(tag);
        }
      }));
      elPill.scrollIntoView({behavior: 'smooth', inline: 'start'});
    },

    activateTab(tag) {
      console.log('[fn] TopBar.activate', tag);
      for (const el of document.querySelectorAll('.tabPill')) {el.classList.remove('active');}
      const pill = document.querySelector(`.tabPill[data-key="${CSS.escape(String(tag))}"]`);
      if (pill) {
        pill.scrollIntoView({
          behavior: 'smooth',
          inline: 'nearest',
          container: 'nearest'
        });
        pill.classList.add('active');
      }
    },

    removeTab(tag) {
      console.log('[fn] removeTagview', tag);
      const pill = this.tc.querySelector(`.tabPill[data-key="${CSS.escape(String(tag))}"]`);
      if (pill) pill.remove();
    }
  },

  ProjectFiles: {
    el: null,
    observer: null,
    width: 320,
    dispose() {
      this.observer?.disconnect();
      this.observer = null;
      this.el = null;
    },
    mount(workspace) {
      this.dispose();
      const handle = workspace.appendChild(view.el('div', {
        role: 'separator', tabindex: 0, 'aria-orientation': 'vertical',
        'aria-label': 'Larghezza colonna file', 'aria-controls': 'ProjectFiles',
        className: 'project-files-resizer'
      }));
      const panel = this.el = workspace.appendChild(view.el('aside', {
        id: 'ProjectFiles', tabindex: -1, 'aria-label': 'File della scheda attiva',
        className: 'project-files'
      }));
      const resize = width => {
        const available = workspace.getBoundingClientRect().width;
        const max = Math.max(80, Math.min(640, available * 0.6));
        const min = Math.min(180, max);
        const actual = Math.round(Math.max(min, Math.min(max, width)));
        panel.style.width = `${actual}px`;
        handle.setAttribute('aria-valuemin', String(Math.round(min)));
        handle.setAttribute('aria-valuemax', String(Math.round(max)));
        handle.setAttribute('aria-valuenow', String(actual));
        return actual;
      };
      let drag = null;
      handle.onpointerdown = ev => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        handle.focus();
        drag = {x: ev.clientX, width: panel.getBoundingClientRect().width};
        handle.setPointerCapture(ev.pointerId);
      };
      handle.onpointermove = ev => {
        if (drag) this.width = resize(drag.width + drag.x - ev.clientX);
      };
      handle.onpointerup = ev => {
        drag = null;
        if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
      };
      handle.onpointercancel = handle.onlostpointercapture = () => { drag = null; };
      handle.onkeydown = ev => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
        ev.preventDefault();
        ev.stopPropagation();
        const current = panel.getBoundingClientRect().width;
        this.width = resize(ev.key === 'Home' ? 0 : ev.key === 'End' ? Infinity
          : current + (ev.key === 'ArrowLeft' ? 20 : -20));
      };
      this.observer = new ResizeObserver(() => resize(this.width));
      this.observer.observe(workspace);
      resize(this.width);
    },
    fileType(name) {
      const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
      const types = [
        ['pdf', 'file-pdf', 'PDF'],
        ['doc docx odt rtf', 'file-word', 'Documento'],
        ['xls xlsx xlsm ods csv tsv', 'file-excel', 'Foglio di calcolo'],
        ['ppt pptx odp', 'file-powerpoint', 'Presentazione'],
        ['png jpg jpeg gif svg webp bmp ico tif tiff heic avif', 'file-image', 'Immagine'],
        ['mp3 wav flac aac m4a ogg wma', 'file-audio', 'Audio'],
        ['mp4 mov avi mkv webm m4v wmv', 'file-video', 'Video'],
        ['zip rar 7z tar gz bz2 xz', 'file-zipper', 'Archivio'],
        ['js ts jsx tsx py html css scss json xml yaml yml sql sh bat ps1 c cpp h java cs go rs php', 'file-code', 'Codice'],
        ['txt md log ini cfg', 'file-lines', 'Testo']
      ];
      const match = types.find(([extensions]) => extensions.split(' ').includes(extension));
      return match ? {icon: match[1], label: match[2]} : {icon: 'file', label: 'File'};
    },
    icon(name, label) {
      return view.el('i', {
        className: `project-files-icon fa-solid fa-fw fa-${name}`,
        'aria-hidden': 'true', title: label
      });
    },
    appendTree(list, entries, tag) {
      for (const entry of entries) {
        const item = list.appendChild(view.el('li', {className: 'project-files-node'}));
        if (!entry.directory) {
          const type = this.fileType(entry.name);
          item.appendChild(view.el('button', {
            type: 'button', className: 'project-files-row project-files-file',
            title: `Anteprima: ${entry.name}`, 'aria-label': `Anteprima: ${entry.name}`,
            onclick: () => modal.filePreview.open(tag, entry)
          }, [
            this.icon(type.icon, type.label),
            view.el('span', {className: 'project-files-name', textContent: entry.name})
          ]));
          continue;
        }
        const folder = item.appendChild(view.el('details', {className: 'project-files-folder'}));
        const summary = folder.appendChild(view.el('summary', {className: 'project-files-row', title: entry.name}));
        const icon = this.icon('folder', 'Cartella');
        summary.append(icon, view.el('span', {className: 'project-files-name', textContent: entry.name}));
        const children = folder.appendChild(view.el('ul', {className: 'project-files-children'}));
        let loaded = false;
        let loading = false;
        folder.addEventListener('toggle', async () => {
          icon.classList.toggle('fa-folder-open', folder.open);
          icon.classList.toggle('fa-folder', !folder.open);
          if (!folder.open || loaded || loading) return;
          loading = true;
          folder.setAttribute('aria-busy', 'true');
          children.replaceChildren(view.el('li', {className: 'project-files-message', textContent: 'Caricamento…', role: 'status'}));
          try {
            const result = await api.projectFolder(tag, 'files', {relative: entry.path});
            if (!folder.isConnected) return;
            children.replaceChildren();
            this.appendTree(children, result.entries, tag);
            if (!result.entries.length) children.appendChild(view.el('li', {
              className: 'project-files-message', textContent: 'Cartella vuota.'
            }));
            loaded = true;
          } catch (error) {
            if (!folder.isConnected) return;
            children.replaceChildren(view.el('li', {
              className: 'project-files-message', role: 'status',
              textContent: `${error.message} Chiudi e riapri la cartella per riprovare.`
            }));
          } finally {
            loading = false;
            folder.removeAttribute('aria-busy');
          }
        });
      }
    },
    render(selecting = false) {
      if (!this.el?.isConnected) return;
      const tag = model.get('tagsActive');
      // A separate DOM session prevents old tab requests from painting a new tab.
      const panel = view.el('section', {className: 'project-files-session'});
      this.el.replaceChildren(panel);
      if (!tag || h.getClassfromTag(tag) !== 'Projects') {
        panel.appendChild(view.el('h2', {textContent: 'File del progetto'}));
        panel.appendChild(view.el('p', {textContent: 'Seleziona una scheda progetto per visualizzare i file.'}));
        return;
      }
      const title = panel.appendChild(view.el('h2', {className: 'project-files-title'}));
      const pathForm = panel.appendChild(view.el('form', {className: 'project-files-path-form'}));
      const pathInput = pathForm.appendChild(view.el('input', {
        type: 'text', 'aria-label': 'Percorso cartella', placeholder: 'C:\\Progetti',
        className: 'project-files-path-input'
      }));
      pathForm.appendChild(view.el('button', {type: 'submit', className: 'btn standard', textContent: 'Vai'}));
      const pathLabel = panel.appendChild(view.el('p', {className: 'project-files-path'}));
      const toolbar = panel.appendChild(view.el('div', {className: 'project-files-toolbar'}));
      const status = panel.appendChild(view.el('p', {className: 'project-files-status', role: 'status', 'aria-live': 'polite'}));
      const list = panel.appendChild(view.el('ul', {className: 'project-files-tree', 'aria-label': 'File e cartelle'}));
      const actions = panel.appendChild(view.el('div', {className: 'project-files-actions'}));
      let currentPath = null;
      let currentRelative = '';
      let generation = 0;
      let saving = false;
      const button = (parent, label, handler) => parent.appendChild(view.el('button', {
        type: 'button', className: 'btn standard', textContent: label, onclick: handler
      }));
      const save = button(actions, 'Collega questa cartella', async () => {
        if (!currentPath || saving) return;
        saving = true;
        save.disabled = true;
        try {
          await api.projectFolder(tag, 'link', {path: currentPath});
          // Existing metadata refresh keeps open column properties up to date.
          try {
            await model.tags.reload();
            view.TagsBoxList.render();
            view.Main.refreshTagDetails();
          } catch (error) {
            view.EditorWrap.addStatus(`Cartella salvata; aggiornamento metadati fallito: ${error.message}`, 'error');
          }
          if (panel.isConnected) {
            selecting = false;
            await load('');
          }
        } catch (error) {
          status.textContent = error.message;
        } finally {
          saving = false;
          save.disabled = !currentPath;
        }
      });
      const cancel = button(actions, 'Annulla', () => { selecting = false; load(''); });
      const load = async (path) => {
        const requestGeneration = ++generation;
        currentPath = null;
        save.disabled = true;
        save.hidden = !selecting;
        cancel.hidden = !selecting;
        pathForm.hidden = !selecting;
        title.textContent = `${selecting ? 'Collega cartella' : 'File del progetto'} — ${tag}`;
        status.textContent = 'Caricamento…';
        list.replaceChildren();
        toolbar.replaceChildren();
        pathLabel.textContent = '';
        try {
          const result = await api.projectFolder(tag, selecting ? 'browse' : 'files',
            selecting ? {path} : {relative: path});
          if (requestGeneration !== generation || !panel.isConnected) return;
          currentPath = result.path;
          currentRelative = result.relative || '';
          pathLabel.textContent = result.path || 'Seleziona un disco';
          pathInput.value = result.path || '';
          save.disabled = !currentPath || saving;
          if (selecting && result.parent !== null) button(toolbar, '↑ Cartella superiore', () => load(result.parent));
          if (selecting) button(toolbar, 'Dischi', () => load(''));
          else button(toolbar, 'Cambia cartella', () => { selecting = true; load(currentPath || ''); });
          button(toolbar, 'Aggiorna', () => load(selecting ? currentPath || '' : currentRelative));
          if (selecting) {
            for (const entry of result.entries) {
              const row = list.appendChild(view.el('li'));
              const choose = button(row, '', () => load(entry.path));
              choose.className = 'project-files-row project-files-choose';
              choose.append(view.ProjectFiles.icon('folder', 'Cartella'),
                view.el('span', {textContent: entry.name}));
            }
          } else {
            view.ProjectFiles.appendTree(list, result.entries, tag);
          }
          status.textContent = !selecting && result.linked === false ? 'Nessuna cartella collegata.'
            : result.entries.length ? `${result.entries.length} elementi` : 'Cartella vuota.';
        } catch (error) {
          if (requestGeneration !== generation || !panel.isConnected) return;
          status.textContent = error.message;
          if (selecting) button(toolbar, 'Dischi', () => load(''));
          else button(toolbar, 'Collega o cambia cartella', () => { selecting = true; load(''); });
        }
      };
      pathForm.onsubmit = ev => { ev.preventDefault(); load(pathInput.value); };
      // Editing a path invalidates the previous browse selection until Vai is used.
      pathInput.oninput = () => { currentPath = null; save.disabled = true; };
      // Prevent app-wide shortcuts while typing a folder path.
      pathInput.addEventListener('keydown', ev => ev.stopPropagation());
      const project = (model.get('tags') || []).find(item => item.name === tag);
      const linkedPath = project?.properties?.find(item => item.key === 'local_folder')?.value || '';
      load(selecting ? linkedPath : '');
      if (selecting) pathInput.focus();
    }
  },

  Main: {
    render() {
      if (!view.mount(this, 'Main')) return;
      this.el_tb = this.el.appendChild(view.el('div', {id: 'TopBar'}));
      const workspace = this.el.appendChild(view.el('div', {
        id: 'NotesWorkspace'
      }));
      this.el_cw = workspace.appendChild(view.el('div', {
        id: 'ColumnsWrap', className: 'columns scrollable-x'
      }));
      view.ProjectFiles.mount(workspace);
      this.el_ew = this.el.appendChild(view.el('div', {id: 'EditorWrap'}));
      view.TopBar.render();
      view.EditorWrap.render();
    },

    addTab(tag, notes, events, label = tag) {
      const tagObj = (model.get('tags') || []).find(t => t.name === tag);
      const elColumn = this.el_cw.appendChild(view.el('div', {className: 'column fullwidth', dataset: {key: tag}}));
      const elColumnResizer = elColumn.appendChild(view.el('div', {className: 'ColumnResizer'}));
      view.Main.makeResizable(elColumn, elColumnResizer);
      const elColCont = elColumn.appendChild(view.el('div', {className: 'column-content', dataset: {key: tag}}));
      
      /* ColHeader */
      const elColHeader = elColCont.appendChild(view.el('div', {
        className: 'columnHeader',
        textContent: label,
        onclick: ev => {ev.stopPropagation(); page.home.activateTagview(tag);}
      }));
      const elColHeaderBtnWrap = elColHeader.appendChild(view.el('div', {className: 'columnHeaderBtns'}));
      if (h.getClassfromTag(tag) === 'Projects') {
        elColHeaderBtnWrap.appendChild(view.el('button', {
          type: 'button', className: 'btnp primary',
          title: 'File della cartella collegata',
          'aria-label': 'File della cartella collegata',
          innerHTML: '<i class="fa-solid fa-folder-open fa-fw fa-xs" aria-hidden="true"></i>',
          onclick: ev => {
            ev.stopPropagation();
            page.home.activateTagview(tag);
            view.ProjectFiles.el?.focus();
          }
        }));
      }
      elColHeaderBtnWrap.appendChild(view.el('button', {
        className: 'btnp primary',
        title: 'Show sub header',
        innerHTML: '<i class="fa fa-eye fa-fw fa-solid fa-xs"> </i>',
        onclick: ev => {ev.stopPropagation(); elColumn.classList.toggle('showSubHeader');}
      }));
      elColHeaderBtnWrap.appendChild(view.el('button', {
        className: 'btnp primary fullWidthBtn',
        title: 'Full width',
        innerHTML: '<i class="fa fa-arrows-left-right-to-line fa-fw fa-solid fa-xs"> </i>',
        onclick: ev => {ev.stopPropagation(); elColumn.classList.toggle('fullwidth');}
      }));
      elColHeaderBtnWrap.appendChild(view.el('button', {
        innerHTML: '<i class="fa fa-x fa-fw fa-solid fa-xs"> </i>',
        title: 'Close tab',
        className: 'btnp primary',
        onclick: ev => {ev.stopPropagation();page.home.removeTagview(tag);}
      }));

      /* ColSubHeader */
      const elColSubheader = elColCont.appendChild(view.el('div', {className: 'columnSubHeader'}));
      this.renderTagDetails(elColSubheader, tag, tagObj);

      /* NotesList */
      const elNoteList = elColCont.appendChild(view.el('div', {className: 'notesList scrollable'}));
      const dayNumber = date => (
        /^\d{4}-\d{2}-\d{2}$/.test(date || '')
          ? Date.parse(`${date}T00:00:00Z`) / 86400000
          : NaN
      );
      const allItems = notes
        .concat(events.filter(ev => ev.date !== null))
        .concat([{date: h.localDate(), today: true}])
        .sort((a,b) => {
          const aDate = dayNumber(a.date);
          const bDate = dayNumber(b.date);
          if (Number.isFinite(aDate) && Number.isFinite(bDate)) {
            return aDate - bDate;
          }
          return 0;
        });
      allItems.forEach((note, index) => {    
        if (index > 0) {
          const days = Math.abs(dayNumber(note.date) - dayNumber(allItems[index - 1].date));
          if (Number.isFinite(days) && days > 0) {
            const months = Math.floor(days / 28);
            let remainingDays = days % 28;
            const weeks = Math.floor(remainingDays / 7);
            remainingDays = days % 7;
            for (let i = 0; i < months + weeks + remainingDays; i++) {
              elNoteList.appendChild(view.el('div', {
                className: i < months
                  ? 'notesDateGap-line notesDateGap-month'
                  : i < weeks 
                    ? 'notesDateGap-line notesDateGap-week'
                    :'notesDateGap-line',
                'aria-hidden': 'true'
              }));
            }
          }
        }
        if(note.today) {
          elNoteList.appendChild(this.genTodayItem(note, tag));
        } else if(note.category && note.category !== '') {
          elNoteList.appendChild(this.genEventItem(note, tag));
        } else {
          elNoteList.appendChild(this.genNoteItem(note, tag));
        }
      });

      setTimeout(() => {
        elNoteList.scrollTop = elNoteList.scrollHeight;
      }, 0);
      
      /* activate column */
      page.home.activateTagview(tag);
    },

    genEventItem(event, tag) {
      const elNoteItem = view.el('div', {
        className: `noteItem eventItem`,
        dataset: {id: event.name, date: event.date}
      });
      const elNoteDate = elNoteItem.appendChild(view.el('div', {
          className: 'noteDate flex-col',
          innerHTML:
            new Date(`${event.date}T12:00:00`)
              .toLocaleString('default', {month: 'short'}) +
            '-' + event.date.substring(8, 10)
      }));
      
      const elNoteText = elNoteItem
        .appendChild(view.el('div', {className: 'noteTextWrap'}))
        .appendChild(view.el('div', {className: 'noteText'}))
        .appendChild(view.el('p', {textContent: event.name}));

      return elNoteItem;
    },

    genTodayItem(event, tag) {
      const elNoteItem = view.el('div', {
        className: `noteItem todayItem`,
        dataset: {id: 'today', date: event.date}
      });
      const elNoteDate = elNoteItem.appendChild(view.el('div', {
          className: 'noteDate flex-col',
          innerHTML:
            new Date(`${event.date}T12:00:00`)
              .toLocaleString('default', {month: 'short'}) +
            '-' + event.date.substring(8, 10)
      }));
      
      const elNoteText = elNoteItem
        .appendChild(view.el('div', {className: 'noteTextWrap'}))
        .appendChild(view.el('div', {className: 'noteText'}))
        .appendChild(view.el('i', {textContent: 'Oggi'}));

      return elNoteItem;
    },
    renderTagDetails(elColSubheader, tag, tagObj) {
      elColSubheader.replaceChildren();
      if (tagObj == undefined) {
        const tagType = h.getClassfromTag(tag);
        if (tagType == 'Journal') {
          elColSubheader.innerHTML = new Date(`${tag}T12:00:00`).toLocaleDateString('it-IT', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } else if (tagType == 'FullText') {
          elColSubheader.innerHTML = '';
        } else {
          console.error('tagObj is undefined and tagType not recognized', tag, tagType);
        }
      } else {
        const conv = new showdown.Converter({metadata: true});
        elColSubheader.innerHTML = conv.makeHtml(h.escapeHTML(tagObj.content || ''));
        h.sanitizeRenderedMarkdown(elColSubheader);

        const properties = Array.isArray(tagObj.properties)
          ? tagObj.properties
          : [];
        if (properties.length) {
          const elColProperties = elColSubheader.appendChild(
            view.el('div', {className: 'columnTagProperties'})
          );
          for (const property of properties) {
            const elProperty = elColProperties.appendChild(
              view.el('div', {className: 'columnTagProperty'})
            );
            const elPropertyBody = elProperty.appendChild(
              view.el('div', {className: 'columnTagPropertyBody'})
            );
            elPropertyBody.appendChild(view.el('div', {
              className: 'columnTagPropertyKey',
              textContent: property.key
            }));
            const elPropertyValue = elPropertyBody.appendChild(
              view.el('div', {className: 'columnTagPropertyValue'})
            );
            elPropertyValue.innerHTML = conv.makeHtml(
              h.escapeHTML(property.value ?? '')
            );
            h.sanitizeRenderedMarkdown(elPropertyValue);
            elProperty.appendChild(view.el('button', {
              className: 'btn muted small transparent columnTagPropertyEditBtn',
              innerHTML: '<i class="fa fa-pencil fa-solid fa-fw fa-2xs"></i>',
              title: `Edit property ${property.key}`,
              'aria-label': `Edit property ${property.key}`,
              onclick: ev => {
                ev.stopPropagation();
                view.EditorWrap.startPropertyEdit(
                  tagObj.name,
                  property.key,
                  property.value
                );
              }
            }));
          }
        }
      }

    },

    refreshTagDetails() {
      if (!h.eid('Main')) return;
      const tags = new Map((model.get('tags') || []).map(tag => [tag.name, tag]));
      for (const column of this.el_cw.querySelectorAll('.column')) {
        this.renderTagDetails(column.querySelector('.columnSubHeader'), column.dataset.key, tags.get(column.dataset.key));
      }
    },

    activateTab(tag) {
      console.log('[fn] Main.activate', tag);
      for (const el of this.el_cw.querySelectorAll('.column')) {
        el.classList.remove('active');
      }
      const col = this.el_cw.querySelector(`.column[data-key="${CSS.escape(String(tag))}"]`);
      if (col) {
        col.scrollIntoView({behavior: 'smooth', inline: 'start'});
        col.classList.add('active');
      }
    },

    removeTab(tag) {
      const elColToRemove = this.el_cw.querySelector(
        `.column[data-key="${CSS.escape(String(tag))}"]`
      );
      if (elColToRemove) elColToRemove.remove();
    },

    resetFullWidth() {
      for (const col of this.el_cw.querySelectorAll(
        '.column.fullwidth'
      )) {
        col.classList.remove('fullwidth');
      }
    },

    pushNote(note) {
      for (const tag of new Set([...(note.tags || []), note.date])) {
        if (!model.get('tagsVisible').includes(tag)) continue;
        const list = this.el_cw?.querySelector(`.column[data-key="${CSS.escape(tag)}"] .notesList`);
        if (!list) continue;
        list.querySelector('.empty-state')?.remove();
        const item = this.genNoteItem(note, tag);
        list.appendChild(item);
        item.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'nearest'});
      }
    },

    updateTab(tag, notes) {
      const column = this.el_cw?.querySelector(
        `.column[data-key="${CSS.escape(String(tag))}"]`
      );
      const noteList = column?.querySelector('.notesList');
      if (!noteList) return;
      if (notes.length === 0) {
        this.showEmptyState(noteList, tag);
        return;
      }
      noteList.replaceChildren(
        ...notes.map(note => this.genNoteItem(note, tag))
      );
    },

    showEmptyState(noteList, tag) {
      const message = view.el('p', {
        className: 'empty-state'
      });
      if (tag.startsWith('filter-')) {
        message.textContent = 'Nessuna nota corrisponde a questa regola.';
      } else if (h.getClassfromTag(tag) === 'Journal') {
        message.textContent = 'Nessuna nota per questa data.';
      } else {
        message.textContent = 'Nessuna nota in questa raccolta.';
      }
      noteList.replaceChildren(message);
    },

    genNoteItem(n, currentTag, relatedRole = null, {editable = true} = {}) {
      let taskClass = '';
      if (n.task != null && n.task != '') {
        taskClass = 'task-' + n.task;
      }

      const elNoteItem = view.el('div', {
        className: `noteItem ${taskClass}`,
        dataset: {id: n.id, date: n.date}
      });
      if (relatedRole) {
        elNoteItem.classList.add(
          'noteItem-related',
          relatedRole === 'parent'
            ? 'noteItem-related-parent'
            : 'noteItem-related-child'
        );
      }

      const elNoteDate = elNoteItem.appendChild(
        view.el('div', {
          className: 'noteDate flex-col',
          innerHTML:
            new Date(`${n.date}T12:00:00`).toLocaleString('default', {month: 'short'}) +
            '-' + n.date.substring(8, 10) +
            (
              n.duedate
                ? '<br><span class="color--c-error">' +
                  new Date(`${n.duedate}T12:00:00`).toLocaleString('default', {month: 'short'}) +
                  '-' +
                  n.duedate.substring(8, 10) + '</span>'
                : ''
            )
        })
      );

      {
        const elReplyIndicators = elNoteItem.appendChild(view.el('div', {className: 'noteReplyIndicators flex-col'}));

        if (!elNoteItem.classList.contains('noteItem-related-child')) {
          elReplyIndicators.appendChild(view.el('button', {
            className: n.replied_to
              ? 'btn primary small'
              : 'btn transparent muted small',
            innerHTML:
              '<i class="fa-solid fa-caret-up fa-2xs fa-fw"></i>',
            title: n.replied_to
              ? 'Risponde a un\'altra nota'
              : 'Nessuna nota a cui risponde',
            'aria-label': n.replied_to
              ? 'Risponde a un\'altra nota'
              : 'Nessuna nota a cui risponde',
            tabindex: n.replied_to ? 0 : -1,
            onclick: (ev) => {
              ev.stopPropagation();
              if (n.replied_to) {
                if (elNoteItem.classList.contains('replied_to-open')) {
                  return
                }
                elNoteItem.classList += 'replied_to-open'
                view.Main.openRelatedNote(  
                  n.replied_to,
                  'above',
                  elNoteItem
                );
              }
            }
          }));
        }

        if (!elNoteItem.classList.contains('noteItem-related-parent')) {
          elReplyIndicators.appendChild(
            view.el('button', {
              className: n.reply
                ? 'btn primary small'
                : 'btn transparent muted small',
              innerHTML:
                '<i class="fa-solid fa-caret-down fa-2xs fa-fw"></i>',
              title: n.reply ? 'Ha una risposta' : 'Nessuna risposta',
              'aria-label': n.reply
                ? 'Ha una risposta'
                : 'Nessuna risposta',
              tabindex: n.reply ? 0 : -1,
              onclick: ev => {
                ev.stopPropagation();
                if (n.reply) {
                  if (elNoteItem.classList.contains('reply-open')) {
                    return
                  }
                  elNoteItem.classList += 'reply-open'
                  view.Main.openRelatedNote(n.reply, 'below', elNoteItem);
                } else {
                  view.EditorWrap.startReply(n);
                }
              }
            })
          );
        }
      }

      const elNoteDays = elNoteItem.appendChild(
        view.el('div', {
          className: 'noteDays flex-col',
          innerHTML:
            h.diffToToday(new Date(n.date)) +
            (
              n.duedate
                ? '<br><span class="color--c-error">' +
                  h.diffToToday(new Date(n.duedate)) +
                  '</span>'
                : ''
            )
        })
      );

      const elNoteText = elNoteItem
        .appendChild(view.el('div', {className: 'noteTextWrap'}))
        .appendChild(this.genNoteText(n, currentTag));

      if (!editable) return elNoteItem;
      const elNoteBtnWrap = elNoteItem.appendChild(view.el('div', {className: 'noteBtnWrap'}));
      const elNoteEditBtn = elNoteBtnWrap.appendChild(view.el('button', {
        className: 'btn muted small transparent',
        innerHTML:
          '<i class="fa fa-pencil fa-solid fa-fw fa-2xs"></i>',
        title: 'Edit note',
        onclick: ev => {
          ev.stopPropagation();
          view.EditorWrap.renderEditNote(n);
        }
      }));

      const elNoteDelBtn = elNoteBtnWrap.appendChild(
        view.el('button', {
          className: 'btn muted small transparent',
          innerHTML: '<i class="fa fa-x fa-solid fa-fw fa-2xs"></i>',
          title: 'Delete note',
          onclick: async ev => {
            ev.stopPropagation();
            if (!confirm('Delete this note?')) return;
            let deleted = false;
            view.EditorWrap.addStatus(
              `Eliminazione nota ${n.id}…`,
              'loading'
            );
            try {
              const response = await api.deleteNote(n.id);
              if (response !== null && response?.status !== 'deleted') {
                throw new Error('Il server non ha confermato la cancellazione.');
              }
              deleted = true;
              view.EditorWrap.addStatus(
                `Nota ${n.id} eliminata.`,
                'success'
              );
              document.querySelectorAll(
                `.noteItem[data-id="${CSS.escape(String(n.id))}"]`
              ).forEach(item => {
                const list = item.closest('.notesList');
                item.remove();
                if (list && !list.querySelector('.noteItem')) {
                  this.showEmptyState(
                    list,
                    list.closest('.column')?.dataset.key || ''
                  );
                }
              });
              await page.home.refreshMetadata();
            } catch (error) {
              view.EditorWrap.addStatus(
                deleted
                  ? `Nota eliminata, aggiornamento della vista fallito: ${error.message}`
                  : `Eliminazione non riuscita: ${error.message}`,
                'error'
              );
            }
          }
        })
      );

      return elNoteItem;
    },

    genNoteText(n, currentTag) {
      const elNoteText = view.el('div', {className: 'noteText'});
      const converter = new showdown.Converter({metadata: true});

      // A tag at the start of a line ("#qwe", ">qwe", "+qwe") would be
      // parsed by Markdown as a heading, blockquote or list. Escape the
      // tag prefix so it is rendered as plain text instead.
      const protectedText = h.escapeHTML(n.text).replace(
        /(^|\n)([#+][A-Za-z0-9_.-]+)/g,
        (_, lineStart, tag) => `${lineStart}\\${tag}`
      );

      const html = converter.makeHtml(protectedText);

      elNoteText.innerHTML = html;
      h.sanitizeRenderedMarkdown(elNoteText);
      const walker = document.createTreeWalker(elNoteText, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (const node of textNodes) {
        if (node.parentElement.closest('a, code, pre, button, script, style')) continue;
        const pattern = /(^|\s)([#@>+][A-Za-z0-9_.-]+)/g;
        const fragment = document.createDocumentFragment();
        let last = 0;
        for (const match of node.textContent.matchAll(pattern)) {
          const offset = match.index + match[1].length;
          const tag = match[2];
          fragment.append(node.textContent.slice(last, offset));
          fragment.append(view.el('button', {
            type: 'button', className: `lbl lbl-${h.getClassfromTag(tag)}`,
            dataset: {tag}, title: `Apri ${tag}`,
            textContent: tag === currentTag ? '●' : tag,
            onclick: () => page.home.addTagview(tag)
          }));
          last = offset + tag.length;
        }
        if (last) {
          fragment.append(node.textContent.slice(last));
          node.replaceWith(fragment);
        }
      }

      elNoteText.querySelectorAll('img').forEach(image => {
        image.loading = 'lazy';
        image.decoding = 'async';
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute(
          'aria-label',
          `Apri immagine a schermo intero: ${image.alt || 'immagine'}`
        );
        const openImage = () => modal.imageViewer.open(
          image.currentSrc || image.src,
          image.alt
        );
        image.addEventListener('click', openImage);
        image.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            openImage();
          }
        });
      });

      return elNoteText;
    },

    async openRelatedNote(
      noteid,
      position = 'below',
      anchorItem = null
    ) {
      if (!noteid) return;
      try {
        const note = await api.getNote(noteid);
        if (!note) return;
        const noteList = anchorItem?.closest('.notesList');
        if (!noteList) return;

        const elNoteItem = this.genNoteItem(
          note,
          noteList.closest('.column-content')?.dataset.key || note.date,
          position === 'above' ? 'parent' : 'child',
          {editable: Boolean(h.eid('Main'))}
        );
        if (position === 'above') {
          anchorItem.before(elNoteItem);
        } else {
          anchorItem.after(elNoteItem);
        }
        elNoteItem.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      } catch (error) {
        console.error('Cannot open related note:', error);
      }
    },

    makeResizable(colEl, handle) {
      view.resizeColumn(colEl, handle, 220, 600);
    },

    toggleMaximizeTab(tag) {
      const column = this.el_cw?.querySelector(`.column[data-key="${CSS.escape(tag)}"]`);
      // column?.classList.toggle('fullwidth');
    },

    editedNote(note, previousTags = [], previousDate = note.date) {
      console.log('[fn] editedNote', note);
      const affectedKeys = new Set([
        ...previousTags,
        ...note.tags,
        previousDate,
        note.date
      ]);

      for (const key of affectedKeys) {
        if (
          page.home.filterViews[key] ||
          !model.get('tagsVisible').includes(key)
        ) continue;

        const noteList = document.querySelector(
          `.column[data-key="${CSS.escape(String(key))}"] .notesList`
        );
        if (!noteList) continue;

        const existing = noteList.querySelector(
          `.noteItem[data-id="${CSS.escape(String(note.id))}"]`
        );
        const belongs = note.tags.includes(key) || note.date === key;
        if (belongs) {
          noteList.querySelector('.empty-state')?.remove();
          const updated = this.genNoteItem(note, key);
          existing
            ? existing.replaceWith(updated)
            : noteList.appendChild(updated);
        } else {
          existing?.remove();
        }
        if (!noteList.querySelector('.noteItem')) this.showEmptyState(noteList, key);
      }
    }
  },

  LeftBar: {
    render() {
      if (!view.mount(this, 'LeftBar')) return;

      if (!model.get('leftBarVisible')) {
        this.el.style.display = 'none';
        return;
      }
      this.el.style.display = 'block';
      if (!localStorage.getItem('leftBarWidth')) {
        this.el.style.flex = '0 0 260px';
      } else {
        this.el.style.flex = localStorage.getItem('leftBarWidth');
      }

      this.el.appendChild(view.el('div', {
        id: 'JournalBox',
        className: 'box',
        style: 'flex:0'
      }));
      this.el.appendChild(view.el('div', {
        id: 'TagsBox',
        className: 'box',
        style: 'flex:1 1 auto; min-height:0; overflow-y:auto;'
      }));
      this.el.appendChild(view.el('div', {
        id: 'ActionRequiredBox',
        className: 'box',
        style: 'flex:0 0 auto; margin-top:auto;'
      }));

      const handle = view.el('div', {
        id: 'LeftBarResizer'
      });
      handle.style.width = '5px';
      handle.style.cursor = 'col-resize';
      handle.style.position = 'absolute';
      handle.style.top = '0';
      handle.style.right = '0';
      handle.style.bottom = '0';
      handle.style.zIndex = '10';
      this.el.style.position = 'relative';
      this.el.appendChild(handle);
      view.LeftBar.makeResizable(handle);

      view.run(() => view.JournalBox.render());
      view.TagsBox.render();
      view.run(() => view.ActionRequiredBox.render());
    },

    makeResizable(handle) {
      const element = this.el;
      view.resizeColumn(element, handle, 180, 500, () => {
        localStorage.setItem('leftBarWidth', element.style.flex);
      });
    }
  },

  TagsBox: {
    render() {
      if (!view.mount(this, 'TagsBox')) return;

      this.el.appendChild(view.el('div', {
        id: 'TagsBoxSubHeader',
        style: 'margin:10px 0px;'
      }));
      this.el.appendChild(view.el('div', {
        id: 'TagsBoxList',
        style:
          'display:block; width:100%; background:none; border:none; font-size:1.2em; z-index:2;',
        className: 'scrollable'
      }));

      view.TagsBoxSubHeader.render();
      view.TagsBoxList.render();
    }
  },

  TagsBoxSubHeader: {
    render() {
      console.log('[fn] TagsBoxSubHeader.render()');
      if (!view.mount(this, 'TagsBoxSubHeader')) return;

      const toggles = [
        ['tagsBox_task', 'tagsTasksToggle', '!', 'task'],
        ['tagsBox_projects', 'tagsProjectToggle', '#', 'progetti'],
        ['tagsBox_events', 'tagsEventsToggle', '>', 'eventi'],
        ['tagsBox_persons', 'tagsPersonsToggle', '@', 'persone'],
        ['tagsBox_generic', 'tagsGenericToggle', '+', 'tag generici']
      ];
      for (const [key, id, text, label] of toggles) {
        this.el.appendChild(view.el('button', {
          type: 'button', id,
          className: `btnp primary${model.get(key) ? ' active' : ''}`,
          textContent: text,
          title: `Mostra/nascondi ${label}`,
          'aria-label': `Mostra/nascondi ${label}`,
          'aria-pressed': String(model.get(key)),
          onclick: () => model.set(key, !model.get(key))
        }));
      }
      return this.el;
    }
  },

  TagsBoxList: {
    render() {
      console.log('[fn] TagsBoxList.render()');
      if (!view.mount(this, 'TagsBoxList')) return;

      const tagCategories = ['Projects', 'Events', 'Generic', 'Persons'];
      const sectionsDiv = {
        Tags: {
          el: view.el('div'),
          filter: tagCategories
        }
      };
      const modelTagsBoxTask = model.get('tagsBox_task');
      const tags = model.get('tags');
      const tasks = model.get('tasks');

      const untaggedTasks = tasks.filter(task => !task.firstTag);
      if (untaggedTasks.length) {
        const section = view.el('div', {
          className: 'tagSection'
        });
        const title = view.el('div', {
          className: 'sectionTitle',
          textContent: 'Senza tag: '
        });
        section.appendChild(title);

        const taskList = view.el('ul', {
          className: 'tagList-tree'
        });
        untaggedTasks.forEach(task => {
          taskList.appendChild(
            this.createTaskElement(task, modelTagsBoxTask)
          );
        });
        section.appendChild(taskList);
        this.el.appendChild(section);
      }

      Object.entries(sectionsDiv).forEach(([secName, {el, filter}]) => {
        el.className = 'tagSection';
        const title = view.el('div', {
          className: 'sectionTitle',
          textContent: secName + ': '
        });
        el.appendChild(title);

        const tagTree = businessLogic.buildTagTree(
          tags.filter(t => filter.includes(t.category)),
          tasks
        );
        el.appendChild(this.createTreeWrap(
          tagTree,
          {
            Projects: model.get('tagsBox_projects'),
            Events: model.get('tagsBox_events'),
            Generic: model.get('tagsBox_generic'),
            Persons: model.get('tagsBox_persons')
          },
          modelTagsBoxTask,
          1
        ));
        this.el.appendChild(el);
      });
      return this.el;
    },

    createTaskElement(task, tagsTaskActive) {
      const li = view.el('li');
      if (!tagsTaskActive) {
        li.style.display = 'none';
      }
      li.style.listStyle = 'none';
      li.className = 'tagList-task task-' + task.task;

      const header = view.el('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';

      const span = view.el('span');
      const hasTag = Boolean(task.firstTag);
      const hasPanel = hasTag || Boolean(task.date);
      span.textContent = hasTag
        ? task.text.replace(task.firstTag, '●')
        : task.text;
      span.className = 'tag-task-text';
      span.title = task.text;
      span.style.flex = '1';

      if (hasPanel) {
        span.setAttribute('role', 'button');
        span.tabIndex = 0;
        span.setAttribute(
          'aria-label',
          `Apri la nota del task: ${task.text}`
        );
        span.style.cursor = 'pointer';
        span.onclick = () => page.home.focusTask(task);
        span.onkeydown = ev => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            page.home.focusTask(task);
          }
        };
      }

      header.appendChild(span);
      li.appendChild(header);
      return li;
    },

    createTreeWrap(tagTree, tagsEyeActive, tagsTaskActive, depth) {
      const ul = view.el('ul', {
        className: 'tagList-tree'
      });
      tagTree.forEach(tag => {
        ul.appendChild(this.createTreeElement(
          tag,
          tagsEyeActive,
          tagsTaskActive,
          depth
        ));
      });
      return ul;
    },

    hasDiscendentTask(tag) {
      if (tag.tasks.length != 0) return true;
      return tag.children.some(child => this.hasDiscendentTask(child));
    },

    createTreeElement(tag, tagsEyeActive, tagsTaskActive, depth) {
      const li = view.el('li');
      li.style.listStyle = 'none';

      if (
        !tagsEyeActive[tag.category] &&
        !tag.treed &&
        !this.hasDiscendentTask(tag)
      ) {
        li.style.display = 'none';
      }

      li.className = `expanded tree-depth-${depth}`;
      const header = view.el('div', {
        className: "tagtree-box " +tag.category
      });

      const hasChildren = tag.children && tag.children.length > 0;
      const toggleBtn = header.appendChild(view.el('i', {
        className: hasChildren
          ? 'caret-icon fa-fw fa-regular fa-square-caret-down'
          : 'caret-icon fa-fw fa-regular fa-square',
          style: {
            marginRight: '5px',
            cursor: hasChildren ? 'pointer' : 'default',
          },
          onclick: () => {
            if (hasChildren) {
              li.classList.toggle('expanded');
              if (li.classList.contains('expanded')) {
                toggleBtn.classList.remove('fa-square-caret-right');
                toggleBtn.classList.add('fa-square-caret-down');
              } else {
                toggleBtn.classList.remove('fa-square-caret-down');
                toggleBtn.classList.add('fa-square-caret-right');
              }
            }
          }
      }));

      header.appendChild(view.el('span', {
        className: "tagtree-text",
        textContent: tag.name,
        style: {
          flex: '1',
          cursor: 'pointer',
          fontWeight: '600'
        },
        onclick: async () => await page.home.addTagview(tag.name)
      }));

      if (tag.category === 'Projects') {
        header.appendChild(view.el('button', {
          type: 'button', className: 'btn small muted transparent',
          title: 'Collega o cambia cartella', 'aria-label': 'Collega o cambia cartella',
          innerHTML: '<i class="fa-solid fa-folder-plus fa-fw fa-xs" aria-hidden="true"></i>',
          onclick: async ev => {
            ev.stopPropagation();
            await page.home.addTagview(tag.name);
            if (model.get('tagsActive') === tag.name) view.ProjectFiles.render(true);
          }
        }));
      }

      header.appendChild(view.el('button', {
        className: tag.treed ? 'btn small primary transparent' : 'btn small muted transparent',
        innerHTML: tag.treed ? '<i class="fa-xs fa-fw fa-solid fa-eye fa-middle"></i>' : '<i class="fa-xs fa-fw fa-solid fa-eye-slash fa-middle"></i>',
        onclick: async ev => {
          ev.stopPropagation();
          let saved = false;
          try {
            const updated = await api.updateTagVisibility(tag, !tag.treed);
            saved = true;
            view.EditorWrap.addStatus(
              `Visibilità di ${updated.name} aggiornata.`,
              'success'
            );
            model.set('tags', tags => {
              const index = tags.findIndex(item => item.name === updated.name);
              if (index !== -1) tags[index] = updated;
              return tags;
            });
          } catch (error) {
            const message = saved
              ? `Visibilità salvata, aggiornamento della vista fallito: ${error.message}`
              : `Modifica della visibilità non riuscita: ${error.message}`;
            view.EditorWrap.addStatus(message, 'error');
          }
        }
      }));

      header.appendChild(view.el('button', {
        className: 'btn small muted transparent',
        innerHTML:
          '<i class="fa-xs fa-fw fa-solid fa-pencil fa-middle"></i>',
        onclick: async ev => {
          ev.stopPropagation();
          modal.editTreeTagModal.render(tag.name);
        }
      }));

      header.appendChild(view.el('button', {
        className: 'btn small muted transparent',
        innerHTML:
          '<i class="fa-xs fa-fw fa-solid fa-gear fa-middle"></i>',
        onclick: async ev => {
          ev.stopPropagation();
          modal.editTagPropertiesModal.render(tag.name);
        }
      }));
      

      li.appendChild(header);
      tag.tasks.forEach(task => {
        li.appendChild(
          this.createTaskElement(task, tagsTaskActive, depth + 1)
        );
      });

      if (hasChildren) {
        li.appendChild(this.createTreeWrap(
          tag.children,
          tagsEyeActive,
          tagsTaskActive,
          depth + 1
        ));
      }
      return li;
    }
  },

  ActionRequiredBox: {
    render() {
      console.log('[fn] ActionRequiredBox.render()');
      if (!view.mount(this, 'ActionRequiredBox')) return;

      const header = view.el('div', {
        className: 'action-required-header'
      });

      const title = view.el('h3', {
        textContent: 'Action Required'
      });
      title.style.color = '#856404';

      const countBadge = view.el('span', {
        className: 'badge bg-warning text-dark'
      });
      const actionItems = businessLogic.getActionRequiredItems();
      countBadge.textContent = String(actionItems.length);
      countBadge.style.fontSize = '0.8em';
      header.append(title, countBadge);
      this.el.appendChild(header);

      actionItems.forEach(tag => {
        const item = view.el('button', {
          type: 'button'
        });
        const category = h.getClassfromTag(tag);
        const categoryClass = {
          Projects: 'project',
          Persons: 'person',
          Events: 'event',
          Generic: 'generic'
        }[category] || 'other';

        item.className =
          `action-required-tag action-required-tag-${categoryClass}`;
        item.textContent = tag;
        item.title = `Associa ${tag} a un parent`;
        item.onclick = () => modal.editTreeTagModal.render(tag);
        this.el.appendChild(item);
      });
      return this.el;
    }
  },

  JournalBox: {
    async render() {
      console.log('[fn] JournalBox.render()');
      if (!view.mount(this, 'JournalBox')) return;

      this.calendarYear = this.calendarYear || new Date().getFullYear();
      this.calendarMonth = this.calendarMonth !== undefined
        ? this.calendarMonth
        : new Date().getMonth();

      const elJournalHeader = view.el('div', {
        className: 'calendar-header mini-calendar-header'
      });

      const elJournalPrevBtn = view.el('button', {
        className: 'calendar-nav-btn',
        textContent: '‹'
      });
      elJournalPrevBtn.onclick = () => {
        this.calendarMonth--;
        if (this.calendarMonth < 0) {
          this.calendarMonth = 11;
          this.calendarYear--;
        }
        this.render();
      };

      const root = this.el;
      const generation = this.generation = (this.generation || 0) + 1;
      const numNotesOfMonth = await api.getMonthlyNoteCounts(
        this.calendarYear,
        this.calendarMonth + 1
      );
      if (generation !== this.generation || root !== h.eid('JournalBox')) return;
      const numNotesOfMonthMax = Math.max(
        ...Object.values(numNotesOfMonth)
      );

      const elJournalNextBtn = view.el('button', {
        className: 'calendar-nav-btn',
        textContent: '›'
      });
      elJournalNextBtn.onclick = () => {
        this.calendarMonth++;
        if (this.calendarMonth > 11) {
          this.calendarMonth = 0;
          this.calendarYear++;
        }
        this.render();
      };

      const elJournalMonthLabel = view.el('span', {
        className: 'calendar-month-label'
      });
      elJournalMonthLabel.textContent =
        `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}`;

      elJournalHeader.appendChild(elJournalPrevBtn);
      elJournalHeader.appendChild(elJournalMonthLabel);
      elJournalHeader.appendChild(elJournalNextBtn);
      this.el.appendChild(elJournalHeader);

      const elJournalTable = view.el('table', {
        className: 'calendar-table mini-calendar'
      });

      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const elJournalThead = view.el('thead');
      const elJournalTrHead = view.el('tr');
      for (const day of weekdays) {
        const elJournalTrHeadTh = view.el('th', {
          textContent: day
        });
        elJournalTrHead.appendChild(elJournalTrHeadTh);
      }
      elJournalThead.appendChild(elJournalTrHead);
      elJournalTable.appendChild(elJournalThead);

      const {firstDay, daysInMonth} = businessLogic.getCalendarDays(
        this.calendarYear, this.calendarMonth
      );

      const tasks = model.get('tasks') || [];
      const elJournalTbody = view.el('tbody');
      let elJournalTrBody = view.el('tr');
      let dayCount = 0;

      for (let i = 0; i < firstDay; i++) {
        const elJournalTdBody = view.el('td', {
          textContent: ''
        });
        elJournalTrBody.appendChild(elJournalTdBody);
        dayCount++;
      }

      for (let d = 1; d <= daysInMonth; d++) {
        if (dayCount % 7 === 0 && dayCount !== 0) {
          elJournalTbody.appendChild(elJournalTrBody);
          elJournalTrBody = view.el('tr');
        }

        const elJournalTdBody = view.el('td', {
          className: 'calendar-cell'
        });
        const dateStr =
          `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const intensity = numNotesOfMonthMax > 0
          ? Math.min(
              8,
              Math.ceil(
                (numNotesOfMonth[dateStr] || 0) /
                (numNotesOfMonthMax / 8)
              )
            )
          : 0;

        console.debug(
          `Date ${dateStr} has ${numNotesOfMonth[dateStr] || 0} notes, intensity ${intensity}`
        );
        elJournalTdBody.classList.add(`intensity-${intensity}`);
        elJournalTdBody.style.position = 'relative';

        const dayNumEl = view.el('div', {
          className: 'mini-calendar-day-number',
          textContent: d
        });
        elJournalTdBody.appendChild(dayNumEl);

        const weekdayIndex = dayCount % 7;
        if (weekdayIndex === 5 || weekdayIndex === 6) {
          elJournalTdBody.classList.add('calendar-weekend');
        }

        const today = new Date();
        const isToday =
          this.calendarYear === today.getFullYear() &&
          this.calendarMonth === today.getMonth() &&
          d === today.getDate();
        if (isToday) {
          elJournalTdBody.classList.add('calendar-today');
        }

        const tasksForDay = tasks.filter(t => t.duedate === dateStr);
        if (tasksForDay.length > 0) {
          const dot = view.el('div', {
            className: 'journal-task-dot',
            title: `${tasksForDay.length} task(s)`
          });
          elJournalTdBody.appendChild(dot);
        }

        elJournalTdBody.onclick = async () => {
          await page.home.addTagview(dateStr);
        };
        elJournalTrBody.appendChild(elJournalTdBody);
        dayCount++;
      }

      while (dayCount % 7 !== 0) {
        const elJournalTdBody = view.el('td', {
          textContent: ''
        });
        elJournalTrBody.appendChild(elJournalTdBody);
        dayCount++;
      }
      elJournalTbody.appendChild(elJournalTrBody);
      elJournalTable.appendChild(elJournalTbody);
      this.el.appendChild(elJournalTable);
    }
  },

  Calendar: {
    render() {
      if (!view.mount(this, 'CalendarMain')) return;
      this.el.style.flex = '1';

      this.el_tb = this.el.appendChild(
        view.el('div', {id: 'TopBar'})
      );
      view.TopBar.render();

      this.el_cw = this.el.appendChild(
        view.el('div', {id: 'CalendarWrap'})
      );

      this.calendarYear = this.calendarYear || new Date().getFullYear();
      this.calendarMonth = this.calendarMonth !== undefined
        ? this.calendarMonth
        : new Date().getMonth();

      const header = view.el('div', {
        className: 'calendar-header'
      });

      const prevBtn = view.el('button', {
        className: 'calendar-nav-btn',
        textContent: '‹'
      });
      prevBtn.onclick = () => {
        this.calendarMonth--;
        if (this.calendarMonth < 0) {
          this.calendarMonth = 11;
          this.calendarYear--;
        }
        this.render();
      };

      const nextBtn = view.el('button', {
        className: 'calendar-nav-btn',
        textContent: '›'
      });
      nextBtn.onclick = () => {
        this.calendarMonth++;
        if (this.calendarMonth > 11) {
          this.calendarMonth = 0;
          this.calendarYear++;
        }
        this.render();
      };

      const monthLabel = view.el('span', {
        className: 'calendar-month-label'
      });
      monthLabel.textContent =
        `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}`;

      header.appendChild(prevBtn);
      header.appendChild(monthLabel);
      header.appendChild(nextBtn);
      this.el_cw.appendChild(header);

      const tasks = model.get('tasks') || [];
      const monthStart = new Date(
        this.calendarYear,
        this.calendarMonth,
        1
      );
      const monthEnd = new Date(
        this.calendarYear,
        this.calendarMonth + 1,
        0
      );

      const aboveTasks = [];
      const belowTasks = [];
      tasks.forEach(t => {
        if (!t || !t.duedate) {
          aboveTasks.push(t);
          return;
        }
        const parts = String(t.duedate).split('-').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) {
          aboveTasks.push(t);
          return;
        }
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        if (dt < monthStart) aboveTasks.push(t);
        else if (dt > monthEnd) belowTasks.push(t);
      });

      const buildListBlock = (title, list) => {
        const wrap = view.el('div', {
          className: 'calendar-extras'
        });
        const h = view.el('div');
        h.style.fontWeight = '700';
        h.style.margin = '6px 0';
        h.textContent = `${title} (${list.length})`;
        wrap.appendChild(h);

        if (list.length === 0) {
          const empty = view.el('div');
          empty.style.color = '#888';
          empty.style.fontSize = '0.9em';
          empty.textContent = '(none)';
          wrap.appendChild(empty);
          return wrap;
        }

        const listWrap = view.el('div');
        listWrap.style.display = 'flex';
        listWrap.style.flexDirection = 'column';

        listWrap.classList.add('notesList');
        list.forEach(note => listWrap.appendChild(
          view.Main.genNoteItem(note, '', null, {editable: false})
        ));

        wrap.appendChild(listWrap);
        return wrap;
      };

      this.el_cw.appendChild(
        buildListBlock('Unscheduled / earlier than this month', aboveTasks)
      );

      const table = view.el('table', {
        className: 'calendar-table'
      });
      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const thead = view.el('thead');
      const trHead = view.el('tr');

      weekdays.forEach(w => {
        const th = view.el('th', {
          textContent: w
        });
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      const {firstDay, daysInMonth} = businessLogic.getCalendarDays(
        this.calendarYear, this.calendarMonth
      );

      const tbody = view.el('tbody');
      let tr = view.el('tr');
      let dayCount = 0;

      for (let i = 0; i < firstDay; i++) {
        const td = view.el('td', {
          className: 'calendar-cell-empty',
          textContent: ''
        });
        tr.appendChild(td);
        dayCount++;
      }

      for (let d = 1; d <= daysInMonth; d++) {
        if (dayCount % 7 === 0 && dayCount !== 0) {
          tbody.appendChild(tr);
          tr = view.el('tr');
        }

        const td = view.el('td', {
          className: 'calendar-cell'
        });
        const weekdayIndex = dayCount % 7;
        if (weekdayIndex === 5 || weekdayIndex === 6) {
          td.classList.add('calendar-weekend');
        }

        const today = new Date();
        if (
          this.calendarYear === today.getFullYear() &&
          this.calendarMonth === today.getMonth() &&
          d === today.getDate()
        ) {
          td.classList.add('calendar-today');
        }

        const dayNum = view.el('div');
        dayNum.style.fontWeight = '600';
        dayNum.style.marginBottom = '6px';
        dayNum.textContent = d;
        td.appendChild(dayNum);

        const dateStr =
          `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const tasksForDay = tasks.filter(t => t.duedate === dateStr);

        if (tasksForDay.length > 0) {
          const tasksWrap = view.el('div');
          tasksWrap.style.display = 'flex';
          tasksWrap.style.flexDirection = 'column';
          tasksWrap.style.gap = '4px';

          tasksForDay.forEach(t => {
            const tEl = view.el('div', {
              className: `tagList-task task-${t.task || 'low'}`
            });
            tEl.style.padding = '4px';
            tEl.style.borderRadius = '6px';
            tEl.title = t.text;
            tEl.textContent = `${t.duedate} - ${t.text.length > 80 ? t.text.slice(0, 80) + '…' : t.text}`;
            tasksWrap.appendChild(tEl);
          });
          td.appendChild(tasksWrap);
        }

        tr.appendChild(td);
        dayCount++;
      }

      while (dayCount % 7 !== 0) {
        const td = view.el('td', {
          className: 'calendar-cell-empty',
          textContent: ''
        });
        tr.appendChild(td);
        dayCount++;
      }

      tbody.appendChild(tr);
      table.appendChild(tbody);
      this.el_cw.appendChild(table);
      this.el_cw.appendChild(
        buildListBlock('Scheduled after this month', belowTasks)
      );
    }
  },

  Explorer: {
    async render() {
      if (!view.mount(this, 'app')) return;

      const shell = this.el.appendChild(
        view.el('div', {id: 'ExplorerApp'})
      );
      shell.appendChild(view.el('div', {id: 'TopBar'}));
      view.TopBar.render();

      const layout = shell.appendChild(
        view.el('div', {id: 'ExplorerLayout'})
      );
      const sidebar = layout.appendChild(
        view.el('aside', {id: 'ExplorerSidebar'})
      );
      const sidebarTitle = sidebar.appendChild(
        view.el('h2')
      );
      sidebarTitle.textContent = 'Tabelle';

      this.tableList = sidebar.appendChild(
        view.el('nav', {
          id: 'ExplorerTableList',
          'aria-label': 'Tabelle del database'
        })
      );

      const workspace = layout.appendChild(
        view.el('main', {id: 'ExplorerWorkspace'})
      );
      this.results = workspace.appendChild(
        view.el('section', {
          id: 'ExplorerResults',
          'aria-label': 'Risultati query'
        })
      );
      this.results.setAttribute('aria-live', 'polite');
      this.results.textContent =
        'Seleziona una tabella o inserisci una query SQL.';

      const form = workspace.appendChild(
        view.el('form', {id: 'ExplorerQueryForm'})
      );
      const toolbar = form.appendChild(
        view.el('div', {className: 'explorer-query-toolbar'})
      );
      const queryLabel = toolbar.appendChild(
        view.el('label')
      );
      queryLabel.htmlFor = 'ExplorerQuery';
      queryLabel.textContent = 'Query SQL';

      const runButton = toolbar.appendChild(
        view.el('button', {
          type: 'submit',
          className: 'btn primary',
          innerHTML:
            '<i class="fa-solid fa-play" aria-hidden="true"></i> Esegui'
        })
      );

      this.queryInput = form.appendChild(
        view.el('textarea', {
          id: 'ExplorerQuery',
          name: 'query',
          rows: 4,
          spellcheck: false,
          placeholder: 'SELECT * FROM notes LIMIT 100;'
        })
      );
      this.queryInput.setAttribute(
        'aria-label',
        'Query SQL in sola lettura'
      );

      this.queryStatus = form.appendChild(
        view.el('div', {
          id: 'ExplorerQueryStatus',
          role: 'status',
          'aria-live': 'polite'
        })
      );

      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        runButton.disabled = true;
        await this.runQuery();
        runButton.disabled = false;
      });
      this.queryInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          form.requestSubmit(runButton);
        }
      });

      await this.loadTables();
    },

    async loadTables() {
      const root = this.tableList;
      this.tableList.textContent = 'Caricamento…';
      try {
        const tables = await api.getExplorerTables();
        if (root !== this.tableList || !root.isConnected) return;
        this.tableList.replaceChildren();

        if (!tables.length) {
          this.tableList.textContent = 'Nessuna tabella';
          return;
        }

        tables.forEach(tableName => {
          const tableButton = view.el('button', {
            type: 'button',
            className: 'explorer-table-button',
            textContent: tableName
          });
          tableButton.onclick = () => this.selectTable(
            tableName,
            tableButton
          );
          this.tableList.appendChild(tableButton);
        });

        await this.selectTable(
          tables[0],
          this.tableList.firstElementChild
        );
      } catch (error) {
        if (root !== this.tableList || !root.isConnected) return;
        this.tableList.textContent = `Errore: ${error.message}`;
      }
    },

    async selectTable(tableName, tableButton) {
      this.tableList.querySelectorAll(
        '.explorer-table-button'
      ).forEach(button => {
        button.classList.toggle('active', button === tableButton);
      });

      const quotedName = `"${tableName.replace(/"/g, '""')}"`;
      this.queryInput.value = `SELECT * FROM ${quotedName} LIMIT 200;`;
      await this.runQuery();
    },

    async runQuery(query = this.queryInput.value) {
      const request = this.queryRequest = (this.queryRequest || 0) + 1;
      const root = this.results;
      this.queryStatus.textContent = 'Esecuzione…';
      this.queryStatus.dataset.state = 'loading';

      try {
        const result = await api.runExplorerQuery(query);
        if (request !== this.queryRequest || root !== this.results || !root.isConnected) return;
        this.renderResults(result);
        const count = result.rows.length;
        this.queryStatus.textContent = result.truncated
          ? `Mostrate le prime ${count} righe.`
          : `${count} righe.`;
        this.queryStatus.dataset.state = 'success';
      } catch (error) {
        if (request !== this.queryRequest || root !== this.results || !root.isConnected) return;
        this.results.replaceChildren();
        const message = view.el('p', {
          className: 'explorer-query-error',
          textContent: error.message
        });
        this.results.appendChild(message);
        this.queryStatus.textContent = 'Query non eseguita.';
        this.queryStatus.dataset.state = 'error';
      }
    },

    renderResults(result) {
      const table = view.el('table', {
        className: 'explorer-result-table'
      });

      const head = table.createTHead().insertRow();
      result.columns.forEach(column => {
        const cell = view.el('th', {
          textContent: column
        });
        head.appendChild(cell);
      });

      const body = table.createTBody();
      result.rows.forEach(row => {
        const tr = body.insertRow();
        row.forEach(value => {
          const cell = tr.insertCell();
          cell.textContent = value === null
            ? 'NULL'
            : value && typeof value === 'object' && 'blob_hex' in value
              ? `BLOB (${value.blob_hex})`
              : String(value);
        });
      });
      this.results.replaceChildren(table);
    }
  }
};
//#endregion

//#region MODAL
const modal = {
  filePreview: {
    el: null,
    close() { this.el?.close(); },
    async open(tag, entry) {
      this.close();
      const previousFocus = document.activeElement;
      const controller = new AbortController();
      let objectURL = null;
      let cleaned = false;
      const dialog = view.el('dialog', {
        className: 'project-file-preview', 'aria-labelledby': 'project-preview-title'
      });
      this.el = dialog;
      const header = dialog.appendChild(view.el('header', {className: 'project-preview-header'}));
      header.appendChild(view.el('h2', {id: 'project-preview-title', textContent: entry.name}));
      const openStatus = view.el('p', {
        className: 'project-preview-status', role: 'status', 'aria-live': 'polite', hidden: true
      });
      let opening = false;
      const openButton = header.appendChild(view.el('button', {
        type: 'button', className: 'btn standard',
        textContent: 'Apri nell’app predefinita',
        onclick: async () => {
          if (opening) return;
          opening = true;
          openButton.disabled = true;
          openStatus.hidden = false;
          openStatus.textContent = 'Richiesta di apertura…';
          try {
            await api.projectFolder(tag, 'open', {relative: entry.path});
            if (dialog.open) openStatus.textContent = 'Richiesta di apertura inviata a Windows.';
          } catch (error) {
            if (dialog.open) openStatus.textContent = error.message;
          } finally {
            opening = false;
            openButton.disabled = false;
          }
        }
      }));
      const close = header.appendChild(view.el('button', {
        type: 'button', className: 'btn standard', textContent: 'Chiudi',
        'aria-label': 'Chiudi anteprima', onclick: () => dialog.close()
      }));
      const status = dialog.appendChild(view.el('p', {
        className: 'project-preview-status', role: 'status', textContent: 'Caricamento anteprima…'
      }));
      dialog.appendChild(openStatus);
      const body = dialog.appendChild(view.el('div', {className: 'project-preview-body'}));
      dialog.addEventListener('keydown', ev => ev.stopPropagation());
      dialog.addEventListener('close', () => {
        if (cleaned) return;
        cleaned = true;
        controller.abort();
        for (const media of body.querySelectorAll('audio, video')) {
          media.pause();
          media.removeAttribute('src');
          media.load();
        }
        body.replaceChildren();
        if (objectURL) URL.revokeObjectURL(objectURL);
        dialog.remove();
        if (this.el === dialog) {
          this.el = null;
          if (previousFocus?.isConnected) previousFocus.focus();
        }
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      close.focus();
      try {
        const result = await api.previewProjectFile(tag, entry.path, controller.signal);
        if (!dialog.open || this.el !== dialog) return;
        if (result.kind === 'text') {
          const text = await result.blob.text();
          if (!dialog.open || this.el !== dialog) return;
          body.appendChild(view.el('pre', {className: 'project-preview-text', textContent: text}));
          status.textContent = 'Anteprima testo';
          return;
        }
        if (!['image', 'pdf', 'audio', 'video'].includes(result.kind)) {
          throw new Error('Anteprima non disponibile per questo formato.');
        }
        objectURL = URL.createObjectURL(result.blob);
        let content;
        if (result.kind === 'image') {
          content = view.el('img', {src: objectURL, alt: entry.name});
        } else if (result.kind === 'pdf') {
          content = view.el('object', {
            data: objectURL, type: 'application/pdf',
            'aria-label': `Anteprima PDF: ${entry.name}`
          }, [view.el('p', {textContent: 'Anteprima PDF non disponibile in questo browser.'})]);
        } else {
          content = view.el(result.kind, {src: objectURL, controls: true, preload: 'metadata'});
        }
        content.addEventListener('error', () => {
          status.textContent = 'Il browser non riesce a visualizzare questo formato o il file è danneggiato.';
        });
        body.appendChild(content);
        status.textContent = result.kind === 'pdf'
          ? 'Anteprima PDF — richiede il visualizzatore PDF del browser.'
          : 'Anteprima locale';
      } catch (error) {
        if (!dialog.open || this.el !== dialog || error.name === 'AbortError') return;
        status.textContent = error.message;
      }
    }
  },
  shortcutsModal: {
    el: null,
    render() {
      if (this.el?.open) return;
      const previousFocus = document.activeElement;
      const dialog = document.createElement('dialog');
      this.el = dialog;
      dialog.setAttribute('aria-labelledby', 'shortcuts-title');
      dialog.style.cssText = 'max-width:680px;width:calc(100% - 48px);max-height:80vh;overflow:auto;padding:24px;border:1px solid #888;border-radius:12px;';
      const shortcuts = [
        ['Alt+A', 'Focus note list of the active tab', 'Anywhere (when available)'],
        ['Alt+S', 'Focus Monaco / fallback editor', 'Anywhere (when available)'],
        ['Alt+?', 'Open this shortcut recap (Shift may be needed for ?)', 'Anywhere'],
        ['Alt+F', 'Open note filter', 'Anywhere'],
        ['Alt+N', 'Focus editor at the end of the note', 'Home'],
        ['Alt+T', 'Open today’s tab', 'Home'],
        ['Alt+W', 'Close active tab (except today)', 'Home'],
        ['Alt+1 … Alt+9', 'Activate tab by position', 'Home'],
        ['Alt+← / Alt+→', 'Activate previous / next tab', 'Home'],
        ['Alt+↑', 'Maximize editor', 'Editor focused'],
        ['Alt+↑ / Alt+↓', 'Maximize / restore active tab', 'Home; ↑ outside editor'],
        ['Ctrl+Enter', 'Save or update note', 'Editor'],
        ['Ctrl+D', 'Insert today’s date at end of note', 'Editor'],
        ['Ctrl+B / Ctrl+I / Ctrl+K', 'Wrap selection in bold / italic / code', 'Editor'],
        ['Ctrl+Alt+D (Cmd+Alt+D on Mac)', 'Select next matching occurrence', 'Monaco'],
        ['Alt+click', 'Add cursor', 'Monaco'],
        ['Tab', 'Insert two spaces', 'Fallback editor'],
        ['Ctrl+Enter / Cmd+Enter', 'Run query', 'Explorer query'],
        ['Enter / Tab', 'Add first suggested tag', 'Filter search'],
        ['Backspace', 'Remove last token when search is empty', 'Filter search'],
        ['Escape', 'Close shortcut recap or image viewer', 'Modal']
      ];
      dialog.innerHTML = `<h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <table style="width:100%;border-collapse:collapse;text-align:left">
          <thead><tr><th>Shortcut</th><th>Action</th><th>Context</th></tr></thead>
          <tbody>${shortcuts.map(row => `<tr>${row.map(cell =>
            `<td style="padding:8px 6px;border-bottom:1px solid #8884">${h.escapeHTML(cell)}</td>`
          ).join('')}</tr>`).join('')}</tbody>
        </table>
        <p>Monaco’s standard editing shortcuts also remain available. Use the editor’s Minimize button to restore its size.</p>
        <button type="button" class="btn secondary" autofocus>Close</button>`;
      dialog.querySelector('button').onclick = () => this.close();
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (this.el === dialog) this.el = null;
        if (previousFocus?.isConnected &&
            (document.activeElement === document.body || dialog.contains(document.activeElement))) {
          previousFocus.focus();
        }
      });
      dialog.addEventListener('keydown', ev => {
        // Keep home shortcuts from acting behind the modal.
        ev.stopPropagation();
      });
      document.body.appendChild(dialog);
      dialog.showModal();
    },
    close() {
      this.el?.close();
    }
  },
  imageViewer: {
    el: null,
    onKeydown: null,
    open(src, alt = '') {
      return this.render(src, alt);
    },
    render(src, alt = '') {
      this.close();
      this.previousFocus = document.activeElement;
      this.el = view.el('div');
      this.el.className = 'image-lightbox';
      this.el.setAttribute('role', 'dialog');
      this.el.setAttribute('aria-modal', 'true');
      this.el.setAttribute('aria-label', 'Immagine a schermo intero');
      const closeButton = view.el('button', {
        type: 'button',
        className: 'image-lightbox-close'
      });
      closeButton.setAttribute('aria-label', 'Chiudi immagine');
      closeButton.title = 'Chiudi';
      closeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      closeButton.addEventListener('click', () => this.close());
      const image = view.el('img', {
        className: 'image-lightbox-image',
        src: src,
        alt: alt
      });
      this.el.append(closeButton, image);
      this.el.addEventListener('click', ev => {
        if (ev.target === this.el) this.close();
      });
      this.onKeydown = ev => {
        if (ev.key === 'Escape') this.close();
      };
      document.addEventListener('keydown', this.onKeydown);
      document.body.appendChild(this.el);
      closeButton.focus();
    },

    close() {
      if (!this.el) return;
      this.el.remove();
      this.el = null;
      if (this.onKeydown) {
        document.removeEventListener('keydown', this.onKeydown);
      }
      this.onKeydown = null;
      if (this.previousFocus?.isConnected) this.previousFocus.focus();
    }
  },
  filterModal: {
    el: null,
    tokens: [],

    render() {
      if (this.el) this.el.remove();
      this.tokens = [];
      this.el = view.el('div');
      this.el.className = 'modal';
      this.el.innerHTML = `
        <section class="modal-content filter-dialog" role="dialog" aria-modal="true" aria-labelledby="filter-dialog-title">
          <h3 id="filter-dialog-title">Filtra note</h3>
          <form id="filter-form" class="myform">
            <div id="filter-rule-tokens" class="filter-rule-tokens" aria-live="polite"></div>
            <label for="filter-tag-search">Tag o persona</label>
            <input id="filter-tag-search" type="search" autocomplete="off" placeholder="Cerca #tag o @persona">
            <div id="filter-tag-suggestions" class="filter-tag-suggestions" role="listbox"></div>
            <div class="filter-operators" aria-label="Operatori della regola"></div>
            <div id="filter-rule-error" class="error" role="alert"></div>
            <div class="modal-actions">
              <button type="button" class="btn standard" id="filter-cancel">Annulla</button>
              <button type="submit" class="btn primary">Apri risultati</button>
            </div>
          </form>
        </section>`;
      document.body.appendChild(this.el);

      const dialog = this.el;
      const form = dialog.querySelector('#filter-form');
      const search = dialog.querySelector('#filter-tag-search');
      const suggestions = dialog.querySelector('#filter-tag-suggestions');
      const tokenList = dialog.querySelector('#filter-rule-tokens');
      const error = dialog.querySelector('#filter-rule-error');
      const availableTags = model.get('tags') || [];

      const renderTokens = () => {
        tokenList.innerHTML = '';
        this.tokens.forEach((token, index) => {
          const chip = view.el('button', {
            type: 'button'
          });
          chip.className =
            `filter-rule-token ${token.kind === 'tag' ? 'filter-rule-tag' : 'filter-rule-operator'}`;
          chip.textContent = token.value;
          chip.title = 'Rimuovi dalla regola';
          chip.setAttribute('aria-label', `Rimuovi ${token.value}`);
          chip.onclick = () => {
            this.tokens.splice(index, 1);
            renderTokens();
            search.focus();
          };
          tokenList.appendChild(chip);
        });
      };

      const addToken = (value, kind) => {
        this.tokens.push({value, kind});
        error.textContent = '';
        renderTokens();
        search.value = '';
        suggestions.innerHTML = '';
        search.focus();
      };

      const renderSuggestions = () => {
        suggestions.innerHTML = '';
        const query = search.value.trim().toLocaleLowerCase();
        if (!query) return;

        availableTags
          .filter(tag => tag.name.toLocaleLowerCase().includes(query))
          .slice(0, 8)
          .forEach(tag => {
            const option = view.el('button', {
              type: 'button',
              className: 'filter-tag-suggestion'
            });
            option.setAttribute('role', 'option');
            option.innerHTML =
              `<span>${h.escapeHTML(tag.name)}</span><span class="tag-category">${h.escapeHTML(tag.category)}</span>`;
            option.onmousedown = ev => ev.preventDefault();
            option.onclick = () => addToken(tag.name, 'tag');
            suggestions.appendChild(option);
          });
      };

      search.addEventListener('input', renderSuggestions);
      search.addEventListener('keydown', ev => {
        if (
          ev.key === 'Backspace' &&
          !search.value &&
          this.tokens.length
        ) {
          this.tokens.pop();
          renderTokens();
        } else if (
          ev.key === 'Enter' &&
          suggestions.firstElementChild
        ) {
          ev.preventDefault();
          suggestions.firstElementChild.click();
        } else if (
          ev.key === 'Tab' &&
          suggestions.firstElementChild
        ) {
          ev.preventDefault();
          suggestions.firstElementChild.click();
        } else if (
          ['!', 'o', '(', ')'].includes(ev.key) &&
          !search.value
        ) {
          ev.preventDefault();
          addToken(ev.key, 'operator');
        }
      });

      const operators = dialog.querySelector('.filter-operators');
      [
        ['!', 'not'],
        ['e', 'and'],
        ['o', 'or'],
        ['(', 'parentesi aperta'],
        [')', 'parentesi chiusa']
      ].forEach(([value, label]) => {
        const button = view.el('button', {
          type: 'button',
          className: 'btn standard',
          textContent: value,
          title: label,
          onclick: () => addToken(value, 'operator')
        });
        operators.appendChild(button);
      });

      dialog.querySelector('#filter-cancel').onclick = () => {
        dialog.remove();
        this.el = null;
      };
      dialog.onclick = ev => {
        if (ev.target === dialog) {
          dialog.remove();
          this.el = null;
        }
      };

      form.onsubmit = async ev => {
        ev.preventDefault();
        if (form.dataset.saving) return;
        form.dataset.saving = 'true';
        const rule = this.tokens.map(token => token.value).join(' ');
        try {
          const notes = await api.filterNotes(rule);
          if (this.el !== dialog || !dialog.isConnected) return;
          await page.home.addFilterview(rule, notes);
          dialog.remove();
          if (this.el === dialog) this.el = null;
        } catch (err) {
          error.textContent = err.message;
          view.EditorWrap.addStatus(
            `Filtro non applicato: ${err.message}`,
            'error'
          );
        } finally {
          delete form.dataset.saving;
        }
      };
      search.focus();
    }
  },
  editTreeTagModal: {
    el: null,

    render(tag) {
      console.debug('[fn] openEditTreeTagModal', tag);
      const tagObj = (model.get('tags') || []).find(t => t.name === tag);
      if (!tagObj) return;
      console.debug('[fn] openEditTreeTagModal', tagObj);
      if (this.el) this.el.remove();

      this.el = view.el('div');
      this.el.className = 'modal';
      this.el.innerHTML = `
        <div class="modal-content">
          <h3>Edit Tag</h3>
          <form id="EditTagForm" class="myform" style="flex: 1">
            <label>
              <input type="radio" id="editform-treed-visible" name="treed" value="true" ${tagObj.treed ? 'checked' : ''}>
              Visible
            </label>
            <label>
              <input type="radio" id="editform-treed-hidden" name="treed" value="false" ${!tagObj.treed ? 'checked' : ''}>
              Hidden
            </label>
            <div>
              <label for="editform-rename">Rename Tag:</label>
              <input type="text" id="editform-rename" name="rename" value="${h.escapeHTML(tagObj.name)}" placeholder="Enter new name">
            </div>
            <div>
              <label for="editform-parent">Parent Tag:</label>
              <input type="text" id="editform-parent" name="parent" value="${h.escapeHTML(tagObj.parent)}" placeholder="Enter parent tag">
              <div id="editform-parent-suggestions" class="filter-tag-suggestions" role="listbox" style="display: none;"></div>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column">
              <label for="editform-content">Content:</label>
              <textarea style="flex:1" id="editform-content" name="content" class="modal-textarea">${h.escapeHTML(tagObj.content)}</textarea>
            </div>
            <div></div>
            <div class="modal-actions">
              <button type="submit" value="cancel" class="btn standard" id="edit-tree-modal-cancel">Cancel</button>
              <button type="submit" value="save" class="btn primary" id="edit-tree-modal-save">Save</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(this.el);

      const parentInput = this.el.querySelector('#editform-parent');
      const parentSuggestions = this.el.querySelector(
        '#editform-parent-suggestions'
      );
      const availableParentTags = model.get('tags') || [];

      const selectParent = parentTag => {
        parentInput.value = parentTag.name;
        parentSuggestions.replaceChildren();
        parentSuggestions.style.display = 'none';
        parentInput.focus();
      };

      const renderParentSuggestions = () => {
        const query = parentInput.value.trim().toLocaleLowerCase();
        const matches = query
          ? availableParentTags
              .filter(candidate =>
                candidate.name !== tagObj.name &&
                candidate.name.toLocaleLowerCase().includes(query)
              )
              .slice(0, 8)
          : [];

        parentSuggestions.replaceChildren();
        matches.forEach(candidate => {
          const option = view.el('button', {
            type: 'button',
            className: 'filter-tag-suggestion'
          });
          option.setAttribute('role', 'option');
          option.textContent = `${candidate.name} · ${candidate.category}`;
          option.onmousedown = ev => ev.preventDefault();
          option.onclick = () => selectParent(candidate);
          parentSuggestions.appendChild(option);
        });
        parentSuggestions.style.display = matches.length ? 'flex' : 'none';
      };

      parentInput.addEventListener('input', renderParentSuggestions);
      parentInput.addEventListener('focus', renderParentSuggestions);
      parentInput.addEventListener('blur', () => {
        parentSuggestions.style.display = 'none';
      });
      parentInput.addEventListener('keydown', ev => {
        if (
          ev.key === 'Tab' &&
          !ev.shiftKey &&
          parentSuggestions.firstElementChild
        ) {
          ev.preventDefault();
          parentSuggestions.firstElementChild.click();
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          EditTagForm.requestSubmit(h.eid('edit-tree-modal-save'));
        } else if (ev.key === 'Escape') {
          parentSuggestions.style.display = 'none';
        }
      });

      const dialog = this.el;
      const EditTagForm = dialog.querySelector('#EditTagForm');
      EditTagForm.onsubmit = async ev => {
        ev.preventDefault();
        if (ev.submitter?.value === 'cancel') {
          dialog.remove();
          if (this.el === dialog) this.el = null;
          return;
        }
        if (EditTagForm.dataset.saving) return;
        EditTagForm.dataset.saving = 'true';
        const save = dialog.querySelector('#edit-tree-modal-save');
        save.disabled = true;
        let saved = false;
        try {
          view.EditorWrap.addStatus(
            `Salvataggio tag ${tagObj.name}…`,
            'loading'
          );
          const updated = await api.updateTag(
            tagObj,
            Object.fromEntries(new FormData(EditTagForm).entries())
          );
          saved = true;
          const message = updated.name !== tagObj.name
            ? `Tag rinominato: ${tagObj.name} → ${updated.name}`
            : `Tag ${updated.name} salvato.`;
          view.EditorWrap.addStatus(message, 'success');
          businessLogic.completeActionRequiredTag(tagObj.name);
          await page.home.refreshMetadata();
          view.ActionRequiredBox.render();
          if (updated.name !== tagObj.name && h.eid('Main') && model.get('tagsVisible').includes(tagObj.name)) {
            page.home.removeTagview(tagObj.name);
            await page.home.addTagview(updated.name);
          }
          dialog.remove();
          if (this.el === dialog) this.el = null;
        } catch (error) {
          const message =
            `${saved ? 'Tag salvato, aggiornamento fallito' : 'Salvataggio non riuscito'}: ${error.message}`;
          view.EditorWrap.addStatus(message, 'error');
        } finally {
          delete EditTagForm.dataset.saving;
          save.disabled = false;
        }
      };
    }
  },
  editTagPropertiesModal: {
    el: null,

    async render(tag) {
      const tagObj = (model.get('tags') || []).find(item => item.name === tag);
      if (!tagObj) return;
      if (this.el) this.el.remove();
      this.el = view.el('div', {className: 'modal'});
      const modalContent = this.el.appendChild(view.el('div', {className: 'modal-content'}));
      modalContent.appendChild(view.el('h3', {textContent: tag}));
      if (tagObj.category === "Events") {
        const dateControl = modalContent.appendChild(view.el('div', {className: 'tag-box',}));
        const dateLabel = dateControl.appendChild(view.el('label', {htmlFor: 'tag-date',textContent: 'Data:',}));
        const dateInput = dateControl.appendChild(view.el('input', {type: 'date',id: 'tag-date',value: tagObj.date || ''}));
        const dateSave = dateControl.appendChild(view.el('button', {
          type: 'button',
          className: 'btn primary',
          textContent: 'Salva',
          onclick: async () => {
            await businessLogic.updateTagDate(tagObj, dateInput.value);
            this.el.remove();
            if (this.el === this.el) this.el = null;
          }
        }));
      }
      const propertiesBox = modalContent.appendChild(view.el('div', {className: 'tag-box',}));
      const propertiesLabel = propertiesBox.appendChild(view.el('label', {textContent: 'Proprietà:'}));
      const propertiesList = propertiesBox.appendChild(view.el('div', {className: 'tag-box'}));
      const controls = modalContent.appendChild(view.el('div', {className: 'tag-properties-controls',}));
      const closeButton = controls.appendChild(view.el('button', {
        type: 'button',
        'data-dismiss': '',
        className: 'btn muted',
        textContent: 'Chiudi',
        onclick: () => {
          this.el.remove();
          if (this.el === this.el) this.el = null;
        }
      }));
      document.body.appendChild(this.el);

      const addRow = (property = {key: '', value: ''}) => {
        const row = view.el('div', {
          className: 'property-item property-drag-handle',
          draggable: true,
          "data-key": property.key
        });
        row.innerHTML = `
          <span title="Trascina per riordinare" aria-label="Trascina per riordinare">⠿</span>
          <label>${property.key}</label>`;
        row.addEventListener('dragstart', event => {
          row.classList.add('dragging');
          event.dataTransfer?.setData('text/plain', property.key);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          propertiesList.querySelectorAll('.property-item').forEach(item => {
            item.classList.remove('drag-over');
          });
        });
        row.addEventListener('dragover', event => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', event => {
          if (!row.contains(event.relatedTarget)) row.classList.remove('drag-over');
        });
        row.addEventListener('drop', async event => {
          event.preventDefault();
          row.classList.remove('drag-over');
          const draggedRow = propertiesList.querySelector('.property-item.dragging');
          if (!draggedRow || draggedRow === row) {
            console.error('Invalid drag operation');
            return;
          }
          const bounds = row.getBoundingClientRect();
          propertiesList.insertBefore(draggedRow, row);
          const order = Array.from(
            propertiesList.querySelectorAll('.property-item'),
            input => input.getAttribute('data-key')
          );
          console.log('Reordering properties for tag', tag, 'to order', order);
          await businessLogic.sortTagProperties(tag, order);
        });
        propertiesList.appendChild(row);
      };

      const response = await api.getTagProperties(tagObj);
      response.properties.forEach(addRow);
    }
  }
};
//#endregion

//#region ROUTER
let routeGeneration = 0;
async function router() {
  const generation = ++routeGeneration;
  const hash = location.hash.replace(/^#/, '') || '/';
  try {
    const destination = hash === '/' || hash === '/home'
      ? page.home : hash === '/calendar' ? page.calendar : null;
    if (destination) {
      await destination.load();
      if (generation !== routeGeneration) return;
      await destination.render();
      if (destination === page.home && generation === routeGeneration) {
        window.dispatchEvent(new Event('journote-home-ready'));
      }
    } else if (hash === '/explorer') {
      view.EditorWrap.dispose();
      await view.Explorer.render();
    } else {
      view.EditorWrap.dispose();
      h.eid('app').replaceChildren(view.el('p', {textContent: 'Not found'}));
    }
  } catch (error) {
    if (generation !== routeGeneration) return;
    console.error('Navigazione fallita:', error);
    alert(`Impossibile aprire la pagina: ${error.message}`);
  }
}
//#endregion

//#region RUN
(async () => {
  document.addEventListener('keydown', ev => {
    if(ev.repeat) return;
    console.debug('Pressed key:',
        ev.key, ' | ',
        ev.altKey ? 'ALT ' : '', 
        ev.ctrlKey ? 'CTRL ' : '',
        ev.shiftKey ? 'SHIFT ' : '');
        
    if (ev.altKey && !ev.ctrlKey && ev.shiftKey) {
      if (ev.key.toLowerCase() === '?') {
        ev.preventDefault();
        modal.shortcutsModal.render();
      }
    }
      
    if (ev.altKey && !ev.ctrlKey && !ev.shiftKey) {
      if (ev.key.toLowerCase() === 'n') {
        console.log('Alt+n pressed');
        ev.preventDefault();
        view.EditorWrap.focus();
      }
      if (ev.key.toLowerCase() === 't') {
        console.log('Alt+t pressed');
        ev.preventDefault();
        const today = h.localDate();
        page.home.addTagview(today);
      }
      if (ev.key.toLowerCase() === 'w') {
        console.log('Alt+w pressed');
        ev.preventDefault();
        page.home.removeTagview(model.get('tagsActive'));
      }
      if (ev.key === 'ArrowLeft') {
        console.log('Alt+Left pressed');
        ev.preventDefault();
        const activeTab = model.get('tagsActive');
        const visible = model.get('tagsVisible');
        const currentIndex = visible.findIndex(t => t === activeTab);
        console.log(currentIndex);
        if (currentIndex >= 1) {
          page.home.activateTagview(
            model.get('tagsVisible')[currentIndex - 1]
          );
        }
      }
      if (ev.key === 'ArrowRight') {
        console.log('Alt+Right pressed');
        ev.preventDefault();
        const activeTab = model.get('tagsActive');
        const visible = model.get('tagsVisible');
        const currentIndex = visible.findIndex(t => t === activeTab);
        console.log(currentIndex);
        if (currentIndex < visible.length - 1) {
          page.home.activateTagview(
            model.get('tagsVisible')[currentIndex + 1]
          );
        }
      }
      if (ev.key === 'm') {
        ev.preventDefault();
        view.EditorWrap.toggleMaximize();
      }
      if (ev.key === 'b') {
        ev.preventDefault();
        const activeTab = model.get('tagsActive');
        if(activeTab) {
          document.querySelector(`.column[data-key="${CSS.escape(String(activeTab))}"] .notesList`)?.focus();
        }
      }
      if (ev.key === 'l') {
        ev.preventDefault();
        const activeTab = model.get('tagsActive');
        if(activeTab) {
          document.querySelector(`.column[data-key="${CSS.escape(String(activeTab))}"]`)?.classList.toggle('showSubHeader');
        }
      }

      if (ev.key === 'f') {
        ev.preventDefault();
        modal.filterModal.render();
      }
    }
  });
  
  window.addEventListener('hashchange', router);
  await router();
})();
//#endregion
