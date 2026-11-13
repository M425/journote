'use strict'
import mn from "../mini.js";

export default {
    mnCss () {
        return /*css*/ `
            [mini-key="Central"] {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0;
                height: 100vh;
                overflow: hidden;
                background: var(--bg);
                
                &.editor-maximized {  
                    #EditorWrap {
                        flex: 1 1 0;
                        #EditorWrapIn {
                            #Editor {
                                height: auto;
                                flex: 1 1 120px;
                            }
                        }
                    }
                    #NotesWorkspace {
                        display: none;
                    }
                }
            }
        `
    },
    mnContent () {
        return /*html*/ `
            <div mini-key="TopBar" id="TopBar"></div>
            <div mini-key="NotesWorkspace" id="NotesWorkspace"></div>
            <div mini-key="EditorWrap" id="EditorWrap"></div>`
    },
    mnSubscribe () {
        return {
            editorMaximize: (params) => {
                this.mnDom.classList.toggle('editor-maximized');
            }
        }
    }
}