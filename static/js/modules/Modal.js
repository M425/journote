'use strict'
import mn from "../mini.js";

export default {
    mnCss () {
        return /*css*/ `

        .modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1006;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            background: rgba(26, 43, 35, 0.42);
            backdrop-filter: blur(3px);
            .modal-controls {
                position: absolute;
                top: 0;
                right: 0;
                button {
                    padding: 6px 12px;
                    border-radius: 6px;
                    border: none;
                    font-size: 1em;
                    cursor: pointer;
                    color: var(--paper);
                    background: transparent;
                    &:hover {
                        background: rgba(0,0,0,0.1);
                    }
                }
            }
            .modal-content {
                width: min(800px, calc(100vw - 32px));
                min-width: 0;
                min-height: 0;
                max-height: 90vh;
                flex: 0 1 800px;
                margin: 0;
                padding: 20px;
                border: 1px solid rgba(255, 255, 255, 0.75);
                border-radius: 8px;
                background: var(--paper);
                box-shadow: 0 22px 60px rgba(21, 39, 30, 0.2);
                animation: dialog-arrive 180ms ease-out both;
                h3 {
                    color: var(--ink);
                    font-size: 1.1rem;
                }
            }
            .modal-actions {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                button {
                    padding: 6px 16px;
                    border-radius: 6px;
                    border: none;
                    font-size: 1em;
                    cursor: pointer;
                }
            }

            .myform {
                display: flex;
                flex-direction: column;
                gap: 1em;
                padding: 0.2rem;
                input, select, button {
                    padding: 1em;
                    font-size: 1em;
                    border-radius: 0.5em;
                    border: 1px solid var(--border);
                    width: 100%;
                }
                input[type=radio] {
                    width: 30px;
                }
                input:focus, input:focus-visible, select:focus, select:focus-visible, textarea:focus, textarea:focus-visible {
                    outline: none;
                    border-color: var(--primary);
                }
                textarea {
                    width: 100%;
                    min-height: 80px;
                    font-size: 1em;
                    padding: 8px;
                    border-radius: 6px;
                    flex: 1;
                    border: 1px solid #ccc;
                    resize: vertical;
                }
            }
        }
        `
    },
    mnContent () {
        return /*html*/ `
            <div class="modal">
                <div class="modal-controls">
                    <button class="small modal-close" aria-label="Close" title="Close">
                        <i class="fa-solid fa-times fa-fw" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="modal-content">
                </div>
            </div>
        `
    },
    mnRender () {
        this.mnDom.querySelector('.modal-controls button').addEventListener('click', () => {
            this.closeModal();
        });    
    },
    mnSubscribe () {
        return {
            closeModal: async (params) => {
                this.closeModal();
            },
            openModal: async (params) => {
                console.log('openModal', params);
                this.openModal(params);
            }
        };
    },
    closeModal() {
        this.mnDom.querySelector('.modal-content').innerHTML = '';
        this.mnDom.classList.toggle('hidden', true);
    },
    async openModal(params) {
        const { key, onClose, extras } = params;
        this.closeModal();
        console.log('openModal', key, extras);
        this.mnDom.querySelector('.modal-content').innerHTML = /*html*/ `
            <div
                class="modal-inner"
                mini-key="${key}"
                ${extras ? Object.entries(extras).map(([k, v]) => `data-${k}="${v}"`).join(' ') : ''}
            ></div>
        `
        await mn.vu.cycle(this.mnDom);
        this.mnDom.classList.toggle('hidden', false);
    }
}