// main js file (updated: added Calendar page)
const eid = (el) => document.getElementById(el);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const renderMarkdown = (text) => {
  if (!text) return '';
  const converter = new showdown.Converter({
    tables: true,
    simplifiedAutoLink: true,
    strikethrough: true,
    taskOptions: true,
    ghCodeBlocks: true,
    backslashEscapesHTMLTags: true,
    encodeEmails: true,
    openLinksInNewWindow: true,
    excludeTrailingPunctuationFromURLs: true,
    smartIndentationFix: true,
    simpleLineBreaks: true
  });
  // Process #tag[key] syntax
  const processedText = text.replace(/#([A-Za-z0-9_.-]+)\[([^\]]+)\]/g, (match, tagName, key) => {
    // Find the tag in our model
    const tag = (model.get('tags') || []).find(t => t.name === `#${tagName}`);
    if (tag && Array.isArray(tag.properties)) {
      // Extract the property value
      const propertyValue = tag.properties.find(property => property.key === key)?.value;
      if (propertyValue !== undefined) {
        return `<span class="tag-property-reference">${escapeHTML(propertyValue)}</span>`;
      }
    }
    // If we can't find the tag or property, return the original text
    return match;
  });
  return converter.makeHtml(processedText);
};

const sanitizeRenderedMarkdown = (root) => {
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
};

// Helper function to process #tag[key] syntax in text areas
const processTagSyntaxInTextArea = (text) => {
  if (!text) return text;
  // Replace #tag[key] with the actual tag content
  return text.replace(/#([A-Za-z0-9_.-]+)\[([^\]]+)\]/g, (match, tagName, key) => {
    // Find the tag in our model
    const tag = (model.get('tags') || []).find(t => t.name === `#${tagName}`);
    if (tag && Array.isArray(tag.properties)) {
      // Extract the property value
      const propertyValue = tag.properties.find(property => property.key === key)?.value;
      return propertyValue ?? match; // Return the property value or original if not found
    }
    return match; // Return original if tag not found
  });
};

