'use strict'
import mn from "../mini.js";

export default {
    mnCss () {
        return /*css*/ `
            #TagsBox {
                min-height: 0;

                #TagsBoxSubHeader {
                    margin: 0 0 8px;
                    display: flex;
                    gap: 8px;
                    flex-direction: row;
                    justify-content: flex-start;
                    button {
                        width: 30px;
                    }
                }

                #TagsBoxList {
                    font-size: 0.95rem !important;
                    line-height: 1.4;
                    
                    .tagSection {
                    margin-bottom: 3px;
                    .sectionTitle {
                        color: var(--muted);
                        font-size: 0.74rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        margin-bottom: 1px;
                    }
                    .tagList-tree {
                        list-style: none;
                        /* Rimuovi i pallini di default */
                        padding-left: 8px;
                        /* Indentazione per i livelli successivi */
                        margin: 0px 0px 0px 8px;
                        background: #00000008;
                        border-left-width: 2px;
                        border-left-style: solid;
                        border-left-color: #00000010;

                        .tree-depth-0, .tree-depth-1, .tree-depth-2, .tree-depth-3, .tree-depth-4, .tree-depth-5, .tree-depth-6 {
                        background: transparent;
                        }
                        li {
                        margin: 4px 0 0 0;
                        padding: 0;
                        & > ul {
                            display: none;
                        }
                        & > div {
                            min-height: 18px;
                        }
                        &.expanded {
                            & > ul {
                            display: block;
                            }
                        }
                        }
                        .tag-task-text {
                        display: block;
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        font-size: inherit;
                        line-height: inherit;
                        }
                        .tagtree-box {
                        display: flex;
                        align-items: center;
                        &.Events {
                            border-color: var(--c-event);
                        }
                        &.Projects {
                            border-color: var(--c-project);
                        }
                        &.Generic {
                            border-color: var(--c-generic);
                        }
                        &.Persons {
                            border-color: var(--c-person);
                        }
                        &.Events {
                            .tagtree-text {
                            color: var(--c-event);
                            }
                        }
                        &.Projects {
                            .tagtree-text {
                            color: var(--c-project);
                            }
                        }
                        &.Generic {
                            .tagtree-text {
                            color: var(--c-generic);
                            }
                        }
                        &.Persons {
                            .tagtree-text {
                            color: var(--c-person);
                            }
                        }
                        &.Events {
                            .caret-icon {
                            color: var(--c-event);
                            }
                        }
                        &.Projects {
                            .caret-icon {
                            color: var(--c-project);
                            }
                        }
                        &.Generic {
                            .caret-icon {
                            color: var(--c-generic);
                            }
                        }
                        &.Persons {
                            .caret-icon {
                            color: var(--c-person);
                            }
                        }
                        }
                        .tagList-task {
                        margin: 4px 0 0px 7px;
                        padding: 4px 5px;
                        max-width: 100%;
                        font-size: 0.83rem;
                        line-height: 1.25;
                        border: 0px;
                        border-left-width: 6px;
                        border-style: solid;
                        &:hover {
                            opacity: 0.6;
                        }
                        &.task-low {
                            background: var(--c-primary-l);
                            border-color: var(--c-primary);
                            color: var(--c-primary-d);
                        }
                        &.task-mid {
                            background: var(--c-warning-l);
                            border-color: var(--c-warning);
                            color: var(--c-warning-d);
                        }
                        &.task-high {
                            background: var(--c-error-l);
                            border-color: var(--c-error);
                            color: var(--c-error-d);
                        }
                        & > div {
                            display: block !important;
                            min-height: 0 !important;
                            border: 0 !important;
                            background: transparent !important;
                        }
                        }
                    }
                    }
                }
            }
        `
    },

    mnContent () {
        return /*html*/ `
        <div mini-key="TagsBoxSubHeader" id="TagsBoxSubHeader" style="margin:10px 0px;"></div>
        <div mini-key="TagsBoxList" id="TagsBoxList" class="scrollable" style="display:block; width:100%; background:none; border:none; font-size:1.2em; z-index:2;"></div>`
    }
}