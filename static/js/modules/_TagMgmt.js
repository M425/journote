'use strict'
import mn from "../mini.js";
import api from "../api.js";
import h from "../h.js";

export default {

    mnContent () {
        return /*html*/ ``;
    },

    async mnLoad () {
    },
    
    mnSubscribe () {
        return {
            tagSaveReq: async (params) => {
                const { tagObj, editObj } = params;
                console.log('to update', tagObj, editObj);
                const updated = await api.updateTag(tagObj, editObj);
                console.log(updated);
                await mn.ev.pub('actionRequiredComplete', {tag: tagObj.name});
                if (updated.name !== tagObj.name) {
                    await mn.ev.pub('renameTab', {oldname: tagObj.name, newname: updated.name});
                }
                await mn.st.reload('tags');
                await mn.ev.pub('notify', {msg: `Tag ${updated.name} salvato.`, status: 'success'});
            }
        };
    },
}