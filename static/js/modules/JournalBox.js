'use strict'
import api from "../api.js";
import h from "../h.js";
import mn from "../mini.js";

export default {

    mnCss () {
      return /*css*/ `
        #JournalBox {
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);

          .mini-calendar-header {
            min-height: 34px;
            padding: 0 0 6px;
            border-bottom: 0;
            font-size: 0.78rem;
          }
          .journal-collapse-btn {
            width: 24px;
            height: 27px;
            padding: 0;
            border: 0;
            background: transparent;
            color: var(--ink);
            cursor: pointer;
            font-size: 0.9rem;
            &:hover {
              background: var(--accent-soft);
            }
          }
          .mini-calendar-header {
            .calendar-nav-btn {
              width: 28px;
              height: 27px;
              border: 0;
              background: transparent;
              font-size: 1.1rem;
              &:hover {
                background: var(--accent-soft);
              }
            }
          }
          .mini-calendar {
            table-layout: fixed;
            border-spacing: 3px 4px;
            .journal-task-dot {
              position: absolute;
              right: 50%;
              bottom: 2px;
              width: 4px;
              height: 4px;
              border-radius: 50%;
              background: var(--signal);
              box-shadow: none;
              transform: translateX(50%);
            }
            th {
              padding: 2px 0 4px;
              font-size: 0.58rem;
              letter-spacing: 0;
            }
            td {
              position: relative;
              height: 32px;
              min-height: 32px;
              padding: 3px 2px 6px;
              border: 0;
              border-radius: 4px;
              background: transparent;
              font-size: 0.69rem;
              line-height: 1;
              vertical-align: middle;
              box-shadow: none;
            }
            td.calendar-cell {
              background: #fff;
            }
            td.calendar-weekend {
              background: #f5f7f5;
            }
            td.calendar-cell {
              &:hover {
                background: var(--accent-soft);
              }
            }
            .calendar-cell-empty {
              background: transparent !important;
            }
          }
          .mini-calendar-day-number {
            display: grid;
            min-height: 100%;
            place-items: center;
            margin: 0;
            font-weight: 600;
          }
        }`
    },
    
    mnRerender: [
      'journalBox_calendarYear',
      'journalBox_calendarMonth',
      'journalBox_collapsed',
    ],

    async mnLoad () {
      this.tasks = await mn.st.load('tasks');
      this.numNotesOfMonth = await api.getMonthlyNoteCounts(
        mn.st.get('journalBox_calendarYear'),
        mn.st.get('journalBox_calendarMonth') + 1
      );
    },

    mnContent () {
      this.today = new Date();
      const numNotesOfMonthMax = Math.max(...Object.values(this.numNotesOfMonth));
      let body = /*html*/ `
        <div class="calendar-header mini-calendar-header">
          <button type="button" class="journal-collapse-btn">
            <i class="fa fa-fw fa-regular button-collapsed-journalBox fa-square-caret-right ${mn.st.get('journalBox_collapsed') ? '' : 'hidden'}"> </i>
            <i class="fa fa-fw fa-regular button-collapsed-journalBox fa-square-caret-down  ${mn.st.get('journalBox_collapsed') ? 'hidden' : ''}"> </i>
          </button>
          <button type="button" class="calendar-nav-btn calendar-nav-btn-prev"> < </button>
          <span class="calendar-month-label"> ${mn.st.get('journalBox_calendarYear')}-${String(mn.st.get('journalBox_calendarMonth') + 1).padStart(2, '0')} </span>
          <button type="button" class="calendar-nav-btn calendar-nav-btn-next"> > </button>
        </div>
      `;

      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const { firstDay, daysInMonth } = h.getCalendarDays(mn.st.get('journalBox_calendarYear'), mn.st.get('journalBox_calendarMonth'));
      const datePrefix = `${mn.st.get('journalBox_calendarYear')}-${String(mn.st.get('journalBox_calendarMonth') + 1).padStart(2, '0')}`;
      const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

      const todayDay =
        mn.st.get('journalBox_calendarYear') === this.today.getFullYear() &&
        mn.st.get('journalBox_calendarMonth') === this.today.getMonth()
          ? this.today.getDate()
          : null;

      body += /*html*/ `
        <table class="calendar-table mini-calendar ${mn.st.get('journalBox_collapsed') ? 'hidden' : ''}">
          <thead>
            <tr>${weekdays.map(day => `<th>${day}</th>`).join('')}</tr>
          </thead>
          <tbody>
      `;

      for (let i = 0; i < totalCells; i++) {
        const weekdayIndex = i % 7;
        const day = i - firstDay + 1;
        if (weekdayIndex === 0) body += '<tr>';
        if (day < 1 || day > daysInMonth) {
          body += '<td></td>';
        } else {
          const dateStr = `${datePrefix}-${String(day).padStart(2, '0')}`;
          const notes = this.numNotesOfMonth[dateStr] || 0;

          const intensity = numNotesOfMonthMax > 0
            ? Math.min(8, Math.ceil((notes / numNotesOfMonthMax) * 8))
            : 0;

          const classes = [
            'calendar-cell',
            `intensity-${intensity}`,
            weekdayIndex >= 5 ? 'calendar-weekend' : '',
            day === todayDay ? 'calendar-today' : ''
          ].filter(Boolean).join(' ');

          body += /*html*/ `
            <td data-datestr="${dateStr}" class="${classes}">
              <div class="mini-calendar-day-number">${day}</div>
            </td>
          `;
        }
        if (weekdayIndex === 6) body += '</tr>';
      }

      body += /*html*/ `</tbody></table>`;
      return body;
    },

    mnRender () {
      console.log(this);
      this.mnDom.querySelector('.journal-collapse-btn').onclick = () => {
        // this.mnDom.querySelector('.calendar-table').classList.toggle('hidden');
        // this.mnDom.querySelectorAll('.button-collapsed-journalBox').forEach(b => { b.classList.toggle('hidden')} );
        mn.st.set({key: 'journalBox_collapsed', value: !mn.st.get('journalBox_collapsed')})
      };
      this.mnDom.querySelector('.calendar-nav-btn-prev').onclick = () => {
        mn.st.set([
          {key: 'journalBox_calendarMonth', value: mn.st.get('journalBox_calendarMonth') == 0 ? 11 : mn.st.get('journalBox_calendarMonth') - 1},
          {key: 'journalBox_calendarYear', value: mn.st.get('journalBox_calendarMonth') == 0 ? mn.st.get('journalBox_calendarYear') - 1: mn.st.get('journalBox_calendarYear')},
        ])
      };
      this.mnDom.querySelector('.calendar-nav-btn-next').onclick = () => {
        mn.st.set([
          {key: 'journalBox_calendarMonth', value: mn.st.get('journalBox_calendarMonth') == 11 ? 0 : mn.st.get('journalBox_calendarMonth') + 1},
          {key: 'journalBox_calendarYear', value: mn.st.get('journalBox_calendarMonth') == 11 ? mn.st.get('journalBox_calendarYear') + 1: mn.st.get('journalBox_calendarYear')},
        ])
      };
      this.mnDom.querySelectorAll('.calendar-cell').forEach(cell => {
        cell.addEventListener('click', async (event) => {
          const dateStr = event.currentTarget.dataset.datestr;
          console.log(dateStr);
          // await page.home.addTagview(dateStr);
          mn.ev.pub('openTabReq', {tag: dateStr});
        });
      });

    }

}