// HELPER
const helper = {
  getClassfromTag(tag) {
    if (tag.startsWith('#')) return 'Projects';
    if (tag.startsWith('@')) return 'Persons';
    if (tag.startsWith('>')) return 'Events';
    if (tag.startsWith('+')) return 'Generic';
    if (/^\d{4}-\d{2}-\d{2}$/.test(tag)) return 'Journal';
    return 'FullText';
  },
  getAnonymizedTag(tag) {
    if (tag.startsWith('#')) return tag.substring(1);
    if (tag.startsWith('@')) return tag.substring(1);
    if (tag.startsWith('>')) return tag.substring(1);
    if (tag.startsWith('+')) return tag.substring(1);
    return tag;
  },
  extractTagsFromText(text, trailing_space=true) {
    const tagsfound = new Set();
    let tagRx = /(?<=^|\s)([#@>\+])([A-Za-z0-9_\-\.]+)[ ,\.;:]/g;
    if (!trailing_space) {
      tagRx = /([#@>\+])([A-Za-z0-9_\-\.]+)/g;
    }
    let m;
    while((m = tagRx.exec(text)) !== null) {
      tagsfound.add(m[0].trim());
    }
    return Array.from(tagsfound);
  },
  diffToToday(date1) {
    const date2 = new Date();
    const diffTime = date2 - date1;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays;
  }
}

// API
const api = {
  async api(url, opts = {}){
    console.log('[fn] api ' + url)
    opts.headers = opts.headers || {};
    if (opts.body && typeof FormData !== 'undefined' && opts.body instanceof FormData) {
      delete opts.headers['Content-Type'];
    } else if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    console.debug("[fn] api " + url + " executed", res.status);
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error?.message || res.statusText);
    }
    if (res.status !== 204) {
      return res.json();
    }
    return null;
  },
  async loadNotes(tag){
    console.log('[fn] loadNotes', tag);
    const category = helper.getClassfromTag(tag);
    const anonTag = helper.getAnonymizedTag(tag);
    const notes = await api.api(`/api/notes/${category}/${anonTag}`);
    return notes;
  },
};

// MODEL
const model = {
  set(el, val) {
    console.debug('model set "' + el + '"', val);
    if (typeof val == 'function') {
      this[el]._v = val(this[el]._v);
    } else {
      this[el]._v = val;
    }
    for (const sub of this[el].subs) {
      view[sub].render();
    }
    return this[el]._v;
  },
  get(el) {
    console.debug('model get: ' + el, this[el]._v);
    return this[el]._v;
  },

  tags: { _v: null, subs: ['TagsBoxList'], async reload() {
    this._v = await api.api("/api/tags");
    this._v.sort((a, b) => {
      const nameA = a.name.toUpperCase(); // ignore upper and lowercase
      const nameB = b.name.toUpperCase(); // ignore upper and lowercase
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
  } },
  // added 'Calendar' as subscriber so calendar view refreshes when tasks reload
  tasks: { _v: null, subs: ['TagsBoxList','Calendar'], async reload() {
    this._v = await api.api("/api/tasks");
    this._v.forEach( t => t.firstTag = t.tags[0] || null)
  } },
  tagsBox_eye: { _v: false, subs: ['TagsBoxList'] },
  tagsBox_task: { _v: true, subs: ['TagsBoxList'] },
  tagsVisible: { _v: [], subs: [] },
  tagsActive: { _v: [], subs: [] },
  leftBarVisible: { _v: true, subs: ['LeftBar'] }
};

// BUSINESS LOGIC LAYER
const businessLogic = {
  // Handle note operations
  async saveNote(raw, tdate) {
    if (!raw.trim()) return null;
    const assignment = raw.trim().match(/^(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]+)\][ \t]+(\S[\s\S]*)$/);
    if (assignment && assignment[2].trim()) {
      return api.api(`/api/tags/Projects/${encodeURIComponent(assignment[1].slice(1))}/properties`, {
        method: 'PATCH',
        body: {properties: [{key: assignment[2].trim(), value: assignment[3].trim()}]}
      });
    }
    const response = await api.api('/api/notes', {
      method: 'POST', body: {text: raw, date: tdate || new Date().toISOString().slice(0, 10)}
    });
    if (!response?.note?.id && response?.kind !== 'tag_property') throw new Error('Error saving note');
    return response;
  },

  async editNote(note, previousTags = note.tags, previousDate = note.date) {
    const response = await api.api(`/api/notes/${note.id}`, {
      method: 'PATCH',
      body: {
        text: note.text,
        date: note.date
      }
    });
    if(!response || !response.note.id) {
      alert('Error saving note');
      return;
    }
    return response.note;
  },
  
  // Handle tag operations
  getTagCategory(tag) {
    if (tag.startsWith('#')) return 'Projects';
    if (tag.startsWith('@')) return 'Persons';
    if (tag.startsWith('>')) return 'Events';
    if (tag.startsWith('+')) return 'Generic';
    if (/^\d{4}-\d{2}-\d{2}$/.test(tag)) return 'Journal';
    return 'FullText';
  },
  
  getAnonymizedTag(tag) {
    if (tag.startsWith('#')) return tag.substring(1);
    if (tag.startsWith('@')) return tag.substring(1);
    if (tag.startsWith('>')) return tag.substring(1);
    if (tag.startsWith('+')) return tag.substring(1);
    return tag;
  },
  
  // Handle task operations
  getTaskPriority(task) {
    // Return priority level based on task value
    if (!task || !task.task) return 'low';
    return task.task;
  },
  
  // Handle tag tree operations
  buildTagTree(flatTags, tasks) {
    const tree = [];
    const childrenOf = {};
    flatTags.forEach(tag => {
      childrenOf[tag.name] = { ...tag, tasks: [], children: [] };
      if (!tag.parent || tag.parent === '') {
        tree.push(childrenOf[tag.name]);
      }
      tasks.forEach(task => {
        if (task.firstTag == tag.name) {
          childrenOf[tag.name].tasks.push(task);
        }
      })
    });
    flatTags.forEach(tag => {
      if (tag.parent && childrenOf[tag.parent]) {
        childrenOf[tag.parent].children.push(childrenOf[tag.name]);
      }
    });
    return tree;
  },
  
  // Handle calendar operations
  getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return {
      firstDay: (firstDay === 0) ? 6 : firstDay - 1,
      daysInMonth
    };
  },
  
  // Handle action required operations
  getNewTags(text, existingTags = model.get('tags') || []) {
    const existingTagNames = new Set(existingTags.map(tag => tag.name));
    return helper.extractTagsFromText(text, false).filter(tag => !existingTagNames.has(tag));
  },

  getActionRequiredItems() {
    try {
      return JSON.parse(localStorage.getItem('journoteActionRequiredTags') || '[]');
    } catch (error) {
      console.error('Error reading action required tags:', error);
      return [];
    }
  },

  addActionRequiredTags(tags) {
    const pendingTags = new Set(this.getActionRequiredItems());
    tags.forEach(tag => pendingTags.add(tag));
    localStorage.setItem('journoteActionRequiredTags', JSON.stringify([...pendingTags]));
  },

  completeActionRequiredTag(tag) {
    const pendingTags = this.getActionRequiredItems().filter(item => item !== tag);
    localStorage.setItem('journoteActionRequiredTags', JSON.stringify(pendingTags));
  }
};

// PAGES
const page = {
  home: {
    filterViews: {},
    shortcutsBound: false,
    render() {
      this.el = eid('app');
      this.el.innerHTML = '';
      this.el.appendChild(view.createEl('aside', {id: 'LeftBar'}));
      this.el.appendChild(view.createEl('div', {id: 'Main'}));
      view.LeftBar.render();
      view.Main.render();

      const tagsVisible = model.get('tagsVisible');
      model.set('tagsVisible', []);
      (async () => {
        await this.addTagview(new Date().toISOString().slice(0, 10)); 
        for (const x of tagsVisible) {
          if (this.filterViews[x]) {
            await this.addFilterview(this.filterViews[x], null, x);
          } else {
            await this.addTagview(x);
          }
        }
      })();
      if (!this.shortcutsBound) {
        this.shortcutsBound = true;
        document.addEventListener('keydown', (ev) => {
          if (!eid('Main')) return;
        if (ev.altKey && !ev.ctrlKey && !ev.shiftKey) {
          /* Alt + n --> focus on editor */
          if (ev.key.toLowerCase() === 'n') {
            ev.preventDefault();
            const editor = view.EditorWrap.ed;
            editor.focus();
            editor.setSelectionRange(editor.value.length, editor.value.length);
          }
          /* Alt + t --> add today's journal entry */
          if (ev.key.toLowerCase() === 't') {
            ev.preventDefault();
            const today = new Date().toISOString().slice(0, 10);
            page.home.addTagview(today);
          }
          /* Alt + w --> close current tab */
          if (ev.key.toLowerCase() === 'w') {
            ev.preventDefault();
            page.home.removeTagview(model.get('tagsActive'));
          }
          /* Alt + 1..9 --> switch to tab */
          if (!isNaN(parseInt(ev.key, 10))) {
            ev.preventDefault();
            let evIndex = parseInt(ev.key, 10)-1;
            console.log('Numeric key pressed:', evIndex);
            if (evIndex >= 0 && evIndex < model.get('tagsVisible').length) {
              page.home.activateTagview(model.get('tagsVisible')[evIndex]);
            }
          }
          /* Alt + Arrow left --> swith to arrow left */
          if (ev.key === 'ArrowLeft') {
            ev.preventDefault();
            const activeTab = model.get('tagsActive');
            const tagsVisible = model.get('tagsVisible');
            const currentIndex = tagsVisible.findIndex(t => t === activeTab);
            console.log(currentIndex);
            if (currentIndex >= 1) {
              page.home.activateTagview(model.get('tagsVisible')[currentIndex - 1]);
            }
          }
          /* Alt + Arrow right --> swith to arrow right */
          if (ev.key === 'ArrowRight') {
            ev.preventDefault();
            const activeTab = model.get('tagsActive');
            const tagsVisible = model.get('tagsVisible');
            const currentIndex = tagsVisible.findIndex(t => t === activeTab);
            console.log(currentIndex);
            if (currentIndex < tagsVisible.length - 1) {
              page.home.activateTagview(tagsVisible[currentIndex + 1]);
            }
          }
          /* Alt + Arrow up/down --> maximize/restore current tab */
          if(ev.key == 'ArrowUp') {
            ev.preventDefault();
            const activeTab = model.get('tagsActive');
            // Maximize active tab
            if (activeTab) view.Main.maximizeTab(activeTab);
          }
          /* Alt + Arrow up/down --> maximize/restore current tab */
          if(ev.key == 'ArrowDown') {
            ev.preventDefault();
            const activeTab = model.get('tagsActive');
            // Restore active tab
            if (activeTab) view.Main.maximizeTab(activeTab);
          }
        }
        });
      }
    },
    async load() {
      await model.tags.reload();
      await model.tasks.reload();
    },
    async refreshMetadata() {
      await model.tags.reload();
      await model.tasks.reload();
      view.TagsBoxList.render();
      for (const [key, rule] of Object.entries(this.filterViews)) {
        if (!model.get('tagsVisible').includes(key)) continue;
        const notes = await api.api('/api/notes/filter', {
          method: 'POST',
          body: {rule}
        });
        view.Main.updateTab(key, notes);
      }
    },
    async addTagview(tag) {
      console.log('[fn] addTagview', tag);
      console.log('[fn] addTagview', model.get('tagsVisible'));
      
      if (model.get('tagsVisible').includes(tag)) {
          console.log('Tagview already exists');
          page.home.activateTagview(tag);
          return;
      }
      const tagsVisible = model.set('tagsVisible', (tagsVisible) => { tagsVisible.push(tag); return tagsVisible;})

      const matched = await api.loadNotes(tag);

      view.TopBar.addTab(tag, matched);
      view.Main.addTab(tag, matched);
    },
    async addFilterview(rule, notes = null, key = null) {
      if (!eid('Main')) {
        const homeReady = new Promise(resolve => {
          window.addEventListener('journote-home-ready', resolve, {once: true});
        });
        const alreadyHome = location.hash === '#/home';
        location.hash = '/home';
        if (alreadyHome) {
          await this.load();
          this.render();
          window.dispatchEvent(new Event('journote-home-ready'));
        }
        await homeReady;
      }
      const filterKey = key || `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.filterViews[filterKey] = rule;
      model.set('tagsVisible', (visible) => [...visible, filterKey]);

      const matched = notes ?? await api.api('/api/notes/filter', {
        method: 'POST',
        body: {rule}
      });
      const label = `Filtro: ${rule}`;
      view.TopBar.addTab(filterKey, matched, label);
      view.Main.addTab(filterKey, matched, label);
    },
    activateTagview(key){
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
      if ((new Date().toISOString().slice(0, 10)) == tag) {
        console.log('[fn] removeTagview - dont remove today', tag);
        return;
      }
      delete this.filterViews[tag];
      const tagsVisible = model.set('tagsVisible', (tags) => tags.filter(t => t !== tag) );
      console.log(tagsVisible)
      view.TopBar.removeTab(tag)
      view.Main.removeTab(tag)
      if (model.get('tagsActive') == tag) {
        page.home.activateTagview(tagsVisible[tagsVisible.length-1])
      }
    }
  },
  calendar: {
    render() {
      this.el = eid('app');
      this.el.innerHTML = '';
      this.el.appendChild(view.createEl('aside', {id: 'LeftBar'}));
      this.el.appendChild(view.createEl('div', {id: 'CalendarMain'}));
      view.LeftBar.render();
      view.Calendar.render();
    },
    async load() {
      await model.tags.reload();
      await model.tasks.reload();
    }
  }
};

// BUSINESS LOGIC LAYER - PAGE SPECIFIC METHODS
const pageBusinessLogic = {
  async saveNote(raw, tdate) {
    return businessLogic.saveNote(raw, tdate);
  },

  async editNote(note, previousTags = note.tags, previousDate = note.date) {
    const response = await api.api(`/api/notes/${note.id}`, {
      method: 'PATCH',
      body: {
        text: note.text,
        date: note.date
      }
    });
    if(!response || !response.note.id) {
      alert('Error saving note');
      return;
    }
    return response.note;
  }
};
// VIEW
const view = {
  createEl(typ, options) {
    const e = document.createElement(typ);
    for (const [key, value] of Object.entries(options)) {
      if (value && typeof value === 'object') {
        for (const [subkey, subvalue] of Object.entries(value)) {
          e[key][subkey] = subvalue;
        }
      } else {
        e[key] = value;
      }
    }
    return e;
  },
  EditorWrap: {
    render() {
      this.currentNote = null;
      this.el = eid('EditorWrap');
      this.el.innerHTML = '';
      this.editorField = this.el.appendChild(view.createEl('div', {className: 'editor-field'}));
      this.ed = this.editorField.appendChild(view.createEl('textarea', {
        id: 'Editor',
        className: 'editor-area',
        placeholder: 'Scrivi una nota in Markdown...',
        rows: 5,
        spellcheck: false
      }));
      this.ed.setAttribute('aria-label', 'Testo della nota in Markdown');
      this.status = this.editorField.appendChild(view.createEl('div', {
        id: 'EditorStatus',
        className: 'editor-status'
      }));
      this.status.setAttribute('aria-live', 'polite');
      this.pendingImageUploads = 0;
      const EditorCtrl = this.el.appendChild(view.createEl('div', {id: 'EditorCtrl'}));
      const EditorSaveBtn = EditorCtrl.appendChild(view.createEl('button', {id: 'EditorSaveBtn', className: 'btn primary', textContent: 'Save'}))
      const EditorUpdateBtn = EditorCtrl.appendChild(view.createEl('button', {id: 'EditorUpdateBtn', className: 'btn secondary', textContent: 'Update', style: 'display:none;'}))
      const EditorClearBtn = EditorCtrl.appendChild(view.createEl('button', {id: 'EditorClearBtn', className: 'btn info', textContent: 'Clear', style: 'display:none;'}))

      this.ed.addEventListener('input', () => this.resizeEditor());
      this.ed.addEventListener('paste', async (ev) => {
        const imageItem = Array.from(ev.clipboardData?.items || []).find(item =>
          item.kind === 'file' && item.type.startsWith('image/')
        );
        const imageFile = imageItem?.getAsFile();
        if (!imageFile) return;

        ev.preventDefault();
        const token = `journote-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const placeholder = `![Immagine in caricamento](pending:${token})`;
        this.ed.setRangeText(placeholder, this.ed.selectionStart, this.ed.selectionEnd, 'end');
        this.pendingImageUploads += 1;
        this.updateImageUploadState();

        const formData = new FormData();
        formData.append('image', imageFile, imageFile.name || 'clipboard-image');
        try {
          const uploaded = await api.api('/api/images', {method: 'POST', body: formData});
          const markerPosition = this.ed.value.indexOf(placeholder);
          if (markerPosition >= 0) {
            this.ed.setRangeText(
              uploaded.markdown,
              markerPosition,
              markerPosition + placeholder.length,
              'preserve'
            );
          }
          this.status.textContent = 'Immagine inserita nella nota.';
          this.status.dataset.state = 'success';
        } catch (error) {
          const markerPosition = this.ed.value.indexOf(placeholder);
          if (markerPosition >= 0) {
            this.ed.setRangeText('', markerPosition, markerPosition + placeholder.length, 'preserve');
          }
          this.status.textContent = `Immagine non inserita: ${error.message}`;
          this.status.dataset.state = 'error';
        } finally {
          this.pendingImageUploads -= 1;
          this.updateImageUploadState();
          this.resizeEditor();
        }
      });
      this.ed.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Enter' && ev.ctrlKey && !ev.altKey) {
          ev.preventDefault();
          if (this.pendingImageUploads) return;
          if (this.currentNote) await this.editNote();
          else await this.saveNote();
          return;
        }
        if (ev.key === 'Tab') {
          ev.preventDefault();
          this.ed.setRangeText('  ', this.ed.selectionStart, this.ed.selectionEnd, 'end');
          return;
        }
        if (ev.ctrlKey && !ev.altKey && ['b', 'i', 'k'].includes(ev.key.toLowerCase())) {
          ev.preventDefault();
          const marker = ev.key.toLowerCase() === 'b' ? '**' : ev.key.toLowerCase() === 'i' ? '*' : '`';
          this.insertMarkdown(marker, marker);
        }
      });

      /* Button events */
      EditorSaveBtn.addEventListener('click', async (ev) => {
        if (this.pendingImageUploads) return;
        await this.saveNote()
      });
      EditorClearBtn.addEventListener('click', (ev) => {
        this.clear();
      });
      EditorUpdateBtn.addEventListener('click', async (ev) => {
        if (this.pendingImageUploads) return;
        this.editNote();
      });

    },
    resizeEditor() {
      this.ed.style.height = 'auto';
      this.ed.style.height = `${Math.min(Math.max(this.ed.scrollHeight, 120), 300)}px`;
    },
    updateImageUploadState() {
      const busy = this.pendingImageUploads > 0;
      eid('EditorSaveBtn').disabled = busy;
      eid('EditorUpdateBtn').disabled = busy;
      if (busy) {
        this.status.textContent = `Caricamento immagine${this.pendingImageUploads > 1 ? ` (${this.pendingImageUploads})` : ''}...`;
        this.status.dataset.state = 'loading';
      }
    },
    insertMarkdown(prefix, suffix) {
      const start = this.ed.selectionStart;
      const end = this.ed.selectionEnd;
      const selectedText = this.ed.value.slice(start, end);
      this.ed.setRangeText(`${prefix}${selectedText}${suffix}`, start, end, 'select');
      if (!selectedText) {
        const cursor = start + prefix.length;
        this.ed.setSelectionRange(cursor, cursor);
      }
      this.ed.focus();
    },
    clear() {
      this.ed.value = '';
      this.ed.style.height = '';
      this.status.textContent = '';
      this.status.dataset.state = '';
      this.currentNote = null;
      eid('EditorSaveBtn').style.display = 'block';
      eid('EditorUpdateBtn').style.display = 'none';
      eid('EditorClearBtn').style.display = 'none';
    },
    renderEditNote(note) {
      this.currentNote = note;
      this.ed.value = note.text;
      this.resizeEditor();
      this.ed.focus();
      eid('EditorSaveBtn').style.display = 'none';
      eid('EditorUpdateBtn').style.display = 'block';
      eid('EditorClearBtn').style.display = 'block';
      this.ed.setSelectionRange(this.ed.value.length, this.ed.value.length);
    },
    async saveNote() {
      if (this.saving || !this.ed.value.trim()) return;
      this.saving = true;
      const raw = this.ed.value;
      const newTags = businessLogic.getNewTags(raw);
      let saved = false;
      try {
        const response = await pageBusinessLogic.saveNote(raw, this.parseLeadingDate(raw));
        saved = true;
        const isProperty = response.kind === 'tag_property';
        if (isProperty) {
          if (this.ed.value === raw) this.ed.value = '';
          this.status.textContent = `Proprietà salvata per ${response.tag}.`;
        } else {
          view.Main.pushNote(response.note);
          const leadingTags = [];
          for (const word of raw.split(/\s+/)) {
            if (/^[#@>+]/.test(word)) leadingTags.push(word);
            else break;
          }
          if (this.ed.value === raw) this.ed.value = leadingTags.length ? `${leadingTags.join(' ')} ` : '';
          this.status.textContent = 'Nota salvata.';
        }
        businessLogic.addActionRequiredTags(isProperty ? newTags.filter(tag => tag === response.tag) : newTags);
        this.status.dataset.state = 'success';
        await page.home.refreshMetadata();
        await view.ActionRequiredBox.render();
      } catch (error) {
        this.status.textContent = saved
          ? `Salvato, ma aggiornamento della vista fallito: ${error.message}`
          : `Salvataggio non riuscito: ${error.message}`;
        this.status.dataset.state = 'error';
      } finally {
        this.saving = false;
        this.resizeEditor();
        this.ed.focus();
      }
    },
    async editNote() {
      const raw = this.ed.value;
      if (!raw) return;
      const date = this.parseLeadingDate(raw);
      const previousTags = [...this.currentNote.tags];
      const previousDate = this.currentNote.date;
      this.currentNote.text = raw;
      this.currentNote.date = date || this.currentNote.date;
      const note = await pageBusinessLogic.editNote(this.currentNote, previousTags, previousDate);
      if (note) {
        view.Main.editedNote(note, previousTags, previousDate);
        view.EditorWrap.clear();
        await page.home.refreshMetadata();
      }
    },
    parseLeadingDate(text) {
      const m = text.trim().match(/^(\d{4}-\d{2}-\d{2})\b/);
      return m ? m[1] : null;
    }
  },
  TopBar: {
    render() {
      this.el = eid('TopBar');
      this.el.innerHTML = '';
      
      const navBtnsWrap = this.el.appendChild(view.createEl('div', {className: 'navBtnsWrap'}));

      const hamburger = navBtnsWrap.appendChild(view.createEl('button', {
        id: 'HamburgerBtn',
        className: 'navBtn btn standard',
        innerHTML: '<i class="fa-xs fa-fw fa-solid fa-bars fa-middle"></i>',
        style: { top: '10px',left: '10px',zIndex: '1000',fontSize: '20px',height: '36px'},
        onclick: () => {
          model.set('leftBarVisible', !model.get('leftBarVisible'));
        }
      }));
      if (!eid('LeftBar')) hamburger.style.display = 'none';
            
      const home = navBtnsWrap.appendChild(view.createEl('button', {
        id:'HomeBtn',
        className:'navBtn btn secondary',
        innerHTML:'<i class="fa-xs fa-fw fa-solid fa-home fa-middle"></i>',
        style: {top:'10px', left:'10px', zIndex:'1000', fontSize:'20px', height:'36px'},
        onclick:() => {
          location.hash = '/home'
        }
      }));
      
      const calendar = navBtnsWrap.appendChild(view.createEl('button', {
        id: 'calendarBtn',
        className: 'navBtn btn secondary',
        innerHTML: '<i class="fa-xs fa-fw fa-regular fa-calendar fa-middle"></i>',
        style: {top: '10px', left: '10px', zIndex: '1000', fontSize: '20px', height: '36px'},
        onclick: () => {
          location.hash = '/calendar'
        }
      }));

      navBtnsWrap.appendChild(view.createEl('button', {
        id: 'explorerBtn',
        className: 'navBtn btn secondary',
        innerHTML: '<i class="fa-xs fa-fw fa-solid fa-database fa-middle"></i>',
        title: 'Explorer',
        'aria-label': 'Explorer',
        style: {top: '10px', left: '10px', zIndex: '1000', fontSize: '20px', height: '36px'},
        onclick: () => {
          location.hash = '/explorer';
        }
      }));
      
      this.tc = this.el.appendChild(view.createEl('div', {id: 'TopBarContainer', className: 'scrollable-x'}));
    },
    addTab(tag, notes, label = tag) {
      // Pill
      const elPill = document.createElement('div');
      elPill.className = 'tabPill';
      elPill.dataset.key = tag;
      elPill.title = label;
      elPill.onclick = () => page.home.activateTagview(tag);
      this.tc.appendChild(elPill);
      
      // Pill label
      const elPillLabel = document.createElement('span');
      elPillLabel.textContent = label;
      elPill.appendChild(elPillLabel);

      // Pill close button
      const elPillCloseBtn = document.createElement('span');
      elPillCloseBtn.className = 'x';
      elPillCloseBtn.textContent = '×';
      elPillCloseBtn.onclick = (ev) => {
        ev.stopPropagation();
        page.home.removeTagview(tag);
      };
      elPill.appendChild(elPillCloseBtn);
      elPill.scrollIntoView({behavior:'smooth', inline:'start'});
    },
    activateTab(tag) {
      console.log('[fn] TopBar.activate', tag);
      for(const el of document.querySelectorAll('.tabPill')) el.classList.remove('active');
      const pill = document.querySelector(`.tabPill[data-key="${tag}"]`);
      if(pill) {
        pill.scrollIntoView({behavior:'smooth', inline:'nearest', container: 'nearest'});
        pill.classList.add('active');
      }
    },
    removeTab(tag) {
      console.log('[fn] removeTagview', tag);
      const pill = this.tc.querySelector(`.tabPill[data-key="${tag}"]`);
      if (pill) pill.remove();
    }
  },
  Main: {
    render() {
      this.el = eid('Main');
      this.el.innerHTML = '';
      this.el_tb = this.el.appendChild(view.createEl('div', {id: 'TopBar'}));
      this.el_cw = this.el.appendChild(view.createEl('div', {id: 'ColumnsWrap', className: 'columns scrollable-x'}));
      this.el_ew = this.el.appendChild(view.createEl('div', {id: 'EditorWrap'}));
      view.TopBar.render();
      view.EditorWrap.render();
    },
    addTab(tag, notes, label = tag) {
      // Column
      const tagObj = (model.get('tags') || []).find(t => t.name === tag);
      const elColumn = this.el_cw.appendChild(document.createElement('div'));
      elColumn.className = 'column';
      elColumn.dataset.key = tag;
      elColumn.style.position = 'relative';   // needed for resizer positioning
      elColumn.style.flex = '0 0 420px';

      // Add resize handle
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'ColumnResizer';
      resizeHandle.style.width = '5px';
      resizeHandle.style.cursor = 'col-resize';
      resizeHandle.style.position = 'absolute';
      resizeHandle.style.top = '0';
      resizeHandle.style.right = '0';
      resizeHandle.style.bottom = '0';
      resizeHandle.style.zIndex = '10';
      elColumn.appendChild(resizeHandle);

      // Make resizable
      view.Main.makeResizable(elColumn, resizeHandle);


      // Content wrapper
      const elColCont = elColumn.appendChild(document.createElement('div'));
      elColCont.className = 'column-content';
      elColCont.dataset.key = tag;

      // Header
      const header = elColCont.appendChild(document.createElement('div'));
      header.className = 'columnHeader';
      header.textContent = label;

      const subheader = elColCont.appendChild(document.createElement('div'));
      subheader.className = 'columnSubHeader';

      if (tagObj == undefined) {
        const tagType = helper.getClassfromTag(tag);
        if (tagType == 'Journal') {
          subheader.innerHTML = (new Date(tag)).toLocaleDateString('it-IT', { weekday: 'long', year: "numeric", month: "long", day: "numeric" });
        } else if (tagType == 'FullText') {
          subheader.innerHTML = '';
        } else {
          console.error('tagObj is undefined');
        }
      } else {
        const conv = new showdown.Converter({metadata: true, sanitize: true});
        const content = conv.makeHtml(tagObj.content || '');
        subheader.innerHTML = content;
        sanitizeRenderedMarkdown(subheader);
      }
      subheader.style.display = 'block';

      // Buttons
      const btnWrap = header.appendChild(document.createElement('div'));
      btnWrap.style.float = 'right';
      btnWrap.style.display = 'flex';
      btnWrap.style.gap = '8px';

      // Maximize button
      const contentBtn = btnWrap.appendChild(document.createElement('button'));
      contentBtn.innerHTML = '<i class="fa fa-eye fa-fw fa-solid fa-xs"> </i>';
      contentBtn.title = 'Show content';
      contentBtn.className = 'btnp primary';
      contentBtn.onclick = (ev) => {
        ev.stopPropagation();
          if (subheader.style.display === "none") {
            subheader.style.display = "block";
          } else {
            subheader.style.display = "none";
          }
      };

      // Maximize button
      const maxBtn = btnWrap.appendChild(document.createElement('button'));
      maxBtn.innerHTML = '<i class="fa fa-expand fa-fw fa-solid fa-xs"> </i>';
      maxBtn.title = 'Maximize column';
      maxBtn.className = 'btnp primary';
      maxBtn.onclick = (ev) => {
        ev.stopPropagation();
        this.maximizeTab(tag);
      };

      // Close button
      const closeBtn = btnWrap.appendChild(document.createElement('button'));
      closeBtn.innerHTML = '<i class="fa fa-x fa-fw fa-solid fa-xs"> </i>';
      closeBtn.title = 'Close tab';
      closeBtn.className = 'btnp primary';
      closeBtn.onclick = (ev) => {
        ev.stopPropagation();
        page.home.removeTagview(tag);
      };

      // Note list
      const elNoteList = elColCont.appendChild(document.createElement('div'));
      elNoteList.className = 'notesList scrollable';

      // Load notes for this tag
      if(notes.length === 0) {
        this.showEmptyState(elNoteList, tag);
      } else {
        notes.forEach(n => elNoteList.appendChild(this.genNoteItem(n, tag)) );
        setTimeout(() => {
          console.log('Scrolling note list to bottom', tag);
          elNoteList.scrollTop = elNoteList.scrollHeight;
        }, 0);
      }
      page.home.activateTagview(tag);
    },
    activateTab(tag) {
      console.log('[fn] Main.activate', tag);
      for(const el of this.el_cw.querySelectorAll('.column')) el.classList.remove('active');
      const col = this.el_cw.querySelector(`.column[data-key="${tag}"]`);
      if(col) {
        col.scrollIntoView({behavior:'smooth', inline:'start'});
        col.classList.add('active');
      }
    },
    removeTab(tag) {
      const elColToRemove = this.el_cw.querySelector(`.column[data-key="${tag}"]`);
      if (elColToRemove) elColToRemove.remove()
    },
    pushNote(note) {
      console.log('[fn] pushNote', note);
      /* automatically add to all tag views based on note tags */
      for (let tag of note.tags) {
        if (!model.get('tagsVisible').includes(tag)) {
          // page.home.addTagview(tag);
        } else {
          const noteList = document.querySelector(`.column[data-key="${tag}"] .notesList`);
          if (noteList) {
            const elNotePushed = noteList.appendChild(this.genNoteItem(note, tag));
            elNotePushed.scrollIntoView({behavior:'smooth', inline:'start'});
          }
        }
      }

      /* automatically add date view */
      if (!model.get('tagsVisible').includes(note.date)) {
        // page.home.addTagview(note.date);
      } else {
        const noteList = document.querySelector(`.column[data-key="${note.date}"] .notesList`);
        if (noteList) {
          const elNotePushed = noteList.appendChild(this.genNoteItem(note, note.date));
          elNotePushed.scrollIntoView({behavior:'smooth', inline:'start'});
        }
      }

    }, 
    updateTab(tag, notes) {
      const column = this.el_cw.querySelector(`.column[data-key="${tag}"]`);
      const noteList = column?.querySelector('.notesList');
      if (!noteList) return;
      if (notes.length === 0) {
        this.showEmptyState(noteList, tag);
        return;
      }
      noteList.replaceChildren(...notes.map(note => this.genNoteItem(note, tag)));
    },
    showEmptyState(noteList, tag) {
      const message = document.createElement('p');
      message.className = 'empty-state';
      if (tag.startsWith('filter-')) {
        message.textContent = 'Nessuna nota corrisponde a questa regola.';
      } else if (helper.getClassfromTag(tag) === 'Journal') {
        message.textContent = 'Nessuna nota per questa data.';
      } else {
        message.textContent = 'Nessuna nota in questa raccolta.';
      }
      noteList.replaceChildren(message);
    },
    maximizeTab(key) {
      console.log('[fn] maximizeTab', key);
      const col = this.el_cw.querySelector(`.column[data-key="${key}"]`);
      if (!col) return;
      col.classList.toggle('maximized');
    },
    genNoteItem(n, currentTag) {
      let taskClass = ''
      if(n.task != null && n.task != '') { taskClass = 'task-'+n.task }

      const elNoteItem = view.createEl('div', {
        className: `noteItem ${taskClass}`,
        dataset: {id: n.id}
      })
      
      const elNoteDate = elNoteItem.appendChild(view.createEl('div', {
        className: 'noteDate flex-col',
        innerHTML: new Date(n.date).toLocaleString('default', { month: 'short' }) + '-' + n.date.substring(8,10) + 
                (n.duedate ? '<br><span class="color-purple-4">' + new Date(n.duedate).toLocaleString('default', { month: 'short' }) + '-' + n.duedate.substring(8,10) + '</span>' : ''  )
      }));
      const elNoteDays = elNoteItem.appendChild(view.createEl('div', {
        className: 'noteDays flex-col',
        innerHTML: helper.diffToToday(new Date(n.date)) + 
                (n.duedate ? '<br><span class="color-purple-4">' + helper.diffToToday(new Date(n.duedate)) + '</span>': '' )
      }));

      // Note Text
      const elNoteText = elNoteItem
        .appendChild(view.createEl('div', {style: {flex: '1', display: 'flex', flexDirection: 'column', paddingLeft: '5px'}}))
        .appendChild(this.genNoteText(n, currentTag))

      // ButtonWrap
      const elNoteBtnWrap = elNoteItem.appendChild(view.createEl('div', {
        style: "display:flex; flex-direction: column; gap: 2px; flex: 0; padding-left: 5px;"
      }));

      // Edit button
      elNoteBtnWrap.appendChild(view.createEl('button', {
        className: 'btn primary small transparent',
        innerHTML: '<i class="fa fa-pencil fa-solid fa-fw fa-2xs"></i>',
        title: 'Edit note',
        onclick: (ev) => {
          ev.stopPropagation();
          view.EditorWrap.renderEditNote(n);
        }
      }));
      
      // Delete button
      const elNoteDelBtn = elNoteBtnWrap.appendChild(view.createEl('button', {
        className: 'btn error small transparent',
        innerHTML: '<i class="fa fa-x fa-solid fa-fw fa-2xs"></i>',
        title: 'Delete note',
        onclick: async (ev) => {
          ev.stopPropagation();
          if (!confirm('Delete this note?')) return;
          const ok = await api.api(`/api/notes/${n.id}`, {method: "DELETE"});
          if (ok && ok.status === 'deleted') {
            document.querySelectorAll(`.noteItem[data-id="${n.id}"]`).forEach(item => item.remove());
            await page.home.refreshMetadata();
          }
        }
      }));

      return elNoteItem
    },
    genNoteText(n, currentTag) {
      const elNoteText = document.createElement('div');
      elNoteText.className = 'noteText';
      let noteText = escapeHTML(n.text);
      const noteKey = String(n.id).replace(/[^A-Za-z0-9]/g, '');
      const labels = helper.extractTagsFromText(n.text, false).map((tag, index) => {
        const token = `JOURNOTETAG${noteKey}X${index}END`;
        // For hashtags, we want to hide the # symbol from the text but keep it for filtering
        if (tag.startsWith('#')) {
          // Replace the full tag (including #) with a token, but only show the tag without #
          noteText = noteText.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), token);
          return {tag, token, displayTag: tag.substring(1)};
        }
        noteText = noteText.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), token);
        return {tag, token};
      });
      const converter = new showdown.Converter({metadata: true, sanitize: true});
      elNoteText.innerHTML = converter.makeHtml(noteText);
        sanitizeRenderedMarkdown(elNoteText);
      elNoteText.querySelectorAll('img').forEach(image => {
        image.loading = 'lazy';
        image.decoding = 'async';
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', `Apri immagine a schermo intero: ${image.alt || 'immagine'}`);
        const openImage = () => modal.imageViewer.open(image.currentSrc || image.src, image.alt);
        image.addEventListener('click', openImage);
        image.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            openImage();
          }
        });
      });

      if (labels.length) {
        const labelByToken = new Map(labels.map(label => [label.token, label]));
        const tokenPattern = new RegExp(`(${labels.map(label => label.token).join('|')})`, 'g');
        const walker = document.createTreeWalker(elNoteText, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        for (const node of textNodes) {
          const parts = node.nodeValue.split(tokenPattern);
          if (parts.length === 1) continue;
          const content = document.createDocumentFragment();
          parts.forEach((part, index) => {
            if (labelByToken.has(part)) {
              const labelInfo = labelByToken.get(part);
              const tag = labelInfo.tag;
              if (node.parentElement?.closest('pre, code')) {
                content.appendChild(document.createTextNode(tag));
                return;
              }
              const label = document.createElement('button');
              label.type = 'button';
              label.className = `lbl lbl-${helper.getClassfromTag(tag)}`;
              label.dataset.tag = tag;
              // Use displayTag if it exists (for hashtags), otherwise use the original tag
              label.textContent = tag === currentTag ? '●' : (labelInfo.displayTag || tag);
              label.title = `Apri ${tag}`;
              label.addEventListener('click', () => page.home.addTagview(tag));
              content.appendChild(label);
            } else if (part) {
              content.appendChild(document.createTextNode(part));
            }
          });
          node.replaceWith(content);
        }
      }
      return elNoteText
    },
    makeResizable(colEl, handle) {
      let startX, startWidth;

      const onMouseDown = (e) => {
        startX = e.clientX;
        startWidth = colEl.offsetWidth;
        document.documentElement.addEventListener('mousemove', onMouseMove);
        document.documentElement.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        const newWidth = Math.min(Math.max(startWidth + (e.clientX - startX), 220), 600);
        colEl.style.flex = `0 0 ${newWidth}px`;
      };

      const onMouseUp = () => {
        document.documentElement.removeEventListener('mousemove', onMouseMove);
        document.documentElement.removeEventListener('mouseup', onMouseUp);
      };

      handle.addEventListener('mousedown', onMouseDown);
    },
    editedNote(note, previousTags = [], previousDate = note.date) {
      console.log('[fn] editedNote', note);
      const affectedKeys = new Set([...previousTags, ...note.tags, previousDate, note.date]);
      for (const key of affectedKeys) {
        if (page.home.filterViews[key] || !model.get('tagsVisible').includes(key)) continue;
        const noteList = document.querySelector(`.column[data-key="${key}"] .notesList`);
        if (!noteList) continue;
        const existing = noteList.querySelector(`.noteItem[data-id="${note.id}"]`);
        const belongs = note.tags.includes(key) || note.date === key;
        if (belongs) {
          const updated = this.genNoteItem(note, key);
          existing ? existing.replaceWith(updated) : noteList.appendChild(updated);
        } else {
          existing?.remove();
        }
      }
    }
  },
  LeftBar: {
    render() {
      this.el = eid('LeftBar');
      this.el.innerHTML = '';

      // check visibility
      if (!model.get('leftBarVisible')) {
        this.el.style.display = 'none';
        return;
      }
      this.el.style.display = 'block';
      if(!localStorage.getItem('leftBarWidth')){
        this.el.style.flex = "0 0 260px";
      } else {
        this.el.style.flex = localStorage.getItem('leftBarWidth');
      }

      this.el.appendChild(view.createEl('div', {id: 'JournalBox', className: "box", style: "flex: 0"}));
      this.el.appendChild(view.createEl('div', {id: 'TagsBox', className: "box", style: "flex: 1 1 auto; min-height: 0; overflow-y: auto;"}));
      this.el.appendChild(view.createEl('div', {id: 'ActionRequiredBox', className: "box", style: "flex: 0 0 auto; margin-top: auto;"}));

      // Resizer
      const handle = document.createElement('div');
      handle.id = 'LeftBarResizer';
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

      view.JournalBox.render()
      view.TagsBox.render()
      view.ActionRequiredBox.render()
    },

    makeResizable(handle) {
      let startX, startWidth;

      const onMouseDown = (e) => {
        startX = e.clientX;
        startWidth = this.el.offsetWidth;
        document.documentElement.addEventListener('mousemove', onMouseMove);
        document.documentElement.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        const newWidth = Math.min(Math.max(startWidth + (e.clientX - startX), 180), 500);
        this.el.style.flex = "0 0 "+ newWidth + 'px';
      };

      const onMouseUp = () => {
        localStorage.setItem('leftBarWidth', this.el.style.flex);
        document.documentElement.removeEventListener('mousemove', onMouseMove);
        document.documentElement.removeEventListener('mouseup', onMouseUp);
      };

      handle.addEventListener('mousedown', onMouseDown);
    }
  },
  TagsBox: {
    render() {
      this.el = eid('TagsBox');
      this.el.innerHTML = '';
     
      this.el.appendChild(view.createEl('div', {id: 'TagsBoxSubHeader',
        style: "margin: 10px 0px;"
      }));
      
      this.el.appendChild(view.createEl('div', {id: 'TagsBoxList',
        style: "display:block; width:100%;background:none;border:none;font-size:1.2em;z-index:2;",
        className: 'scrollable'
      }));

      view.TagsBoxSubHeader.render()
      view.TagsBoxList.render()
    }
  },
  TagsBoxSubHeader: {
    render() {
      console.log('[fn] TagsBoxSubHeader.render()');
      this.el = eid('TagsBoxSubHeader');
      this.el.innerHTML = '';
      
      const elTagsEye = document.createElement('button');
      elTagsEye.id = 'tagsEye';
      elTagsEye.className="btnp primary";
      elTagsEye.innerHTML = '<i class="fa fa-fw fa-eye"></i>';
      elTagsEye.onclick = (ev) => {
        ev.preventDefault();
        elTagsEye.classList.toggle('active');
        model.set('tagsBox_eye', !model.get('tagsBox_eye'));
      };
      this.el.appendChild(elTagsEye);

      const elTagsTasks = document.createElement('button');
      elTagsTasks.id = 'tagsEye';
      elTagsTasks.className=`btnp primary ${model.get('tagsBox_task') ? ' active' : ''}`;
      elTagsTasks.innerHTML = '<i class="fa fa-fw fa-exclamation fa-solid"></i>';
      elTagsTasks.onclick = (ev) => {
        ev.preventDefault();
        elTagsTasks.classList.toggle('active');
        model.set('tagsBox_task', !model.get('tagsBox_task'));
      };
      this.el.appendChild(elTagsTasks);
      return this.el;
    }
  },
  TagsBoxList: {
    render() {
      console.log('[fn] TagsBoxList.render()');
      this.el = eid('TagsBoxList');
      this.el.innerHTML = '';

      const sectionsDiv = {
        'Tags': { el: document.createElement('div'), filter: ['Projects', 'Events', 'Generic']},
        'Persons': { el: document.createElement('div'), filter: ['Persons']}
      };
      const modelTagsBoxEye = model.get('tagsBox_eye');
      const modelTagsBoxTask = model.get('tagsBox_task');
      const tags = model.get('tags');
      const tasks = model.get('tasks');

      Object.entries(sectionsDiv).forEach(([secName, {el, filter}]) => {
        el.className = 'tagSection';
        let title = document.createElement('div');
        title.className = 'sectionTitle';
        title.textContent = secName + ': ';
        el.appendChild(title);
        let tagTree = businessLogic.buildTagTree(tags.filter( tag => filter.includes(tag.category)), tasks);
        el.appendChild(this.createTreeWrap(tagTree, modelTagsBoxEye, modelTagsBoxTask, 1));
        this.el.appendChild(el);
      });
      return this.el;
    },
    buildTagTree(flatTags, tasks) {
      const tree = [];
      const childrenOf = {};
      flatTags.forEach(tag => {
        childrenOf[tag.name] = { ...tag, tasks: [], children: [] };
        if (!tag.parent || tag.parent === '') {
          tree.push(childrenOf[tag.name]);
        }
        tasks.forEach(task => {
          if (task.firstTag == tag.name) {
            childrenOf[tag.name].tasks.push(task);
          }
        })
      });
      flatTags.forEach(tag => {
        if (tag.parent && childrenOf[tag.parent]) {
          childrenOf[tag.parent].children.push(childrenOf[tag.name]);
        }
      });
      return tree;
    },
    createTaskElement(task, tagsTaskActive) {
      const li = document.createElement('li');
      if(!tagsTaskActive) {
        li.style.display = "none";
      }
      li.style.listStyle = 'none'; // Rimuove il proiettile dell'elemento di lista
      li.className = 'tagList-task task-'+task.task;
      
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';

      // Nome del tag e funzionalità di click
      const span = document.createElement('span');
      span.textContent = task.text.replace(task.firstTag, '●');
      span.className = 'tag-task-text';
      span.title = task.text;
      span.style.flex = '1';
      header.appendChild(span);
      li.appendChild(header);
      return li;
    },
    createTreeWrap(tagTree, tagsEyeActive, tagsTaskActive, depth) {
      let ul = document.createElement('ul');
      ul.className = 'tagList-tree';
      tagTree.forEach(tag => {
        ul.appendChild(this.createTreeElement(tag, tagsEyeActive, tagsTaskActive, depth));
      });
      return ul;
    },
    noDiscendentTask(tag) {
      if (tag.tasks.length != 0)
        return true;
      return tag.children.some(child => this.noDiscendentTask(child));
    },
    createTreeElement(tag, tagsEyeActive, tagsTaskActive, depth) {
      const li = document.createElement('li');
      li.style.listStyle = 'none'; // Rimuove il proiettile dell'elemento di lista
      if(!tagsEyeActive && !tag.treed && !this.noDiscendentTask(tag)) {
        li.style.display = "none";
      }
      li.className=`expanded tree-depth-${depth}`;
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.padding = "2px 4px";
      header.style.background = "#fff";
      header.style.borderWidth = "2px";
      header.style.borderStyle = "solid";
      header.className = {'Projects': 'color-border-green-5', 'Events': 'color-border-blue-5', 'Generic': 'color-border-purple-5', 'Persons': 'color-border-orange-5'}[tag.category];
      header.style.borderRadius = "2px";
      const hasChildren = tag.children && tag.children.length > 0;
      // Toggle button per espandere/contrarre
      const toggleBtn = document.createElement('i');
      toggleBtn.className = hasChildren ? 'fa-fw fa-regular fa-square-caret-down color-blue-5' : 'fa-fw fa-regular fa-square color-blue-5';
      toggleBtn.style.cursor = hasChildren ? 'pointer' : 'default';
      toggleBtn.style.marginRight = '5px';
      toggleBtn.onclick = () => {
        if (hasChildren) {
          li.classList.toggle('expanded');
          if (li.classList.contains('expanded')) {
            toggleBtn.classList.remove('fa-square-caret-right');
            toggleBtn.classList.add('fa-square-caret-down');
          }
          else {
            toggleBtn.classList.remove('fa-square-caret-down');
            toggleBtn.classList.add('fa-square-caret-right');
          }
        }
      };
      header.appendChild(toggleBtn);

      // Nome del tag e funzionalità di click
      const span = document.createElement('span');
      span.textContent = tag.name;
      span.style.flex = '1';
      span.style.cursor = 'pointer';
      span.style.fontWeight = '600';
      span.className = {'Projects': 'color-green-5', 'Events': 'color-blue-5', 'Generic': 'color-purple-5', 'Persons': 'color-orange-5'}[tag.category];
      span.onclick = async () => await page.home.addTagview(tag.name);
      header.appendChild(span);

      // Bottoni aggiuntivi (occhio e matita)
      // Eye button for visibility toggle
      const eyeBtn = document.createElement('i');
      eyeBtn.className = tag.treed ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
      eyeBtn.title = tag.treed ? 'Visible in tree' : 'Hidden from tree';
      eyeBtn.style.color = tag.treed ? '#2e7d32' : '#c62828';
      eyeBtn.style.marginLeft = '8px';
      eyeBtn.style.cursor = 'pointer';
      eyeBtn.onclick = async (ev) => {
        ev.stopPropagation();
        const updated = await api.api(`/api/tags/${tag.category}/${tag.name.substring(1)}`, {
          method: "PATCH",
          body: {
            treed: !tag.treed,
            parent: tag.parent || '',
            content: tag.content || ''
          }
        });
        model.set('tags', (tags) => { 
          const index = tags.findIndex(item => item['name'] === updated['name']);
          if (index !== -1) tags[index] = updated;
          return tags;
        });
      };
      header.appendChild(eyeBtn);

      // Tree edit button
      const treeEdit = document.createElement('i');
      treeEdit.className = 'fa-solid fa-pencil';
      treeEdit.style.color = '#666';
      treeEdit.style.marginLeft = '8px';
      treeEdit.style.cursor = 'pointer';
      treeEdit.title = `Tree "${tag.name}"`;
      treeEdit.onclick = async (ev) => {
        ev.stopPropagation();
        modal.editTreeTagModal.render(tag.name);
      };
      header.appendChild(treeEdit);

      // Properties button
      const propsBtn = document.createElement('i');
      propsBtn.className = 'fa-solid fa-gear';
      propsBtn.style.color = '#666';
      propsBtn.style.marginLeft = '8px';
      propsBtn.style.cursor = 'pointer';
      propsBtn.title = `Properties for "${tag.name}"`;
      propsBtn.onclick = async (ev) => {
        ev.stopPropagation();
        modal.editTagPropertiesModal.render(tag.name);
      };
      header.appendChild(propsBtn);

      // Show properties indicator if tag has properties
      const propsIndicator = document.createElement('span');
      propsIndicator.className = 'tag-properties-indicator';
      propsIndicator.style.color = '#666';
      propsIndicator.style.marginLeft = '4px';
      propsIndicator.style.cursor = 'pointer';
      propsIndicator.title = 'Tag has properties';
      propsIndicator.textContent = '•';
      // Only show indicator if tag has properties
      if (tag.property_count && tag.property_count > 0) {
        propsIndicator.style.display = 'inline';
      } else {
        propsIndicator.style.display = 'none';
      }
      propsIndicator.onclick = ev => {
        ev.stopPropagation();
        modal.editTagPropertiesModal.render(tag.name);
      };
      header.appendChild(propsIndicator);

      li.appendChild(header);
      tag.tasks.forEach(task => {
        li.appendChild(this.createTaskElement(task, tagsTaskActive, depth+1));
      })
      // Crea la lista dei figli (se esistono)
      if (hasChildren) {
        li.appendChild(this.createTreeWrap(tag.children, tagsEyeActive, tagsTaskActive, depth+1));
      }
      return li;
    }

  },
  ActionRequiredBox: {
    async render() {
      console.log('[fn] ActionRequiredBox.render()');
      this.el = eid('ActionRequiredBox');
      this.el.innerHTML = '';
      
      // Title
      const header = document.createElement('div');
      header.className = 'action-required-header';
      const title = document.createElement('h3');
      title.textContent = 'Action Required';
      title.style.color = '#856404';
      
      // Count badge
      const countBadge = document.createElement('span');
      countBadge.className = 'badge bg-warning text-dark';
      const actionItems = businessLogic.getActionRequiredItems();
      countBadge.textContent = String(actionItems.length);
      countBadge.style.fontSize = '0.8em';
      header.append(title, countBadge);
      this.el.appendChild(header);

      actionItems.forEach(tag => {
        const item = document.createElement('button');
        item.type = 'button';
        const category = helper.getClassfromTag(tag);
        const categoryClass = {
          Projects: 'project',
          Persons: 'person',
          Events: 'event',
          Generic: 'generic'
        }[category] || 'other';
        item.className = `action-required-tag action-required-tag-${categoryClass}`;
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
      this.el = eid('JournalBox');
      this.el.innerHTML = '';
      
      /* Date variables */
      this.calendarYear = this.calendarYear || new Date().getFullYear();
      this.calendarMonth = (this.calendarMonth !== undefined) ? this.calendarMonth : new Date().getMonth();

      // Header with month navigation
      const elJournalHeader = document.createElement('div');
      elJournalHeader.className = 'calendar-header mini-calendar-header';

      const elJournalPrevBtn = document.createElement('button');
      elJournalPrevBtn.className = 'calendar-nav-btn';
      elJournalPrevBtn.textContent = '‹';
      elJournalPrevBtn.onclick = () => {
        this.calendarMonth--;
        if (this.calendarMonth < 0) {
          this.calendarMonth = 11;
          this.calendarYear--;
        }
        this.render();
      };
      const numNotesOfMonth = await api.api(`/api/notes/${this.calendarYear}/${String(this.calendarMonth + 1).padStart(2, '0')}/count`);
      console.debug('numNotesOfMonth', numNotesOfMonth);
      const numNotesOfMonthMax = Math.max(...Object.values(numNotesOfMonth));
      
      const elJournalNextBtn = document.createElement('button');
      elJournalNextBtn.className = 'calendar-nav-btn';
      elJournalNextBtn.textContent = '›';
      elJournalNextBtn.onclick = () => {
        this.calendarMonth++;
        if (this.calendarMonth > 11) {
          this.calendarMonth = 0;
          this.calendarYear++;
        }
        this.render();
      };

      const elJournalMonthLabel = document.createElement('span');
      elJournalMonthLabel.className = 'calendar-month-label';
      elJournalMonthLabel.textContent = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}`;

      elJournalHeader.appendChild(elJournalPrevBtn);
      elJournalHeader.appendChild(elJournalMonthLabel);
      elJournalHeader.appendChild(elJournalNextBtn);
      this.el.appendChild(elJournalHeader);

      // Calendar grid
      const elJournalTable = document.createElement('table');
      elJournalTable.className = 'calendar-table mini-calendar';

      // Weekday headers
      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const elJournalThead = document.createElement('thead');
      const elJournalTrHead = document.createElement('tr');
      for(const day of weekdays) {
        const elJournalTrHeadTh = document.createElement('th');
        elJournalTrHeadTh.textContent = day;
        elJournalTrHead.appendChild(elJournalTrHeadTh);
      }
      elJournalThead.appendChild(elJournalTrHead);
      elJournalTable.appendChild(elJournalThead);

      // Days
      let firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      firstDay = (firstDay === 0) ? 6 : firstDay - 1;
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();

      // gather tasks from model (already loaded by page)
      const tasks = model.get('tasks') || [];

      const elJournalTbody = document.createElement('tbody');
      let elJournalTrBody = document.createElement('tr');
      let dayCount = 0;

      // Fill empty cells before first day
      for (let i = 0; i < firstDay; i++) {
        const elJournalTdBody = document.createElement('td');
        elJournalTdBody.textContent = '';
        elJournalTrBody.appendChild(elJournalTdBody);
        dayCount++;
      }

      // Fill days
      for (let d = 1; d <= daysInMonth; d++) {
        if (dayCount % 7 === 0 && dayCount !== 0) {
          elJournalTbody.appendChild(elJournalTrBody);
          elJournalTrBody = document.createElement('tr');
        }
        const elJournalTdBody = document.createElement('td');
        elJournalTdBody.className = 'calendar-cell';
        const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const intensity = numNotesOfMonthMax > 0 ? Math.min(8, Math.ceil((numNotesOfMonth[dateStr] || 0) / (numNotesOfMonthMax / 8))) : 0;
        console.debug(`Date ${dateStr} has ${numNotesOfMonth[dateStr] || 0} notes, intensity ${intensity}`);
        elJournalTdBody.classList.add(`intensity-${intensity}`);
        elJournalTdBody.style.position = 'relative';

        // Day number element
        const dayNumEl = document.createElement('div');
        dayNumEl.className = 'mini-calendar-day-number';
        dayNumEl.textContent = d;
        elJournalTdBody.appendChild(dayNumEl);

        // Mark weekends (Saturday: 5, Sunday: 6)
        const weekdayIndex = (dayCount % 7);
        if (weekdayIndex === 5 || weekdayIndex === 6) {
          elJournalTdBody.classList.add('calendar-weekend');
        }

        // Highlight today
        const today = new Date();
        const isToday =
          this.calendarYear === today.getFullYear() &&
          this.calendarMonth === today.getMonth() &&
          d === today.getDate();
        if (isToday) {
          elJournalTdBody.classList.add('calendar-today');
        }

        // Red dot if there are tasks on that day
        const tasksForDay = tasks.filter(t => t.duedate === dateStr);
        if (tasksForDay.length > 0) {
          const dot = document.createElement('div');
          dot.className = 'journal-task-dot';
          dot.title = `${tasksForDay.length} task(s)`;
          elJournalTdBody.appendChild(dot);
        }

        elJournalTdBody.onclick = async () => {
          await page.home.addTagview(dateStr);
        };
        elJournalTrBody.appendChild(elJournalTdBody);
        dayCount++;
      }

      // Fill remaining cells
      while (dayCount % 7 !== 0) {
        const elJournalTdBody = document.createElement('td');
        elJournalTdBody.textContent = '';
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
      this.el = eid('CalendarMain');
      this.el.innerHTML = '';
      this.el.style.flex = '1';

      this.el_tb = this.el.appendChild(view.createEl('div', {id: 'TopBar'}));
      view.TopBar.render();
      
      this.el_cw = this.el.appendChild(view.createEl('div', {id: 'CalendarWrap'}));

      // initialize current view month/year if not present
      this.calendarYear = this.calendarYear || new Date().getFullYear();
      this.calendarMonth = (this.calendarMonth !== undefined) ? this.calendarMonth : new Date().getMonth();

      // Header
      const header = document.createElement('div');
      header.className = 'calendar-header';
      const prevBtn = document.createElement('button'); prevBtn.className = 'calendar-nav-btn'; prevBtn.textContent = '‹';
      prevBtn.onclick = () => { this.calendarMonth--; if(this.calendarMonth < 0){ this.calendarMonth = 11; this.calendarYear--; } this.render(); };
      const nextBtn = document.createElement('button'); nextBtn.className = 'calendar-nav-btn'; nextBtn.textContent = '›';
      nextBtn.onclick = () => { this.calendarMonth++; if(this.calendarMonth > 11){ this.calendarMonth = 0; this.calendarYear++; } this.render(); };
      const monthLabel = document.createElement('span'); monthLabel.className = 'calendar-month-label';
      monthLabel.textContent = `${this.calendarYear}-${String(this.calendarMonth+1).padStart(2,'0')}`;
      header.appendChild(prevBtn); header.appendChild(monthLabel); header.appendChild(nextBtn);
      this.el_cw.appendChild(header);

      // gather tasks
      const tasks = model.get('tasks') || [];

      // compute month boundaries
      const monthStart = new Date(this.calendarYear, this.calendarMonth, 1);
      const monthEnd = new Date(this.calendarYear, this.calendarMonth + 1, 0);

      // partition tasks:
      //  - aboveTasks: duedate === null/undefined OR duedate < monthStart
      //  - belowTasks: duedate > monthEnd
      //  - in-month tasks will be shown inside calendar cells as before
      const aboveTasks = [];
      const belowTasks = [];
      tasks.forEach(t => {
        if (!t || !t.duedate) {
          aboveTasks.push(t);
          return;
        }
        // robust parse YYYY-MM-DD -> local date
        const parts = String(t.duedate).split('-').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) {
          // treat unparseable as unscheduled/previous
          aboveTasks.push(t);
          return;
        }
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        if (dt < monthStart) aboveTasks.push(t);
        else if (dt > monthEnd) belowTasks.push(t);
      });

      // helper to build list block (used for above and below)
      const buildListBlock = (title, list) => {
        const wrap = document.createElement('div');
        wrap.className = 'calendar-extras';
        const h = document.createElement('div');
        h.style.fontWeight = '700';
        h.style.margin = '6px 0';
        h.textContent = `${title} (${list.length})`;
        wrap.appendChild(h);
        if (list.length === 0) {
          const empty = document.createElement('div');
          empty.style.color = '#888';
          empty.style.fontSize = '0.9em';
          empty.textContent = '(none)';
          wrap.appendChild(empty);
          return wrap;
        }
        const listWrap = document.createElement('div');
        listWrap.style.display = 'flex';
        listWrap.style.flexDirection = 'column';
        list.forEach(n => {
          let taskClass = ''
          if(n.task != null && n.task != '') { taskClass = 'task-'+n.task }
          const elNoteItem = view.createEl('div', {
            className: `noteItem ${taskClass}`,
            dataset: {id: n.id}
          })
          const elNoteDate = elNoteItem.appendChild(view.createEl('div', {
            className: 'noteDate flex-col',
            innerHTML: new Date(n.date).toLocaleString('default', { month: 'short' }) + '-' + n.date.substring(8,10) + 
                    (n.duedate ? '<br><span class="color-purple-4">' + new Date(n.duedate).toLocaleString('default', { month: 'short' }) + '-' + n.duedate.substring(8,10) + '</span>' : ''  )
          }));
          const elNoteDays = elNoteItem.appendChild(view.createEl('div', {
            className: 'noteDays flex-col',
            innerHTML: helper.diffToToday(new Date(n.date)) + 
                    (n.duedate ? '<br><span class="color-purple-4">' + helper.diffToToday(new Date(n.duedate)) + '</span>': '' )
          }));
          const elNoteText = elNoteItem
            .appendChild(view.createEl('div', {style: {flex: '1', display: 'flex', flexDirection: 'column', paddingLeft: '5px'}}))
            .appendChild(view.Main.genNoteText(n, ''))


          // const tEl = document.createElement('div');
          // tEl.className = `tagList-task task-${t.task || 'low'}`;
          // tEl.style.padding = '6px';
          // tEl.style.borderRadius = '6px';
          // tEl.title = `${t.text}${t.duedate ? ' — ' + t.duedate : ''}`;
          // tEl.textContent = `${t.duedate} - ${(t.text.length > 120) ? t.text.slice(0,120) + '…' : t.text}`;
          listWrap.appendChild(elNoteItem);
        });
        wrap.appendChild(listWrap);
        return wrap;
      };

      // ABOVE: unscheduled / earlier than current month
      this.el_cw.appendChild(buildListBlock('Unscheduled / earlier than this month', aboveTasks));

      // build calendar table (in-month tasks will be injected into cells)
      const table = document.createElement('table'); table.className = 'calendar-table';
      const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const thead = document.createElement('thead'); const trHead = document.createElement('tr');
      weekdays.forEach(w => { const th = document.createElement('th'); th.textContent = w; trHead.appendChild(th); });
      thead.appendChild(trHead); table.appendChild(thead);

      // compute month layout
      let firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      firstDay = (firstDay === 0) ? 6 : firstDay - 1; // convert Sun(0)/Mon(1).. to Mon(0)..Sun(6)
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth+1, 0).getDate();
      const tbody = document.createElement('tbody');
      let tr = document.createElement('tr');
      let dayCount = 0;

      // empty cells
      for(let i=0;i<firstDay;i++){ const td = document.createElement('td'); td.className="calendar-cell-empty"; td.textContent = ''; tr.appendChild(td); dayCount++; }

      for(let d=1; d<=daysInMonth; d++){
        if (dayCount % 7 === 0 && dayCount !== 0) { tbody.appendChild(tr); tr = document.createElement('tr'); }
        const td = document.createElement('td'); td.className = 'calendar-cell';
        // mark weekend
        const weekdayIndex = (dayCount % 7);
        if (weekdayIndex === 5 || weekdayIndex === 6) td.classList.add('calendar-weekend');
        // highlight today
        const today = new Date();
        if (this.calendarYear === today.getFullYear() && this.calendarMonth === today.getMonth() && d === today.getDate()) td.classList.add('calendar-today');

        // Day number
        const dayNum = document.createElement('div'); dayNum.style.fontWeight = '600'; dayNum.style.marginBottom = '6px'; dayNum.textContent = d;
        td.appendChild(dayNum);

        // Tasks list for the day
        const dateStr = `${this.calendarYear}-${String(this.calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const tasksForDay = tasks.filter(t => t.duedate === dateStr);
        if (tasksForDay.length > 0) {
          const tasksWrap = document.createElement('div');
          tasksWrap.style.display = 'flex';
          tasksWrap.style.flexDirection = 'column';
          tasksWrap.style.gap = '4px';
          tasksForDay.forEach(t => {
            const tEl = document.createElement('div');
            tEl.className = `tagList-task task-${t.task || 'low'}`;
            tEl.style.padding = '4px';
            tEl.style.borderRadius = '6px';
            tEl.title = t.text;
            tEl.textContent = t.duedate + " - "+ (t.text.length > 80) ? t.text.slice(0,80) + '…' : t.text;
            tasksWrap.appendChild(tEl);
          });
          td.appendChild(tasksWrap);
        }
        tr.appendChild(td);
        dayCount++;
      }

      // fill ending empty cells
      while(dayCount % 7 !== 0){ const td = document.createElement('td'); td.className="calendar-cell-empty"; td.textContent = ''; tr.appendChild(td); dayCount++; }
      tbody.appendChild(tr); table.appendChild(tbody);

      this.el_cw.appendChild(table);

      // BELOW: tasks after this month
      this.el_cw.appendChild(buildListBlock('Scheduled after this month', belowTasks));
    }
  },
  Explorer: {
    async render() {
      this.el = eid('app');
      this.el.replaceChildren();
      const shell = this.el.appendChild(view.createEl('div', {id: 'ExplorerApp'}));
      shell.appendChild(view.createEl('div', {id: 'TopBar'}));
      view.TopBar.render();

      const layout = shell.appendChild(view.createEl('div', {id: 'ExplorerLayout'}));
      const sidebar = layout.appendChild(view.createEl('aside', {id: 'ExplorerSidebar'}));
      const sidebarTitle = sidebar.appendChild(document.createElement('h2'));
      sidebarTitle.textContent = 'Tabelle';
      this.tableList = sidebar.appendChild(view.createEl('nav', {
        id: 'ExplorerTableList',
        'aria-label': 'Tabelle del database'
      }));

      const workspace = layout.appendChild(view.createEl('main', {id: 'ExplorerWorkspace'}));
      this.results = workspace.appendChild(view.createEl('section', {
        id: 'ExplorerResults',
        'aria-label': 'Risultati query'
      }));
      this.results.setAttribute('aria-live', 'polite');
      this.results.textContent = 'Seleziona una tabella o inserisci una query SQL.';

      const form = workspace.appendChild(view.createEl('form', {id: 'ExplorerQueryForm'}));
      const toolbar = form.appendChild(view.createEl('div', {className: 'explorer-query-toolbar'}));
      const queryLabel = toolbar.appendChild(document.createElement('label'));
      queryLabel.htmlFor = 'ExplorerQuery';
      queryLabel.textContent = 'Query SQL';
      const runButton = toolbar.appendChild(view.createEl('button', {
        type: 'submit',
        className: 'btn primary',
        innerHTML: '<i class="fa-solid fa-play" aria-hidden="true"></i> Esegui'
      }));
      this.queryInput = form.appendChild(view.createEl('textarea', {
        id: 'ExplorerQuery',
        name: 'query',
        rows: 4,
        spellcheck: false,
        placeholder: 'SELECT * FROM notes LIMIT 100;'
      }));
      this.queryInput.setAttribute('aria-label', 'Query SQL in sola lettura');
      this.queryStatus = form.appendChild(view.createEl('div', {
        id: 'ExplorerQueryStatus',
        role: 'status',
        'aria-live': 'polite'
      }));
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
      this.tableList.textContent = 'Caricamento…';
      try {
        const tables = await api.api('/api/explorer/tables');
        this.tableList.replaceChildren();
        if (!tables.length) {
          this.tableList.textContent = 'Nessuna tabella';
          return;
        }
        tables.forEach(tableName => {
          const tableButton = document.createElement('button');
          tableButton.type = 'button';
          tableButton.className = 'explorer-table-button';
          tableButton.textContent = tableName;
          tableButton.onclick = () => this.selectTable(tableName, tableButton);
          this.tableList.appendChild(tableButton);
        });
        await this.selectTable(tables[0], this.tableList.firstElementChild);
      } catch (error) {
        this.tableList.textContent = `Errore: ${error.message}`;
      }
    },
    async selectTable(tableName, tableButton) {
      this.tableList.querySelectorAll('.explorer-table-button').forEach(button => {
        button.classList.toggle('active', button === tableButton);
      });
      const quotedName = `"${tableName.replace(/"/g, '""')}"`;
      this.queryInput.value = `SELECT * FROM ${quotedName} LIMIT 200;`;
      await this.runQuery();
    },
    async runQuery(query = this.queryInput.value) {
      this.queryStatus.textContent = 'Esecuzione…';
      this.queryStatus.dataset.state = 'loading';
      try {
        const result = await api.api('/api/explorer/query', {
          method: 'POST',
          body: {query}
        });
        this.renderResults(result);
        const count = result.rows.length;
        this.queryStatus.textContent = result.truncated
          ? `Mostrate le prime ${count} righe.`
          : `${count} righe.`;
        this.queryStatus.dataset.state = 'success';
      } catch (error) {
        this.results.replaceChildren();
        const message = document.createElement('p');
        message.className = 'explorer-query-error';
        message.textContent = error.message;
        this.results.appendChild(message);
        this.queryStatus.textContent = 'Query non eseguita.';
        this.queryStatus.dataset.state = 'error';
      }
    },
    renderResults(result) {
      const table = document.createElement('table');
      table.className = 'explorer-result-table';
      const head = table.createTHead().insertRow();
      result.columns.forEach(column => {
        const cell = document.createElement('th');
        cell.textContent = column;
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
  },
};

// MODAL
const modal = {
  imageViewer: {
    el: null,
    onKeydown: null,
    open(src, alt = '') {
      this.close();
      this.el = document.createElement('div');
      this.el.className = 'image-lightbox';
      this.el.setAttribute('role', 'dialog');
      this.el.setAttribute('aria-modal', 'true');
      this.el.setAttribute('aria-label', 'Immagine a schermo intero');

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'image-lightbox-close';
      closeButton.setAttribute('aria-label', 'Chiudi immagine');
      closeButton.title = 'Chiudi';
      closeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      closeButton.addEventListener('click', () => this.close());

      const image = document.createElement('img');
      image.className = 'image-lightbox-image';
      image.src = src;
      image.alt = alt;

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
      if (this.onKeydown) document.removeEventListener('keydown', this.onKeydown);
      this.onKeydown = null;
    }
  },
  filterModal: {
    el: null,
    tokens: [],
    render() {
      if (this.el) {
        this.el.remove();
      }
      this.tokens = [];
      this.el = document.createElement('div');
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
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = `filter-rule-token ${token.kind === 'tag' ? 'filter-rule-tag' : 'filter-rule-operator'}`;
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
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'filter-tag-suggestion';
            option.setAttribute('role', 'option');
            option.innerHTML = `<span>${tag.name}</span><span class="tag-category">${tag.category}</span>`;
            option.onmousedown = ev => ev.preventDefault();
            option.onclick = () => addToken(tag.name, 'tag');
            suggestions.appendChild(option);
          });
      };

      search.addEventListener('input', renderSuggestions);
      search.addEventListener('keydown', ev => {
        if (ev.key === 'Backspace' && !search.value && this.tokens.length) {
          this.tokens.pop();
          renderTokens();
        } else if (ev.key === 'Enter' && suggestions.firstElementChild) {
          ev.preventDefault();
          suggestions.firstElementChild.click();
        } else if (ev.key === 'Tab' && suggestions.firstElementChild) {
          ev.preventDefault();
          suggestions.firstElementChild.click();
        } else if (['!', 'o', '(', ')'].includes(ev.key) && !search.value) {
          // Prevent default to avoid typing the character in the search box
          ev.preventDefault();
          addToken(ev.key, 'operator');
        }
      });

      const operators = dialog.querySelector('.filter-operators');
      [['!', 'not'], ['e', 'and'], ['o', 'or'], ['(', 'parentesi aperta'], [')', 'parentesi chiusa']]
        .forEach(([value, label]) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn standard';
          button.textContent = value;
          button.title = label;
          button.onclick = () => addToken(value, 'operator');
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
        const rule = this.tokens.map(token => token.value).join(' ');
        try {
          const notes = await api.api('/api/notes/filter', {
            method: 'POST',
            body: {rule}
          });
          dialog.remove();
          this.el = null;
          await page.home.addFilterview(rule, notes);
        } catch (err) {
          error.textContent = err.message;
        }
      };
      search.focus();
    }
  },
  editModal: {
    el: null,
    render(note, editCallback) {
      if (this.el) this.el.remove();
      this.el = document.createElement('div');
      this.el.className = 'modal';
      this.el.innerHTML = `
        <div class="modal-content">
          <h3>Edit Note</h3>
          <form id="editModal" class="myform" style="flex: 1">
            <textarea name="text" class="modal-textarea">${escapeHTML(note.text)}</textarea>
            <div>duedate: ${note.duedate} </div>
            <div>task: ${note.task} </div>
            <div class="modal-actions">
              <button type="submit" value="cancel" class="btn standard" id="edit-modal-cancel">Cancel</button>
              <button type="submit" value="save" class="btn primary" id="edit-modal-save">Save</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(this.el);

      const editModal =eid('editModal');
      editModal.onsubmit = async (ev) => {
        ev.preventDefault();
        const btn = ev.submitter; // the button element
        if (btn.value == "cancel") {
          this.el.remove();
          this.el = null;
        } else {
          // PATCH API
          const updated = await api.api(`/api/notes/${note.id}`, {
            method: "PATCH",
            body: Object.fromEntries(new FormData(ev.target).entries())
          });
          if(!updated || !updated.note.id || updated.status != 'patched') {
            alert('Error saving note');
            return;
          }
          editCallback?.(updated.note, note.tags, note.date);
          await model.tags.reload();
          await model.tasks.reload();
          view.TagsBoxList.render();
          this.el.remove();
          this.el = null;
        }
      }
       
    }
  },
  editTreeTagModal: {
    el: null,
    render(tag) {
      console.debug(`[fn] openEditTreeTagModal`, tag);
      const tagObj = model.get('tags').find( t => t.name === tag);
      console.debug(`[fn] openEditTreeTagModal`, tagObj);
      if (this.el) this.el.remove();
      this.el = document.createElement('div');
      this.el.className = 'modal';
      this.el.innerHTML = `
        <div class="modal-content">
          <h3>Edit Tag</h3>
          <form id="EditTagForm" class="myform" style="flex: 1">
            <label>
              <input type="radio" id="editform-treed" name="treed" value="true" ${tagObj.treed ? 'checked' : ''}>
              Visible
            </label>
            <label>
              <input type="radio" id="editform-treed" name="treed" value="false" ${!tagObj.treed ? 'checked' : ''}>
              Hidden
            </label>
            <div>
              <label for="rename">Rename Tag:</label>
              <input type="text" id="editform-rename" name="rename" value="${escapeHTML(tagObj.name)}" placeholder="Enter new name">
            </div>
            <div>
              <label for="parent">Parent Tag:</label>
              <input type="text" id="editform-parent" name="parent" value="${escapeHTML(tagObj.parent)}" placeholder="Enter parent tag">
              <div id="editform-parent-suggestions" class="filter-tag-suggestions" role="listbox" style="display: none;"></div>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column">
              <label for="content">Content:</label>
              <textarea style="flex:1" id="editform-content" name="content" class="modal-textarea">${escapeHTML(tagObj.content)}</textarea>
            </div>
            <div ></div>
            <div class="modal-actions">
              <button type="submit" value="cancel" class="btn standard" id="edit-tree-modal-cancel">Cancel</button>
              <button type="submit" value="save" class="btn primary" id="edit-tree-modal-save">Save</button>
            </div>
          </div>
        </form>
      `;
      document.body.appendChild(this.el);

      const parentInput = this.el.querySelector('#editform-parent');
      const parentSuggestions = this.el.querySelector('#editform-parent-suggestions');
      const availableParentTags = model.get('tags') || [];
      const selectParent = (parentTag) => {
        parentInput.value = parentTag.name;
        parentSuggestions.replaceChildren();
        parentSuggestions.style.display = 'none';
        parentInput.focus();
      };
      const renderParentSuggestions = () => {
        const query = parentInput.value.trim().toLocaleLowerCase();
        const matches = query
          ? availableParentTags
            .filter(candidate => candidate.name !== tagObj.name && candidate.name.toLocaleLowerCase().includes(query))
            .slice(0, 8)
          : [];
        parentSuggestions.replaceChildren();
        matches.forEach(candidate => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'filter-tag-suggestion';
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
        if (ev.key === 'Tab' && !ev.shiftKey && parentSuggestions.firstElementChild) {
          ev.preventDefault();
          parentSuggestions.firstElementChild.click();
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          EditTagForm.requestSubmit(eid('edit-tree-modal-save'));
        } else if (ev.key === 'Escape') {
          parentSuggestions.style.display = 'none';
        }
      });
      
      // Cancel button
      /*
      this.el.querySelector('#edit-tree-modal-cancel').onclick = () => {
        this.el.remove();
        this.el = null;
      };
      */
      // Save button

      const EditTagForm = eid('EditTagForm');
      EditTagForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const btn = ev.submitter; // the button element
        if (btn.value == "cancel") {
          this.el.remove();
          this.el = null;
        } else {
          const formData = new FormData(ev.target);
          const updated = await api.api(`/api/tags/${tagObj.category}/${tag.substring(1)}`, {
            method: "PATCH",
            body: Object.fromEntries(formData.entries())
          });
          // Update local tag
          model.set('tags', (tags) => {
            const index = tags.findIndex(item => item['name'] === updated['name']);
            if (index !== -1) tags[index] = updated;
            return tags;
          })

          if (updated.parent) businessLogic.completeActionRequiredTag(tagObj.name);
          await view.ActionRequiredBox.render();

          this.el.remove();
          this.el = null;
        }
      }
    }
  },
  editTagPropertiesModal: {
    el: null,
    async render(tag) {
      const tagObj = (model.get('tags') || []).find(item => item.name === tag);
      if (!tagObj) return;
      if (this.el) this.el.remove();
      const el = this.el = document.createElement('div');
      el.className = 'modal';
      el.innerHTML = `
        <div class="modal-content">
          <h3>Proprietà di ${escapeHTML(tag)}</h3>
          <p role="status">Caricamento proprietà…</p>
          <form class="myform" hidden>
            <div class="tag-properties-list" style="overflow:auto"></div>
            <button type="button" data-add class="btn standard">Aggiungi proprietà</button>
            <div class="modal-actions">
              <button type="button" data-close class="btn standard">Chiudi</button>
              <button type="submit" class="btn primary">Salva</button>
            </div>
          </form>
          <button type="button" data-dismiss class="btn standard">Chiudi</button>
        </div>`;
      document.body.appendChild(el);
      const close = () => { el.remove(); if (this.el === el) this.el = null; };
      el.querySelector('[data-dismiss]').onclick = close;
      el.querySelector('[data-close]').onclick = close;
      const status = el.querySelector('[role="status"]');
      const form = el.querySelector('form');
      form.style.display = 'none';
      const list = el.querySelector('.tag-properties-list');
      const url = `/api/tags/${encodeURIComponent(tagObj.category)}/${encodeURIComponent(helper.getAnonymizedTag(tag))}/properties`;
      const addRow = (property = {key: '', value: ''}) => {
        const row = document.createElement('div');
        row.className = 'property-item';
        row.innerHTML = `<label>Chiave <input data-key required></label>
          <label>Valore <textarea data-value class="modal-textarea"></textarea></label>
          <button type="button" class="btn standard">Rimuovi</button>`;
        row.querySelector('[data-key]').value = property.key;
        row.querySelector('[data-value]').value = property.value;
        row.querySelector('button').onclick = () => row.remove();
        list.appendChild(row);
      };
      el.querySelector('[data-add]').onclick = () => addRow();
      try {
        const response = await api.api(url);
        if (this.el !== el) return;
        response.properties.forEach(addRow);
        status.textContent = response.properties.length ? '' : 'Nessuna proprietà associata.';
        form.hidden = false;
        form.style.display = '';
        el.querySelector('[data-dismiss]').hidden = true;
      } catch (error) {
        status.textContent = `Impossibile caricare le proprietà: ${error.message}`;
        return;
      }
      form.onsubmit = async ev => {
        ev.preventDefault();
        const properties = Array.from(list.children, row => ({
          key: row.querySelector('[data-key]').value.trim(),
          value: row.querySelector('[data-value]').value
        }));
        if (properties.some(p => !p.key || /[\[\]\r\n]/.test(p.key)) ||
            new Set(properties.map(p => p.key)).size !== properties.length) {
          status.textContent = 'Usa chiavi non vuote, uniche e senza parentesi quadre.';
          return;
        }
        const controls = Array.from(form.querySelectorAll('button, input, textarea'));
        controls.forEach(control => control.disabled = true);
        let saved = false;
        try {
          await api.api(url, {method: 'PUT', body: {properties}});
          saved = true;
          await page.home.refreshMetadata();
          close();
        } catch (error) {
          status.textContent = saved ? `Proprietà salvate, aggiornamento fallito: ${error.message}`
            : `Salvataggio non riuscito: ${error.message}`;
        } finally {
          controls.forEach(control => control.disabled = false);
        }
      };
    }
  }
}

// ROUTER
async function router() {
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash === "/" || hash === "/home") {
    await page.home.load();
    page.home.render();
    window.dispatchEvent(new Event('journote-home-ready'));
  } else if (hash === "/calendar") {
    await page.calendar.load();
    page.calendar.render();
  } else if (hash === "/explorer") {
    await view.Explorer.render();
  } else {
    app.innerHTML = "<p>Not found</p>";
  }
}

// RUN
(async () => {
  window.addEventListener("hashchange", router);
  window.addEventListener('keydown', ev => {
    if (ev.altKey && !ev.ctrlKey && !ev.shiftKey && ev.key.toLowerCase() === 'f') {
      ev.preventDefault();
      modal.filterModal.render();
    }
  });
  await router();
}
)();
