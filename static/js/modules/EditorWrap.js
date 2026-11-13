'use strict';
import mn from "../mini.js";
import api from "../api.js";
import h from "../h.js";

// Condivisa fra le istanze; tutte le altre risorse appartengono alla vista.
let monacoLoading;

export default {

    mnCss () {
        return /*css*/ `
        #EditorWrap {
            flex: 0 0 auto;
            min-height: 0;
            align-items: stretch;
            gap: 10px;
            flex-direction: row;
            padding: 6px 6px 6px 0px;
            display: flex;
            background: var(--paper);
            border-top: 5px solid var(--accent-soft);

            #EditorWrapIn {
                min-width: 0;
                flex: 1 1 auto;
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-height: 0;
                min-width: 0;

                #EditorCtrl {
                    height: auto;
                    gap: 3px;
                    display: flex;
                    flex-direction: row;
                    flex-grow: unset;
                    padding: 0px 10px;
                }

                #Editor {
                    color: var(--ink);
                    font-size: 0.95rem;
                    line-height: 1.5;
                    display: flex;
                    background: var(--paper);
                    outline: none;
                    flex: 0 0 120px;
                    height: 120px;
                    min-height: 0;
                    overflow: hidden;

                    &:focus {
                        border-color: #86ad96;
                    }

                    &:focus-within {
                        border-color: var(--border);
                    }

                    .monaco-editor {
                        outline: none;

                        .reply-reference-bg {
                            background-color: #e0e7ff;
                            color: #3730a3 !important;
                            border-radius: 4px;
                        }

                        &.monaco-component.vs {
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 0;
                            height: 0;
                            overflow: visible;
                            z-index: 1000;
                        }
                    }

                    .jn-project {
                        color: var(--c-project) !important;
                        background-color: var(--c-project-l);
                        border-radius: 3px;
                    }

                    .jn-event {
                        color: var(--c-event) !important;
                        background-color: var(--c-event-l);
                        border-radius: 3px;
                    }

                    .jn-generic {
                        color: var(--c-generic) !important;
                        background-color: var(--c-generic-l);
                        border-radius: 3px;
                    }

                    .jn-person {
                        color: var(--c-person) !important;
                        background-color: var(--c-person-l);
                        border-radius: 3px;
                    }

                    .editor-hint {
                        margin: 2px 0 0;
                        color: var(--muted);
                        font-size: 0.75rem;
                        line-height: 1.5;
                        opacity: 1;
                        overflow-wrap: anywhere;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 8px;
                    }

                    .editor-hint {
                        .editor-hint-text {
                            flex: 1 1 auto;
                            min-width: 0;
                        }
                    }
                }
            }
        }
        `;
    },

    mnLoad () {
        this.currentNote = null;
        this.pendingImageUploads = 0;
        this.saving = false;
        this.monacoEditor = null;
    },

    mnContent () {
        return /*html*/ `
            <div id="EditorWrapIn">
                <div
                    id="Editor"
                    class="journote-code-editor"
                    style="min-height: 150px"
                ></div>
                <div id="EditorCtrl">
                    <button style="display: none" type="button" id="editorSaveBtn">
                        <i class="primary fa fa-fw fa-save"></i>
                    </button>
                    <button style="display: none" type="button" id="editorClearBtn">
                        <i class="primary fa fa-fw fa-eraser"></i>
                    </button>
                    <button style="display: none" type="button" id="editorMaximizeBtn">
                        <i class="primary fa fa-fw fa-arrows"></i>
                    </button>
                </div>
            </div>
        `;
    },

    async mnRender () {
        this.controls = {
            save: this.mnDom.querySelector('#editorSaveBtn'),
            clear: this.mnDom.querySelector('#editorClearBtn'),
            maximize: this.mnDom.querySelector('#editorMaximizeBtn')
        };

        this.controls.save.onclick = () => this.submitNote();

        this.controls.clear.onclick = () => {
            if (!this.isBusy()) this.clear();
        };

        this.controls.maximize.onclick = () => mn.ev.pub('editorMaximize');

        this.bindEditorEvents();
        await this.mountMonaco();
    },

    mnSubscribe () {
        const clear = () => this.clear();

        return {
            noteCreated: clear,
            noteEdited: clear,

            noteEditStart: note => {
                if (this.isBusy()) return;

                this.currentNote = note;

                const text = note.text ?? '';
                const prefix = note.replied_to ? `<R:${note.replied_to}` : '';
                const hasPrefix =
                    text === prefix ||
                    text.startsWith(`${prefix} `) ||
                    text.startsWith(`${prefix}\n`);

                this.setText(
                    prefix && !hasPrefix ? `${prefix} ${text}` : text,
                    true
                );

                this.updateControls();
            },

            noteEditStartProperty: ({property, tag}) => {
                if (this.isBusy()) return;

                this.currentNote = property;

                const text = `${tag}[${property.key}]\n${property.value}`
                this.setText( `${tag}[${property.key}]\n${property.value}`, true );

                this.updateControls();
            },

            noteReply: ({ replied_to }) => {
                if (this.isBusy() || !this.clear()) return;
                this.setText(`<R:${replied_to} `, true);
            },

            editorFocus: () => this.focus()
        };
    },

    languageId: 'journote-markdown',

    tagTypes: {
        '#': { label: 'Progetto', kind: 'Folder', className: 'jn-project' },
        '@': { label: 'Persona', kind: 'User', className: 'jn-person' },
        '>': { label: 'Evento', kind: 'Event', className: 'jn-event' },
        '+': { label: 'Tag generico', kind: 'Keyword', className: 'jn-generic' }
    },

    replyPattern: /^<R:[A-Za-z0-9_-]+(?=\s|$)/,

    editorOptions: {
        fontSize: 14,
        lineHeight: 22,
        fontFamily: '"IBM Plex Mono", monospace',
        minimap: { enabled: false },
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
        padding: { top: 0, bottom: 0 },
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
        fixedOverflowWidgets: true,
        suggest: {
            insertMode: 'replace',
            showWords: false,
            showSnippets: false,
            preview: false,
            selectionMode: 'always'
        }
    },

    // Stato derivato: nessun flag aggiuntivo per ready/busy/editing.
    isBusy() {
        return !this.mnIsActive() ||
            !this.monacoEditor ||
            this.saving ||
            this.pendingImageUploads > 0;
    },

    updateControls() {
        const busy = this.isBusy();

        for (const button of Object.values(this.controls)) {
            button.disabled = busy;
            button.style.display = '';
        }

        this.controls.clear.style.display = this.currentNote ? '' : 'none';

        // La bozza inviata resta invariata durante il salvataggio.
        this.monacoEditor?.updateOptions({ readOnly: this.saving });
    },

    async submitNote() {
        if (this.isBusy()) return;

        const note = {
            ...(this.currentNote ?? {}),
            text: this.getText()
        };

        this.saving = true;
        this.updateControls();

        try {
            await mn.ev.pub('saveNote', { note });
        } finally {
            this.saving = false;
            if (this.mnIsActive()) this.updateControls();
        }
    },

    bindEditorEvents() {
        const options = { capture: true, signal: this.mnSignal };
        const container = this.mnDom.querySelector('#Editor');

        container.addEventListener(
            'paste',
            ev => this.pasteImage(ev),
            options
        );
        
        this.mnCleanup(h.keyBindings(container, "ALT", {
            Enter: () => {
                const tag = this.getTagAtCursor();
                if (tag) { mn.ev.pub('openTabReq', { tag: tag.name }) }
            }
        }));
        this.mnCleanup(h.keyBindings(container, "CTRL", {
            Enter: () => this.submitNote(),
            d: () => {
                const end = this.getText().length;
                this.replaceText(h.localDate(), end, end, true);
            },
            b: () => this.insertMarkdown('**', '**'),
            i: () => this.insertMarkdown('*', '*'),
            k: () => this.insertMarkdown('`', '`')
        }));

    },

    replacePlaceholder(placeholder, replacement) {
        const start = this.getText().indexOf(placeholder);
        if (start < 0) return;

        this.replaceText(
            replacement,
            start,
            start + placeholder.length
        );
    },

    async pasteImage(ev) {
        if (!this.monacoEditor || !this.mnIsActive()) return;

        const file = Array.from(ev.clipboardData?.items || [])
            .find(item => item.kind === 'file' && item.type.startsWith('image/'))
            ?.getAsFile();

        if (!file) return;

        ev.preventDefault();
        ev.stopImmediatePropagation();

        if (this.saving) return;

        const token = `journote-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const placeholder = `![Immagine in caricamento](pending:${token})`;
        const selection = this.monacoEditor.getSelection();
        const model = this.monacoEditor.getModel();

        this.replaceText(
            placeholder,
            model.getOffsetAt(selection.getStartPosition()),
            model.getOffsetAt(selection.getEndPosition()),
            true
        );

        this.pendingImageUploads++;
        this.updateControls();

        mn.ev.pub('notify', {
            msg: `Immagini in caricamento: ${this.pendingImageUploads}`,
            status: 'loading'
        });

        try {
            const form = new FormData();
            form.append('image', file, file.name || 'clipboard-image');

            const uploaded = await api.uploadImage(form);
            if (!this.mnIsActive()) return;

            this.replacePlaceholder(placeholder, uploaded.markdown);

            mn.ev.pub('notify', {
                msg: 'Immagine inserita nella nota.',
                status: 'success'
            });
        } catch (error) {
            if (!this.mnIsActive()) return;

            this.replacePlaceholder(placeholder, '');

            mn.ev.pub('notify', {
                msg: `Immagine non inserita: ${error.message}`,
                status: 'error'
            });
        } finally {
            if (this.mnIsActive()) {
                this.pendingImageUploads--;
                this.updateControls();
            }
        }
    },

    async ensureEditorLanguage(monaco) {
        const id = this.languageId;
        const registered = () =>
            monaco.languages.getLanguages().some(item => item.id === id);

        if (registered()) return;

        const markdown = monaco.languages.getLanguages()
            .find(item => item.id === 'markdown');

        const { language, conf } = await markdown.loader();

        // Un altro render potrebbe aver registrato il linguaggio durante il caricamento.
        if (registered()) return;

        monaco.languages.register({ id });
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

    async mountMonaco() {
        const own = resource => {
            this.mnCleanup(() => resource.dispose());
            return resource;
        };

        if (!this.mnIsActive() || this.monacoEditor) return;

        const monaco = await this.loadMonaco();
        if (!this.mnIsActive()) return;

        await this.ensureEditorLanguage(monaco);
        if (!this.mnIsActive()) return;

        this.monaco = monaco;
        this.installEditorTheme(monaco);

        const popupHost = mn.vu.el('div', {
            className: 'monaco-editor monaco-component vs'
        });

        document.body.appendChild(popupHost);
        this.mnCleanup(() => popupHost.remove());

        const textModel = own(
            monaco.editor.createModel('', this.languageId)
        );

        const editor = own(
            monaco.editor.create(this.mnDom.querySelector('#Editor'), {
                ...this.editorOptions,
                automaticLayout: true,
                theme: this.languageId,
                model: textModel,
                overflowWidgetsDomNode: popupHost
            })
        );

        this.monacoEditor = editor;

        this.mnCleanup(() => {
            this.monacoEditor = null;
        });

        const command = editor.addCommand(
            0,
            () => this.loadProperty(editor)
        );

        own(this.registerTagCompletions(editor, monaco));
        own(this.registerPropertyCompletions(editor, monaco, command));
        own(this.bindTagNavigation(editor, monaco));
        own(this.bindDecorations(editor, monaco));

        own(editor.addAction({
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

        document.fonts?.ready.then(() => {
            if (this.mnIsActive() && this.monacoEditor === editor) {
                monaco.editor.remeasureFonts();
            }
        });

        if (this.mnIsActive()) this.updateControls();
    },

    async loadProperty(editor) {
        if (this.isBusy() || this.currentNote) return;

        const model = editor.getModel();
        const match = model?.getValue()
            .match(/^(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]+)\]\s*$/);

        if (!match) return;

        const [, tag, key] = match;
        const version = model.getVersionId();

        try {
            const response = await api.getTagProperties(tag);

            // La risposta non deve sostituire testo modificato durante l'attesa.
            if (
                this.isBusy() ||
                this.currentNote ||
                model.isDisposed() ||
                editor.getModel() !== model ||
                model.getVersionId() !== version
            ) return;

            const property = response.properties?.find(p => p.key === key);
            if (!property) return;

            if (!this.clear()) return;
            this.setText(`${tag}[${key}]\n${property.value ?? ''}`, true);

            mn.ev.pub('notify', {
                msg: `Modifica proprietà: ${tag}[${key}]`,
                status: 'success'
            });
        } catch (error) {
            if (this.mnIsActive()) {
                mn.ev.pub('notify', {
                    msg: `Caricamento proprietà fallito: ${error.message}`,
                    status: 'error'
                });
            }
        }
    },

    registerTagCompletions(editor, monaco) {
        const categories = this.tagTypes;

        return monaco.languages.registerCompletionItemProvider(
            this.languageId,
            {
                triggerCharacters: Object.keys(categories),

                provideCompletionItems(model, position, context, cancellation) {
                    if (
                        cancellation.isCancellationRequested ||
                        model !== editor.getModel()
                    ) return { suggestions: [] };

                    const line = model.getLineContent(position.lineNumber);
                    const match = line.slice(0, position.column - 1)
                        .match(/(?:^|\s)([#@+>][A-Za-z0-9_.-]*)$/);

                    if (!match) return { suggestions: [] };

                    const typed = match[1];
                    const prefix = typed[0];
                    const category = categories[prefix];

                    const suffix = line.slice(position.column - 1)
                        .match(/^[A-Za-z0-9_.-]*/)[0];

                    const range = new monaco.Range(
                        position.lineNumber,
                        position.column - typed.length,
                        position.lineNumber,
                        position.column + suffix.length
                    );

                    const seen = new Set();
                    const suggestions = [];

                    for (const tag of mn.st.get('tags') || []) {
                        const name = tag?.name;

                        if (
                            typeof name !== 'string' ||
                            name[0] !== prefix ||
                            seen.has(name) ||
                            !/^[#@+>][A-Za-z0-9_.-]+$/.test(name) ||
                            !name.toLowerCase().startsWith(typed.toLowerCase())
                        ) continue;

                        seen.add(name);

                        suggestions.push({
                            label: {
                                label: name,
                                description: category.label
                            },
                            kind: monaco.languages.CompletionItemKind[category.kind],
                            detail: category.label +
                                (tag.parent ? ` · Parent: ${tag.parent}` : ''),
                            filterText: name,
                            sortText: name.toLowerCase(),
                            insertText: name,
                            range
                        });
                    }

                    return { suggestions, incomplete: true };
                }
            }
        );
    },

    registerPropertyCompletions(editor, monaco, command) {
        return monaco.languages.registerCompletionItemProvider(
            this.languageId,
            {
                triggerCharacters: ['['],

                provideCompletionItems: (model, position, context, cancellation) => {
                    if (
                        cancellation.isCancellationRequested ||
                        model !== editor.getModel() ||
                        this.currentNote ||
                        position.lineNumber !== 1 ||
                        model.getLineCount() !== 1
                    ) {
                        return { suggestions: [] };
                    }

                    const line = model.getLineContent(1);
                    const match = line.slice(0, position.column - 1)
                        .match(/^(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]*)$/);

                    if (
                        !match ||
                        !/^[^\[\]\r\n]*\]?\s*$/.test(
                            line.slice(position.column - 1)
                        )
                    ) {
                        return { suggestions: [] };
                    }

                    const [, name, query] = match;
                    const tag = (mn.st.get('tags') || [])
                        .find(item => item.name === name);

                    return {
                        suggestions: (tag?.properties || [])
                            .filter(p =>
                                p.key.toLowerCase().startsWith(query.toLowerCase())
                            )
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
                                    id: command,
                                    title: 'Carica proprietà'
                                }
                            }))
                    };
                }
            }
        );
    },

    getTagAtCursor() {
        const position = this.monacoEditor?.getPosition();
        const model = this.monacoEditor?.getModel();

        if (!position || !model) return;

        return h.getTagAt(
            model.getLineContent(position.lineNumber),
            position.column - 1,
            true
        );
    },

    bindTagNavigation(editor, monaco) {
        return editor.onMouseDown(async e => {
            if (
                !e.event.ctrlKey ||
                !e.event.leftButton ||
                e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT ||
                !e.target.position
            ) return;

            const { lineNumber, column } = e.target.position;
            const textModel = editor.getModel();

            if (!textModel) return;

            const tag = h.getTagAt(
                textModel.getLineContent(lineNumber),
                column - 1
            );

            if (!tag) return;

            e.event.preventDefault();
            e.event.stopPropagation();

            await mn.ev.pub('openTabReq', { tag: tag.name });
        });
    },

    bindDecorations(editor, monaco) {
        const tags = editor.createDecorationsCollection();
        const reply = editor.createDecorationsCollection();

        const update = () => {
            const textModel = editor.getModel();
            if (!textModel) return;

            tags.set(h.findTags(textModel.getValue()).map(tag => {
                const a = textModel.getPositionAt(tag.start);
                const b = textModel.getPositionAt(tag.start + tag.name.length);

                return {
                    range: new monaco.Range(
                        a.lineNumber,
                        a.column,
                        b.lineNumber,
                        b.column
                    ),
                    options: {
                        inlineClassName: this.tagTypes[tag.name[0]].className
                    }
                };
            }));

            const match = textModel.getLineContent(1).match(this.replyPattern);

            reply.set(match ? [{
                range: new monaco.Range(1, 1, 1, match[0].length + 1),
                options: {
                    inlineClassName: 'reply-reference-bg',
                    stickiness: monaco.editor.TrackedRangeStickiness
                        .NeverGrowsWhenTypingAtEdges
                }
            }] : []);
        };

        update();
        return editor.onDidChangeModelContent(update);
    },

    loadMonaco() {
        if (window.monaco?.editor) {
            return Promise.resolve(window.monaco);
        }

        if (monacoLoading) return monacoLoading;

        monacoLoading = new Promise((resolve, reject) => {
            const vs = (
                window.JOURNOTE_MONACO_VS ||
                'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'
            ).replace(/\/$/, '');

            if (!window.MonacoEnvironment) {
                const worker = new Blob([
                    `self.MonacoEnvironment={baseUrl:${JSON.stringify(vs + '/')}};importScripts(${JSON.stringify(vs + '/base/worker/workerMain.js')});`
                ], { type: 'text/javascript' });

                const url = URL.createObjectURL(worker);

                window.MonacoEnvironment = {
                    getWorkerUrl: () => url
                };

                window.addEventListener('pagehide', event => {
                    if (!event.persisted) URL.revokeObjectURL(url);
                });
            }

            let settled = false;
            let script;

            const finish = error => {
                if (settled) return;
                settled = true;

                clearTimeout(timer);

                if (script) {
                    script.onload = null;
                    script.onerror = null;
                    script.remove();
                }

                error ? reject(error) : resolve(window.monaco);
            };

            const timer = setTimeout(
                () => finish(new Error('Timeout caricamento Monaco')),
                20000
            );

            const start = () => {
                if (settled) return;

                try {
                    window.require.config({ paths: { vs } });
                    window.require(
                        ['vs/editor/editor.main'],
                        () => finish(),
                        finish
                    );
                } catch (error) {
                    finish(error);
                }
            };

            if (window.require?.config) {
                start();
            } else {
                script = document.createElement('script');
                script.src = `${vs}/loader.js`;
                script.onload = start;
                script.onerror = () => finish(
                    new Error('Monaco non disponibile')
                );

                document.head.appendChild(script);
            }
        }).catch(error => {
            monacoLoading = null;
            throw error;
        });

        return monacoLoading;
    },

    installEditorTheme(monaco) {
        const style = getComputedStyle(document.documentElement);

        const color = (name, fallback) => {
            const value = style.getPropertyValue(name).trim();
            return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
        };

        const colors = {
            paper: color('--paper', '#ffffff'),
            paperMuted: color('--paper-muted', '#f6f9f7'),
            ink: color('--ink', '#25332d'),
            muted: color('--muted', '#68766f'),
            border: color('--border', '#d8e2dc'),
            accent: color('--accent', '#286b56'),
            accentStrong: color('--accent-strong', '#1b5744'),
            accentSoft: color('--accent-soft', '#e1eee7'),
            error: color('--c-error', '#d34e4e'),
            event: color('--c-event', '#366f91'),
            generic: color('--c-generic', '#a7503b')
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
                token,
                foreground: color.slice(1),
                ...(fontStyle ? { fontStyle } : {})
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

    getText() {
        return this.monacoEditor?.getModel()?.getValue() ?? '';
    },

    setText(text, focus = false) {
        const editor = this.monacoEditor;
        const model = this.monacoEditor?.getModel();

        if (!editor || !model) return;

        editor.setValue(String(text ?? ''));

        if (focus) {
            const position = model.getPositionAt(model.getValueLength());

            editor.setPosition(position);
            editor.revealPositionInCenterIfOutsideViewport(position);
            editor.focus();
        }
    },

    replaceText(text, start, end, moveCursor = false) {
        const editor = this.monacoEditor;
        const model = this.monacoEditor?.getModel();

        if (!editor || !model || this.saving) return;

        const a = model.getPositionAt(start);
        const b = model.getPositionAt(end);

        editor.pushUndoStop();

        editor.executeEdits('journote.replace', [{
            range: new this.monaco.Range(
                a.lineNumber,
                a.column,
                b.lineNumber,
                b.column
            ),
            text,
            forceMoveMarkers: true
        }]);

        if (moveCursor) {
            editor.setPosition(model.getPositionAt(start + text.length));
        }

        editor.pushUndoStop();
    },

    insertMarkdown(prefix, suffix) {
        const editor = this.monacoEditor;
        const model = this.monacoEditor?.getModel();

        if (!editor || !model || this.saving) return;

        editor.pushUndoStop();

        editor.executeEdits(
            'journote.markdown',
            editor.getSelections().map(range => ({
                range,
                text: prefix + model.getValueInRange(range) + suffix,
                forceMoveMarkers: true
            })),
            edits => edits.map(({ range }) => {
                const a = model.getPositionAt(
                    model.getOffsetAt(range.getStartPosition()) + prefix.length
                );

                const b = model.getPositionAt(
                    model.getOffsetAt(range.getEndPosition()) - suffix.length
                );

                return new this.monaco.Selection(
                    a.lineNumber,
                    a.column,
                    b.lineNumber,
                    b.column
                );
            })
        );

        editor.pushUndoStop();
        editor.focus();
    },

    // Gli eventi di successo possono arrivare mentre saving è ancora true.
    clear() {
        if (
            !this.mnIsActive() ||
            !this.monacoEditor ||
            this.pendingImageUploads
        ) return false;

        this.setText('');
        this.currentNote = null;
        this.updateControls();

        return true;
    },

    focus() {
        this.monacoEditor?.focus();
    }
};