'use strict'
import mn from "../mini.js";

export default {
    mnCss () {
        return /*css*/ `

        #LeftBar {
            background: var(--brown-l);
            border-right: 1px solid var(--muted);
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            height: 100vh;
            overflow-y: auto;
            padding: 14px 12px;
            scrollbar-color: var(--bg-d1) transparent;
            scrollbar-width: thin;
            .box {
                min-height: 0;
                h3 {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin: 0 0 8px;
                    font-size: 0.9rem;
                    font-weight: 700;
                }
            }
        }`;
    },

    mnContent () {
        if (!(mn.st.get('leftBarVisible'))) {
            this.mnDom.classList.push('hidden')
        }
        return /*html*/ `
        <div mini-key="JournalBox" id="JournalBox" class="box"></div>
        <div mini-key="TagsBox" id="TagsBox" class="box" style="flex:1 1 auto; min-height:0; overflow-y:auto;"></div>
        <div mini-key="ActionRequiredBox" id="ActionRequiredBox" style="flex:0 0 auto; margin-top:auto;"></div>
        `;
    },
    mnSubscribe () {
        return {
            'model-set-leftBarVisible': async () => {
                this.mnDom.classList.toggle('hidden', !mn.st.get('leftBarVisible'));
            }
        };
    },
}