'use strict'
import api from '../api.js';
import mn from "../mini.js";
import h from '../h.js';

const sidebarWidths = {
    LeftBar: null,
    RightBar: null
};

export default {

    mnStates: [
        { key: 'tags', load: api.getTags },
        { key: 'tasks', load: async () => {
            const tasks = await api.getTasks();
            const tags = new Map((await mn.st.load('tags')).map(tag => [tag.name, tag]));

            for (const task of tasks) {
                task.firstTag = null;
                
                console.log('checking task', task);
                for (const name of task.tags || []) {
                    console.log('checkingsub tag', name);
                    console.log('checkingsub tag', tags);
                    if (['Projects', 'Generic', 'Events'].includes(tags.get(name)?.category)) {
                        task.firstTag = name;
                    }
                }
            }
            console.log(tasks);
            return tasks;
        }},
        { key: 'tagsBox_projects', value: false },
        { key: 'tagsBox_task', value: true },
        { key: 'tagsBox_events', value: false },
        { key: 'tagsBox_persons', value: false },
        { key: 'tagsBox_generic', value: false },
        { key: 'journalBox_calendarYear', value: new Date().getFullYear() },
        { key: 'journalBox_calendarMonth', value: new Date().getMonth() },
        { key: 'journalBox_collapsed', value: true },
        { key: 'tagsVisible' },
        { key: 'tagsActive', value: ''},
        { key: 'leftBarVisible', value: true },
        { key: 'rightBarVisible', value: true },
        { key: 'page' }
    ],

    mnRerender: [
        'page'
    ],

    mnCss () {
        return /*css*/ `

            * {
                box-sizing: border-box;
            }
            html,body,#app {
                height: 100%;
                margin: 0;
                font-family: var(--font-body);
                color: var(--ink);
                font-weight: 400;
                font-style: normal;
                letter-spacing: 0;
            }
            body {
                background: var(--bg);
                color: var(--ink);
            }
            h1 {
                margin: 0;
                font-size: 1.5em;
            }
            h2 {
                margin: 0;
                font-size: 1.3em;
            }
            h3 {
                margin: 0;
                font-size: 1.1em;
            }
            h4 {
                margin: 0;
                font-size: 1.0em;
            }
            p {
                margin: 2px 0px 2px 0px;
            }
            [mini-key=app] {
                display: flex;
                height: 100vh;
                background: var(--bg);
                overflow: hidden;
                
                #LeftBarResizer {
                    background: transparent;

                    &:hover {
                        background: rgba(0,0,0,0.1);
                    }
                }
                
                #RightBarResizer {
                    background: transparent;

                    &:hover {
                        background: rgba(0,0,0,0.1);
                    }
                }
                #LeftBarResizer,
                #RightBarResizer {
                    position: relative;
                    z-index: 10;

                    flex: 0 0 8px;
                    width: 8px;
                    min-width: 8px;
                    align-self: stretch;

                    pointer-events: auto;
                    touch-action: none;
                    user-select: none;
                    cursor: col-resize;

                    background: var(--accent-soft, #ddd);
                }

                #LeftBarResizer:hover,
                #RightBarResizer:hover {
                    background: var(--accent, #888);
                }

                #LeftBarResizer:hover,
                #RightBarResizer:hover,
                #LeftBarResizer:focus-visible,
                #RightBarResizer:focus-visible {
                    background: var(--accent-soft, rgba(0, 0, 0, 0.1));
                }

                #LeftBarResizer:focus-visible,
                #RightBarResizer:focus-visible {
                    outline: 1px solid var(--accent);
                    outline-offset: -1px;
                }

                #Central {
                    flex: 1 1 0;
                    min-width: 0;
                }

                &.resizing-sidebar,
                &.resizing-sidebar * {
                    cursor: col-resize !important;
                    user-select: none !important;
                }
            }
            `;
    },

    mnContent () {
        const currentPage = mn.st.get('page');
        if (currentPage == 'home') {
            return /*html*/ `
                <div mini-key="LeftBar"  id="LeftBar"></div>
                <div                     id="LeftBarResizer"></div>
                <div mini-key="Central"  id="Central"></div>
                <div                     id="RightBarResizer"></div>
                <div mini-key="RightBar" id="RightBar"></div>

                <div mini-key="_TabMgmt" class="hidden"></div>
                <div mini-key="_NoteMgmt" class="hidden"></div>
                <div mini-key="_TagMgmt" class="hidden"></div>
                <div mini-key="Modal" class="hidden"></div>
            `;
        } else {
            return 'NO APP';
        }
    },

    mnRender () {
        h.keyBindings(document, "ALT", {
            KeyN: () => mn.ev.pub('editorFocus'),
            KeyT: () => mn.ev.pub('openTabReq', { tag: 'journal' }),
            KeyW: () => mn.ev.pub('closeTabReq', { tag: 'ACTIVE' }),
            KeyM: () => mn.ev.pub('editorMaximize'),
            KeyL: () => mn.ev.pub('columnShowSubheader'),
            KeyF: () => modal.filterModal.render(),
            Digit1: () => mn.st.set({ key: 'leftBarVisible', value: !mn.st.get('leftBarVisible') }),
            Digit2: () => mn.st.set({ key: 'rightBarVisible', value: !mn.st.get('rightBarVisible') }),
            ArrowLeft: () => mn.ev.pub('tabMove', { direction: 'LEFT' }),
            ArrowRight: () => mn.ev.pub('tabMove', { direction: 'RIGHT' }),
        });
    },
    mnRendered() {
        if (mn.st.get('page') !== 'home') return;

        this.bindSidebarResizers();
    },

    bindSidebarResizers() {
        const root = this.mnDom;
        const signal = this.mnSignal;

        const minWidth = 160;
        const maxWidth = 600;
        const minCenterWidth = 240;

        const sides = [
            {
                id: 'LeftBar',
                panel: root.querySelector('#LeftBar'),
                handle: root.querySelector('#LeftBarResizer'),
                direction: 1,
                label: 'Larghezza barra sinistra'
            },
            {
                id: 'RightBar',
                panel: root.querySelector('#RightBar'),
                handle: root.querySelector('#RightBarResizer'),
                direction: -1,
                label: 'Larghezza barra destra'
            }
        ];

        if (sides.some(side => !side.panel || !side.handle)) return;

        let drag = null;

        const isVisible = side =>
            side.panel.getClientRects().length > 0 &&
            side.panel.getBoundingClientRect().width > 0;

        const limits = side => {
            const other = sides.find(item => item !== side);

            const otherWidth = isVisible(other)
                ? other.panel.getBoundingClientRect().width
                : 0;

            const handlesWidth = sides.reduce(
                (sum, item) =>
                    sum + item.handle.getBoundingClientRect().width,
                0
            );

            const available =
                root.clientWidth -
                otherWidth -
                handlesWidth -
                minCenterWidth;

            // Su schermi piccoli può scendere sotto il minimo normale.
            const max = Math.max(0, Math.min(maxWidth, available));
            const min = Math.min(minWidth, max);

            return { min, max };
        };

        const applyWidth = (side, requested, remember = false) => {
            const { min, max } = limits(side);
            const width = Math.round(
                Math.max(min, Math.min(max, requested))
            );

            side.panel.style.width = `${width}px`;
            side.panel.style.flex = '0 0 auto';
            side.panel.style.minWidth = '0';
            side.panel.style.maxWidth = `${maxWidth}px`;

            side.handle.setAttribute('aria-valuemin', String(Math.round(min)));
            side.handle.setAttribute('aria-valuemax', String(Math.round(max)));
            side.handle.setAttribute('aria-valuenow', String(width));

            if (remember) sidebarWidths[side.id] = width;
        };

        const stopDrag = () => {
            if (!drag) return;

            const { side, pointerId } = drag;
            drag = null;

            root.classList.remove('resizing-sidebar');

            if (side.handle.hasPointerCapture(pointerId)) {
                side.handle.releasePointerCapture(pointerId);
            }
        };

        for (const side of sides) {
            console.log('side', side)
            const { panel, handle } = side;

            handle.tabIndex = 0;
            handle.setAttribute('role', 'separator');
            handle.setAttribute('aria-orientation', 'vertical');
            handle.setAttribute('aria-controls', side.id);
            handle.setAttribute('aria-label', side.label);

            if (sidebarWidths[side.id] === null && isVisible(side)) {
                sidebarWidths[side.id] = panel.getBoundingClientRect().width;
            }

            handle.addEventListener('pointerdown', ev => {
                console.log('resize start', side.id);
                if (ev.button !== 0 || !ev.isPrimary || !isVisible(side)) {
                    return;
                }

                ev.preventDefault();
                stopDrag();
                handle.focus();

                drag = {
                    side,
                    pointerId: ev.pointerId,
                    startX: ev.clientX,
                    startWidth: panel.getBoundingClientRect().width
                };

                handle.setPointerCapture(ev.pointerId);
                root.classList.add('resizing-sidebar');
            }, { signal });

            handle.addEventListener('pointermove', ev => {
                if (
                    !drag ||
                    drag.side !== side ||
                    drag.pointerId !== ev.pointerId
                ) return;

                const delta = (ev.clientX - drag.startX) * side.direction;

                applyWidth(side, drag.startWidth + delta, true);
            }, { signal });

            const endPointer = ev => {
                if (drag?.side === side && drag.pointerId === ev.pointerId) {
                    stopDrag();
                }
            };

            handle.addEventListener('pointerup', endPointer, { signal });
            handle.addEventListener('pointercancel', endPointer, { signal });
            handle.addEventListener('lostpointercapture', endPointer, { signal });

            handle.addEventListener('keydown', ev => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
                    return;
                }

                ev.preventDefault();
                ev.stopPropagation();

                const { min, max } = limits(side);
                const current = panel.getBoundingClientRect().width;
                const step = ev.shiftKey ? 40 : 10;

                const requested =
                    ev.key === 'Home' ? min :
                    ev.key === 'End' ? max :
                    current +
                        (ev.key === 'ArrowRight' ? step : -step) *
                        side.direction;

                applyWidth(side, requested, true);
            }, { signal });
        }

        // Sincronizza anche quando una barra viene nascosta o riaperta.
        const sync = () => {
            if (!this.mnIsActive()) return;

            for (const side of sides) {
                // Non usare la larghezza per rilevare una barra nascosta:
                // una barra ridotta a zero deve poter tornare ad allargarsi.
                const shown =
                    side.panel.getClientRects().length > 0 &&
                    getComputedStyle(side.panel).display !== 'none';

                side.handle.style.display = shown ? '' : 'none';

                if (!shown && drag?.side === side) stopDrag();
            }

            for (const side of sides) {
                if (side.handle.style.display === 'none') continue;

                const desired =
                    sidebarWidths[side.id] ??
                    side.panel.getBoundingClientRect().width;

                if (sidebarWidths[side.id] === null) {
                    sidebarWidths[side.id] = desired;
                }

                applyWidth(side, desired);
            }
        };

        const observer = new ResizeObserver(sync);

        observer.observe(root);
        sides.forEach(side => observer.observe(side.panel));

        this.mnCleanup(() => {
            observer.disconnect();
            stopDrag();
        });

        sync();
    },
};