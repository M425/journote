'use strict'
import mn from "../mini.js";
import h from "../h.js";

export default {
    mnCss () {
        return /*css*/ `

        [mini-key="NotificationBox"] {

            .notification-box-inn {
                min-height: 100px;
                max-height: 100px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                border-top: 1px solid var(--border);
            }
        }`;
    },

    mnContent () {
        return /*html*/ `
            <div class="notification-box-inn"></div>
        `
    },
    mnSubscribe () {
        return {
            'notify': async (params) => {
                const {msg, status, uniqueid} = {...{uniqueid: null}, ...params};
                this.mnDom.querySelector('.notification-box-inn')
                    .insertAdjacentHTML('beforeEnd', /*html*/ `
                        <div
                            mini-key="NotificationItem"
                            data-data="${h.escapeHTML(JSON.stringify(params))}"
                        ></div>`);
                    await mn.vu.cycle(this.mnDom)
            }
        }
    },
}