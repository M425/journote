'use strict'
import mn from "../mini.js";
import api from "../api.js";

export default {

    async mnLoad () {
        this.tags = await mn.st.load('tags');
        this.tasks = await mn.st.load('tasks');
    },

    mnCss () {
        return /*css*/ `

        #NotesWorkspace {
            display: flex;
            flex: 1 1 0;
            min-height: 0;
            min-width: 0;
            overflow: hidden;
            & > #ColumnsWrap {
                flex: 1 1 0;
                min-width: 0;
                height: 100%;
                display: flex;
                /* use flex row, not grid */
                flex-direction: row;
                align-items: stretch;
                overflow-x: auto;
                /* horizontal scroll */
                overflow-y: hidden;
                scrollbar-width: none;
                scrollbar-color: var(--bg-d1) transparent;
                background: transparent;
                
                .column {
                    flex: 0 0 320px;
                    /* fixed width, adjust as you like */
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    .ColumnResizer {
                        background: transparent;
                        width: 5px;
                        cursor: col-resize;
                        position: absolute;
                        top: 0;
                        right: 0;
                        bottom: 0;
                        z-index: 10;
                        &:hover {
                            background: rgba(0,0,0,0.1);
                        }
                    }
                    .column-content {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        padding: 0px;
                        overflow: hidden;
                        /* border-radius: 7px; */
                        /* background: var(--paper); */
                        animation: column-arrive 180ms ease-out both;

                        .columnSubHeader {
                            padding: var(--gap);
                            background: var(--paper-muted);
                            border-bottom: 1px solid var(--border);
                            overflow-y: scroll;
                            color: var(--muted);
                            font-size: 0.88rem;
                            display: none;
                            flex: 0;
                            flex-direction: column;

                            .columnTagProperties {
                                display: flex;
                                flex-direction: column;
                                gap: var(--gap);
                            }
                            .columnTagProperty {
                                display: flex;
                                align-items: flex-start;
                                gap: 4px;
                                padding: 4px 6px;
                                border: 1px solid var(--border);
                                background: var(--paper);
                                min-width: 0;
                            }
                            .columnTagPropertyBody {
                                flex: 1 1 auto;
                                min-width: 0;
                                display: flex;
                                flex-direction: column;
                                gap: 2px;
                            }
                            .columnTagPropertyKey {
                                color: var(--accent);
                                font-weight: 600;
                                font-size: 0.8em;
                                text-transform: uppercase;
                                letter-spacing: 0.03em;
                            }
                            .columnTagPropertyValue {
                                color: var(--ink);
                                overflow-wrap: anywhere;
                                p {
                                    margin: 0;
                                }
                                ul, ol {
                                    margin: 2px 0;
                                    padding-left: 1.4em;
                                }
                                img {
                                    max-width: 100%;
                                }
                            }
                            .columnTagPropertyEditBtn {
                                flex: 0 0 auto;
                                opacity: 0.6;
                                &:hover {
                                    opacity: 1;
                                }
                            }
                        }
                        .notesList {
                            flex: 1 1 auto;
                            overflow-y: auto;
                            display: flex;
                            flex-direction: column;
                            scrollbar-color: var(--bg-d1) transparent;
                            scrollbar-width: thin;
                            padding: var(--gap);
                            gap: var(--gap);

                            .notesDateGap-line {
                                height: 2px;
                                flex: 0 0 auto;
                                background: var(--darker);
                            }
                            .notesDateGap-week {
                                height: 7px;
                            }
                            .notesDateGap-month {
                                height: 24px;
                            }
                            .noteItem {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                gap: 0px;
                                border-bottom: 1px solid #edf1ee;
                                padding-right: 5px;
                                padding-left: 0;
                                background: var(--paper);
                                border-left: 3px solid var(--border);
                                background: var(--paper);

                                .lbl {
                                    display: inline-block;
                                    padding: 0px 2px;
                                    margin: 0 2px 0 0;
                                    border: 1px solid transparent;
                                    border-radius: 1px;
                                    font-weight: 600;
                                    cursor: pointer;
                                    &.lbl-Projects {
                                        background: #e1eee7;
                                        color: #286b56;
                                    }
                                    &.lbl-Persons {
                                        background: #f8f0d9;
                                        color: #886414;
                                    }
                                    &.lbl-Events {
                                        background: #e4eff5;
                                        color: #366f91;
                                    }
                                    &.lbl-Generic {
                                        background: #fff0e9;
                                        color: #a7503b;
                                    }
                                    &.lbl-FullText {
                                        background: #edf0ee;
                                        color: #4c5b53;
                                    }
                                }
                                &.task-high {
                                    border-left: 3px solid var(--c-error);
                                    background: var(--c-error-l);
                                }
                                &.task-mid {
                                    border-left: 3px solid var(--c-warning);
                                    background: var(--c-warning-l);
                                }
                                &.task-low {
                                    border-left: 3px solid var(--c-primary);
                                    background: var(--c-primary-l);
                                }
                                &.eventItem {
                                    border: 1px solid var(--c-secondary-d);
                                    background: var(--c-secondary-a);
                                }
                                &.todayItem {
                                    border-left: 3px solid var(--c-standard-a);
                                    background: var(--c-standard-a);
                                }
                                img {
                                    max-width: 100%;
                                }
                                &:hover {
                                    background: #f8fbff;
                                }
                            }
                            .noteItem-related {
                                margin-left: 6px;
                                margin-right: 6px;
                            }
                            .noteItem-related-parent {
                                margin-top: 2px;
                                border-radius: 10px 10px 0px 0px;
                                background: var(--accent-soft) !important;
                            }
                            .noteItem-related-child {
                                margin-bottom: 2px;
                                border-radius: 0px 0px 10px 10px;
                                background: var(--accent-soft) !important;
                            }
                            .noteItem {
                                .noteDate, .noteDays {
                                    color: var(--muted);
                                    margin-bottom: 0px;
                                    min-width: 42px;
                                    min-height: 25px;
                                    text-align: center;
                                    padding-right: 6px;
                                    padding-left: 6px;
                                    border-right: 1px dashed #dce5df;
                                    justify-content: center;
                                    font-size: 0.69rem;
                                    line-height: 1.4;
                                    display: flex;
                                    flex-direction: column;
                                }
                                .noteTextWrap {
                                    flex: 1;
                                    display: flex;
                                    flex-direction: column;
                                    padding-left: 5px;
                                    .noteText {
                                        font-size: 0.8rem;
                                    }
                                }
                                .noteBtnWrap {
                                    display: flex;
                                    flex-direction: row;
                                    gap: 2px;
                                    flex: 0;
                                    padding-left: 5px;
                                }
                                .noteReplyIndicators {
                                    display: flex;
                                    flex-direction: column;
                                    align-items: center;
                                    justify-content: flex-start;
                                    gap: 1px;
                                    padding-left: 2px;
                                }
                            }
                        }
                        .columnHeader {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            gap: 8px;
                            min-height: 46px;
                            padding: 8px 10px;
                            border-bottom: 1px solid var(--border);
                            color: var(--ink);
                            font-size: 0.96rem;
                            font-weight: 700;
                            background: var(--bg-d1);
                            
                            .columnHeaderBtns {
                                float: right;
                                display: flex;
                                gap: 8px;
                            }
                            
                            & > div {
                                flex: 0 0 auto;
                            }
                            
                            .btnp {
                                width: 30px;
                                height: 30px;
                                border: 1px solid transparent;
                                border-radius: 5px;
                                background: transparent;
                                color: var(--muted);
                                &:hover {
                                    border-color: var(--border);
                                    background: var(--paper-muted);
                                    color: var(--accent);
                                }
                            }
                        }
                    }
                    &.active {
                        .column-content {
                            .columnHeader {
                                background: var(--paper);
                            }
                        }
                    }
                    &.showSubHeader {
                        .column-content {
                            .columnSubHeader {
                                display: flex;
                                flex: 1;
                            }
                            .notesList {
                                display: none;
                                flex: 0;
                            }
                        }
                    }
                    &.fullwidth {
                        flex: 0 0 100% !important;
                        min-width: 0;
                        max-width: none;
                        .ColumnResizer {
                            display: none;
                        }
                    }
                }
            }
        }`;
    },

    mnContent () {
        return /*html*/ `
            <div id="ColumnsWrap" class="columns scrollable-x">
            </div>
        `
    },

    async mnRender () {
        setTimeout(() => { mn.ev.pub('openTabReq', { tag: 'journal' }), 500 });
    },

    mnSubscribe () {
        return {
            openTab: async (params) => {
                console.log('[FIRED] noteWorkspace-openTab', params);
                this.mnDom.querySelector('#ColumnsWrap').insertAdjacentHTML("beforeend", /*html*/ `
                    <div
                        mini-key="NotesColumn"
                        class="column fullwidth"
                        data-key="${params.tag}"
                        data-label="${params.tag}">
                    </div>
                `);
                await mn.vu.cycle(this.mnDom);
            },
            activateTab: async (params) => {
                const { tag } = params;
                this.mnDom.querySelectorAll('.column').forEach(col => {
                    col.classList.toggle('active', col.dataset.key === tag);
                    col.classList.toggle('hidden', col.dataset.key !== tag);
                });
                const activeColumn = this.mnDom.querySelector('.column.active');
                if (activeColumn) {
                    activeColumn.scrollIntoView({ behavior: 'smooth', inline: 'start' });
                }
            },
            tabMove: async (params) => {
                const { direction } = params;
                const active = this.mnDom.querySelector('.column.active');
                const target = direction == "LEFT" ? active?.previousElementSibling : active?.nextElementSibling;
                if (target) {
                    active.classList.remove('active');
                    active.classList.add('hidden');
                    target.classList.add('active');
                    target.classList.remove('hidden');
                    target.scrollIntoView({ behavior: 'smooth', inline: 'start' });
                }
            },
            'model-set-leftBarVisible': async () => {
                const activeColumn = this.mnDom.querySelector('.column.active');
                if (activeColumn) {
                    activeColumn.scrollIntoView({ behavior: 'smooth', inline: 'start' });
                }
            },
            'model-set-rightBarVisible': async () => {
                const activeColumn = this.mnDom.querySelector('.column.active');
                if (activeColumn) {
                    activeColumn.scrollIntoView({ behavior: 'smooth', inline: 'start' });
                }
            }
        };
    },
}