import mn from '../mini.js';

export default {
    mnContent () {
        return /*html*/ `
            <aside
                class="project-files"
                tabindex="-1"
                aria-label="File della scheda attiva"
            ></aside>
        `;
    },

    mnRender () {
        this.folderApi = createFolderApi(this.mnSignal);
        this.preview = createPreview(this.folderApi);

        this.mnCleanup(() => {
            this.preview.close();
            this.folderController?.abort();
        });

        this.el = this.mnDom.querySelector('.project-files');
        this.showFolder();
    },

    mnSubscribe () {
        return {
            'model-set-tagsActive': () => this.showFolder(),
            projectFolderRefresh: () => this.showFolder(),
            projectFolderFocus: () => this.el.focus(),

            projectFolderSelect: () => {
                this.showFolder(true);
                this.el.focus();
            }
        };
    },

    mnCss () {
        return /*css*/ `
            [mini-key="ProjectFolder"] {
                display: flex;
                flex: 1 1 auto;
                min-width: 0;
                min-height: 0;
            }

            [mini-key="ProjectFolder"] .project-files {
                display: flex;
                flex: 1 1 auto;
                min-width: 0;
                overflow: auto;
                color: var(--ink, #25332d);
                box-sizing: border-box;
            }

            [mini-key="ProjectFolder"] .project-files-session {
                display: flex;
                flex: 1 1 auto;
                flex-direction: column;
                min-width: 0;
                --pf-date-width: 165px;
            }

            [mini-key="ProjectFolder"] .project-files-title {
                font-size: 1rem;
                overflow-wrap: anywhere;
            }

            [mini-key="ProjectFolder"] .project-files-tree,
            [mini-key="ProjectFolder"] .project-files-children {
                display: block;
                list-style: none;
                padding: 0;
                margin: 0;
                width: 100%;
            }

            [mini-key="ProjectFolder"] .project-files-node,
            [mini-key="ProjectFolder"] details.project-files-folder {
                display: block;
                margin: 0;
                padding: 0;
                border: 0;
                min-width: 0;
                width: 100%;
                background: transparent;
                box-shadow: none;
            }

            [mini-key="ProjectFolder"] .project-files-detail-header,
            [mini-key="ProjectFolder"] .project-files-row {
                display: grid;
                /*grid-template-columns: minmax(0, 1fr) var(--pf-date-width);*/
                grid-template-rows: auto;
                align-items: center;
                column-gap: 8px;
                width: 100%;
                box-sizing: border-box;
                margin: 0;
                padding: 2px 5px;
            }

            [mini-key="ProjectFolder"] .project-files-row {
                border: 0;
                border-radius: 0;
                background: transparent;
                color: inherit;
                text-align: left;
                cursor: pointer;
                font: inherit;
                list-style: none;
            }

            /* Evita celle aggiuntive generate dal CSS globale di summary. */
            [mini-key="ProjectFolder"] .project-files-row::before,
            [mini-key="ProjectFolder"] .project-files-row::after {
                content: none !important;
                display: none !important;
            }

            [mini-key="ProjectFolder"] summary.project-files-row::marker {
                content: '';
            }

            [mini-key="ProjectFolder"] summary.project-files-row::-webkit-details-marker {
                display: none;
            }

            [mini-key="ProjectFolder"] .project-files-row:hover {
                background: var(--accent-soft, #e1eee7);
            }

            [mini-key="ProjectFolder"] .project-files-row > .project-files-name-cell {
                grid-column: 1;
                grid-row: 1;
                display: flex;
                flex-direction: row;
                justify-content: flex-start;
                align-items: center;
                justify-self: stretch;
                gap: 7px;
                min-width: 0;
                margin: 0;
                text-align: left;
                overflow: hidden;
            }

            [mini-key="ProjectFolder"] .project-files-name-cell::before {
                content: '';
                display: inline-block;
                flex: 0 0 10px;
                width: 10px;
                text-align: center;
            }

            [mini-key="ProjectFolder"] summary.project-files-row > .project-files-name-cell::before {
                content: '›';
            }

            [mini-key="ProjectFolder"] details[open] > summary.project-files-row > .project-files-name-cell::before {
                transform: rotate(90deg);
            }

            [mini-key="ProjectFolder"] .project-files-name {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            [mini-key="ProjectFolder"] .project-files-icon {
                flex: 0 0 18px;

                &.fa-folder-open { color: #cbc32b; }
                &.fa-folder { color: #cbc32b; }
                &.fa-file-pdf { color: #c53232; }
                &.fa-file-zipper { color: #856c27; }
                &.fa-file-word { color: #19187e; }
                &.fa-file-excel { color: #187e42; }
                &.fa-file-powerpoint { color: #b38022; }
                &.fa-file-image { color: #6d187e; }
                &.fa-file-audio {}
                &.fa-file-video {}
                &.fa-file-zipper {}
                &.fa-file-code {}
                &.fa-file-lines {}
            }

            [mini-key="ProjectFolder"] .project-files-row > .project-files-modified {
                grid-column: 2;
                grid-row: 1;
                justify-self: end;
                margin: 0;
                padding: 0;
                font-size: .8rem;
                font-variant-numeric: tabular-nums;
                white-space: nowrap;
                text-align: right;
                color: var(--muted, #68766f);
            }

            [mini-key="ProjectFolder"] .project-files-detail-header {
                border-bottom: 1px solid var(--border, #d8e2dc);
            }

            [mini-key="ProjectFolder"] .project-files-detail-header button {
                min-width: 0;
                margin: 0;
                padding: 4px 0;
                border: 0;
                background: transparent;
                color: inherit;
                text-align: left;
                font: inherit;
                font-weight: 600;
                cursor: pointer;
            }

            [mini-key="ProjectFolder"] .project-files-detail-header button:first-child {
                grid-column: 1;
                grid-row: 1;
            }

            [mini-key="ProjectFolder"] .project-files-detail-header button:last-child {
                grid-column: 2;
                grid-row: 1;
                text-align: right;
            }

            [mini-key="ProjectFolder"] .project-files-detail-header button:focus-visible,
            [mini-key="ProjectFolder"] .project-files-row:focus-visible {
                outline: 2px solid var(--accent, #286b56);
                outline-offset: -2px;
            }

            [mini-key="ProjectFolder"] .project-files-path,
            [mini-key="ProjectFolder"] .project-files-status {
                font-size: .8rem;
                overflow-wrap: anywhere;
            }

            [mini-key="ProjectFolder"] .project-files-toolbar,
            [mini-key="ProjectFolder"] .project-files-actions {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                margin: 8px 0;
            }

            [mini-key="ProjectFolder"] .project-files-path-form {
                display: flex;
                gap: 6px;
            }

            [mini-key="ProjectFolder"] .project-files-path-input {
                min-width: 0;
                flex: 1;
            }

            [mini-key="ProjectFolder"] .project-files-filter {
                margin: 8px 0;
            }

            [mini-key="ProjectFolder"] .project-files-filter-input {
                display: block;
                box-sizing: border-box;
                width: 100%;
                min-width: 0;
                margin-top: 4px;
                padding: 6px 8px;
                color: var(--ink, #25332d);
                background: var(--paper, white);
                border: 1px solid var(--border, #d8e2dc);
                border-radius: 4px;
            }

            [mini-key="ProjectFolder"] .project-files-filter-input[aria-invalid="true"] {
                border-color: var(--c-error, #d34e4e);
            }

            [mini-key="ProjectFolder"] .project-files-filter-status {
                margin: 4px 0;
                padding: 0 10px;
                font-size: .8rem;
                overflow-wrap: anywhere;
            }

            [mini-key="ProjectFolder"] .project-files-path-form[hidden],
            [mini-key="ProjectFolder"] .project-files-filter[hidden],
            [mini-key="ProjectFolder"] .project-files-node[hidden],
            [mini-key="ProjectFolder"] .project-files-detail-header[hidden] {
                display: none;
            }

            .project-file-preview {
                box-sizing: border-box;
                width: min(1000px, 94vw);
                max-height: 90vh;
                padding: 16px;
                background: var(--paper, white);
                color: var(--ink, #25332d);
                border: 1px solid var(--border, #d8e2dc);
                border-radius: 10px;
            }

            .project-file-preview::backdrop {
                background: #0008;
            }

            .project-preview-header {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
            }

            .project-preview-header h2 {
                flex: 1;
                font-size: 1rem;
                overflow-wrap: anywhere;
            }

            .project-preview-body {
                overflow: auto;
            }

            .project-preview-body img,
            .project-preview-body video {
                display: block;
                max-width: 100%;
                max-height: 65vh;
                margin: auto;
            }

            .project-preview-body object {
                display: block;
                width: 100%;
                height: 65vh;
            }

            .project-preview-body audio {
                width: 100%;
            }

            .project-preview-text {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
            }
        `;
    },

    fileType(name) {
        const extension = name.includes('.')
            ? name.split('.').pop().toLowerCase()
            : '';

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

        const match = types.find(([extensions]) =>
            extensions.split(' ').includes(extension)
        );

        return match
            ? { icon: match[1], label: match[2] }
            : { icon: 'file', label: 'File' };
    },

    icon(name, label) {
        return mn.vu.el('i', {
            className: `project-files-icon fa-solid fa-fw fa-${name}`,
            'aria-hidden': 'true',
            title: label
        });
    },

    createQuickFilter(list) {
        const input = mn.vu.el('input', {
            type: 'search',
            className: 'project-files-filter-input',
            placeholder: 'Cerca...',
            autocomplete: 'off',
            spellcheck: false,
            'aria-label': 'Filtra file e cartelle con una regex'
        });

        const message = mn.vu.el('p', {
            className: 'project-files-filter-status',
            role: 'status',
            'aria-live': 'polite'
        });

        const dom = mn.vu.el('div', {
            className: 'project-files-filter'
        }, [
            mn.vu.el('label', {}, [input]),
            message
        ]);

        let expansion = new WeakMap();
        let searching = false;

        const refresh = () => {
            let regex = null;
            let error = false;

            try {
                if (input.value !== '') {
                    regex = new RegExp(input.value, 'i');
                }
            } catch {
                error = true;
            }

            input.setAttribute('aria-invalid', String(error));

            const items = Array.from(
                list.querySelectorAll('[data-entry-name]')
            );

            const folders = Array.from(
                list.querySelectorAll('details.project-files-folder')
            );

            // Salva lo stato delle cartelle prima della ricerca.
            if (regex) {
                for (const folder of folders) {
                    if (!expansion.has(folder)) {
                        expansion.set(folder, folder.open);
                    }
                }

                searching = true;
            } else if (searching) {
                // Ripristina lo stato precedente quando il filtro viene tolto.
                for (const folder of folders) {
                    if (expansion.has(folder)) {
                        folder.open = expansion.get(folder);
                    }
                }

                expansion = new WeakMap();
                searching = false;
            }

            let matches = 0;

            const incomplete = items.filter(
                item => item.dataset.loadError
            ).length;

            for (const item of items) {
                const matched =
                    !regex || regex.test(item.dataset.entryName);

                item.hidden = !matched;

                if (matched) matches++;
            }

            // Rende visibili e apre gli antenati dei risultati.
            for (const item of items.reverse()) {
                if (item.hidden) continue;

                const parent =
                    item.parentElement?.closest('[data-entry-name]');

                if (parent && list.contains(parent)) {
                    parent.hidden = false;

                    if (regex) {
                        const folder = Array.from(parent.children)
                            .find(child => child.tagName === 'DETAILS');

                        if (folder) folder.open = true;
                    }
                }
            }

            message.textContent = error
                ? 'Regex non valida!'
                : regex
                    ? `${matches} / ${items.length}.`
                    : 'Cerca...';

            if (incomplete) {
                message.textContent +=
                    ` Ricerca parziale: ${incomplete} cartelle non caricate.`;
            }
        };

        input.addEventListener('input', refresh);

        input.addEventListener('keydown', ev => {
            ev.stopPropagation();

            if (ev.key === 'Escape') {
                ev.preventDefault();
                input.value = '';
                refresh();
            }
        });

        const reset = () => {
            expansion = new WeakMap();
            searching = false;
            input.disabled = true;
            message.textContent = 'Caricamento ricorsivo in corso…';
        };

        const ready = () => {
            input.disabled = false;
            refresh();
        };

        refresh();

        return { dom, refresh, reset, ready };
    },

    modifiedTime(entry) {
        let time = NaN;

        if (
            typeof entry.modified_at === 'string' &&
            entry.modified_at
        ) {
            time = Date.parse(entry.modified_at);
        }

        if (
            !Number.isFinite(time) &&
            typeof entry.mtime === 'number'
        ) {
            time = entry.mtime * 1000;
        }

        return Number.isFinite(time) && Math.abs(time) <= 8.64e15
            ? time
            : null;
    },

    detailCells(entry, icon, depth = 0) {
        const time = this.modifiedTime(entry);
        const date = time === null ? null : new Date(time);

        return [
            mn.vu.el('span', {
                className: 'project-files-name-cell',
                style: {
                    paddingLeft: `${depth * 16}px`
                }
            }, [
                icon,
                mn.vu.el('span', {
                    className: 'project-files-name',
                    textContent: entry.name
                })
            ]),

            mn.vu.el('time', {
                className: 'project-files-modified',
                dateTime: date ? date.toISOString() : '',

                textContent: date
                    ? date.toLocaleString('it-IT', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                    : '—',

                title: date
                    ? date.toLocaleString('it-IT')
                    : 'Data di modifica non disponibile'
            })
        ];
    },

    createDetailsHeader(list) {
        let key = null;
        let direction = 0;

        const collator = new Intl.Collator('it', {
            numeric: true,
            sensitivity: 'base'
        });

        const dom = mn.vu.el('div', {
            className: 'project-files-detail-header',
            role: 'group',
            'aria-label': 'Ordina file e cartelle'
        });

        const buttons = [];

        const apply = () => {
            const lists = [
                list,
                ...list.querySelectorAll('.project-files-children')
            ];

            for (const parent of lists) {
                const items = Array.from(parent.children)
                    .filter(item =>
                        item.hasAttribute('data-entry-name')
                    );

                items.sort((a, b) => {
                    const original =
                        Number(a.dataset.originalIndex) -
                        Number(b.dataset.originalIndex);

                    if (!direction) return original;

                    let comparison;

                    if (key === 'name') {
                        comparison = collator.compare(
                            a.dataset.entryName,
                            b.dataset.entryName
                        );
                    } else {
                        const av = a.dataset.modifiedTime;
                        const bv = b.dataset.modifiedTime;

                        if (av === '' || bv === '') {
                            return av === bv
                                ? original
                                : av === '' ? 1 : -1;
                        }

                        comparison = Number(av) - Number(bv);
                    }

                    return comparison * direction || original;
                });

                items.forEach(item => parent.appendChild(item));
            }
        };

        const updateHeaders = () => {
            for (const item of buttons) {
                const current =
                    item.key === key ? direction : 0;

                const symbol =
                    current === 1 ? ' ↑' :
                    current === -1 ? ' ↓' : ' ↕';

                const state =
                    current === 1 ? 'crescente' :
                    current === -1 ? 'decrescente' : 'neutro';

                const next =
                    current === 0 ? 'crescente' :
                    current === 1 ? 'decrescente' : 'neutro';

                item.button.textContent = item.label + symbol;

                item.button.setAttribute(
                    'aria-label',
                    `${item.label}: ${state}. Clicca per ordine ${next}.`
                );

                item.button.setAttribute(
                    'aria-pressed',
                    String(current !== 0)
                );
            }
        };

        for (const [column, label] of [
            ['name', 'Nome'],
            ['modified', 'Mod']
        ]) {
            const button = mn.vu.el('button', {
                type: 'button',

                onclick: () => {
                    direction =
                        key !== column ? 1 :
                        direction === 1 ? -1 :
                        direction === -1 ? 0 : 1;

                    key = direction ? column : null;

                    apply();
                    updateHeaders();
                }
            });

            buttons.push({
                key: column,
                label,
                button
            });

            dom.appendChild(button);
        }

        updateHeaders();

        return { dom, apply };
    },

    async loadTree(entries, tag, signal, onProgress = () => {}) {
        const roots = entries.map(entry => ({ ...entry }));
        const queue = roots.filter(entry => entry.directory);
        const visited = new Set();

        let completed = 0;
        let errors = 0;
        let count = roots.length;

        // Carica solo metadati, con quattro richieste alla volta.
        while (queue.length) {
            signal.throwIfAborted();

            const batch = queue.splice(0, 4);

            await Promise.all(batch.map(async entry => {
                signal.throwIfAborted();

                const path = String(entry.path);

                if (visited.has(path)) {
                    entry.children = [];
                    entry.loadError = 'Percorso già visitato.';
                    errors++;
                    return;
                }

                visited.add(path);

                try {
                    const result = await this.folderApi.projectFolder(
                        tag,
                        'files',
                        { relative: entry.path },
                        signal
                    );

                    signal.throwIfAborted();

                    entry.children = result.entries.map(child => ({
                        ...child
                    }));

                    count += entry.children.length;

                    queue.push(
                        ...entry.children.filter(child => child.directory)
                    );
                } catch (error) {
                    if (signal.aborted || error.name === 'AbortError') {
                        throw error;
                    }

                    entry.children = [];
                    entry.loadError = error.message;
                    errors++;
                } finally {
                    completed++;

                    if (!signal.aborted) {
                        onProgress({ completed, count, errors });
                    }
                }
            }));
        }

        signal.throwIfAborted();

        return {
            entries: roots,
            count,
            errors
        };
    },

    appendTree(list, entries, tag, depth = 0) {
        for (const [index, entry] of entries.entries()) {
            const item = list.appendChild(mn.vu.el('li', {
                className: 'project-files-node',

                dataset: {
                    entryName: entry.name,
                    originalIndex: index,
                    modifiedTime: this.modifiedTime(entry) ?? ''
                }
            }));

            if (!entry.directory) {
                const type = this.fileType(entry.name);

                item.appendChild(mn.vu.el('button', {
                    type: 'button',
                    className: 'project-files-row project-files-file',
                    title: `Anteprima: ${entry.name}`,
                    'aria-label': `Anteprima: ${entry.name}`,
                    onclick: () => this.preview.open(tag, entry)
                }, this.detailCells(
                    entry,
                    this.icon(type.icon, type.label),
                    depth
                )));

                continue;
            }

            const folder = item.appendChild(mn.vu.el('details', {
                className: 'project-files-folder'
            }));

            const summary = folder.appendChild(mn.vu.el('summary', {
                className: 'project-files-row',
                title: entry.name
            }));

            const icon = this.icon('folder', 'Cartella');

            summary.append(
                ...this.detailCells(entry, icon, depth)
            );

            const children = folder.appendChild(mn.vu.el('ul', {
                className: 'project-files-children'
            }));

            // L'apertura non effettua più richieste: l'albero è già caricato.
            folder.addEventListener('toggle', () => {
                icon.classList.toggle('fa-folder-open', folder.open);
                icon.classList.toggle('fa-folder', !folder.open);
            });

            if (entry.loadError) {
                item.dataset.loadError = 'true';

                children.appendChild(mn.vu.el('li', {
                    className: 'project-files-message',
                    textContent:
                        `Cartella non caricata: ${entry.loadError}. Premi Aggiorna per riprovare.`
                }));
            } else if (!entry.children?.length) {
                children.appendChild(mn.vu.el('li', {
                    className: 'project-files-message',
                    textContent: 'Cartella vuota.'
                }));
            } else {
                this.appendTree(
                    children,
                    entry.children,
                    tag,
                    depth + 1
                );
            }
        }
    },

    showFolder(selecting = false) {
        this.folderController?.abort();
        this.preview.close();

        if (!this.mnIsActive()) return;

        const tag = mn.st.get('tagsActive');

        const panel = mn.vu.el('section', {
            className: 'project-files-session'
        });

        this.el.replaceChildren(panel);

        if (!tag || typeof tag !== 'string' || !tag.startsWith('#')) {
            panel.appendChild(mn.vu.el('h2', {
                textContent: 'File del progetto'
            }));

            panel.appendChild(mn.vu.el('p', {
                textContent:
                    'Seleziona una scheda progetto per visualizzare i file.'
            }));

            return;
        }

        const title = panel.appendChild(mn.vu.el('h2', {
            className: 'project-files-title'
        }));

        const pathForm = panel.appendChild(mn.vu.el('form', {
            className: 'project-files-path-form'
        }));

        const pathInput = pathForm.appendChild(mn.vu.el('input', {
            type: 'text',
            'aria-label': 'Percorso cartella',
            placeholder: 'C:\\Progetti',
            className: 'project-files-path-input'
        }));

        pathForm.appendChild(mn.vu.el('button', {
            type: 'submit',
            className: 'btn standard',
            textContent: 'Vai'
        }));

        const pathLabel = panel.appendChild(mn.vu.el('p', {
            className: 'project-files-path'
        }));

        const toolbar = panel.appendChild(mn.vu.el('div', {
            className: 'project-files-toolbar'
        }));

        const status = panel.appendChild(mn.vu.el('p', {
            className: 'project-files-status',
            role: 'status',
            'aria-live': 'polite'
        }));

        const list = panel.appendChild(mn.vu.el('ul', {
            className: 'project-files-tree',
            'aria-label': 'File e cartelle'
        }));

        const filter = this.createQuickFilter(list);
        const details = this.createDetailsHeader(list);

        list.before(filter.dom, details.dom);

        const refreshTree = () => {
            details.apply();
            filter.refresh();
        };

        const actions = panel.appendChild(mn.vu.el('div', {
            className: 'project-files-actions'
        }));

        let currentPath = null;
        let currentRelative = '';
        let generation = 0;
        let saving = false;

        const button = (parent, title, icon, handler) =>
            parent.appendChild(mn.vu.el('button', {
                type: 'button',
                className: 'btn standard',
                title: title,
                onclick: handler
            }, mn.vu.el('i', {
                className: 'fa fa-fw fa-' + icon
            })));

        const save = button(actions, 'Save', 'link', async () => {
            if (!currentPath || saving) return;

            saving = true;
            save.disabled = true;
            pathInput.disabled = true;

            try {
                const linkedPath = currentPath;

                await this.folderApi.projectFolder(
                    tag,
                    'link',
                    { path: linkedPath }
                );

                try {
                    await mn.st.reload('tags');

                    await mn.ev.pub('projectFolderLinked', {
                        tag,
                        path: linkedPath
                    });
                } catch (error) {
                    mn.ev.pub('notify', {
                        msg: `Cartella salvata; aggiornamento metadati fallito: ${error.message}`,
                        status: 'error'
                    });
                }

                if (this.mnIsActive() && panel.isConnected) {
                    selecting = false;
                    saving = false;
                    await load('');
                }
            } catch (error) {
                if (this.mnIsActive() && panel.isConnected) {
                    status.textContent = error.message;
                }
            } finally {
                saving = false;
                pathInput.disabled = false;
                save.disabled = !currentPath;
            }
        });

        const cancel = button(actions, 'Clear', 'ban', () => {
            if (saving) return;

            selecting = false;
            load('');
        });

        const load = async path => {
            if (
                saving ||
                !this.mnIsActive() ||
                !panel.isConnected
            ) return;

            const requestGeneration = ++generation;

            this.folderController?.abort();

            const controller =
                this.folderController = new AbortController();

            const signal = controller.signal;

            currentPath = null;
            save.disabled = true;
            save.hidden = !selecting;
            cancel.hidden = !selecting;
            pathForm.hidden = !selecting;
            filter.dom.hidden = selecting;
            details.dom.hidden = selecting;

            title.textContent =
                `${selecting ? 'Collega cartella' : 'File del progetto'} — ${tag}`;

            status.textContent = 'Caricamento…';

            list.replaceChildren();
            filter.reset();
            toolbar.replaceChildren();
            pathLabel.textContent = '';

            try {
                const result = await this.folderApi.projectFolder(
                    tag,
                    selecting ? 'browse' : 'files',
                    selecting ? { path } : { relative: path },
                    signal
                );

                if (
                    signal.aborted ||
                    requestGeneration !== generation ||
                    !this.mnIsActive() ||
                    !panel.isConnected
                ) return;

                currentPath = result.path;
                currentRelative = result.relative || '';

                pathLabel.textContent =
                    result.path || 'Seleziona un disco';

                pathInput.value = result.path || '';
                save.disabled = !currentPath || saving;

                if (selecting && result.parent !== null) {
                    button(
                        toolbar,
                        'Parent',
                        'arrow-up',
                        () => load(result.parent)
                    );
                }

                if (selecting) {
                    button(toolbar, 'Disk', 'hard-drive', () => load(''));
                } else {
                    button(toolbar, 'Switch', 'right-left', () => {
                        if (saving) return;

                        selecting = true;
                        load(currentPath || '');
                    });
                }

                button(toolbar, 'Refresh', 'rotate', () =>
                    load(
                        selecting
                            ? currentPath || ''
                            : currentRelative
                    )
                );

                if (selecting) {
                    // La scelta della cartella rimane navigabile
                    // un livello alla volta.
                    for (const entry of result.entries) {
                        const row = list.appendChild(mn.vu.el('li'));

                        row.appendChild(mn.vu.el('button', {
                            type: 'button',
                            className:
                                'project-files-row project-files-choose',
                            onclick: () => load(entry.path)
                        }, this.detailCells(
                            entry,
                            this.icon('folder', 'Cartella')
                        )));
                    }
                } else {
                    // Per il progetto collegato legge subito tutto l'albero.
                    const tree = await this.loadTree(
                        result.entries,
                        tag,
                        signal,
                        progress => {
                            if (
                                requestGeneration !== generation ||
                                !this.mnIsActive() ||
                                !panel.isConnected
                            ) return;

                            status.textContent =
                                `Caricamento: ${progress.completed} cartelle lette, ${progress.count} elementi trovati…`;
                        }
                    );

                    if (
                        signal.aborted ||
                        requestGeneration !== generation ||
                        !this.mnIsActive() ||
                        !panel.isConnected
                    ) return;

                    this.appendTree(list, tree.entries, tag);

                    refreshTree();
                    filter.ready();

                    status.textContent = result.linked === false
                        ? 'Nessuna cartella collegata.'
                        : `${tree.count} elementi complessivi${
                            tree.errors
                                ? ` — ${tree.errors} cartelle non caricate`
                                : ''
                        }`;

                    return;
                }

                status.textContent =
                    !selecting && result.linked === false
                        ? 'Nessuna cartella collegata.'
                        : result.entries.length
                            ? `${result.entries.length} elementi`
                            : 'Cartella vuota.';
            } catch (error) {
                if (
                    signal.aborted ||
                    requestGeneration !== generation ||
                    !this.mnIsActive() ||
                    !panel.isConnected
                ) return;

                status.textContent = error.message;

                if (selecting) {
                    button(toolbar, 'Dischi', 'hard-drive', () => load(''));
                } else {
                    button(toolbar, 'Collega o cambia cartella', 'right-left', () => {
                        if (saving) return;

                        selecting = true;
                        load('');
                    });
                }
            }
        };

        pathForm.onsubmit = ev => {
            ev.preventDefault();
            load(pathInput.value);
        };

        pathInput.oninput = () => {
            generation++;
            this.folderController?.abort();
            currentPath = null;
            save.disabled = true;
        };

        pathInput.addEventListener('keydown', ev => {
            ev.stopPropagation();
        });

        const project = (mn.st.get('tags') || [])
            .find(item => item.name === tag);

        const linkedPath = project?.properties
            ?.find(item => item.key === 'local_folder')
            ?.value || '';

        load(selecting ? linkedPath : '');

        if (selecting) pathInput.focus();
    }
};

function createFolderApi(signal) {
    const endpoint = (tag, action) => {
        if (typeof tag !== 'string' || !tag.startsWith('#')) {
            throw new Error('Progetto non valido.');
        }

        return `/api/tags/Projects/${encodeURIComponent(tag.slice(1))}/folder/${action}`;
    };

    async function request(tag, action, body, requestSignal = signal) {
        const response = await fetch(endpoint(tag, action), {
            method: 'POST',
            signal: requestSignal,
            headers: {
                'Content-Type': 'application/json',
                'X-Journote-Local': '1'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));

            throw new Error(
                error.error?.message ||
                `Richiesta fallita (${response.status}).`
            );
        }

        return response;
    }

    return {
        async projectFolder(
            tag,
            action,
            body = {},
            requestSignal = signal
        ) {
            const response = await request(
                tag,
                action,
                body,
                requestSignal
            );

            return response.status === 204
                ? null
                : response.json();
        },

        async previewProjectFile(tag, relative, previewSignal) {
            const response = await request(
                tag,
                'preview',
                { relative },
                previewSignal
            );

            return {
                kind: response.headers.get('X-Journote-Preview'),
                blob: await response.blob()
            };
        }
    };
}

function createPreview(api) {
    return {
        el: null,

        close() {
            this.el?.close();
            this.cleanup?.();
        },

        async open(tag, entry) {
            this.close();

            const previousFocus = document.activeElement;
            const controller = new AbortController();

            let objectURL = null;
            let cleaned = false;

            const dialog = mn.vu.el('dialog', {
                className: 'project-file-preview',
                'aria-label': entry.name
            });

            this.el = dialog;

            const header = dialog.appendChild(mn.vu.el('header', {
                className: 'project-preview-header'
            }));

            header.appendChild(mn.vu.el('h2', {
                textContent: entry.name
            }));

            const openStatus = mn.vu.el('p', {
                className: 'project-preview-status',
                role: 'status',
                'aria-live': 'polite',
                hidden: true
            });

            let opening = false;

            const openButton = header.appendChild(mn.vu.el('button', {
                type: 'button',
                className: 'btn standard',
                textContent: 'Apri nell’app predefinita',

                onclick: async () => {
                    if (opening) return;

                    opening = true;
                    openButton.disabled = true;
                    openStatus.hidden = false;
                    openStatus.textContent = 'Richiesta di apertura…';

                    try {
                        await api.projectFolder(
                            tag,
                            'open',
                            { relative: entry.path }
                        );

                        if (dialog.open) {
                            openStatus.textContent =
                                'Richiesta di apertura inviata a Windows.';
                        }
                    } catch (error) {
                        if (dialog.open) {
                            openStatus.textContent = error.message;
                        }
                    } finally {
                        opening = false;
                        openButton.disabled = false;
                    }
                }
            }));

            const close = header.appendChild(mn.vu.el('button', {
                type: 'button',
                className: 'btn standard',
                textContent: 'Chiudi',
                'aria-label': 'Chiudi anteprima',
                onclick: () => dialog.close()
            }));

            const status = dialog.appendChild(mn.vu.el('p', {
                className: 'project-preview-status',
                role: 'status',
                textContent: 'Caricamento anteprima…'
            }));

            dialog.appendChild(openStatus);

            const body = dialog.appendChild(mn.vu.el('div', {
                className: 'project-preview-body'
            }));

            dialog.addEventListener('keydown', ev => {
                ev.stopPropagation();
            });

            const cleanup = () => {
                if (cleaned) return;

                cleaned = true;
                controller.abort();

                for (const media of body.querySelectorAll('audio, video')) {
                    media.pause();
                    media.removeAttribute('src');
                    media.load();
                }

                body.replaceChildren();

                if (objectURL) {
                    URL.revokeObjectURL(objectURL);
                }

                dialog.remove();

                if (this.el === dialog) {
                    this.el = null;
                    this.cleanup = null;

                    if (previousFocus?.isConnected) {
                        previousFocus.focus();
                    }
                }
            };

            this.cleanup = cleanup;

            dialog.addEventListener('close', cleanup, {
                once: true
            });

            document.body.appendChild(dialog);
            dialog.showModal();
            close.focus();

            try {
                const result = await api.previewProjectFile(
                    tag,
                    entry.path,
                    controller.signal
                );

                if (!dialog.open || this.el !== dialog) return;

                if (result.kind === 'text') {
                    const text = await result.blob.text();

                    if (!dialog.open || this.el !== dialog) return;

                    body.appendChild(mn.vu.el('pre', {
                        className: 'project-preview-text',
                        textContent: text
                    }));

                    status.textContent = 'Anteprima testo';
                    return;
                }

                if (!['image', 'pdf', 'audio', 'video'].includes(result.kind)) {
                    throw new Error(
                        'Anteprima non disponibile per questo formato.'
                    );
                }

                objectURL = URL.createObjectURL(result.blob);

                let content;

                if (result.kind === 'image') {
                    content = mn.vu.el('img', {
                        src: objectURL,
                        alt: entry.name
                    });
                } else if (result.kind === 'pdf') {
                    content = mn.vu.el('object', {
                        data: objectURL,
                        type: 'application/pdf',
                        'aria-label': `Anteprima PDF: ${entry.name}`
                    }, [
                        mn.vu.el('p', {
                            textContent:
                                'Anteprima PDF non disponibile in questo browser.'
                        })
                    ]);
                } else {
                    content = mn.vu.el(result.kind, {
                        src: objectURL,
                        controls: true,
                        preload: 'metadata'
                    });
                }

                content.addEventListener('error', () => {
                    status.textContent =
                        'Il browser non riesce a visualizzare questo formato o il file è danneggiato.';
                });

                body.appendChild(content);

                status.textContent = result.kind === 'pdf'
                    ? 'Anteprima PDF — richiede il visualizzatore PDF del browser.'
                    : 'Anteprima locale';
            } catch (error) {
                if (
                    !dialog.open ||
                    this.el !== dialog ||
                    error.name === 'AbortError'
                ) return;

                status.textContent = error.message;
            }
        }
    };
}