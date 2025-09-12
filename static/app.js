// Notes SPA with Flask backend
// Fetches tags, journal, notes via REST API

// -------------------- App state --------------------
let notes = [];      // loaded from server
let tabs = [];       // query tabs
let tags = {}

let activeTab = null;
let maxedTab = null;

// -------------------- DOM refs --------------------
const tagsListEl = document.getElementById('tagsList');
const journalListEl = document.getElementById('journalList');
const treeListEl = document.getElementById('treeList');
const tabsContainer = document.getElementById('tabsContainer');
const columnsWrap = document.getElementById('columnsWrap');
const editor = document.getElementById('editor');
const saveBtn = document.getElementById('saveBtn');
const newNoteBtn = document.getElementById('newNoteBtn');
const addTabBtn = document.getElementById('addTabBtn');

// -------------------- Init --------------------
(async function init(){
  await loadNotes();
  await loadAndRenderTags();
  await loadAndRenderJournal();
  renderTabs();
  renderColumns();
})();

// -------------------- API helpers --------------------
async function apiGet(url){
  const res = await fetch(url);
  return res.json();
}
async function apiPost(url, data){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}
async function apiPatch(url, data) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}
async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

// -------------------- Load data --------------------
async function loadAndRenderTags(){
  tags = await apiGet("/api/tags");
  renderTagsBox();
  renderTreeBox();
}
async function loadAndRenderJournal(){
  const journalResp = await apiGet("/api/journal");
  renderJournalBox(journalResp);
}
async function loadNotes(){
  notes = await apiGet("/api/notes");
}

