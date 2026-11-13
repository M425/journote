'use strict'
import mn from "../mini.js";
import api from "../api.js";
import h from "../h.js";

export default {

    mnContent () {
        return /*html*/ ``;
    },

    async mnLoad () {
        this.currentColumns = [];
    },
    
    mnSubscribe () {
        return {
            activateTab: async (params) => {
                const {tag} = params;
                mn.st.set({key: 'tagsActive', value: tag});
            },
            openTabReq: async (params) => {
                const {tag} = params;
                let columnNumbers = this.currentColumns.length;
                if (this.currentColumns.includes(tag)) {
                    await mn.ev.pub('activateTab', {
                        tag: tag,
                        label: tag,
                        columnId: columnNumbers
                    });
                    return;
                }
                this.currentColumns.push(tag);
                columnNumbers = this.currentColumns.length;
                await mn.ev.pub('openTab', {
                    tag: tag,
                    label: tag,
                    columnId: columnNumbers
                });
                await mn.ev.pub('activateTab', {
                    tag: tag,
                    label: tag,
                    columnId: columnNumbers
                });
            },
            closeTabReq: async (params) => {
                const {tag} = params;
                if (tag == 'journal') {
                    return
                }
                this.currentColumns = this.currentColumns.filter(tag => tag !== tag);
                await mn.ev.pub('closeTab', {
                    tag: tag
                });
            },
            reameTab: async (params) => {
                const {oldname, newname} = params;
                if (!this.currentColumns.includes(oldname)) {
                    return;
                }
                await mn.ev.pub('closeTabReq', {oldname});
                await mn.ev.pub('openTabReq', {newname});
            },
            taskFocus: async (params) => {
                const {task} = params;
                let target = task.date;
                if (task.firstTag) {
                    target = task.firstTag;
                }
                console.log('task focus target', target)
                await mn.ev.pub('openTabReq', {
                    tag: target,
                });
            }
        };
    },
}