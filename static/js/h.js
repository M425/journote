const h = {
  tagPattern: /(?:^|\s)([#@+>][A-Za-z0-9_.-]+)/g,

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

  async sortTagProperties(tag, order) {
    return api.sortTagProperties(tag, order);
  },

  getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return {
      firstDay: firstDay === 0 ? 6 : firstDay - 1,
      daysInMonth
    };
  },

  getNewTags(text, existingTags = mn.st.get('tags') || []) {
    const existingTagNames = new Set(existingTags.map(tag => tag.name));
    return h.extractTagsFromText(text, false).filter(
      tag => !existingTagNames.has(tag)
    );
  },

  updateTagDate(tag, newDate) { return api.updateTagDate(tag, newDate); },

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

  keyBindings(sourceobject, modifiers, shortcuts) {
    const binded = async (ev) => {
      if (ev.repeat) return;
      console.debug('Pressed key:',
          ev.code, ' | ',
          ev.altKey ? 'ALT ' : '',
          ev.ctrlKey ? 'CTRL ' : '',
          ev.shiftKey ? 'SHIFT ' : '');
      if(modifiers.includes('ALT') && !ev.altKey) return;
      if(!modifiers.includes('ALT') && ev.altKey) return;
      if(modifiers.includes('CTRL') && !ev.ctrlKey) return;
      if(!modifiers.includes('CTRL') && ev.ctrlKey) return;
      const action = Object.hasOwn(shortcuts, ev.code) ? shortcuts[ev.code]: null;
      if (!action) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      await action();
    };
    sourceobject.addEventListener('keydown', binded, { capture: true });
    return binded;
  }
}
export default h;