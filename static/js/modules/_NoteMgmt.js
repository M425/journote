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
    
    parseLeadingDate(text) {
        const m = text.trim().match(/^(\d{4}-\d{2}-\d{2})\b/);
        return m ? m[1] : null;
    },

    parsePropertyAssignment(text) {
        const match = text.trim().match(
        /^(#[A-Za-z0-9_.-]+)\[([^\[\]\r\n]+)\][ \t\r\n]+(\S[\s\S]*)$/
        );
        if (!match) return null;
        const [, tagName, rawKey, rawValue] = match;
        const key = rawKey.trim();
        if (!key) return null;
        return {
            tagName,
            key,
            value: rawValue.trim()
        };
    },

    mnSubscribe () {
        return {
            saveNote: async (params) => {
                const { note } = params;
                const property = this.parsePropertyAssignment(note.text);
                const objtype = property ? 'property' : 'note';
                if (property) {
                    await api.setTagProperty(
                        property.tagName,
                        property.key,
                        property.value
                    );
                } else {
                    const noteSaved = await api.setNote(note);
                    if (noteSaved.status == 'create') {
                        await mn.ev.pub(objtype+'Created', noteSaved.note);
                    } else {
                        await mn.ev.pub(objtype+'Edited', noteSaved.note);
                    }
                    if (
                        noteSaved.new_tags.length > 0 ||
                        noteSaved.removed_tags.length > 0) {
                        await mn.st.reload('tags');
                        await mn.st.reload('tasks');
                    }
                    if ( noteSaved.note.task !== note.task) {
                        await mn.st.reload('tasks');
                    }
                }
            },
            noteRelatedOpenReq: async (params) => {
                const {tag, noteid, anchorItem, position} = params;
                const resp = await api.getNote(noteid);
                await mn.ev.pub('noteRelatedOpen', {tag, note: resp, anchorItem, position});
            },
            noteDeleteReq: async (params) => {
                const {note} = params;
                const response = await api.deleteNote(note.id);
                if (response !== null && response?.status !== 'deleted') {
                    await mn.ev.pub('notify', {msg: 'Errore cancellazione nota '+note.id, status: "error"})
                    throw new Error('Il server non ha confermato la cancellazione.');
                }
                if (response.removed_tags.length > 0) {
                    await mn.st.reload('tags');
                }
                await mn.ev.pub('noteDeleted', {note})
                await mn.ev.pub('notify', {msg: 'Nota eliminata '+note.id, status: "success"})
            }
        };
    },
}