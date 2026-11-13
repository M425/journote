'use strict'
import mn from "../mini.js";

export default {
    mnCss () {
        return /*css*/ `

        #RightBar {
            background: var(--brown-l);
            border-left: 1px solid var(--muted);
            flex: 0 0 260px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            height: 100vh;
            overflow-y: auto;
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
        if (!(mn.st.get('rightBarVisible'))) {
            this.mnDom.classList.push('hidden')
        }

        return /*html*/ `
            <div mini-key="ProjectFolder"></div>
            <div mini-key="NotificationBox" style="flex:0 0 auto; margin-top:auto;"></div>
        `
    },
    mnSubscribe () {
        return {
            'model-set-rightBarVisible': async () => {
                this.mnDom.classList.toggle('hidden', !mn.st.get('rightBarVisible'));
                //return mn.vu.render('RightBar');
            }
        }
    },
}