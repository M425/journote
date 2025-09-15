/* Working variables */
let tags = {}
let tasks = {}

/* DOM elements */
const elTagsList = document.getElementById('tagsList');
const elJournalList = document.getElementById('journalList');
const elTreeList = document.getElementById('treeList');
const elTabsContainer = document.getElementById('tabsContainer');
const elColumnsWrap = document.getElementById('columnsWrap');
const elEditor = document.getElementById('editor');
const elSaveBtn = document.getElementById('saveBtn');

/* Date variables */
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-indexed

/* Initialize */
(async function init(){
  await loadAndRenderTags();
  renderJournalBox();
})();

/* Note helper functions */
function getClassfromTag(tag) {
  if (tag.startsWith('#')) return 'Projects';
  if (tag.startsWith('@')) return 'Persons';
  if (tag.startsWith('>')) return 'Events';
  if (tag.startsWith('+')) return 'Generic';
  if (/^\d{4}-\d{2}-\d{2}$/.test(tag)) return 'Journal';
  return 'Fulltext';
}
function getAnonymizedTag(tag) {
  if (tag.startsWith('#')) return tag.substring(1);
  if (tag.startsWith('@')) return tag.substring(1);
  if (tag.startsWith('>')) return tag.substring(1);
  if (tag.startsWith('+')) return tag.substring(1);
  return tag;
}
async function pushNote(note) {
  console.log('[fn] pushNote', note);
  // Ensure tagviews exist
  for (let tag of note.tags) {
    if (!document.querySelector(`.column[data-key="${tag}"]`)) {
      await addTagview(tag);
    } else {
      const noteList = document.querySelector(`.column[data-key="${tag}"] .notesList`);
      if (noteList) {
        const elNotePushed = noteList.appendChild(genNoteItem(note, tag));
        elNotePushed.scrollIntoView({behavior:'smooth', inline:'start'});
      }
    }
  }
  if (!document.querySelector(`.column[data-key="${note.date}"]`)) {
    await addTagview(note.date);
  } else {
    const noteList = document.querySelector(`.column[data-key="${note.date}"] .notesList`);
    if (noteList) {
      const elNotePushed = noteList.appendChild(genNoteItem(note, note.date));
      elNotePushed.scrollIntoView({behavior:'smooth', inline:'start'});
      // setTimeout(() => noteList.scrollTop = noteList.scrollHeight, 0);
    }
  }
}

/* DOM Generation */
function genNoteItem(n, currentTag) {
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
  const elNoteText = elNoteLeft.appendChild(genNoteText(n, currentTag));

  // Edit button
  const elNoteEditBtn = document.createElement('button');
  elNoteEditBtn.className = 'noteEditBtn';
  elNoteEditBtn.textContent = '✎';
  elNoteEditBtn.title = 'Edit note';
  elNoteEditBtn.onclick = (ev) => {
    ev.stopPropagation();
    openEditModal(n, (updatedNote) => {
      // Update note item in place
      elNoteText.replaceWith(genNoteText(updatedNote, currentTag));
    });
  };
  elNoteItem.appendChild(elNoteEditBtn);

  // Delete button
  const elNoteDelBtn = document.createElement('button');
  elNoteDelBtn.className = 'noteDelBtn';
  elNoteDelBtn.textContent = '×';
  elNoteDelBtn.title = 'Delete note';
  elNoteDelBtn.onclick = async (ev) => {
    ev.stopPropagation();
    if (!confirm('Delete this note?')) return;
    const ok = await apiDelete(`/api/notes/${n.id}`);
    if (ok && ok.status === 'deleted') {
      console.log('Note deleted');
      elNoteItem.remove();
      await loadAndRenderTags();
    }
  };
  elNoteItem.appendChild(elNoteDelBtn);
  return elNoteItem
}
function genNoteText(n, currentTag) {
  const elNoteText = document.createElement('div');
  elNoteText.className = 'noteText';

  let noteText = n.text;
  let noteTags = extractTagsFromText(n.text, false);
  if (noteTags && noteTags.length) {
    noteTags.forEach(foundTag => {
      let foundTagText = foundTag;
      const lbl_class = getClassfromTag(foundTag);
      if(foundTag == currentTag) foundTagText = '●'
      let labelHtml = `<span
        class="lbl lbl-${lbl_class}"
        onclick="await addTagview('${foundTag}')"
        data-tag="${foundTag}">${foundTagText}</span>`;
      // Replace tag in text with label
      noteText = noteText.replace(new RegExp(foundTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), labelHtml);
    });
  }
  elNoteText.innerHTML = noteText;
  return elNoteText
}

