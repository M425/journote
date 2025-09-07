// Notes SPA with Flask backend
// Fetches tags, journal, notes via REST API

// -------------------- App state --------------------
let notes = [];      // loaded from server
let tabs = [];       // query tabs
let tags = {}

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

  // Recursive render with collapsible sublists
  function renderNode(node, depth = 0, parentUl = null) {
    console.log(node)
    const li = document.createElement('li');
    li.className = 'tree-node';
    li.style.marginLeft = `${depth * 8}px`;

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
      const updated = await apiPatch(`/api/tags/${info.category}/${tag.substr(1)}/tree`, {
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

    pill.onclick = () => {
      const col = document.querySelector(`.column[data-key="${t.query}"]`);
      if(col) col.scrollIntoView({behavior:'smooth', inline:'start'});
      document.querySelectorAll('.tabPill').forEach(el => el.classList.remove('active'));
      pill.classList.add('active');
    };
    tabsContainer.appendChild(pill);
  });
  tabsContainer.scrollLeft = tabsContainer.scrollWidth;
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
    col.dataset.key = t.query;

    const col_cont = document.createElement('div');
    col_cont.className = 'column-content';
    col_cont.dataset.key = t.query;

    const header = document.createElement('div');
    header.className = 'columnHeader';
    header.textContent = (t.type === 'date' ? `${t.query}` : t.query);
    col.appendChild(col_cont);
    col_cont.appendChild(header);

    const list = document.createElement('div');
    const matched = filterNotesForTab(t);
    if(matched.length === 0){
      list.textContent = 'No notes';
      list.style.color = '#777';
      list.style.padding = '10px';
    } else {
      matched.forEach(n => {
        const item = document.createElement('div');
        item.className = 'noteItem';

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
        let tags = extractTagsFromText(n.text, false);
        if (tags && tags.length) {
          tags.forEach(tag => {
            // Build label span as HTML
            let lbl_class = 'Generic';
            if (tag.startsWith('#')) lbl_class = 'Projects';
            else if (tag.startsWith('@')) lbl_class = 'Persons';
            else if (tag.startsWith('>')) lbl_class = 'Events';
            let labelHtml = `<span class="lbl lbl-${lbl_class}" onclick="createTab('${tag}')" data-tag="${tag}">${tag}</span>`;
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
        editBtn.style.marginLeft = '8px';
        editBtn.style.fontSize = '1em';
        editBtn.style.cursor = 'pointer';
        editBtn.onclick = (ev) => {
          ev.stopPropagation();
          openEditModal(n);
        };

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'noteDelBtn';
        delBtn.textContent = '×';
        delBtn.title = 'Delete note';
        delBtn.style.marginLeft = '4px';
        delBtn.style.fontSize = '1.1em';
        delBtn.style.cursor = 'pointer';
        delBtn.onclick = async (ev) => {
          ev.stopPropagation();
          if (!confirm('Delete this note?')) return;
          const ok = await apiDelete(`/api/notes/${n.id}`);
          if (ok && ok.status === 'deleted') {
            notes = notes.filter(nn => nn.id !== n.id);
            await loadAndRenderTags();
            if (ok.removed_tags && Array.isArray(ok.removed_tags)) {
              tabs = tabs.filter(t => !ok.removed_tags.includes(t.query));
              renderTabs();
            }
            renderColumns();
          }
        };

        item.appendChild(left);
        item.appendChild(editBtn);
        item.appendChild(delBtn);
        list.appendChild(item);
      });
    }
    col_cont.appendChild(list);
    columnsWrap.appendChild(col);
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
    if (updated && updated.id) {
      // Update local note
      const idx = notes.findIndex(n => n.id === note.id);
      if (idx !== -1) notes[idx] = updated;
      renderColumns();
    }
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
        <input type="text" id="parentTagInput" class="modal-parent-input" value="${tagObj.parent || ''}" placeholder="Enter parent tag">
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
    const updated = await apiPatch(`/api/tags/${tagObj.category}/${tag.substr(1)}/tree`, {
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
  tabs.push({ type, query });
  renderTabs();
  renderColumns();
}
function removeTab(key){
  console.log(`[fn] removeTab: key=${key}`, tabs);
  tabs = tabs.filter(t => t.query !== key);
  renderTabs();
  renderColumns();
}

// -------------------- Filtering --------------------
function filterNotesForTab(tab){
  if(tab.type === 'date'){
    return notes.filter(n => n.date === tab.query).sort((a,b)=>b.timestamp-a.timestamp);
  } else {
    const q = tab.query.toLowerCase();

    // Helper: get all descendant tags recursively
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

    // Collect all tags to match: the query tag and its descendants
    const allTags = new Set([tab.query]);
    getDescendants(tab.query).forEach(t => allTags.add(t));

    return notes.filter(n => 
      (n.tags || []).some(tt => allTags.has(tt)) ||
      n.text.toLowerCase().includes(q)
    ).sort((a,b)=>b.timestamp-a.timestamp);
  }
}

// -------------------- Editor --------------------
function extractTagsFromText(text, trailing_space=true){
  const tags = new Set();
  let tagRx = /([#@>\+])([A-Za-z0-9_\-]+)[ ,\.;:]/g;
  if (!trailing_space) {
    tagRx = /([#@>\+])([A-Za-z0-9_\-]+)/g;
  }
  let m;
  while((m = tagRx.exec(text)) !== null) {
    tags.add(m[0].trim());
  }
  console.debug(`Extracted tags from text: [${Array.from(tags).join(', ')}]`);
  
  return Array.from(tags);
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
  }
});
// -------------------- Save note --------------------
async function saveNote(){
  const raw = editor.value.trim();
  if(!raw) return;
  const date = parseLeadingDate(raw) || (new Date()).toISOString().slice(0,10);
  const tags = extractTagsFromText(raw, false);

  const newNote = await apiPost("/api/notes", {
    text: raw,
    date,
    tags
  });
  notes.push(newNote);

  tags.forEach(t => createTab(t, 'tag'));
  createTab(date, 'date');

  editor.value = '';
  editor.focus();
  await loadAndRenderTags();
  renderColumns();
}
