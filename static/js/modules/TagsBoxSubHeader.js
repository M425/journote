'use strict'
import mn from "../mini.js";

export default {
    mnRerender: [
        'tagsBox_task',
        'tagsBox_projects',
        'tagsBox_events',
        'tagsBox_persons',
        'tagsBox_generic',
    ],
    
    mnContent () {
        this.toggles = [
            ['task', 'tagsBox_task', 'tagsTasksToggle', '!', 'task'],
            ['project', 'tagsBox_projects', 'tagsProjectToggle', '#', 'progetti'],
            ['event', 'tagsBox_events', 'tagsEventsToggle', '>', 'eventi'],
            ['person', 'tagsBox_persons', 'tagsPersonsToggle', '@', 'persone'],
            ['generic', 'tagsBox_generic', 'tagsGenericToggle', '+', 'tag generici']
        ];

        return `
        ${this.toggles.map(([classcol, key, id, text, label]) => {
            const active = Boolean(mn.st.get(key));
            return `
            <button
              id="${id}"
              type="button"
              class="btn ${classcol} toggleTagBox ${active ? ' active' : ''}"
              title="Mostra/nascondi ${label}"
              data-key="${key}"
              aria-label="Mostra/nascondi ${label}"
              aria-pressed="${active}"
            >${text}</button>
          `;
        }).join('')}
      `;
    },

    mnRender () {
        this.mnDom.querySelectorAll('.toggleTagBox').forEach(cell => {
            cell.addEventListener('click', async (event) => {
                mn.st.set({ key: event.target.dataset.key, value: !mn.st.get(event.target.dataset.key) })
            });
        });
    }
}