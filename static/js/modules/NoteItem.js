'use strict'
import mn from "../mini.js";
import api from "../api.js";
import h from "../h.js";

export default {

    async mnLoad () {
        this.note = JSON.parse(this.mnDom.dataset.note);
        this.currentTag = this.mnDom.dataset.tag;
        this.relatedRole = this.mnDom.dataset.relatedrole ? this.mnDom.dataset.relatedrole : null;
    },

    mnCss () {
        return /*css*/ `
        `;
    },

    mnContent () {
        if (this.note.type === 'event') {
            return this.genEventItem(this.note, this.currentTag);
        } else if (this.note.type === 'today') {
            return this.genTodayItem(this.note, this.currentTag);
        } else {
            return this.genNoteItem(this.note, this.currentTag, this.relatedRole, { editable: this.editable });
        }
    },

    mnRender () {
    },

    mnSubscribe () {
        return {
            noteCreated: async (params) => {
                const {date, duedate, id, replied_to, tags, task, text} = params;
                if (this.note.id === replied_to) {
                    this.mnDom.dataset.note = JSON.stringify({...this.note, reply: id});
                    await this.mnRefresh();
                }
            },
            noteEdited: async (params) => {
                const {date, duedate, id, replied_to, reply, tags, task, text, timestamp} = params;
                if (this.note.id === id) {
                    this.mnDom.dataset.note = JSON.stringify({...this.note, ...params});
                    await this.mnRefresh();
                }
            },
            noteDeleted: (params) => {
                const {note} = params;
                if (this.note.id === note.replied_to ) {
                    this.mnDom.dataset.note = JSON.stringify({...this.note, reply: null});
                    this.mnRefresh();
                }
                if (this.note.id === note.reply ) {
                    this.mnDom.dataset.note = JSON.stringify({...this.note, replied_to: null});
                    this.mnRefresh();
                }
                if (this.note.id === note.id ) {
                    mn.vu.unmount(this.mnDom);
                    this.mnDom.remove()
                }
            }
        }
    },

    genEventItem(event, tag) {
        return mn.vu.el('div', {
            className: `noteItem eventItem`,
            dataset: { id: event.name, date: event.date }
        }, [
            mn.vu.el('div', {
                className: 'noteDate',
                innerHTML:
                    new Date(`${event.date}T12:00:00`)
                        .toLocaleString('default', { month: 'short' }) +
                    '-' + event.date.substring(8, 10)
            }),
            mn.vu.el('div', { className: 'noteTextWrap' }),
            mn.vu.el('div', { className: 'noteText' }),
            mn.vu.el('p', { textContent: event.name })
        ]);
    },

    genTodayItem(event, tag) {
        return mn.vu.el('div', {
            className: `noteItem todayItem`,
            dataset: { id: 'today', date: event.date }
        }, [
            mn.vu.el('div', {
                className: 'noteDate',
                innerHTML:
                    new Date(`${event.date}T12:00:00`)
                        .toLocaleString('default', { month: 'short' }) +
                    '-' + event.date.substring(8, 10)
            }),
            mn.vu.el('div', { className: 'noteTextWrap' }),
            mn.vu.el('div', { className: 'noteText' }),
            mn.vu.el('i', { textContent: 'Oggi' })
        ]);
    },

    genNoteItem(n, currentTag, relatedRole = null, { editable = true } = {}) {
        let taskClass = '';
        if (n.task != null && n.task != '') {
            taskClass = 'task-' + n.task;
        }

        const elNoteItem = mn.vu.el('div', {
            className: `noteItem ${taskClass}`,
            dataset: { id: n.id, date: n.date }
        });
        if (relatedRole) {
            elNoteItem.classList.add(
                'noteItem-related',
                relatedRole === 'above'
                    ? 'noteItem-related-parent'
                    : 'noteItem-related-child'
            );
        }

        const elNoteDate = elNoteItem.appendChild(
            mn.vu.el('div', {
                className: 'noteDate',
                innerHTML:
                    new Date(`${n.date}T12:00:00`).toLocaleString('default', { month: 'short' }) +
                    '-' + n.date.substring(8, 10) +
                    (
                        n.duedate
                            ? '<br><span class="color--c-error">' +
                            new Date(`${n.duedate}T12:00:00`).toLocaleString('default', { month: 'short' }) +
                            '-' +
                            n.duedate.substring(8, 10) + '</span>'
                            : ''
                    )
            })
        );

        {
            const elReplyIndicators = elNoteItem.appendChild(mn.vu.el('div', { className: 'noteReplyIndicators' }));

            if (!elNoteItem.classList.contains('noteItem-related-child')) {
                elReplyIndicators.appendChild(mn.vu.el('button', {
                    className: n.replied_to
                        ? 'btn primary small'
                        : 'btn transparent muted small',
                    innerHTML:
                        '<i class="fa-solid fa-caret-up fa-2xs fa-fw"></i>',
                    title: n.replied_to
                        ? 'Risponde a un\'altra nota'
                        : 'Nessuna nota a cui risponde',
                    'aria-label': n.replied_to
                        ? 'Risponde a un\'altra nota'
                        : 'Nessuna nota a cui risponde',
                    tabindex: n.replied_to ? 0 : -1,
                    onclick: (ev) => {
                        ev.stopPropagation();
                        if (n.replied_to) {
                            if (elNoteItem.classList.contains('replied_to-open')) {
                                return
                            }
                            elNoteItem.classList += ' replied_to-open'
                            mn.ev.pub('noteRelatedOpenReq', {
                                tag: this.currentTag,
                                noteid: n.replied_to,
                                position: 'above',
                                anchorItem: this.mnDom
                            });
                        }
                    }
                }));
            }

            if (!elNoteItem.classList.contains('noteItem-related-parent')) {
                elReplyIndicators.appendChild(
                    mn.vu.el('button', {
                        className: n.reply
                            ? 'btn primary small'
                            : 'btn transparent muted small',
                        innerHTML:
                            '<i class="fa-solid fa-caret-down fa-2xs fa-fw"></i>',
                        title: n.reply ? 'Ha una risposta' : 'Nessuna risposta',
                        'aria-label': n.reply
                            ? 'Ha una risposta'
                            : 'Nessuna risposta',
                        tabindex: n.reply ? 0 : -1,
                        onclick: ev => {
                            ev.stopPropagation();
                            if (n.reply) {
                                if (elNoteItem.classList.contains('reply-open')) {
                                    return
                                }
                                elNoteItem.classList += 'reply-open'
                                mn.ev.pub('noteRelatedOpenReq', {
                                    tag: this.currentTag,
                                    noteid: n.reply,
                                    position: 'below',
                                    anchorItem: this.mnDom
                                });
                            } else {
                                mn.ev.pub('noteReply', {replied_to: n.id});
                            }
                        }
                    })
                );
            }
        }

        const elNoteDays = elNoteItem.appendChild(
            mn.vu.el('div', {
                className: 'noteDays',
                innerHTML:
                    h.diffToToday(new Date(n.date)) +
                    (
                        n.duedate
                            ? '<br><span class="color--c-error">' +
                            h.diffToToday(new Date(n.duedate)) +
                            '</span>'
                            : ''
                    )
            })
        );

        const elNoteText = elNoteItem
            .appendChild(mn.vu.el('div', { className: 'noteTextWrap' }))
            .appendChild(this.genNoteText(n, currentTag));

        if (!editable) return elNoteItem;
        const elNoteBtnWrap = elNoteItem.appendChild(mn.vu.el('div', { className: 'noteBtnWrap' }));
        const elNoteEditBtn = elNoteBtnWrap.appendChild(mn.vu.el('button', {
            className: 'btn muted small transparent',
            innerHTML:
                '<i class="fa fa-pencil fa-solid fa-fw fa-2xs"></i>',
            title: 'Edit note',
            onclick: ev => {
                ev.stopPropagation();
                mn.ev.pub('noteEditStart', n);
            }
        }));

        const elNoteDelBtn = elNoteBtnWrap.appendChild(
            mn.vu.el('button', {
                className: 'btn muted small transparent',
                innerHTML: '<i class="fa fa-x fa-solid fa-fw fa-2xs"></i>',
                title: 'Delete note',
                onclick: async ev => {
                    ev.stopPropagation();
                    if (!confirm('Delete this note?')) return;
                    mn.ev.pub('noteDeleteReq', { note: n});
                }
            })
        );

        return elNoteItem;
    },

    genNoteText(n, currentTag) {
        const elNoteText = mn.vu.el('div', { className: 'noteText' });
        const converter = new showdown.Converter({ metadata: true });

        // A tag at the start of a line ("#qwe", ">qwe", "+qwe") would be
        // parsed by Markdown as a heading, blockquote or list. Escape the
        // tag prefix so it is rendered as plain text instead.
        const protectedText = h.escapeHTML(n.text).replace(
            /(^|\n)([#+][A-Za-z0-9_.-]+)/g,
            (_, lineStart, tag) => `${lineStart}\\${tag}`
        );

        const html = converter.makeHtml(protectedText);

        elNoteText.innerHTML = html;
        h.sanitizeRenderedMarkdown(elNoteText);
        const walker = document.createTreeWalker(elNoteText, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        for (const node of textNodes) {
            if (node.parentElement.closest('a, code, pre, button, script, style')) continue;
            const pattern = /(^|\s)([#@>+][A-Za-z0-9_.-]+)/g;
            const fragment = document.createDocumentFragment();
            let last = 0;
            for (const match of node.textContent.matchAll(pattern)) {
                const offset = match.index + match[1].length;
                const tag = match[2];
                fragment.append(node.textContent.slice(last, offset));
                fragment.append(mn.vu.el('button', {
                    type: 'button', className: `lbl lbl-${h.getClassfromTag(tag)}`,
                    dataset: { tag }, title: `Apri ${tag}`,
                    textContent: tag === currentTag ? '●' : tag,
                    onclick: () => mn.ev.pub('openTabReq', {tag: tag})
                }));
                last = offset + tag.length;
            }
            if (last) {
                fragment.append(node.textContent.slice(last));
                node.replaceWith(fragment);
            }
        }

        elNoteText.querySelectorAll('img').forEach(image => {
            image.loading = 'lazy';
            image.decoding = 'async';
            image.tabIndex = 0;
            image.setAttribute('role', 'button');
            image.setAttribute(
                'aria-label',
                `Apri immagine a schermo intero: ${image.alt || 'immagine'}`
            );
            const openImage = () => modal.imageViewer.open(
                image.currentSrc || image.src,
                image.alt
            );
            image.addEventListener('click', openImage);
            image.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    openImage();
                }
            });
        });

        return elNoteText;
    },
}