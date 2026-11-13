'use strict'
import mn from "../mini.js";
import h from "../h.js";

export default {
    mnCss () {
        return /*css*/ `
        `
    },

    async mnLoad () {
        this.tags = await mn.st.load('tags');
        this.tasks = await mn.st.load('tasks');
        this.tag = this.mnDom.dataset.tag;
        this.tagObj = this.tags.find(t => t.name === this.tag);
    },

    mnContent () {
        return /*html*/ `
          <h3>Edit Tag</h3>
          <form id="EditTagForm" class="myform" style="flex: 1">
            <label for="editform-treed">Treed:</label>
            <label>
              <input type="radio" id="editform-treed-visible" name="treed" value="true" ${this.tagObj.treed ? 'checked' : ''}>
              Visible
            </label>
            <label>
              <input type="radio" id="editform-treed-hidden" name="treed" value="false" ${!this.tagObj.treed ? 'checked' : ''}>
              Hidden
            </label>
            <div>
              <label for="editform-rename">Rename Tag:</label>
              <input type="text" id="editform-rename" autocomplete="off" name="rename" value="${h.escapeHTML(this.tagObj.name)}" placeholder="Enter new name">
            </div>
            <div>
              <label for="editform-parent">Parent Tag:</label>
              <input type="text" id="editform-parent" autocomplete="off" name="parent" value="${h.escapeHTML(this.tagObj.parent)}" placeholder="Enter parent tag">
              <div id="editform-parent-suggestions" class="filter-tag-suggestions" role="listbox" style="display: none;"></div>
            </div>
            ${this.tagObj.category !== "Events" ? "" : /*html*/`
                <div>
                    <label for="editform-parent">Data:</label>
                    <input type="date" id="editform-date" autocomplete="off" name="date" value="${h.escapeHTML(this.tagObj.date)}" placeholder="Enter date">
                </div>
            `}
            <div style="flex: 1; display: flex; flex-direction: column">
              <label for="editform-content">Content:</label>
              <textarea style="flex:1" id="editform-content" name="content" class="modal-textarea">${h.escapeHTML(this.tagObj.content)}</textarea>
            </div>
            <div></div>
            <div class="modal-actions">
              <button type="submit" value="cancel" class="btn standard" id="edit-tree-modal-cancel">Cancel</button>
              <button type="submit" value="save" class="btn primary" id="edit-tree-modal-save">Save</button>
            </div>
          </form>
        `
    },

    async mnRender () {
        const parentInput = this.mnDom.querySelector('#editform-parent');
        const parentSuggestions = this.mnDom.querySelector('#editform-parent-suggestions');

        const selectParent = parentTag => {
            parentInput.value = parentTag.name;
            parentSuggestions.replaceChildren();
            parentSuggestions.style.display = 'none';
            parentInput.focus();
        };

        const renderParentSuggestions = () => {
            const query = parentInput.value.trim().toLocaleLowerCase();
            const matches = query
                ? this.tags
                    .filter(candidate =>
                        candidate.name !== this.tagObj.name &&
                        candidate.name.toLocaleLowerCase().includes(query)
                    )
                    .slice(0, 8)
                : [];
            parentSuggestions.replaceChildren();
            matches.forEach(candidate => {
                const option = mn.vu.el('button', {
                    type: 'button',
                    className: 'filter-tag-suggestion'
                });
                option.setAttribute('role', 'option');
                option.textContent = `${candidate.name} · ${candidate.category}`;
                option.onmousedown = ev => ev.preventDefault();
                option.onclick = () => selectParent(candidate);
                parentSuggestions.appendChild(option);
            });
            parentSuggestions.style.display = matches.length ? 'flex' : 'none';
        };

        parentInput.addEventListener('input', renderParentSuggestions);
        parentInput.addEventListener('focus', renderParentSuggestions);
        parentInput.addEventListener('blur', () => {
            parentSuggestions.style.display = 'none';
        });
        parentInput.addEventListener('keydown', ev => {
            if (
                ev.key === 'Tab' &&
                !ev.shiftKey &&
                parentSuggestions.firstElementChild
            ) {
                ev.preventDefault();
                parentSuggestions.firstElementChild.click();
            } else if (ev.key === 'Enter') {
                ev.preventDefault();
                EditTagForm.requestSubmit(h.eid('edit-tree-modal-save'));
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                parentSuggestions.style.display = 'none';
            }
        });

        const EditTagForm = this.mnDom.querySelector('#EditTagForm');
        EditTagForm.onsubmit = async ev => {
            ev.preventDefault();
            if (ev.submitter?.value === 'cancel') {
                mn.ev.pub('closeModal');
            }
            await mn.ev.pub('tagSaveReq', {
                tagObj: this.tagObj,
                editObj: Object.fromEntries(new FormData(EditTagForm).entries())
            });
            mn.ev.pub('closeModal');
        };
        
        const closeModalOnEsc = (ev) => {
            if (ev.key === 'Escape') {
                mn.ev.pub('closeModal');
            }
        }
        document.addEventListener('keydown', closeModalOnEsc);
        return () => {
            document.removeEventListener('keydown', closeModalOnEsc);
        }
    }
}