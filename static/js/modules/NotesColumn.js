'use strict'
import mn from "../mini.js";
import api from "../api.js";
import h from "../h.js";

export default {

    async mnLoad () {
        this.tags = await mn.st.load('tags');
        this.tasks = await mn.st.load('tasks');
        this.tag = this.mnDom.dataset.key;
        if (this.tag == 'journal') {
            this.tagObj = { category: '', name: 'journal' }
        } else {
            this.tagObj = this.tags.find(t => t.name === this.tag);
        }

        this.label = this.mnDom.dataset.label;

        const resp = await api.loadNotes(this.tag);
        const notes = resp.notes || [];
        const events = resp.events || [];
        const dayNumber = date => (
            /^\d{4}-\d{2}-\d{2}$/.test(date || '')
                ? Date.parse(`${date}T00:00:00Z`) / 86400000
                : NaN
        );
        this.allItems = notes.map(note => ({
            ...note,
            type: 'note'
        }))
            .concat(events.filter(item => item.date !== null).map(event => ({
                ...event,
                type: 'event'
            })))
            .concat([{ type: 'today', date: h.localDate(), today: true }])
            .sort((a, b) => {
                const aDate = dayNumber(a.date);
                const bDate = dayNumber(b.date);
                if (Number.isFinite(aDate) && Number.isFinite(bDate))
                    return aDate - bDate;
                return 0;
            });

        this.finalList = [];
        this.allItems.forEach((note, index) => {
            if (index > 0) {
                const days = Math.abs(dayNumber(note.date) - dayNumber(this.allItems[index - 1].date));
                if (Number.isFinite(days) && days > 0) {
                    const months = Math.floor(days / 28);
                    let remainingDays = days % 28;
                    const weeks = Math.floor(remainingDays / 7);
                    remainingDays = days % 7;
                    for (let i = 0; i < months + weeks + remainingDays; i++) {
                        this.finalList.push({
                            type: 'gap',
                            class: i < months
                                ? 'notesDateGap-line notesDateGap-month'
                                : i < weeks
                                    ? 'notesDateGap-line notesDateGap-week'
                                    : 'notesDateGap-line'
                        });
                    }
                }
                this.finalList.push(note);
            } else {
                this.finalList.push(note);
            }
        });
    },

    mnCss () {
        return /*css*/ `
        `;
    },

    mnContent () {
        return /*html*/ `
            <div class="ColumnResizer"> </div>
            <div
              class="column-content"
              data-key="${this.tag}"
              onclick="mn.ev.pub('activateTab',{tag: '${this.tag}'})">
                <div class="columnHeader">${this.label}
                    <div class="columnHeaderBtns">
                        <button
                            class="btnp primary"
                            title="Show sub header"
                            data-action="toggleSubHeader"
                        >
                            <i class="fa fa-eye fa-fw fa-solid fa-xs"> </i>
                        </button>
                        <button
                            class="btnp primary"
                            title="Close tab"
                            data-action="closeTab"
                        >
                            <i class="fa fa-x fa-fw fa-solid fa-xs"> </i>
                        </button>
                    </div>
                </div>
                <div class="columnSubHeader"> </div>
                <div class="notesList scrollable">
                    ${this.finalList.map((item, index) => {
            if (item.type === 'gap') {
                return /*html*/ `<div class="${item.class}" aria-hidden="true"></div>`;
            }

            return /*html*/ `
                            <div
                                mini-key="NoteItem"
                                data-tag="${this.tag}"
                                data-note="${h.escapeHTML(JSON.stringify(item))}"
                            ></div>
                        `;
        }).join('')}
                </div>
            </div>
        `
    },

    mnRender () {
        this.mnDom.querySelector('[data-action="closeTab"]').onclick = (event) => {
            event.stopPropagation();
            mn.ev.pub('closeTabReq', { tag: this.tag });
        }
        this.mnDom.querySelector('[data-action="toggleSubHeader"]').onclick = (event) => {
            event.stopPropagation();
            this.mnDom.classList.toggle('showSubHeader');
        }

        const elColSubheader = this.mnDom.querySelector('.columnSubHeader');
        if (this.tagObj == undefined) {
            const tagType = h.getClassfromTag(tag);
            if (tagType == 'Journal') {
                elColSubheader.innerHTML = new Date(`${tag}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            } else if (tagType == 'FullText') {
                elColSubheader.innerHTML = '';
            }
        } else {
            const conv = new showdown.Converter({ metadata: true });
            elColSubheader.innerHTML = conv.makeHtml(h.escapeHTML(this.tagObj.content || ''));
            h.sanitizeRenderedMarkdown(elColSubheader);

            const properties = Array.isArray(this.tagObj.properties)
                ? this.tagObj.properties
                : [];
            if (properties.length) {
                const elColProperties = elColSubheader.appendChild(
                    mn.vu.el('div', { className: 'columnTagProperties' })
                );
                for (const property of properties) {
                    const elProperty = elColProperties.appendChild(
                        mn.vu.el('div', { className: 'columnTagProperty' })
                    );
                    const elPropertyBody = elProperty.appendChild(
                        mn.vu.el('div', { className: 'columnTagPropertyBody' })
                    );
                    elPropertyBody.appendChild(mn.vu.el('div', {
                        className: 'columnTagPropertyKey',
                        textContent: property.key
                    }));
                    const elPropertyValue = elPropertyBody.appendChild(
                        mn.vu.el('div', { className: 'columnTagPropertyValue' })
                    );
                    elPropertyValue.innerHTML = conv.makeHtml(
                        h.escapeHTML(property.value ?? '')
                    );
                    h.sanitizeRenderedMarkdown(elPropertyValue);
                    elProperty.appendChild(mn.vu.el('button', {
                        className: 'btn muted small transparent columnTagPropertyEditBtn',
                        innerHTML: '<i class="fa fa-pencil fa-solid fa-fw fa-2xs"></i>',
                        title: `Edit property ${property.key}`,
                        'aria-label': `Edit property ${property.key}`,
                        onclick: ev => {
                            ev.stopPropagation();
                            mn.ev.pub('noteEditStartProperty', {property: property, tag: this.tag })
                        }
                    }));
                }
            }
        }
    },
    mnRendered() {
        // Tutte le view discendenti hanno completato il rendering.
        this
            .mnDom
            .querySelector('[mini-key="NoteItem"]:last-child')
            .scrollIntoView({ behavior: 'smooth', inline: 'start' });
    },

    mnSubscribe () {
        return {
            columnShowSubheader: async (params) => {
                if (this.mnDom.classList.contains('active')) {
                    this.mnDom.classList.toggle('showSubHeader');
                }
            },
            closeTab: async (params) => {
                if (params.tag === this.tag) {
                    mn.vu.unmount(this.mnDom);
                    this.mnDom.remove()
                }
            },
            noteRelatedOpen: async (params) => {
                const { tag, note, anchorItem, position } = params;
                if (tag === this.tag) {
                    anchorItem.insertAdjacentHTML(
                        position === 'above' ? 'beforeBegin' : 'afterEnd', /*html*/ `
                        <div
                            mini-key="NoteItem"
                            data-tag="${this.tag}"
                            data-note="${h.escapeHTML(JSON.stringify(note))}"
                            data-relatedrole="${position}"
                        ></div>`);
                    await mn.vu.cycle(this.mnDom)
                }
            },
            noteCreated: async (params) => {
                const { date, duedate, id, replied_to, tags, task, text } = params;
                if (tags.includes(this.tag) || this.tag == "journal") {
                    /* FIXME: bisognerebbe inserire l'elemento il base al campo data */
                    this.mnDom.querySelector('.notesList')
                        .insertAdjacentHTML('beforeEnd', /*html*/ `
                        <div
                            mini-key="NoteItem"
                            data-tag="${this.tag}"
                            data-note="${h.escapeHTML(JSON.stringify(params))}"
                        ></div>`);
                    await mn.vu.cycle(this.mnDom)
                    this.mnRendered();
                }
            },
        };
    },
}