// main js file (updated: added Calendar page)

const helper = {
  // HELPER
  getClassfromTag(tag) {
    if (tag.startsWith('#')) return 'Projects';
    if (tag.startsWith('@')) return 'Persons';
    if (tag.startsWith('>')) return 'Events';
    if (tag.startsWith('+')) return 'Generic';
    if (/^\d{4}-\d{2}-\d{2}$/.test(tag)) return 'Journal';
    return 'Fulltext';
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
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays;
  }
}

// API
const api = {
  async api(url, opts = {}){
    console.log('[fn] api ' + url)
    opts.headers = opts.headers || {};
    if (this.token()) {
      opts.headers["Authorization"] = "Bearer " + this.token();
    }
    if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    console.debug("[fn] api " + url + " executed", res.status);
    if (res.status === 401) {
      localStorage.removeItem("token");
      location.hash = "/";
      throw new Error("Unauthorized");
    }
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
  token() {
    return localStorage.getItem("token");
  },
  async checkToken() {
    if (!this.token()) return false;
    try {
      await this.api("/api/health");
      return true;
    } catch {
      return false;
    }
  },
  async signin(username, password) {
    const data = {
      username: username,
      password: password
    };
    try {
      const res = await this.api("/api/auth/signin", {method: "POST", body: data});
      console.log('[fn] api.signin response', res);
      localStorage.setItem("token", res.token);
      location.hash = "/home";
      return null;
    } catch (err) {
      return err.message;
    }
  }
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
    for (sub of this[el].subs) {
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

// PAGE
const page = {
  login: {
    async load() {
      const valid = await api.checkToken();
      if (valid) {
        location.hash = "/home";
        return;
      }
    },
    render() {
      this.el = document.getElementById('app');
      this.el.innerHTML = '';
      const LoginMain = this.el.appendChild(view.createEl('LoginMain', 'div', {}));
      LoginMain.innerHTML = `
        <div id="LoginWrap">
          <h1>Sign In</h1>
          <form id="loginForm" class="myform">
            <input name="username" placeholder="Username" required value=""/>
            <input name="password" type="password" placeholder="Password" required value=""/>
            <button type="submit" class="btn primary">Sign In</button>
            <div class="error" id="loginError"></div>
          </form>
        </div>`;
      const form = document.getElementById("loginForm");
      const errBox = document.getElementById("loginError");
      form.onsubmit = async (e) => {
        e.preventDefault();
        errBox.textContent = "";
        const error = await api.signin(form.username.value, form.password.value)
        if (error) errBox.textContent = error
      };
    }
  },
  
  home: {
    render() {
      this.el = document.getElementById('app');
      this.el.innerHTML = '';
      this.el.appendChild(view.createEl('LeftBar', 'aside', {}));
      this.el.appendChild(view.createEl('Main', 'div', {}));
      view.LeftBar.render();
      view.Main.render();

      const tagsVisible = model.get('tagsVisible');
      model.set('tagsVisible', []);
      (async () => {
        await this.addTagview(new Date().toISOString().slice(0, 10)); 
        for (const x of tagsVisible) { await this.addTagview(x) }
      })();
      tagsVisible.forEach(async (x) => await this.addTagview(x));
      document.addEventListener('keydown', (ev) => {
        if (ev.altKey && !ev.ctrlKey && !ev.shiftKey) {
          /* Alt + n --> focus on editor */
          if (ev.key.toLowerCase() === 'n') {
            ev.preventDefault();
            view.EditorWrap.easyMDE.codemirror.doc.cm.focus()
            view.EditorWrap.easyMDE.codemirror.doc.cm.setCursor(view.EditorWrap.easyMDE.codemirror.doc.cm.lineCount(), 0);
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
    },
    async load() {
      await model.tags.reload();
      await model.tasks.reload();
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
      tagsVisible = model.set('tagsVisible', (tags) => tags.filter(t => t !== tag) );
      console.log(tagsVisible)
      view.TopBar.removeTab(tag)
      view.Main.removeTab(tag)
      if (model.get('tagsActive') == tag) {
        page.home.activateTagview(tagsVisible[tagsVisible.length-1])
      }
    },
    async saveNote(raw, tdate) {
      if(!raw) return;
      const date = tdate || (new Date()).toISOString().slice(0,10);

      const response = await api.api("/api/notes", {
        method: 'POST',
        body: {
          text: raw,
          date
        }
      });
      if(!response || !response.note.id) {
        alert('Error saving note');
        return;
      }
      view.Main.pushNote(response.note);
    },
    async editNote(note) {
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
      view.Main.editedNote(response.note);
      view.EditorWrap.clear();
    }
  },

  calendar: {
    render() {
      this.el = document.getElementById('app');
      this.el.innerHTML = '';
      this.el.appendChild(view.createEl('LeftBar', 'aside', {}));
      this.el.appendChild(view.createEl('CalendarMain', 'div', {}));
      view.LeftBar.render();
      view.Calendar.render();
    },
    async load() {
      await model.tags.reload();
      await model.tasks.reload();
    }
  }
};
let aaa = null;
// VIEW
const view = {
  createEl(id, typ, options) {
    const e = document.createElement(typ);
    if(id != null) {
      e.id = id;
    }
    for (o in options) {
      if (typeof options[o] == 'object') {
        for (u in options[o]) {
          e[o][u] = options[o][u]
        }
      } else {
        e[o] = options[o];
      }
    }
    return e;
  },
  EditorWrap: {
    render() {
      this.currentNote = null;
      this.el = document.getElementById('EditorWrap');
      this.el.innerHTML = '';
      this.ed = this.el.appendChild(view.createEl('Editor', 'textarea', {placeholder: "new note...",className: "editor-area"}));
      const EditorCtrl = this.el.appendChild(view.createEl('EditorCtrl', 'div', {}));
      const EditorSaveBtn = EditorCtrl.appendChild(view.createEl('EditorSaveBtn', 'button', {className: 'btn primary', textContent: 'Save'}))
      const EditorUpdateBtn = EditorCtrl.appendChild(view.createEl('EditorUpdateBtn', 'button', {className: 'btn secondary', textContent: 'Update', style: 'display:none;'}))
      const EditorClearBtn = EditorCtrl.appendChild(view.createEl('EditorClearBtn', 'button', {className: 'btn info', textContent: 'Clear', style: 'display:none;'}))
      
      this.easyMDE = new EasyMDE({
        element: document.getElementById('Editor'),
        minHeight: '100px',
        spellChecker: false
      });
      aaa = this.easyMDE;

      let typingDebounce = null;
      this.easyMDE.codemirror.on("change", (ev) => {
        clearTimeout(typingDebounce);
        typingDebounce = setTimeout(() => {
          const txt = this.easyMDE.value();
          const foundTags = helper.extractTagsFromText(txt);
          foundTags.forEach(tag => page.home.addTagview(tag));
          const date = this.parseLeadingDate(txt);
          if (date) addTagview(date);
        }, 500);
      });
      
      this.easyMDE.codemirror.setOption("extraKeys", {
        ...this.easyMDE.codemirror.options.extraKeys, 
        ...{ 
          "Ctrl-Enter": async (cm) => {
            if (this.currentNote) {
              await this.editNote();
            } else {
              await this.saveNote();
            }
          }
        }
      });

      EditorSaveBtn.addEventListener('click', async (ev) => {
        await this.saveNote()
      });

      EditorClearBtn.addEventListener('click', (ev) => {
        this.clear();
      });

      EditorUpdateBtn.addEventListener('click', async (ev) => {
        this.editNote();
      });
    },
    clear() {
      this.easyMDE.value('');
      this.currentNote = null;
      const EditorSaveBtn = document.getElementById('EditorSaveBtn');
      const EditorUpdateBtn = document.getElementById('EditorUpdateBtn');
      const EditorClearBtn = document.getElementById('EditorClearBtn');
      EditorSaveBtn.style.display = 'block';
      EditorUpdateBtn.style.display = 'none';
      EditorClearBtn.style.display = 'none';
    },
    renderEditNote(note) {
      this.currentNote = note;
      this.easyMDE.value(note.text);
      this.ed.focus();
      const EditorSaveBtn = document.getElementById('EditorSaveBtn');
      const EditorUpdateBtn = document.getElementById('EditorUpdateBtn');
      const EditorClearBtn = document.getElementById('EditorClearBtn');
      EditorSaveBtn.style.display = 'none';
      EditorUpdateBtn.style.display = 'block';
      EditorClearBtn.style.display = 'block';
      console.log(this.easyMDE.codemirror)
      this.easyMDE.codemirror.doc.cm.focus()
      this.easyMDE.codemirror.doc.cm.setCursor(this.easyMDE.codemirror.doc.cm.lineCount(), 0);
    },
    async saveNote() {
      const raw = this.easyMDE.value();
      const date = this.parseLeadingDate(raw);
      await page.home.saveNote(raw, date);
      this.easyMDE.value('');
      rawWords = raw.split(/\s+/);
      const newRawWords = new Array();
      for (let w of rawWords) {
        if (w.startsWith('#') || w.startsWith('@') || w.startsWith('>') || w.startsWith('+')) {
          newRawWords.push(w);
        } else break;
      }
      for (let w of newRawWords) {
        this.ed.value += w + ' ';
      }
      this.ed.focus();
    },
    async editNote() {
      const raw = this.easyMDE.value();
      if(!raw) return;
      const date = this.parseLeadingDate(raw);
      this.currentNote.text = raw;
      this.currentNote.date = date || this.currentNote.date;
      await page.home.editNote(this.currentNote);
    },
    parseLeadingDate(text) {
      const m = text.trim().match(/^(\d{4}-\d{2}-\d{2})\b/);
      return m ? m[1] : null;
    }
  },
  TopBar: {
    render() {
      this.el = document.getElementById('TopBar');
      this.el.innerHTML = '';
      const navBtnsWrap = document.createElement('div');
      navBtnsWrap.className = "navBtnsWrap"
      this.el.appendChild(navBtnsWrap);
      // Hamburger button
      const hamburger = document.createElement('button');
      hamburger.id = 'HamburgerBtn';
      hamburger.className = 'navBtn btn standard';
      hamburger.innerHTML = '<i class="fa fa-2xs fa-fw fa-solid fa-bars"></i>';
      hamburger.style.top = '10px';
      hamburger.style.left = '10px';
      hamburger.style.zIndex = '1000';
      hamburger.style.fontSize = '20px';
      hamburger.onclick = () => {
        model.set('leftBarVisible', !model.get('leftBarVisible'));
      };
      navBtnsWrap.appendChild(hamburger);
      
      const home = document.createElement('button');
      home.id = 'HomeBtn';
      home.className = 'navBtn btn secondary';
      home.innerHTML = '<i class="fa fa-2xs fa-fw fa-solid fa-home"></i>';
      home.style.top = '10px';
      home.style.left = '10px';
      home.style.zIndex = '1000';
      home.style.fontSize = '20px';
      home.onclick = () => {
        location.hash = '/home'
      };
      navBtnsWrap.appendChild(home);
      
      const calendar = document.createElement('button');
      calendar.id = 'calendarBtn';
      calendar.className = 'navBtn btn secondary';
      calendar.innerHTML = '<i class="fa fa-2xs fa-fw fa-regular fa-calendar"></i>';
      calendar.style.top = '10px';
      calendar.style.left = '10px';
      calendar.style.zIndex = '1000';
      calendar.style.fontSize = '20px';
      calendar.onclick = () => {
        location.hash = '/calendar'
      };
      navBtnsWrap.appendChild(calendar);
      
      this.tc = this.el.appendChild(view.createEl('TopBarContainer', 'div', {className: 'scrollable-x'}));
    },
    addTab(tag, notes) {
      // Pill
      const elPill = document.createElement('div');
      elPill.className = 'tabPill';
      elPill.dataset.key = tag;
      elPill.title = `${tag}`;
      elPill.onclick = () => page.home.activateTagview(tag);
      this.tc.appendChild(elPill);
      
      // Pill label
      const elPillLabel = document.createElement('span');
      elPillLabel.textContent = tag;
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
      this.el = document.getElementById('Main');
      this.el.innerHTML = '';
      this.el_tb = this.el.appendChild(view.createEl('TopBar', 'div', {}));
      this.el_cw = this.el.appendChild(view.createEl('ColumnsWrap', 'div', {className: 'columns scrollable-x'}));
      this.el_ew = this.el.appendChild(view.createEl('EditorWrap', 'div', {}));
      view.TopBar.render();
      view.EditorWrap.render();
    },
    addTab(tag, notes) {
      // Column
      const tagObj = model.get('tags').find(t => t.name === tag);
      const elColumn = this.el_cw.appendChild(document.createElement('div'));
      elColumn.className = 'column';
      elColumn.dataset.key = tag;
      elColumn.style.position = 'relative';   // needed for resizer positioning
      elColumn.style.flex = '0 0 700px';      // default width

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
      header.textContent = tag;

      const subheader = elColCont.appendChild(document.createElement('div'));
      subheader.className = 'columnSubHeader';

      if (tagObj == undefined) {
        const tagType = helper.getClassfromTag(tag);
        if (tagType == 'Journal') {
          subheader.textContent = (new Date(tag)).toLocaleDateString('it-IT', { weekday: 'long', year: "numeric", month: "long", day: "numeric" });
        } else if (tagType == 'FullText') {
          subheader.textContent = '';
        } else {
          console.error('cant find tagType');
        }
      } else {
        subheader.textContent = tagObj.content;
      }
      subheader.style.display = 'none';

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
        elNoteList.textContent = '';
      } else {
        elNoteList.textContent = '';
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
      // Ensure tagviews exist
      for (let tag of note.tags) {
        if (!model.get('tagsVisible').includes(tag)) {
          page.home.addTagview(tag);
        } else {
          const noteList = document.querySelector(`.column[data-key="${tag}"] .notesList`);
          if (noteList) {
            const elNotePushed = noteList.appendChild(this.genNoteItem(note, tag));
            elNotePushed.scrollIntoView({behavior:'smooth', inline:'start'});
          }
        }
      }
      if (!model.get('tagsVisible').includes(note.date)) {
        page.home.addTagview(note.date);
      } else {
        const noteList = document.querySelector(`.column[data-key="${note.date}"] .notesList`);
        if (noteList) {
          const elNotePushed = noteList.appendChild(this.genNoteItem(note, note.date));
          elNotePushed.scrollIntoView({behavior:'smooth', inline:'start'});
        }
      }

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

      const elNoteItem = view.createEl(null, 'div', {
        className: `noteItem ${taskClass}`,
        dataset: {id: n.id}
      })
      
      const elNoteDate = elNoteItem.appendChild(view.createEl(null, 'div', {
        className: 'noteDate flex-col',
        innerHTML: new Date(n.date).toLocaleString('default', { month: 'short' }) + '<br>' + n.date.substring(8,10)
      }));

      const elNoteDiff = elNoteItem.appendChild(view.createEl(null, 'div', {
        textContent: helper.diffToToday(new Date(n.date)),
        style: "padding-right: 10px; min-width: 25px; text-align: center; padding-right: 5px; padding-left: 5px; border-right: 1px dashed grey;min-width: 40px;"
      }));

      if(n.duedate) {
        const elNoteDuedate = document.createElement('span');
        elNoteDuedate.className = 'duedate'
        const diff = helper.diffToToday(new Date(n.duedate));
        elNoteDuedate.innerHTML = `${n.duedate}<br>${diff}`;
        elNoteItem.appendChild(elNoteDuedate);
      }

      // Note Text
      const elNoteText = elNoteItem
        .appendChild(view.createEl(null, 'div', {style: {flex: '1', display: 'flex', flexDirection: 'column', paddingLeft: '5px'}}))
        .appendChild(this.genNoteText(n, currentTag))

      // ButtonWrap
      const elNoteBtnWrap = elNoteItem.appendChild(view.createEl(null, 'div', {
        style: "display:flex; flex-direction: column; gap: 2px; flex: 0; padding-left: 5px;"
      }));

      // Edit button
      elNoteBtnWrap.appendChild(view.createEl(null, 'button', {
        className: 'btn primary small transparent',
        innerHTML: '<i class="fa fa-pencil fa-solid fa-fw fa-2xs"></i>',
        title: 'Edit note',
        onclick: (ev) => {
          ev.stopPropagation();
          view.EditorWrap.renderEditNote(n);
        }
      }));
      
      // Delete button
      const elNoteDelBtn = elNoteBtnWrap.appendChild(view.createEl(null, 'button', {
        className: 'btn error small transparent',
        innerHTML: '<i class="fa fa-x fa-solid fa-fw fa-2xs"></i>',
        title: 'Delete note',
        onclick: async (ev) => {
          ev.stopPropagation();
          if (!confirm('Delete this note?')) return;
          const ok = await api.api(`/api/notes/${n.id}`, {method: "DELETE"});
          if (ok && ok.status === 'deleted') {
            console.log('Note deleted');
            elNoteItem.remove();
            await model.tags.reload();
          }
        }
      }));

      return elNoteItem
    },
    genNoteText(n, currentTag) {
      const elNoteText = document.createElement('div');
      elNoteText.className = 'noteText';
      let noteText = n.text;
      let noteTags = helper.extractTagsFromText(n.text, false);
      if (noteTags && noteTags.length) {
        noteTags.forEach(foundTag => {
          let foundTagText = foundTag;
          const lbl_class = helper.getClassfromTag(foundTag);
          if(foundTag == currentTag) foundTagText = '●'
          let labelHtml = `<span
            class="lbl lbl-${lbl_class}"
            onclick="page.home.addTagview('${foundTag}')"
            data-tag="${foundTag}">${foundTagText}</span>`;
          // Replace tag in text with label
          noteText = noteText.replace(new RegExp(foundTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), labelHtml);
        });
      }
      var conv = new showdown.Converter({metadata: true});
      noteText = conv.makeHtml(noteText);
      var metadata = conv.getMetadata(); // returns an object with
      elNoteText.innerHTML = noteText;
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
    editedNote(note) {
      console.log('[fn] editedNote', note);
      // Update all tagviews containing this note
      for (let tag of note.tags) {
        if (model.get('tagsVisible').includes(tag)) {
          const noteList = document.querySelector(`.column[data-key="${tag}"] .notesList`);
          if (noteList) {
            const elNoteItemOld = noteList.querySelector(`.noteItem[data-id="${note.id}"]`);
            if (elNoteItemOld) {
              const newElNoteItem = this.genNoteItem(note, tag);
              elNoteItemOld.replaceWith(newElNoteItem);
            }
          }
        }
      }
      if (model.get('tagsVisible').includes(note.date)) {
        const noteList = document.querySelector(`.column[data-key="${note.date}"] .notesList`);
        if (noteList) {
          const elNoteItemOld = noteList.querySelector(`.noteItem[data-id="${note.id}"]`);
          if (elNoteItemOld) {
            const newElNoteItem = this.genNoteItem(note, note.date);
            elNoteItemOld.replaceWith(newElNoteItem);
          }
        }
      }
    }
  },
  LeftBar: {
    render() {
      this.el = document.getElementById('LeftBar');
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

      this.el.appendChild(view.createEl('JournalBox', 'div', {className: "box", style: "flex: 0"}));
      this.el.appendChild(view.createEl('TagsBox', 'div', {className: "box", style: "flex: 1"}));

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
      this.el = document.getElementById('TagsBox');
      this.el.innerHTML = '';
     
      this.el.appendChild(view.createEl('TagsBoxSubHeader', 'div', {
        style: "margin: 10px 0px;"
      }));
      
      this.el.appendChild(view.createEl('TagsBoxList', 'div', {
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
      this.el = document.getElementById('TagsBoxSubHeader');
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
      this.el = document.getElementById('TagsBoxList');
      this.el.innerHTML = '';

      const sectionsDiv = {
        'Tags': { el: document.createElement('div'), filter: ['Projects', 'Event', 'Generic']},
        'Persons': { el: document.createElement('div'), filter: ['Persons']}
      };
      modelTagsBoxEye = model.get('tagsBox_eye');
      modelTagsBoxTask= model.get('tagsBox_task');
      tags = model.get('tags');
      tasks = model.get('tasks');

      Object.entries(sectionsDiv).forEach(([secName, {el, filter}]) => {
        el.className = 'tagSection';
        let title = document.createElement('div');
        title.className = 'sectionTitle';
        title.textContent = secName + ': ';
        el.appendChild(title);
        let tagTree = this.buildTagTree(tags.filter( tag => filter.includes(tag.category)), tasks);
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
      anyDiscendentTask = false;
      tag.children.forEach(x => {
        anyDiscendentTask = anyDiscendentTask || this.noDiscendentTask(x);
      })
      return anyDiscendentTask;
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
  JournalBox: {
    render() {
      console.log('[fn] JournalBox.render()');
      this.el = document.getElementById('JournalBox');
      this.el.innerHTML = '';
      
      /* Date variables */
      this.calendarYear = this.calendarYear || new Date().getFullYear();
      this.calendarMonth = (this.calendarMonth !== undefined) ? this.calendarMonth : new Date().getMonth();

      // Header with month navigation
      const elJournalHeader = document.createElement('div');
      elJournalHeader.className = 'calendar-header';

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
      elJournalTable.className = 'calendar-table';

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
        elJournalTdBody.textContent = d;
        elJournalTdBody.className = 'calendar-cell';

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

        elJournalTdBody.onclick = async () => {
          const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

  // NEW: Calendar view used for the dedicated "calendar" page in the center area.
  Calendar: {
    render() {
      this.el = document.getElementById('CalendarMain');
      this.el.innerHTML = '';

      this.el_tb = this.el.appendChild(view.createEl('TopBar', 'div', {}));
      view.TopBar.render();
      
      this.el_cw = this.el.appendChild(view.createEl('CalendarWrap', 'div', {}));

      this.el.style.flex = '1';

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
        listWrap.style.gap = '6px';
        list.forEach(t => {
          const tEl = document.createElement('div');
          tEl.className = `tagList-task task-${t.task || 'low'}`;
          tEl.style.padding = '6px';
          tEl.style.borderRadius = '6px';
          tEl.title = `${t.text}${t.duedate ? ' — ' + t.duedate : ''}`;
          tEl.textContent = `${t.duedate} - ${(t.text.length > 120) ? t.text.slice(0,120) + '…' : t.text}`;
          listWrap.appendChild(tEl);
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
};

// MODAL
const modal = {
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
            <textarea name="text" class="modal-textarea">${note.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
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

      const editModal =document.getElementById('editModal');
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
          editCallback?.(updated.note);
          await model.tags.reload();
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
              <input type="text" id="editform-rename" name="rename" value="${tagObj.name}" placeholder="Enter new name">
            </div>
            <div>
              <label for="parent">Parent Tag:</label>
              <input type="text" id="editform-parent" name="parent" value="${tagObj.parent == null ? '' : tagObj.parent.replace(/"/g, '&quot;') || ''}" placeholder="Enter parent tag">
            </div>
            <div style="flex: 1; display: flex; flex-direction: column">
              <label for="content">Content:</label>
              <textarea style="flex:1" id="editform-content" name="content" class="modal-textarea">${tagObj.content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
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
      
      // Cancel button
      /*
      this.el.querySelector('#edit-tree-modal-cancel').onclick = () => {
        this.el.remove();
        this.el = null;
      };
      */
      // Save button

      EditTagForm = document.getElementById('EditTagForm');
      EditTagForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const btn = ev.submitter; // the button element
        if (btn.value == "cancel") {
          this.el.remove();
          this.el = null;
        } else {
          const updated = await api.api(`/api/tags/${tagObj.category}/${tag.substring(1)}`, {
            method: "PATCH",
            body: Object.fromEntries(new FormData(ev.target).entries())
          });
          // Update local tag
          tags[tag] = updated;
          model.set('tags', (tags) => {
            const index = tags.findIndex(item => item['name'] === updated['name']);
            if (index !== -1) tags[index] = updated;
            return tags;
          })

          this.el.remove();
          this.el = null;
        }
      }
    }
  }
}

// ROUTER
async function router() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const valid = await api.checkToken();
  console.log(`[fn] router: Token: ${valid}, location:${hash}`);
  if (!valid) { 
    if (hash != "/") {
      location.hash = "/";
    } else {
      await page.login.load()
      page.login.render()
    }
  }
  else if (valid) {
    if (hash === "/") {
      location.hash = "/home"
    } else if (hash === "/home") {
      await page.home.load()
      page.home.render()
    } else if (hash === "/calendar") {
      // new calendar route
      await page.calendar.load();
      page.calendar.render();
    } else {
      app.innerHTML = "<p>Not found</p>";
    }
  }
}

// RUN
(async () => {
  window.addEventListener("hashchange", router);
  await router();
}
)();