/* DOM Manipulation */
async function addTagview(tag) {
  console.log('[fn] addTagview', tag);
  for (const col of elColumnsWrap.querySelectorAll('.column')) {
    if (col.dataset.key === tag) {
      console.log('Tagview already exists');
      activateTagview(tag);
      return;
    }
  }
  const lenTagsviewOld = elColumnsWrap.querySelectorAll('.column').length;
  const lenTagsviewNew = lenTagsviewOld + 1;

  // Pill
  const elPill = document.createElement('div');
  elPill.className = 'tabPill';
  elPill.dataset.key = tag;
  elPill.title = `${tag}`;
  elPill.onclick = () => activateTagview(tag);
  elTabsContainer.appendChild(elPill);

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
    removeTagview(tag);
  };
  elPill.appendChild(elPillCloseBtn);
  elPill.scrollIntoView({behavior:'smooth', inline:'start'});

  elColumnsWrap.style.gridTemplateColumns = `repeat(${lenTagsviewNew}, 1fr)`;

  // Column
  const elColumn = document.createElement('div');
  elColumn.className = 'column';
  elColumn.dataset.key = tag;
  elColumn.onclick = (ev) => {
    ev.stopPropagation();
    activateTagview(tag);
  }
  elColumnsWrap.appendChild(elColumn);

  // Content wrapper
  const elColCont = document.createElement('div');
  elColCont.className = 'column-content';
  elColCont.dataset.key = tag;
  elColumn.appendChild(elColCont);

  // Header
  const header = document.createElement('div');
  header.className = 'columnHeader';
  header.textContent = tag;
  elColCont.appendChild(header);

  // Buttons
  const btnWrap = document.createElement('span');
  btnWrap.style.float = 'right';
  btnWrap.style.display = 'flex';
  btnWrap.style.gap = '8px';
  header.appendChild(btnWrap);

  // Maximize button
  const maxBtn = document.createElement('button');
  maxBtn.textContent = '⛶';
  maxBtn.title = 'Maximize column';
  maxBtn.className = 'colMaxBtn';
  maxBtn.onclick = (ev) => {
    ev.stopPropagation();
    maximizeTab(tag);
  };
  btnWrap.appendChild(maxBtn);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.title = 'Close tab';
  closeBtn.className = 'colCloseBtn';
  closeBtn.onclick = (ev) => {
    ev.stopPropagation();
    removeTagview(tag);
  };
  btnWrap.appendChild(closeBtn);

  // Note list
  const elNoteList = document.createElement('div');
  elNoteList.className = 'notesList scrollable';
  elNoteList.textContent = 'Fetching notes...';
  elNoteList.style.color = '#777';
  elNoteList.style.padding = '10px';
  elColCont.appendChild(elNoteList);

  // Load notes for this tag
  const matched = await loadNotes(tag);
  console.log('[fn] addTagview - notes loaded', matched);
  if(matched.length === 0) {
    elNoteList.textContent = 'No notes';
  } else {
    elNoteList.textContent = '';
    matched.forEach(n => elNoteList.appendChild(genNoteItem(n, tag)) );
    setTimeout(() => {
      console.log('Scrolling note list to bottom', tag);
      elNoteList.scrollTop = elNoteList.scrollHeight;
    }, 0);
  }
  activateTagview(tag);
}
function removeTagview(tag) {
  console.log('[fn] removeTagview', tag);
  const elColToRemove = elColumnsWrap.querySelector(`.column[data-key="${tag}"]`);
  if (elColToRemove) elColToRemove.remove()
  const pill = elTabsContainer.querySelector(`.tabPill[data-key="${tag}"]`);
  if (pill) pill.remove();

  // check if there is no active tab, activate last tab if exists
  const activePill = elTabsContainer.querySelector('.tabPill.active');
  if (!activePill) {
    const allPills = elTabsContainer.querySelectorAll('.tabPill');
    if (allPills.length > 0) {
      const lastPill = allPills[allPills.length - 1];
      activateTagview(lastPill.dataset.key);
    }
  }

  const lenTagsviewOld = elColumnsWrap.querySelectorAll('.column').length + 1;
  const lenTagsviewNew = elColumnsWrap.querySelectorAll('.column').length;
  elColumnsWrap.style.gridTemplateColumns = `repeat(${lenTagsviewNew}, 1fr)`;
}
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
  elTreeList.innerHTML = '';

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
  tasks.forEach(note => {
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
    tagSpan.onclick = async () => await addTagview(node.tag);
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
        taskLi.textContent = '';
        console.log(note)
        if (note.duedate) {
          taskLi.textContent = note.duedate;
        }
        taskLi.textContent += note.text.length > 60 ? note.text.slice(0, 60) + '…' : note.text;
        taskLi.title = note.text;
        taskLi.onclick = async () => await addTagview(node.tag);
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

    // Append to parent UL or elTreeList
    if (parentUl) {
      parentUl.appendChild(li);
    } else {
      elTreeList.appendChild(li);
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
      taskLi.textContent = '';
      console.log(note)
      if (note.duedate) {
        taskLi.textContent = "" + note.duedate + "] ";
      }
      taskLi.textContent += note.text.length > 60 ? note.text.slice(0, 60) + '…' : note.text;
      taskLi.title = note.text;
      taskLi.onclick = async () => await addTagview(note.date);
      topUl.appendChild(taskLi);
    });
  }

  roots.forEach(root => renderNode(root, 0, topUl));
  elTreeList.appendChild(topUl);

  makeCollapsible('treeBox', 'treeCollapseBtn', elTreeList, 'Tree');
}
function renderTagsBox(){
  console.log('[fn] renderTagsBox', tags);
  elTagsList.innerHTML = '';
  
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
    elTagsList.appendChild(secDiv);
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
    span.onclick = async () => await addTagview(tag);
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
  makeCollapsible('tagsBox', 'tagsCollapseBtn', elTagsList, 'Tags');
}
function activateTagview(key){
  console.log('[fn] activateTagview', key);
  
  for(const el of document.querySelectorAll('.tabPill')) el.classList.remove('active');
  for(const el of document.querySelectorAll('.column')) el.classList.remove('active');
  const pill = document.querySelector(`.tabPill[data-key="${key}"]`);
  if(pill) {
    pill.scrollIntoView({behavior:'smooth', inline:'nearest', container: 'nearest'});
    pill.classList.add('active');
  }
  const col = document.querySelector(`.column[data-key="${key}"]`);
  if(col) {
    col.scrollIntoView({behavior:'smooth', inline:'start'});
    col.classList.add('active');
  }
}
function renderJournalBox() {
  elJournalList.innerHTML = '';

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
  elJournalList.appendChild(elJournalHeader);

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
      addTagview(dateStr);
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

  elJournalList.appendChild(elJournalTable);

  makeCollapsible('journalBox', 'journalCollapseBtn', elJournalList, 'Journal');
}
function maximizeTab(key) {
  console.log('[fn] maximizeTab', key);
  const col = document.querySelector(`.column[data-key="${key}"]`);
  if (!col) return;
  col.classList.toggle('maximized');
}

