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
    let tagRx = /([#@>\+])([A-Za-z0-9_\-]+)[ ,\.;:]/g;
    if (!trailing_space) {
      tagRx = /([#@>\+])([A-Za-z0-9_\-]+)/g;
    }
    let m;
    while((m = tagRx.exec(text)) !== null) {
      tagsfound.add(m[0].trim());
    }
    return Array.from(tagsfound);
  },
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

  tags: { _v: null, subs: [], async reload() {this._v = await api.api("/api/tags")} },
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
      const LoginMain = this.el.appendChild(view.createChild('LoginMain', 'div', {}));
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
      this.el.appendChild(view.createChild('LeftBar', 'aside', {}));
      this.el.appendChild(view.createChild('Main', 'div', {}));
      view.LeftBar.render();
      view.Main.render();

      const tagsVisible = model.get('tagsVisible');
      model.set('tagsVisible', []);
      tagsVisible.forEach(x => this.addTagview(x))
      document.addEventListener('keydown', (ev) => {
        if (ev.altKey && !ev.ctrlKey && !ev.shiftKey) {
          /* Alt + n --> focus on editor */
          if (ev.key.toLowerCase() === 'n') {
            ev.preventDefault();
            document.getElementById('Editor').focus();
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
            // Maximize active tab
            const activeTab = document.querySelector('.tabPill.active')?.dataset.key;
            if (activeTab) document.querySelector(`.column[data-key="${activeTab}"] .colMaxBtn`).click()
          }
          /* Alt + Arrow up/down --> maximize/restore current tab */
          if(ev.key == 'ArrowDown') {
            ev.preventDefault();
            // Restore active tab
            const activeTab = document.querySelector('.tabPill.active')?.dataset.key;
            if (activeTab) document.querySelector(`.column[data-key="${activeTab}"] .colMaxBtn`).click()
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
    }
  },

  // New calendar page
  calendar: {
    render() {
      this.el = document.getElementById('app');
      this.el.innerHTML = '';
      this.el.appendChild(view.createChild('LeftBar', 'aside', {}));
      this.el.appendChild(view.createChild('CalendarMain', 'div', {}));
      view.LeftBar.render();
      view.Calendar.render();
    },
    async load() {
      await model.tags.reload();
      await model.tasks.reload();
    }
  }
};

// VIEW
const view = {
  createChild(id, typ, options) {
    const e = document.createElement(typ);
    e.id = id;
    for (o in options) {
      e[o] = options[o];
    }
    return e;
  },
  EditorWrap: {
    render() {
      this.el = document.getElementById('EditorWrap');
      this.el.innerHTML = '';
      this.ed = this.el.appendChild(view.createChild('Editor', 'textarea', {placeholder: "new note..."}));
      const EditorCtrl = this.el.appendChild(view.createChild('EditorCtrl', 'div', {}));
      const EditorSaveBtn = EditorCtrl.appendChild(view.createChild('EditorSaveBtn', 'button', {className: 'btn primary', textContent: 'Save'}))
      let typingDebounce = null;
      this.ed.addEventListener('input', ()=>{
        clearTimeout(typingDebounce);
        typingDebounce = setTimeout(()=>{
          const txt = this.ed.value;
          const foundTags = helper.extractTagsFromText(txt);
          foundTags.forEach(tag => page.home.addTagview(tag));
          const date = this.parseLeadingDate(txt);
          if(date) addTagview(date);
        }, 500);
      });
      Editor.addEventListener('keydown', async (ev) => {
        if((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter'){
          ev.preventDefault();
          await this.saveNote();
        }
      });
      EditorSaveBtn.addEventListener('click', async (ev) => {
        await this.saveNote()
      });
    },
    async saveNote() {
      const raw = this.ed.value;
      const date = this.parseLeadingDate(raw);
      await page.home.saveNote(raw, date);
      this.ed.value = '';
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
      
      this.tc = this.el.appendChild(view.createChild('TopBarContainer', 'div', {className: 'scrollable-x'}));
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
      this.el_tb = this.el.appendChild(view.createChild('TopBar', 'div', {}));
      this.el_cw = this.el.appendChild(view.createChild('ColumnsWrap', 'div', {className: 'columns scrollable-x'}));
      this.el_ew = this.el.appendChild(view.createChild('EditorWrap', 'div', {}));
      view.TopBar.render();
      view.EditorWrap.render();
    },
    addTab(tag, notes) {
      // Column
      const elColumn = this.el_cw.appendChild(document.createElement('div'));
      elColumn.className = 'column';
      elColumn.dataset.key = tag;
      elColumn.style.position = 'relative';   // needed for resizer positioning
      elColumn.style.flex = '0 0 320px';      // default width

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

      // Buttons
      const btnWrap = header.appendChild(document.createElement('span'));
      btnWrap.style.float = 'right';
      btnWrap.style.display = 'flex';
      btnWrap.style.gap = '8px';

      // Maximize button
      const maxBtn = btnWrap.appendChild(document.createElement('button'));
      maxBtn.textContent = '⛶';
      maxBtn.title = 'Maximize column';
      maxBtn.className = 'colMaxBtn';
      maxBtn.onclick = (ev) => {
        ev.stopPropagation();
        this.maximizeTab(tag);
      };

      // Close button
      const closeBtn = btnWrap.appendChild(document.createElement('button'));
      closeBtn.textContent = '×';
      closeBtn.title = 'Close tab';
      closeBtn.className = 'colCloseBtn';
      closeBtn.onclick = (ev) => {
        ev.stopPropagation();
        page.home.removeTagview(tag);
      };

      // Note list
      const elNoteList = elColCont.appendChild(document.createElement('div'));
      elNoteList.className = 'notesList scrollable';
      elNoteList.style.color = '#777';

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
      const elNoteItem = document.createElement('div');
      elNoteItem.className = 'noteItem';
      elNoteItem.dataset.id = n.id;
      if (n.task === 'high') elNoteItem.classList.add('task-high');
      else if (n.task === 'mid') elNoteItem.classList.add('task-mid');
      else if (n.task === 'low') elNoteItem.classList.add('task-low');

      // Left side (date + text)
      const elNoteLeft = document.createElement('div');
      elNoteLeft.style.flex = '1';
      elNoteLeft.style.display = 'flex';
      elNoteLeft.style.flexDirection = 'column';
      elNoteItem.appendChild(elNoteLeft);

      // Note date
      const elNoteDate = document.createElement('div');
      elNoteDate.className = 'noteDate';
      elNoteDate.textContent = `${n.date} · ${new Date(n.timestamp).toLocaleTimeString()}`;
      if(n.duedate) {
        const elNoteDuedate = document.createElement('span');
        elNoteDuedate.className = 'duedate'
        elNoteDuedate.textContent = `${n.duedate}`;
        elNoteDate.appendChild(elNoteDuedate);
      }
      elNoteLeft.appendChild(elNoteDate);

      // Note text
      const elNoteText = elNoteLeft.appendChild(this.genNoteText(n, currentTag));

      // Edit button
      const elNoteBtnWrap = document.createElement('div');
      elNoteBtnWrap.style = "display:flex; flex-direction: column; gap: 2px; flex: 0; padding-left: 5px;"

      const elNoteEditBtn = document.createElement('button');
      elNoteEditBtn.className = 'btn primary small transparent';
      elNoteEditBtn.innerHTML = '<i class="fa fa-pencil fa-solid fa-fw fa-2xs"></i>';
      elNoteEditBtn.title = 'Edit note';
      elNoteEditBtn.onclick = (ev) => {
        ev.stopPropagation();
        modal.editModal.render(n, (updatedNote) => {
          // Update note item in place
          elNoteText.replaceWith(this.genNoteText(updatedNote, currentTag));
        });
      };
      elNoteBtnWrap.appendChild(elNoteEditBtn);

      // Delete button
      const elNoteDelBtn = document.createElement('button');
      elNoteDelBtn.className = 'btn error small transparent';
      elNoteDelBtn.innerHTML = '<i class="fa fa-x fa-solid fa-fw fa-2xs"></i>';
      elNoteDelBtn.title = 'Delete note';
      elNoteDelBtn.onclick = async (ev) => {
        ev.stopPropagation();
        if (!confirm('Delete this note?')) return;
        const ok = await api.api(`/api/notes/${n.id}`, {method: "DELETE"});
        if (ok && ok.status === 'deleted') {
          console.log('Note deleted');
          elNoteItem.remove();
          await loadAndRenderTags();
        }
      };
      elNoteBtnWrap.appendChild(elNoteDelBtn);
      elNoteItem.appendChild(elNoteBtnWrap);
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
            onclick="await page.home.addTagview('${foundTag}')"
            data-tag="${foundTag}">${foundTagText}</span>`;
          // Replace tag in text with label
          noteText = noteText.replace(new RegExp(foundTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), labelHtml);
        });
      }
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

      this.el.appendChild(view.createChild('JournalBox', 'div', {className: "box", style: "flex: 0"}));
      this.el.appendChild(view.createChild('TagsBox', 'div', {className: "box", style: "flex: 1"}));

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
     
      this.el.appendChild(view.createChild('TagsBoxSubHeader', 'div', {
        style: "margin: 10px 0px;"
      }));
      
      this.el.appendChild(view.createChild('TagsBoxList', 'div', {
        style: "display:block; width:100%;background:none;border:none;font-size:1.2em;z-index:2;",
        className: 'scrollable'
      }));

      view.TagsBoxSubHeader.render()
      view.TagsBoxList.render()
    }
  },
  TagsBoxSubHeader: {
    render () {
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
        el.appendChild(this.createTreeWrap(tagTree, modelTagsBoxEye, modelTagsBoxTask));
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
      // Toggle button per espandere/contrarre
      const toggleBtn = document.createElement('i');
      toggleBtn.className = {
        'high': 'fa-fw fa-solid fa-exclamation-circle color-grey-3',
        'mid': 'fa-fw fa-solid fa-exclamation-triangle color-grey-3',
        'low': 'fa-fw fa-solid fa-exclamation color-grey-3'
      }[task.task];
      toggleBtn.style.marginRight = '5px';
      header.appendChild(toggleBtn);

      // Nome del tag e funzionalità di click
      const span = document.createElement('span');
      span.textContent = task.text.replace(task.firstTag, '●');
      span.style.flex = '1';
      header.appendChild(span);
      li.appendChild(header);
      return li;
    },
    createTreeWrap(tagTree) {
      let ul = document.createElement('ul');
      ul.className = 'tagList-tree';
      tagTree.forEach(tag => {
        ul.appendChild(this.createTreeElement(tag, modelTagsBoxEye, modelTagsBoxTask));
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
    createTreeElement(tag, tagsEyeActive, tagsTaskActive) {
      const li = document.createElement('li');
      li.style.listStyle = 'none'; // Rimuove il proiettile dell'elemento di lista
      if(!tagsEyeActive && !tag.treed && !this.noDiscendentTask(tag)) {
        li.style.display = "none";
      }
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      const hasChildren = tag.children && tag.children.length > 0;
      // Toggle button per espandere/contrarre
      const toggleBtn = document.createElement('i');
      toggleBtn.className = hasChildren ? 'fa-fw fa-solid fa-angles-right color-grey-3' : 'fa-fw fa-solid fa-angle-right color-grey-3';
      toggleBtn.style.cursor = hasChildren ? 'pointer' : 'default';
      toggleBtn.style.marginRight = '5px';
      toggleBtn.onclick = () => {
        if (hasChildren) {
          li.classList.toggle('expanded');
          if (li.classList.contains('expanded')) {
            toggleBtn.classList.remove('fa-angles-right');
            toggleBtn.classList.add('fa-angles-down');
          } else {
            toggleBtn.classList.remove('fa-angles-down');
            toggleBtn.classList.add('fa-angles-right');
          }
        }
      };
      header.appendChild(toggleBtn);

      // Nome del tag e funzionalità di click
      const span = document.createElement('span');
      span.textContent = tag.name;
      span.style.flex = '1';
      span.style.cursor = 'pointer';
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
        const updated = await api.api(`/api/tags/${tag.category}/${tag.name.substring(1)}/tree`, {
          method: "PATCH",
          body: {
            treed: !tag.treed,
            parent: tag.parent || ''
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
        li.appendChild(this.createTaskElement(task, tagsTaskActive));
      })
      // Crea la lista dei figli (se esistono)
      if (hasChildren) {
        li.appendChild(this.createTreeWrap(tag.children, tagsEyeActive, tagsTaskActive));
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
      let calendarYear = new Date().getFullYear();
      let calendarMonth = new Date().getMonth(); // 0-indexed

      // Header with month navigation
      const elJournalHeader = document.createElement('div');
      elJournalHeader.className = 'calendar-header';

      const elJournalPrevBtn = document.createElement('button');
      elJournalPrevBtn.className = 'calendar-nav-btn';
      elJournalPrevBtn.textContent = '‹';
      elJournalPrevBtn.onclick = () => {
        calendarMonth--;
        if (calendarMonth < 0) {
          calendarMonth = 11;
          calendarYear--;
        }
        renderJournalBox();
      };

      const elJournalNextBtn = document.createElement('button');
      elJournalNextBtn.className = 'calendar-nav-btn';
      elJournalNextBtn.textContent = '›';
      elJournalNextBtn.onclick = () => {
        calendarMonth++;
        if (calendarMonth > 11) {
          calendarMonth = 0;
          calendarYear++;
        }
        renderJournalBox();
      };

      const elJournalMonthLabel = document.createElement('span');
      elJournalMonthLabel.className = 'calendar-month-label';
      elJournalMonthLabel.textContent = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;

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
      let firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
      firstDay = (firstDay === 0) ? 6 : firstDay - 1;
      const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
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
          calendarYear === today.getFullYear() &&
          calendarMonth === today.getMonth() &&
          d === today.getDate();
        if (isToday) {
          elJournalTdBody.classList.add('calendar-today');
        }

        elJournalTdBody.onclick = () => {
          const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          page.home.addTagview(dateStr);
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

      this.el_tb = this.el.appendChild(view.createChild('TopBar', 'div', {}));
      view.TopBar.render();
      
      this.el_cw = this.el.appendChild(view.createChild('CalendarWrap', 'div', {}));

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
        // else: in-month -> left for grid rendering
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
          <form class="myform" style="flex: 1">
            <textarea name="note-text" class="modal-textarea">${note.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
            <div>duedate: ${note.duedate} </div>
            <div>task: ${note.task} </div>
            <div class="modal-actions">
              <button id="modal-cancel" class="btn standard" id="modal-cancel">Cancel</button>
              <button id="modal-save" class="btn primary" id="modal-save">Save</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(this.el);

      // Cancel button
      document.getElementById('modal-cancel').onclick = () => {
        this.el.remove();
        this.el = null;
      };
      // Save button
      document.getElementById('modal-save').onclick = async () => {
        const newText = this.el.querySelector('.modal-textarea').value.trim();
        if (!newText || newText === note.text) {
          this.el.remove();
          this.el = null;
          return;
        }
        // PATCH API
        const updated = await api.api(`/api/notes/${note.id}`, {
          method: "PATCH",
          body: { text: newText }
        });
        if(!updated || !updated.note.id || updated.status != 'patched') {
          alert('Error saving note');
          return;
        }
        editCallback?.(updated.note);
        await loadAndRenderTags();
        this.el.remove();
        this.el = null;
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
          <h3>Edit Tag Tree</h3>
          <form class="myform" style="flex: 1">
            <label>
              <input type="radio" name="treedVisible" value="true" ${tagObj.treed ? 'checked' : ''}>
              Visible
            </label>
            <label>
              <input type="radio" name="treedVisible" value="false" ${!tagObj.treed ? 'checked' : ''}>
              Hidden
            </label>
            <div>
              <label for="parentTagInput">Parent Tag:</label>
              <input type="text" id="parentTagInput" class="modal-parent-input" value="${tagObj.parent == null ? '' : tagObj.parent.replace(/"/g, '&quot;') || ''}" placeholder="Enter parent tag">
            </div>
            <div style="flex: 1"></div>
            <div class="modal-actions">
              <button class="btn standard" id="edit-tree-modal-cancel">Cancel</button>
              <button class="btn primary" id="edit-tree-modal-save">Save</button>
            </div>
          </div>
        </form>
      `;
      document.body.appendChild(this.el);
      
      // Cancel button
      this.el.querySelector('#edit-tree-modal-cancel').onclick = () => {
        this.el.remove();
        this.el = null;
      };
      // Save button
      this.el.querySelector('#edit-tree-modal-save').onclick = async () => {
        const updated = await api.api(`/api/tags/${tagObj.category}/${tag.substring(1)}/tree`, {
          method: "PATCH",
          body: {
            "treed": this.el.querySelector('input[name="treedVisible"]:checked').value === 'true',
            "parent": this.el.querySelector('#parentTagInput').value.trim() || null
          }
        });
        
        // Update local tag
        tags[tag] = updated;
        renderTagsBox();
        
        this.el.remove();
        this.el = null;
      };
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
