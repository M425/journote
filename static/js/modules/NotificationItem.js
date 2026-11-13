'use strict'
import mn from "../mini.js";
import h from "../h.js";

export default {
    mnCss () {
        return /*css*/ `
        [mini-key="NotificationItem"] {
            padding: 3px;
            .notification-item {
                border: 1px solid;
                padding: 3px;
                font-size: 0.8em;
                overflow: hidden;

                &.notification-item-success {
                    border-color: var(--c-secondary);
                    background-color: var(--c-secondary-l);
                    color: var(--c-secondary);
                }
                &.notification-item-error {
                    border-color: var(--c-error);
                    background-color: var(--c-error-l);
                    color: var(--c-error);
                }
            }
        }
        `;
    },

    async mnLoad () {
        this.data = JSON.parse(this.mnDom.dataset.data);
        console.log(this.data);
        this.status = this.data.status || '';
        this.msg = this.data.msg || '---';
        this.uniqueid = this.data.msg || null;
    },
    mnContent () {
        return /*html*/ `
            <div class="notification-item notification-item-${this.status}">
                ${this.msg}
            </div>
        `
    },
    mnSubscribe () {
        return {
            'notify': async (params) => {
                const {msg, status, uniqueid} = {...params};
                if(params.uniqueid == this.uniqueid) {
                    this.mnDom.dataset.data = JSON.stringify({...this.data, ...params});
                    this.mnRefresh();
                }
            }
        }
    },
}