/* API calls */
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

/* Data management */
async function loadAndRenderTags(){
  tags = await apiGet("/api/tags");
  tasks = await apiGet("/api/tasks");
  renderTagsBox();
  renderTreeBox();
}
async function loadNotes(tag){
  console.log('[fn] loadNotes', tag);
  const category = getClassfromTag(tag);
  const anonTag = getAnonymizedTag(tag);
  const notes = await apiGet(`/api/notes/${category}/${anonTag}`);
  return notes;
}
async function saveNote(){
  const raw = elEditor.value.trim();
  if(!raw) return;
  const date = parseLeadingDate(raw) || (new Date()).toISOString().slice(0,10);
  const noteTags = extractTagsFromText(raw, false);

  const response = await apiPost("/api/notes", {
    text: raw,
    date,
    noteTags
  });
  console.log("API response:", response);
  if(!response || !response.note.id) {
    alert('Error saving note');
    return;
  }
  pushNote(response.note);

  rawWords = raw.split(/\s+/);
  const newRawWords = new Array();
  for (let w of rawWords) {
    if (w.startsWith('#') || w.startsWith('@') || w.startsWith('>') || w.startsWith('+')) {
      newRawWords.push(w);
    } else {
      break;
    }
  }
  elEditor.value = '';
  for (let w of newRawWords) {
    elEditor.value += w + ' ';
  }
  elEditor.focus();
  await loadAndRenderTags();
}

