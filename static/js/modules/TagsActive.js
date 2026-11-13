'use strict'
import mn from "../mini.js";

export default {
    mnLoad () {
        this.tagactive = mn.st.get('tagsActive');
    },
    mnContent () {
        return /*html*/ `
            <div>${this.tagactive}</div>
        `;
    },
    mnRerender: ['tagsActive']
}