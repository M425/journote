'use strict'
import mn from "../mini.js";

export default {
    mnCss () {
        return /*css*/ `
        #TopBar {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 0 0 60px;
            padding: 10px 14px;
            border-bottom: 1px solid var(--border);
            background: #fbfdfb;
            #TopBarContainer {
                display: flex;
                flex-direction: row;
                min-width: 0;
                flex: 1;
                gap: 7px;
                align-items: center;
                height: 100%;
                overflow-x: auto;
                overflow-y: hidden;
                scrollbar-width: thin;
                .tabPill {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    padding: 4px 5px 4px 10px;
                    background: #f5f8f6;
                    color: #4c5b53;
                    border: 1px solid var(--border);
                    cursor: pointer;
                    font-weight: 600;
                    white-space: nowrap;
                    height: 34px;
                    font-size: 0.84rem;
                    &.active {
                        background: var(--accent-soft);
                        border-color: var(--accent);
                        color: var(--accent-strong);
                    }
                    .x {
                        border-radius: 4px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        background: none;
                        border: none;
                        color: var(--signal);
                        font-size: 1.1em;
                        padding: 2px 6px;
                        transition: background 0.2s;
                        &:hover {
                        background: var(--signal-soft);
                        }
                    }
                }
            }
            .navBtnsWrap {
                flex: 0 0 auto;
                padding: 0;
                gap: 5px;
                .navBtn {
                width: 38px;
                height: 38px !important;
                padding: 0 !important;
                border: 1px solid transparent !important;
                border-radius: 6px !important;
                background: transparent !important;
                color: var(--muted) !important;
                font-size: 16px !important;
                &:hover, &:focus-visible {
                    border-color: var(--border) !important;
                    background: var(--paper-muted) !important;
                    color: var(--accent-strong) !important;
                }
                }
            }
        }`;
    },

    mnContent () {

        const elNavBtnsWrap = mn.vu.el('div', { className: 'navBtnsWrap' });

        const navigation = [
            ['HamburgerBtn', 'bars', 'Menu', 'standard', () => mn.st.set({ key: 'leftBarVisible', value: !mn.st.get('leftBarVisible') })]
            /*['HomeBtn', 'home', 'Home', 'secondary', () => { location.hash = '/home'; }],*/
            /*['calendarBtn', 'calendar', 'Calendario', 'secondary', () => { location.hash = '/calendar'; }],*/
            /*['explorerBtn', 'database', 'Explorer', 'secondary', () => { location.hash = '/explorer'; }]*/
        ];
        for (const [id, icon, label, variant, onclick] of navigation) {
            elNavBtnsWrap.appendChild(mn.vu.el('button', {
                type: 'button', id, className: `navBtn btn ${variant}`,
                title: label, 'aria-label': label,
                innerHTML: `<i class="fa-xs fa-fw fa-solid fa-${icon} fa-middle" aria-hidden="true"></i>`,
                style: {
                    top: '10px',
                    left: '10px',
                    zIndex: '1000',
                    fontSize: '20px',
                    height: '36px'
                },
                onclick
            }));
        }

        const elTopBarContainer = mn.vu.el('div', {
            id: 'TopBarContainer',
            className: 'scrollable-x'
        });

        return [
            elNavBtnsWrap,
            elTopBarContainer
        ]
    },

    mnSubscribe () {
        return {
            openTab: async (params) => {
                const { tag, label } = params;
                const elTopBarContainer = document.getElementById('TopBarContainer');
                if (!elTopBarContainer) {
                    console.error('TopBarContainer not found');
                    return;
                }
                const elPill = elTopBarContainer.appendChild(mn.vu.el('div', {
                    className: 'tabPill',
                    title: label,
                    dataset: { key: tag },
                    onclick: () => mn.ev.pub('activateTab', { tag })
                }, [
                    mn.vu.el('span', {
                        textContent: label
                    }),
                    mn.vu.el('span', {
                        className: 'x',
                        textContent: '×',
                        onclick: ev => {
                            ev.stopPropagation();
                            mn.ev.pub('closeTabReq', { tag });
                        }
                    }),
                ]));
                elPill.scrollIntoView({ behavior: 'smooth', inline: 'start' });
            },
            closeTab: async (params) => {
                const { tag } = params;
                const elTopBarContainer = document.getElementById('TopBarContainer');
                if (!elTopBarContainer) {
                    console.error('TopBarContainer not found');
                    return;
                }
                const elPill = elTopBarContainer.querySelector(`[data-key="${tag}"]`);
                if (elPill) {
                    elPill.remove();
                }
            },
            activateTab: async (params) => {
                const { tag } = params;
                const elTopBarContainer = document.getElementById('TopBarContainer');
                if (!elTopBarContainer) {
                    console.error('TopBarContainer not found');
                    return;
                }
                const elPills = elTopBarContainer.querySelectorAll('.tabPill');
                elPills.forEach(elPill => {
                    if (elPill.dataset.key === tag) {
                        elPill.classList.add('active');
                    } else {
                        elPill.classList.remove('active');
                    }
                });
            },
            tabMove: async (params) => {
                const {direction} = params;
                const active = this.mnDom.querySelector('#TopBarContainer').querySelector('.tabPill.active');
                const target = direction == "LEFT" ? active?.previousElementSibling : active?.nextElementSibling;
                if (target) {
                    active.classList.remove('active');
                    target.classList.add('active');
                    target.scrollIntoView({ behavior: 'smooth', inline: 'start' });
                }
            }
        }
    }
}