/* Modals */
let editModal = null;
function openEditModal(note, editCallback=null) {
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
    if(!updated || !updated.note.id || updated.status != 'patched') {
      alert('Error saving note');
      return;
    }
    editCallback?.(updated.note);
    await loadAndRenderTags();
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
elEditor.addEventListener('input', ()=>{
  clearTimeout(typingDebounce);
  typingDebounce = setTimeout(()=>{
    const txt = elEditor.value;
    const foundTags = extractTagsFromText(txt);
    foundTags.forEach(tag => addTagview(tag));
    const date = parseLeadingDate(txt);
    if(date) addTagview(date);
  }, 500);
});
elEditor.addEventListener('keydown', (ev)=>{
  if((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter'){
    ev.preventDefault();
    saveNote();
  }
});
elSaveBtn.addEventListener('click', saveNote);

/* Keyboard shortcuts */
document.addEventListener('keydown', (ev) => {
  if (ev.altKey && !ev.ctrlKey && !ev.shiftKey) {
    /* Alt + n --> focus on editor */
    if (ev.key.toLowerCase() === 'n') {
      ev.preventDefault();
      elEditor.focus();
    }
    /* Alt + t --> add today's journal entry */
    if (ev.key.toLowerCase() === 't') {
      ev.preventDefault();
      const today = new Date().toISOString().slice(0, 10);
      addTagview(today);
    }
    /* Alt + w --> close current tab */
    if (ev.key.toLowerCase() === 'w') {
      ev.preventDefault();
      removeTagview(document.querySelector('.tabPill.active')?.dataset.key);
    }
    /* Alt + 1..9 --> switch to tab */
    if (!isNaN(parseInt(ev.key, 10))) {
      ev.preventDefault();
      let evIndex = parseInt(ev.key, 10)-1;
      console.log('Numeric key pressed:', evIndex);
      const tabs = Array.from(document.querySelectorAll('.tabPill'));
      if (evIndex >= 0 && evIndex < tabs.length) {
        activateTagview(tabs[evIndex].dataset.key);
      }
    }
    /* Alt + Arrow left --> swith to arrow left */
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      // Activate previous tab if exists
      const tabs = Array.from(document.querySelectorAll('.tabPill'));
      const activeTab = document.querySelector('.tabPill.active')?.dataset.key;
      const currentIndex = tabs.findIndex(t => t.dataset.key === activeTab);
      if (currentIndex > 0) {
        activateTagview(tabs[currentIndex - 1].dataset.key);
      }
    }
    /* Alt + Arrow right --> swith to arrow right */
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      // Activate next tab if exists
      const tabs = Array.from(document.querySelectorAll('.tabPill'));
      const activeTab = document.querySelector('.tabPill.active')?.dataset.key;
      const currentIndex = tabs.findIndex(t => t.dataset.key === activeTab);
      if (currentIndex >= 0 && currentIndex < tabs.length - 1) {
        activateTagview(tabs[currentIndex + 1].dataset.key);
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


