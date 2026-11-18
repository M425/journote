'use strict'
import mn from "../mini.js";
import api from "../api.js";

export default {

    mnRerender: [
        'tagsBox_task',
        'tagsBox_projects',
        'tagsBox_events',
        'tagsBox_persons',
        'tagsBox_generic',
        'tags',
        'tasks',
    ],

    async mnLoad () {
        this.tags = await mn.st.load('tags');
        this.tasks = await mn.st.load('tasks');
    },

    buildTagTree(tags = [], tasks = []) {
        // 1. Crea nodi indipendenti dagli oggetti tag originali.
        const nodesByName = new Map(
        tags.map(tag => [
            tag.name,
            {
            ...tag,
            tasks: [],
            children: []
            }
        ])
        );
        const roots = [];
        // 2. Collega i nodi ai genitori, evitando collegamenti ciclici.
        for (const node of nodesByName.values()) {
        const visitedNames = new Set([node.name]);
        let ancestor = nodesByName.get(node.parent);
        let hasCycle = false;
        while (ancestor) {
            if (visitedNames.has(ancestor.name)) {
            hasCycle = true;
            break;
            }
            visitedNames.add(ancestor.name);
            ancestor = nodesByName.get(ancestor.parent);
        }
        const parent = nodesByName.get(node.parent);
        if (parent && !hasCycle) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
        }
        // 3. Associa ogni task al tag selezionato durante il caricamento.
        for (const task of tasks) {
        const node = nodesByName.get(task.firstTag);
        node?.tasks.push(task);
        }
        return roots;
    },

    createTaskElement(task, tagsTaskActive) {
        return mn.vu.el('li', {
            style: {
                display: tagsTaskActive ? `` : 'none',
                listStyle: 'none',
                cursor: 'pointer'
            },
            className: 'tagList-task task-' + task.task,
            role: 'button',
            tabIndex: 0,
            'aria-label': `Apri la nota del task: ${task.text}`,
            onclick: (ev) => {
                console.log('clicked on task', task);
                mn.ev.pub('taskFocus', {task});
            }
        }, [
            mn.vu.el('div', {
                style: { display: 'flex', alignItems: 'center' }
            }, [
                mn.vu.el('span', {
                    textContent: Boolean(task.firstTag) ? task.text.replace(task.firstTag, '●') : task.text,
                    className: 'tag-task-text',
                    title: task.text,
                    style: {
                        flex: '1'
                    }
                })
            ])
        ]);
    },

    createTreeWrap(tagTree, tagsEyeActive, tagsTaskActive, depth) {
        const ul = mn.vu.el('ul', {
            className: 'tagList-tree'
        });
        tagTree.forEach(tag => {
            ul.appendChild(this.createTreeElement(
                tag,
                tagsEyeActive,
                tagsTaskActive,
                depth
            ));
        });
        return ul;
    },

    hasDiscendentTask(tag) {
        if (tag.tasks.length != 0) return true;
        return tag.children.some(child => this.hasDiscendentTask(child));
    },

    createTreeElement(tag, tagsEyeActive, tagsTaskActive, depth) {
        const hasChildren = tag.children && tag.children.length > 0;
        const isHidden = !tagsEyeActive[tag.category] && !tag.treed && !this.hasDiscendentTask(tag);

        const li = mn.vu.el('li', {
            style: {
                listStyle: 'none',
                display: isHidden ? 'none' : '',
            },
            className: `expanded tree-depth-${depth}`
        });


        const liBox = mn.vu.el('div', {
            className: ["tagtree-box", tag.category].join(' '),
        });

        const toggleBtn = liBox.appendChild(mn.vu.el('i', {
            className: hasChildren
                ? 'caret-icon fa-fw fa-regular fa-square-caret-down'
                : 'caret-icon fa-fw fa-regular fa-square',
            style: {
                marginRight: '5px',
                cursor: hasChildren ? 'pointer' : 'default',
            },
            onclick: () => {
                if (hasChildren) {
                    li.classList.toggle('expanded');
                    if (li.classList.contains('expanded')) {
                        toggleBtn.classList.remove('fa-square-caret-right');
                        toggleBtn.classList.add('fa-square-caret-down');
                    } else {
                        toggleBtn.classList.remove('fa-square-caret-down');
                        toggleBtn.classList.add('fa-square-caret-right');
                    }
                }
            }
        }));

        liBox.appendChild(mn.vu.el('span', {
            className: "tagtree-text",
            textContent: tag.name,
            style: {
                flex: '1',
                cursor: 'pointer',
                fontWeight: '600'
            },
            onclick: () => mn.ev.pub('openTabReq', { tag: tag.name })
        }));

        liBox.appendChild(mn.vu.el('button', {
            className: tag.treed ? 'btn small primary transparent' : 'btn small muted transparent',
            innerHTML: tag.treed ? '<i class="fa-xs fa-fw fa-solid fa-eye fa-middle"></i>' : '<i class="fa-xs fa-fw fa-solid fa-eye-slash fa-middle"></i>',
            onclick: async ev => {
                ev.stopPropagation();
                let saved = false;
                try {
                    const updated = await api.updateTagVisibility(tag, !tag.treed);
                    saved = true;
                    mn.ev.pub('notify', { msg: `Visibilità di ${updated.name} aggiornata.`, status: 'success' })
                    const index = this.tags.findIndex(item => item.name === updated.name);
                    if (index !== -1) this.tags[index] = updated;
                    mn.st.set({ key: 'tags', value: this.tags.map(tag => { return tag.name == updated.name ? updated : tag; }) });
                } catch (error) {
                    const message = saved
                        ? `Visibilità salvata, aggiornamento della vista fallito: ${error.message}`
                        : `Modifica della visibilità non riuscita: ${error.message}`;
                    mn.ev.pub('notify', { msg: message, status: 'error' });
                    throw error;
                }
            }
        }));

        liBox.appendChild(mn.vu.el('button', {
            className: 'btn small muted transparent',
            innerHTML: '<i class="fa-xs fa-fw fa-solid fa-pencil fa-middle"></i>',
            onclick: async ev => {
                ev.stopPropagation();
                mn.ev.pub('openModal', {key: 'ModalEditTree', extras: {'tag': tag.name}});
            }
        }));

        li.appendChild(liBox);

        tag.tasks.forEach(task => {
            li.appendChild(this.createTaskElement(task, tagsTaskActive, depth + 1));
        });

        if (hasChildren) {
            li.appendChild(this.createTreeWrap(
                tag.children,
                tagsEyeActive,
                tagsTaskActive,
                depth + 1
            ));
        }
        return li;
    },

    mnContent () {
        const body = [];

        const untaggedTasks = this.tasks.filter(task => !task.firstTag);
        if (untaggedTasks.length) {
            const section = mn.vu.el('div',
                { className: 'tagSection' },
                [mn.vu.el('div', { className: 'sectionTitle', textContent: 'Senza tag: ' })]
            );

            const taskList = mn.vu.el('ul', { className: 'tagList-tree' });
            untaggedTasks.forEach(task => {
                taskList.appendChild(this.createTaskElement(task, mn.st.get('tagsBox_task')));
            });
            section.appendChild(taskList);
            body.push(section);
        }

        const el = mn.vu.el('div', {
            className: 'tagSection',
        }, [
            mn.vu.el('div', {
                className: 'sectionTitle',
                textContent: 'Tags: '
            }),
            this.createTreeWrap(
                this.buildTagTree(this.tags, this.tasks),
                {
                    Projects: mn.st.get('tagsBox_projects'),
                    Events: mn.st.get('tagsBox_events'),
                    Generic: mn.st.get('tagsBox_generic'),
                    Persons: mn.st.get('tagsBox_persons')
                },
                mn.st.get('tagsBox_task'),
                1
            )
        ])

        body.push(el);

        return body;
    }
}