'use strict'
import mn from "../mini.js";
import h from "../h.js";

export default {
    mnCss () {
        return /*css*/ `
        #ActionRequiredBox {
            padding-top: 12px;
            border-top: 1px solid var(--border);

            .action-required-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 8px;
                h3 {
                    margin: 0 !important;
                }
            }
            .action-required-tag {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                min-height: 32px;
                margin-top: 5px;
                padding: 5px 8px;
                border: 1px solid;
                border-radius: 4px;
                background: var(--paper);
                font: inherit;
                font-size: 0.84rem;
                text-align: left;
                cursor: pointer;
                &::before {
                content: '';
                width: 8px;
                height: 8px;
                flex: 0 0 8px;
                border-radius: 50%;
                background: currentColor;
                }
            }
            .action-required-tag-project {
                color: #286b56;
                border-color: #a5c6b4;
                background: #eaf3ee;
            }
            .action-required-tag-person {
                color: #8a621c;
                border-color: #e1cb94;
                background: #f6f0df;
            }
            .action-required-tag-event {
                color: #366f91;
                border-color: #aac7d8;
                background: #eaf2f6;
            }
            .action-required-tag-generic {
                color: #a65d47;
                border-color: #dfb5a6;
                background: #f7ede9;
            }
            .action-required-tag-other {
                color: var(--muted);
                border-color: var(--border);
            }
            .action-required-tag {
                &:hover {
                filter: brightness(0.97);
                }
                &:focus-visible {
                outline: 2px solid currentColor;
                outline-offset: 2px;
                }
            }
        }
        `;
    },

    mnContent () {
      const actionItems = this.getActionRequiredItems();
      return /*html*/ `
        <div class="action-required-header">
            <h3>Action Required</h3>
            <span class="badge bg-warning text-dark">${actionItems.length}</span>
        </div>
        <div id="ActionRequiredBox">
            ${actionItems.length === 0 ? '<p>Nessuna azione richiesta</p>' : ''}
            ${actionItems.map(tag => /*html*/ `
                <button
                    type="button"
                    class="action-required-tag action-required-tag-${h.getClassfromTag(tag).toLowerCase()}"
                    title="Associa ${tag} a un parent"
                    onclick="mn.ev.pub('openModal',{key:'ModalEditTree',extras:{'tag':'${tag}'}})"
                >
                    <span class="tag-dot"></span>
                    ${tag}
                </button>`
            ).join('')}
        </div>
      `;
    },
    
    mnSubscribe() {
        return {
            actionRequiredAdd: async (params) => {
                const {tags} = params;
                this.addActionRequiredTags(tags);
                await this.mnRefresh();
            },
            actionRequiredComplete: async (params) => {
                const {tag} = params;
                this.completeActionRequiredTag(tag);
                await this.mnRefresh();
            }
        };
    },

    completeActionRequiredTag(tag) {
        const pendingTags = this.getActionRequiredItems().filter(
        item => item !== tag
        );
        localStorage.setItem(
        'journoteActionRequiredTags',
        JSON.stringify(pendingTags)
        );
    },

    getActionRequiredItems() {
        try {
            const items = JSON.parse(localStorage.getItem('journoteActionRequiredTags') || '[]');
            return Array.isArray(items) ? items.filter(item => typeof item === 'string') : [];
        } catch (error) {
            console.error('Error reading action required tags:', error);
            return [];
        }
    },

    addActionRequiredTags(tags) {
        const pendingTags = new Set(this.getActionRequiredItems());
        tags.forEach(tag => pendingTags.add(tag));
        localStorage.setItem(
        'journoteActionRequiredTags',
        JSON.stringify([...pendingTags])
        );
    }
}