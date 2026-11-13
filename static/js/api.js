'use strict'
import h from './h.js'

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
    if(tag == "journal") {
      return api.api(`/api/notes`);
    }
    return api.api(`/api/notes/${this.tagPath(tag)}`);
  },

  getNote(id) {
    return api.api(`/api/notes/${encodeURIComponent(id)}`);
  },

  async setNote(args) {
    const response = await api.api(`/api/notes`,
      { method: 'PUT', body: args }
    );
    if (!response?.note?.id) { throw new Error('Error saving note'); }
    const {new_tags, removed_tags, status, status_parent, note} = response;
    return {new_tags, removed_tags, status, status_parent, note};
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
    return api.api(`/api/tags/${this.tagPath(tag)}`, {
      method: 'PATCH',
      body: changes
    });
  },

  updateTagDate(tag, date) {
    return this.updateTag(tag, {date});
  },

  updateTagVisibility(tag, treed) {
    return this.updateTag(tag, {
      treed,
      parent: tag.parent || '',
      content: tag.content || ''
    });
  },

  async previewProjectFile(tag, relative, signal) {
    const response = await fetch(`/api/tags/${this.tagPath(tag)}/folder/preview`, {
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
    return api.api(`/api/tags/${this.tagPath(tag)}/folder/${action}`, {
      method: 'POST',
      headers: {'X-Journote-Local': '1'},
      body
    });
  },

  // PROPRIETÀ DEI TAG

  getTagProperties(tag) {
    return api.api(`/api/tags/${this.tagPath(tag)}/properties`);
  },

  setTagProperty(tag, key, value) {
    return api.api(`/api/tags/${this.tagPath(tag)}/properties`, {
      method: 'PATCH',
      body: {key, value}
    });
  },

  sortTagProperties(tag, order) {
    return api.api(
      `/api/tags/${this.tagPath(tag)}/properties/order`,
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
}
export default api;