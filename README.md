# Workload Balancer

Prototype personal workload tracker: projects, milestones, work assignments, to-dos, expected time load (hours/week or % of capacity), a weekly log of completed tasks, and a performance report.

No build step. Open `index.html` in a browser, or serve the folder (`npx serve .` / `python -m http.server`).

## Structure

```
index.html        page shell (top bar, tabs, dialog, script tags)
css/styles.css    design tokens (light + dark) and all component styles
js/util.js        dates (ISO weeks, U.S. fiscal year), ids, escaping, load math
js/schema.js      entity definitions — drive forms, spreadsheet columns, import mapping
js/sample.js      example data generated relative to today
js/store.js       state, CRUD, persistence adapters (localStorage; claude.ai artifact db)
js/io.js          .xlsx / .csv / .json import and export (SheetJS)
js/outlook.js     Outlook calendar import (.ics with recurrence expansion, classic Outlook .csv)
js/report.js      performance report model + HTML / Markdown / XLSX / CSV renderers
js/app.js         views, dialogs, events, theme switch, routing (#overview, #projects, …)
```

All scripts are classic scripts sharing a `window.WB` namespace so the app runs from `file://`. Converting to ES modules is a straightforward next step.

## Data model

| Entity | Key fields |
|---|---|
| projects | name, code, status, priority, lead, start, due, loadValue, loadUnit (`hrs` or `%`) |
| milestones | title, projectId, due, status, completedOn |
| assignments | title, projectId, assignedBy, start, due, status, loadValue, loadUnit |
| todos | title, projectId, due, priority, estHours, done, doneOn |
| log | date, title, projectId, hours, category, outcome, todoId, sourceId |
| settings | name, role, org, capacity (hrs/week) |

Completing a to-do creates a linked `log` entry; un-checking removes it.
Committed load = active projects + open assignments; `%` loads convert using `settings.capacity`.

## Spreadsheet format

Export writes one sheet per entity (`Projects`, `Milestones`, `Assignments`, `To-dos`, `Weekly log`, `Settings`). Import matches sheets by name and columns by header (case/punctuation-insensitive). Rows link to projects by `Project ID`, falling back to the `Project` name column. Dates accept ISO, `m/d/yyyy`, or Excel serials.

## Ideas for next steps

- ES modules + a small test suite for `util.js` and `report.js`
- Backend adapter in `store.js` (REST or SQLite) for multi-device sync
- Recurring to-dos, per-week planned vs. actual hours, charts in the report

## Outlook meetings

Weekly log › **Import Outlook meetings** reads an Outlook calendar export and adds the selected meetings as log entries (category *Meeting* by default; hours = meeting length, rounded to 0.25).

- **.ics**: classic Outlook *File › Save Calendar*, a meeting dragged out of Outlook, or a published calendar's ICS link. Recurring series are expanded for the chosen dates (EXDATE and moved occurrences honored); TZID times, including Windows zone names, are converted to local time.
- **.csv**: classic Outlook *File › Open & Export › Import/Export › Export to a file › Comma Separated Values › Calendar*.

Cancelled meetings are dropped; Free and all-day items are left unchecked. Each entry stores a `sourceId` (`outlook:<uid>@<start>`), so re-importing the same file skips meetings already logged. Projects are guessed from earlier imports of the same subject, then from a project code or name in the subject, categories, or location.