// -------------------- Render --------------------
// Collapsible helper
function makeCollapsible(boxId, btnId, contentEl, title) {
  const box = document.getElementById(boxId);
  let btn = document.getElementById(btnId);
  btn.onclick = () => {
    if (contentEl.style.display === 'none') {
      contentEl.style.display = '';
      btn.textContent = title + ' ▾';
      box.style.height = '';
      box.classList.toggle('collapsed', false);
    } else {
      contentEl.style.display = 'none';
      btn.textContent = title + ' ▸';
      box.style.height = '32px';
      box.classList.toggle('collapsed', true);
    }
  };
}
function renderTreeBox() {
  treeListEl.innerHTML = '';

  // Filter only project tags with treed === true
  const projectTags = Object.entries(tags)
    .filter(([tag, info]) => info.treed === true)
    .map(([tag, info]) => ({ tag, ...info }));

  // Build a map for quick lookup
  const tagMap = {};
  projectTags.forEach(t => tagMap[t.tag] = { ...t, children: [] });

  // Build tree structure
  const roots = [];
  projectTags.forEach(t => {
    if (!t.parent || !tagMap[t.parent]) {
      roots.push(tagMap[t.tag]);
    } else {
      tagMap[t.parent].children.push(tagMap[t.tag]);
    }
  });

  // Helper: find first visible ancestor for a tag
  function findFirstVisibleAncestor(tag) {
    let current = tagMap[tag];
    while (current && !current.treed) {
      if (!current.parent) return null;
      current = tagMap[current.parent];
    }
    return current && current.treed ? current.tag : null;
  }

  // Map: tag -> tasks to show under it
  const tasksByTag = {};
  const rootTasks = [];
  notes.forEach(note => {
    if (!note.task || note.task === 'none') return;
    // Find all project tags in note
    const noteTags = (note.tags || []).filter(t => tags[t]);
    let placed = false;
    if (noteTags.length > 0) {
      noteTags.forEach(tag => {
        const showUnder = tags[tag].treed ? tag : findFirstVisibleAncestor(tag);
        if (showUnder) {
          if (!tasksByTag[showUnder]) tasksByTag[showUnder] = [];
          tasksByTag[showUnder].push(note);
          placed = true;
        }
      });
    }
    // If no tags or no visible ancestor, show at root
    if (!placed) {
      rootTasks.push(note);
    }
  });

  // Recursive render with collapsible sublists
  function renderNode(node, depth = 0, parentUl = null) {
    const li = document.createElement('li');
    li.className = 'tree-node';
    li.style.marginLeft = `${depth * 5}px`;

    // Toggle arrow
    let arrow = null;
    if (node.children.length > 0) {
      arrow = document.createElement('span');
      arrow.textContent = depth < 1 ? '▾' : '▸'; // expanded for root, collapsed for deeper
      arrow.className = 'tree-arrow';
      li.appendChild(arrow);
    }

    // Tag label
    const tagSpan = document.createElement('span');
    tagSpan.textContent = node.tag;
    tagSpan.className = `tree-tag lbl lbl-${node.category}`;
    tagSpan.onclick = () => createTab(node.tag, 'tag');
    li.appendChild(tagSpan);

    // Show tasks under this tag
    if (tasksByTag[node.tag]) {
      const taskList = document.createElement('ul');
      taskList.style.listStyle = 'none';
      taskList.style.margin = '4px 0 4px 18px';
      taskList.style.padding = '0';
      tasksByTag[node.tag].forEach(note => {
        const taskLi = document.createElement('li');
        taskLi.style.margin = '2px 0';
        taskLi.style.padding = '2px 6px';
        taskLi.style.borderRadius = '4px';
        taskLi.style.cursor = 'pointer';
        // Add priority background
        if (note.task === 'high') taskLi.classList.add('task-high');
        else if (note.task === 'mid') taskLi.classList.add('task-mid');
        else if (note.task === 'low') taskLi.classList.add('task-low');
        // Show a short preview of the note
        taskLi.textContent = note.text.length > 60 ? note.text.slice(0, 60) + '…' : note.text;
        taskLi.title = note.text;
        taskLi.onclick = () => createTab(node.tag, 'tag');
        taskList.appendChild(taskLi);
      });
      li.appendChild(taskList);
    }

    // Subtree
    let childUl = null;
    if (node.children.length > 0) {
      childUl = document.createElement('ul');
      childUl.className = 'tree-children';
      node.children.forEach(child => renderNode(child, depth + 1, childUl));
      // Show children for depth < 1 (root), collapse for deeper
      childUl.style.display = depth < 1 ? '' : 'none';
      li.appendChild(childUl);

      // Arrow toggle logic
      arrow.onclick = () => {
        if (childUl.style.display === 'none') {
          childUl.style.display = '';
          arrow.textContent = '▾';
        } else {
          childUl.style.display = 'none';
          arrow.textContent = '▸';
        }
      };
    }

    // Append to parent UL or treeListEl
    if (parentUl) {
      parentUl.appendChild(li);
    } else {
      treeListEl.appendChild(li);
    }
  }

  // Top-level UL for better styling
  const topUl = document.createElement('ul');
  topUl.className = 'tree-root';

  // Render root-level tasks first
  if (rootTasks.length > 0) {
    rootTasks.forEach(note => {
      const taskLi = document.createElement('li');
      taskLi.style.margin = '2px 0';
      taskLi.style.padding = '2px 6px';
      taskLi.style.borderRadius = '4px';
      taskLi.style.cursor = 'pointer';
      if (note.task === 'high') taskLi.classList.add('task-high');
      else if (note.task === 'mid') taskLi.classList.add('task-mid');
      else if (note.task === 'low') taskLi.classList.add('task-low');
      taskLi.textContent = note.text.length > 60 ? note.text.slice(0, 60) + '…' : note.text;
      taskLi.title = note.text;
      taskLi.onclick = () => createTab(note.date, 'date');
      topUl.appendChild(taskLi);
    });
  }

  roots.forEach(root => renderNode(root, 0, topUl));
  treeListEl.appendChild(topUl);

  makeCollapsible('treeBox', 'treeCollapseBtn', treeListEl, 'Tree');
}
function renderTagsBox(){
  console.log('[fn] renderTagsBox', tags);
  tagsListEl.innerHTML = '';
  
  const sectionsDiv = {
    'Projects': document.createElement('div'),
    'Persons': document.createElement('div'),
    'Events': document.createElement('div'),
    'Generic': document.createElement('div')
  };
  Object.entries(sectionsDiv).forEach(([secName, secDiv]) => {
    secDiv.className = 'tagSection';
    let title = document.createElement('div');
    title.className = 'sectionTitle';
    title.textContent = secName + ': ';
    secDiv.appendChild(title);
    let ul = document.createElement('ul');
    ul.className = 'tagList';
    secDiv.appendChild(ul);
    tagsListEl.appendChild(secDiv);
  });
  Object.entries(tags).forEach(([tag, info]) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';

    const span = document.createElement('span');
    span.textContent = tag;
    span.style.flex = '1';
    span.style.cursor = 'pointer';
    span.onclick = () => createTab(tag, 'tag');
    li.appendChild(span);

    // Eye button for visibility toggle
    const eyeBtn = document.createElement('span');
    eyeBtn.textContent = '👁';
    eyeBtn.title = info.treed ? 'Visible in tree' : 'Hidden from tree';
    eyeBtn.style.color = info.treed ? '#2e7d32' : '#c62828';
    eyeBtn.style.marginLeft = '8px';
    eyeBtn.style.cursor = 'pointer';
    eyeBtn.onclick = async (ev) => {
      ev.stopPropagation();
      // PATCH API to toggle treed
      const updated = await apiPatch(`/api/tags/${info.category}/${tag.substring(1)}/tree`, {
        treed: !info.treed,
        parent: info.parent || ''
      });
      tags[tag] = updated;
      renderTagsBox();
      renderTreeBox();
    };
    li.appendChild(eyeBtn);

    // Tree edit button
    const treeEdit = document.createElement('span');
    treeEdit.textContent = '✎';
    treeEdit.style.color = '#666';
    treeEdit.style.marginLeft = '8px';
    treeEdit.style.cursor = 'pointer';
    treeEdit.title = `Tree "${tag}"`;
    treeEdit.onclick = async (ev) => {
      ev.stopPropagation();
      openEditTreeTagModal(tag);
    };
    li.appendChild(treeEdit);

    sectionsDiv[info.category].querySelector('ul').appendChild(li);
  });
  makeCollapsible('tagsBox', 'tagsCollapseBtn', tagsListEl, 'Tags');
}
function activateTab(key){
  activeTab = key;
  console.log('[fn] activateTab', activeTab);
  document.querySelectorAll('.tabPill').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.column').forEach(el => el.classList.remove('active'));
  const pill = document.querySelector(`.tabPill[data-key="${activeTab}"]`);
  if(pill) pill.classList.add('active');
  const col = document.querySelector(`.column[data-key="${activeTab}"]`);
  if(col) {
    col.scrollIntoView({behavior:'smooth', inline:'start'});
    col.classList.add('active');
  }
}

function renderJournalBox(days){
  console.log('[fn] renderJournalBox');
  journalListEl.innerHTML = '';
  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.paddingLeft = '8px';
  ul.style.margin = '0';
  days.forEach(d => {
    const li = document.createElement('li');
    li.textContent = d;
    li.style.cursor = 'pointer';
    li.style.padding = '6px 4px';
    li.onclick = () => createTab(d, 'date');
    ul.appendChild(li);
  });
  journalListEl.appendChild(ul);
  makeCollapsible('journalBox', 'journalCollapseBtn', journalListEl, 'Journal');
}
function renderTabs(){
  console.log('[fn] renderTabs', tabs);
  tabsContainer.innerHTML = '';
  tabs.forEach((t) => {
    const pill = document.createElement('div');
    pill.className = 'tabPill';
    if(t.query === activeTab) pill.classList.add('active');
    pill.dataset.key = t.query;
    pill.title = `${t.query}`;

    const label = document.createElement('span');
    label.textContent = t.query;
    pill.appendChild(label);

    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '×';
    x.onclick = (ev) => {
      ev.stopPropagation();
      removeTab(t.query);
    };
    pill.appendChild(x);
    pill.onclick = () => activateTab(t.query);
    tabsContainer.appendChild(pill);
  });
  tabsContainer.scrollLeft = tabsContainer.scrollWidth;
}
function maximizeTab(key) {
  console.log('[fn] maximizeTab', key);
  maxedTab = key;
  const col = document.querySelector(`.column[data-key="${key}"]`);
  if (!col) return;
  col.classList.toggle('maximized');
}
function renderColumns(){
  console.log('[fn] renderColumns');
  columnsWrap.innerHTML = '';

  if(tabs.length === 0){
    const placeholder = document.createElement('div');
    placeholder.className = 'column';
    placeholder.style.justifyContent = 'center';
    placeholder.style.alignItems = 'center';
    placeholder.innerHTML = '<div style="color:#999">No queries yet — click a tag or a date, or type tags into the editor to create searches.</div>';
    columnsWrap.appendChild(placeholder);
    return;
  }

  columnsWrap.style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`;

  tabs.forEach(t => {
    const col = document.createElement('div');
    col.className = 'column';
    if(t.query === activeTab) col.classList.add('active');
    if(t.query === maxedTab) col.classList.add('maximized');
    col.dataset.key = t.query;

    const col_cont = document.createElement('div');
    col_cont.className = 'column-content';
    col_cont.dataset.key = t.query;

    const header = document.createElement('div');
    header.className = 'columnHeader';
    header.textContent = (t.type === 'date' ? `${t.query}` : t.query);
    col.appendChild(col_cont);
    col_cont.appendChild(header);

    // --- Add buttons ---
    const btnWrap = document.createElement('span');
    btnWrap.style.float = 'right';
    btnWrap.style.display = 'flex';
    btnWrap.style.gap = '8px';

    // Maximize button
    const maxBtn = document.createElement('button');
    maxBtn.textContent = '⛶';
    maxBtn.title = 'Maximize column';
    maxBtn.className = 'colMaxBtn';
    maxBtn.onclick = (ev) => {
      ev.stopPropagation();
      maximizeTab(t.query);
    };
    btnWrap.appendChild(maxBtn);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Close tab';
    closeBtn.className = 'colCloseBtn';
    closeBtn.onclick = (ev) => {
      ev.stopPropagation();
      removeTab(t.query);
    };
    btnWrap.appendChild(closeBtn);

    header.appendChild(btnWrap);

    const list = document.createElement('div');
    list.className = 'notesList scrollable';
    const matched = filterNotesForTab(t);
    if(matched.length === 0){
      list.textContent = 'No notes';
      list.style.color = '#777';
      list.style.padding = '10px';
    } else {
      matched.forEach(n => {
        const item = document.createElement('div');
        item.className = 'noteItem';
        
        if (n.task === 'high') item.classList.add('task-high');
        else if (n.task === 'mid') item.classList.add('task-mid');
        else if (n.task === 'low') item.classList.add('task-low');

        const left = document.createElement('div');
        left.style.flex = '1';
        left.style.display = 'flex';
        left.style.flexDirection = 'column';

        const dt = document.createElement('div');
        dt.className = 'noteDate';
        dt.textContent = `${n.date} · ${new Date(n.timestamp).toLocaleTimeString()}`;
        const txt = document.createElement('div');
        txt.className = 'noteText';
        // Inline tag labels in text
        let noteText = n.text;
        let noteTags = extractTagsFromText(n.text, false);
        let tagText = ''
        if (noteTags && noteTags.length) {
          noteTags.forEach(tag => {
            // Build label span as HTML
            let lbl_class = 'Generic';
            if (tag.startsWith('#')) lbl_class = 'Projects';
            else if (tag.startsWith('@')) lbl_class = 'Persons';
            else if (tag.startsWith('>')) lbl_class = 'Events';
            
            tagText = tag;
            if(tag == t.query) {
              lbl_class = 'active';
              tagText = '●'
            }
            let labelHtml = `<span class="lbl lbl-${lbl_class}" onclick="createTab('${tag}', 'tag')" data-tag="${tag}">${tagText}</span>`;
            // Replace tag in text with label
            noteText = noteText.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), labelHtml);
          });
        }
        txt.innerHTML = noteText;
        left.appendChild(dt);
        left.appendChild(txt);


        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'noteEditBtn';
        editBtn.textContent = '✎';
        editBtn.title = 'Edit note';
        editBtn.onclick = (ev) => {
          ev.stopPropagation();
          openEditModal(n);
        };

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'noteDelBtn';
        delBtn.textContent = '×';
        delBtn.title = 'Delete note';
        delBtn.onclick = async (ev) => {
          ev.stopPropagation();
          if (!confirm('Delete this note?')) return;
          const ok = await apiDelete(`/api/notes/${n.id}`);
          if (ok && ok.status === 'deleted') {
            notes = notes.filter(nn => nn.id !== n.id);
            await loadAndRenderTags();
            renderColumns();
          }
        };

        item.appendChild(left);
        item.appendChild(editBtn);
        item.appendChild(delBtn);
        list.appendChild(item);
      });
      setTimeout(() => {
        list.scrollTop = list.scrollHeight;
      }, 0);
    }
    col_cont.appendChild(list);
    columnsWrap.appendChild(col);
  });
  document.querySelectorAll('.column').forEach(col => {
    col.onclick = () => {
      console.log('Column clicked:', col.dataset.key);
      activateTab(col.dataset.key);
    };
  });
}

// -------------------- Edit Modal --------------------
let editModal = null;
function openEditModal(note) {
  if (editModal) editModal.remove();
  editModal = document.createElement('div');
  editModal.className = 'modal';
  editModal.innerHTML = `
    <div class="modal-content">
      <h3>Edit Note</h3>
      <textarea class="modal-textarea">${note.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
      <div class="modal-actions">
        <button class="modal-cancel">Cancel</button>
        <button class="modal-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(editModal);

  // Cancel button
  editModal.querySelector('.modal-cancel').onclick = () => {
    editModal.remove();
    editModal = null;
  };
  // Save button
  editModal.querySelector('.modal-save').onclick = async () => {
    const newText = editModal.querySelector('.modal-textarea').value.trim();
    if (!newText || newText === note.text) {
      editModal.remove();
      editModal = null;
      return;
    }
    // PATCH API
    const updated = await apiPatch(`/api/notes/${note.id}`, { text: newText });
    console.log("API response:", updated);
    // Update local note
    const idx = notes.findIndex(n => n.id === note.id);
    notes[idx] = updated.note;
    await loadAndRenderTags();
    renderColumns();
    editModal.remove();
    editModal = null;
  };
}
let editTreeTagModal = null;
function openEditTreeTagModal(tag) {
  console.debug(`[fn] openEditTreeTagModal`, tag);
  const tagObj = tags[tag];
  console.debug(`[fn] openEditTreeTagModal`, tagObj);
  if (editTreeTagModal) editTreeTagModal.remove();
  editTreeTagModal = document.createElement('div');
  editTreeTagModal.className = 'modal';
  editTreeTagModal.innerHTML = `
    <div class="modal-content">
      <h3>Edit Tag Tree</h3>
      <div style="margin-bottom: 12px;">
        <label>
          <input type="radio" name="treedVisible" value="true" ${tagObj.treed ? 'checked' : ''}>
          Visible
        </label>
        <label style="margin-left: 16px;">
          <input type="radio" name="treedVisible" value="false" ${!tagObj.treed ? 'checked' : ''}>
          Hidden
        </label>
      </div>
      <div style="margin-bottom: 12px;">
        <label for="parentTagInput">Parent Tag:</label>
        <input type="text" id="parentTagInput" class="modal-parent-input" value="${tagObj.parent.replace(/"/g, '&quot;') || ''}" placeholder="Enter parent tag">
      </div>
      <div class="modal-actions">
        <button id="edit-tree-modal-cancel">Cancel</button>
        <button id="edit-tree-modal-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(editTreeTagModal);
  
  // Cancel button
  editTreeTagModal.querySelector('#edit-tree-modal-cancel').onclick = () => {
    editTreeTagModal.remove();
    editTreeTagModal = null;
  };
  // Save button
  editTreeTagModal.querySelector('#edit-tree-modal-save').onclick = async () => {
    const updated = await apiPatch(`/api/tags/${tagObj.category}/${tag.substring(1)}/tree`, {
      "treed": editTreeTagModal.querySelector('input[name="treedVisible"]:checked').value === 'true',
      "parent": editTreeTagModal.querySelector('#parentTagInput').value.trim() || null
    });
    console.log('API response:', updated);
  
    // Update local tag
    tags[tag] = updated;
    renderTagsBox();
    renderTreeBox();
    
    editTreeTagModal.remove();
    editTreeTagModal = null;
  };
}

// -------------------- Tabs --------------------
function createTab(query, type='tag'){
  console.log(`[fn] createTab: type=${type}, query=${query}`, tabs);
  if(tabs.some(t => t.query === query)) return;
  tabs.push({type, query});
  renderTabs();
  renderColumns();
  activateTab(query);
}
function removeTab(key){
  console.log(`[fn] removeTab: key=${key}`, tabs);
  tabs = tabs.filter(t => t.query !== key);
  renderTabs();
  renderColumns();
  if (tabs.find(t => t.query === activeTab)) {
    activateTab(activeTab);
  } else {
    activateTab(tabs.length > 0 ? tabs[tabs.length-1].query : null);
  }
}

// -------------------- Filtering --------------------
function filterNotesForTab(tab){
  if(tab.type === 'date'){
    // Sort ascending (oldest first)
    return notes.filter(n => n.date === tab.query).sort((a,b)=>a.timestamp-b.timestamp);
  } else {
    const q = tab.query.toLowerCase();

    function getDescendants(tag) {
      const descendants = new Set();
      function recurse(currentTag) {
        Object.entries(tags).forEach(([childTag, info]) => {
          if (info.parent === currentTag) {
            descendants.add(childTag);
            recurse(childTag);
          }
        });
      }
      recurse(tag);
      return descendants;
    }

    const allTags = new Set([tab.query]);
    getDescendants(tab.query).forEach(t => allTags.add(t));

    // Sort ascending (oldest first)
    return notes.filter(n => 
      (n.tags || []).some(tt => allTags.has(tt)) ||
      n.text.toLowerCase().includes(q)
    ).sort((a,b)=>a.timestamp-b.timestamp);
  }
}

// -------------------- Editor --------------------
function extractTagsFromText(text, trailing_space=true){
  const tagsfound = new Set();
  let tagRx = /([#@>\+])([A-Za-z0-9_\-]+)[ ,\.;:]/g;
  if (!trailing_space) {
    tagRx = /([#@>\+])([A-Za-z0-9_\-]+)/g;
  }
  let m;
  while((m = tagRx.exec(text)) !== null) {
    tagsfound.add(m[0].trim());
  }
  console.debug(`Extracted tagsfound from text: [${Array.from(tagsfound).join(', ')}]`);
  
  return Array.from(tagsfound);
}
function parseLeadingDate(text){
  const m = text.trim().match(/^(\d{4}-\d{2}-\d{2})\b/);
  return m ? m[1] : null;
}

// -------------------- Editor events --------------------

let typingDebounce = null;
editor.addEventListener('input', ()=>{
  clearTimeout(typingDebounce);
  typingDebounce = setTimeout(()=>{
    const txt = editor.value;
    const foundTags = extractTagsFromText(txt);
    foundTags.forEach(tag => createTab(tag, 'tag'));
    const date = parseLeadingDate(txt);
    if(date) createTab(date, 'date');
  }, 300);
});

saveBtn.addEventListener('click', saveNote);
newNoteBtn.addEventListener('click', ()=> editor.focus());
addTabBtn.addEventListener('click', ()=>{
  const q = prompt('Enter search term:');
  if(q && q.trim()) createTab(q.trim(), 'custom');
});
editor.addEventListener('keydown', (ev)=>{
  if((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter'){
    ev.preventDefault();
    saveNote();
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.altKey && !ev.ctrlKey && !ev.shiftKey) {
    if (ev.key.toLowerCase() === 'n') {
      ev.preventDefault();
      editor.focus();
    }
    if (ev.key.toLowerCase() === 't') {
      ev.preventDefault();
      // Open today tab (assuming today's date in ISO format)
      const today = new Date().toISOString().slice(0, 10);
      createTab(today, 'date');
    }
    if (ev.key.toLowerCase() === 'q') {
      ev.preventDefault();
      const q = prompt('Enter search term:');
      if(q && q.trim()) createTab(q.trim(), 'custom');
    }
    if (ev.key.toLowerCase() === 'w') {
      ev.preventDefault();
      // Close active tab
      if (activeTab) removeTab(activeTab);
    }
    if (!isNaN(parseInt(ev.key, 10))) {
      ev.preventDefault();
      let evIndex = parseInt(ev.key, 10)-1;
      console.log('Numeric key pressed:', evIndex);
      if (tabs[evIndex]) {
        activateTab(tabs[evIndex].query);
      }
    }

    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      // Activate previous tab if exists
      const currentIndex = tabs.findIndex(t => t.query === activeTab);
      if (currentIndex > 0) {
        activateTab(tabs[currentIndex - 1].query);
      }
    }
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      // Activate next tab if exists
      const currentIndex = tabs.findIndex(t => t.query === activeTab);
      if (currentIndex >= 0 && currentIndex < tabs.length - 1) {
        activateTab(tabs[currentIndex + 1].query);
      }
    }
    if(ev.key == 'ArrowUp') {
      ev.preventDefault();
      console.log('Scroll up active column');
      // Scroll active column up
      document.querySelector(`.column[data-key="${activeTab}"] .colMaxBtn`).click()
    }
  }
});
// -------------------- Save note --------------------
async function saveNote(){
  const raw = editor.value.trim();
  if(!raw) return;
  const date = parseLeadingDate(raw) || (new Date()).toISOString().slice(0,10);
  const noteTags = extractTagsFromText(raw, false);

  const response = await apiPost("/api/notes", {
    text: raw,
    date,
    noteTags
  });
  notes.push(response.note);

  noteTags.forEach(t => createTab(t, 'tag'));
  createTab(date, 'date');
  rawWords = raw.split(/\s+/);
  const newRawWords = new Array();
  for (let w of rawWords) {
    if (w.startsWith('#') || w.startsWith('@') || w.startsWith('>') || w.startsWith('+')) {
      newRawWords.push(w);
    } else {
      break;
    }
  }
  editor.value = '';
  for (let w of newRawWords) {
    editor.value += w + ' ';
  }
  editor.focus();
  await loadAndRenderTags();
  renderColumns();
}
