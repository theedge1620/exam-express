/* Workload Balancer — UI: tabs, views, forms, dialogs. */
(function () {
  const WB = (window.WB = window.WB || {});
  const U = WB.util;
  const S = WB.store;
  const esc = U.esc;
  const $ = (sel, root = document) => root.querySelector(sel);

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "projects", label: "Projects" },
    { id: "milestones", label: "Milestones" },
    { id: "assignments", label: "Assignments" },
    { id: "todos", label: "To-do" },
    { id: "log", label: "Weekly log" },
    { id: "report", label: "Report" },
  ];

  const ui = {
    tab: "overview",
    weekOf: U.weekStart(U.todayISO()),
    projFilter: "Open",
    msFilter: "Open",
    asFilter: "Open",
    showDone: false,
    period: "this-week",
    customFrom: U.addDays(U.weekStart(U.todayISO()), -21),
    customTo: U.todayISO(),
  };

  /* ---------- small renderers ---------- */
  const STATUS_TONE = {
    Active: "accent", "In progress": "accent", Assigned: "neutral", Planned: "neutral", "Not started": "neutral",
    Done: "ok", Complete: "ok", "At risk": "bad", Blocked: "bad", "On hold": "warn",
  };
  const pill = (s) => `<span class="pill tone-${STATUS_TONE[s] || "neutral"}">${esc(s || "—")}</span>`;
  const prio = (p) => `<span class="prio prio-${esc((p || "").toLowerCase())}" title="${esc(p)} priority">${esc(p ? p[0] : "")}</span>`;

  const chip = (projectId) => {
    const p = projectId && S.get("projects", projectId);
    if (!p) return `<span class="chip chip-none">No project</span>`;
    return `<span class="chip" style="--c: var(--c${(U.num(p.color) % 6) + 1})">${esc(p.code || p.name)}</span>`;
  };

  const due = (iso, done) => {
    if (!iso) return `<span class="due muted">No date</span>`;
    const n = U.daysUntil(iso);
    const tone = done ? "" : n < 0 ? "late" : n <= 3 ? "soon" : "";
    return `<span class="due ${tone}"><span class="mono">${esc(U.fmtDate(iso))}</span><small>${done ? "" : esc(U.relDays(iso))}</small></span>`;
  };

  const btn = (label, action, attrs = "", cls = "btn") => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  const rowActions = (entity, id) =>
    `<div class="row-actions">${btn("Edit", "edit", `data-entity="${entity}" data-id="${esc(id)}"`, "btn small ghost")}${btn("Delete", "del", `data-entity="${entity}" data-id="${esc(id)}"`, "btn small ghost danger-q")}</div>`;

  const segmented = (name, options, current) =>
    `<div class="seg" role="group">${options.map((o) => `<button type="button" class="${o === current ? "on" : ""}" data-action="filter" data-name="${name}" data-value="${esc(o)}" aria-pressed="${o === current}">${esc(o)}</button>`).join("")}</div>`;

  const empty = (title, body, action) =>
    `<div class="empty"><strong>${esc(title)}</strong><p>${esc(body)}</p>${action || ""}</div>`;

  /* ---------- load ---------- */
  function loadItems() {
    const st = S.state;
    const cap = U.num(st.settings.capacity) || 40;
    const items = [];
    for (const p of st.projects) if (p.status === "Active") {
      const h = U.loadHours(p, cap);
      if (h > 0) items.push({ kind: "Project", title: p.name, hours: h, color: (U.num(p.color) % 6) + 1, src: p });
    }
    for (const a of st.assignments) if (a.status !== "Done") {
      const h = U.loadHours(a, cap);
      const p = a.projectId && S.get("projects", a.projectId);
      if (h > 0) items.push({ kind: "Assignment", title: a.title, hours: h, color: p ? (U.num(p.color) % 6) + 1 : 0, src: a });
    }
    items.sort((a, b) => b.hours - a.hours);
    const total = items.reduce((s, i) => s + i.hours, 0);
    return { items, total, cap };
  }

  /* ================= VIEWS ================= */

  function viewOverview() {
    const st = S.state;
    const { items, total, cap } = loadItems();
    const pct = cap ? (total / cap) * 100 : 0;
    const scale = Math.max(total, cap) || 1;
    const over = total - cap;
    const tone = pct > 100 ? "bad" : pct >= 85 ? "warn" : "ok";

    let rail = "";
    for (const it of items) {
      const w = (it.hours / scale) * 100;
      rail += `<span class="seg-fill" style="width:${w.toFixed(2)}%; --c: var(--c${it.color || "n"})" title="${esc(it.title)}: ${U.fmtHrs(it.hours)} h/wk"></span>`;
    }
    const capLeft = (cap / scale) * 100;

    const legend = items.length
      ? items.map((it) => `<li><span class="sw" style="--c: var(--c${it.color || "n"})"></span><span class="lg-t">${esc(it.title)}<small>${it.kind} · ${esc(U.loadLabel(it.src))}</small></span><b class="mono">${U.fmtHrs(it.hours)} h</b></li>`).join("")
      : `<li class="muted">No load recorded. Add hours or a percentage to an active project or assignment.</li>`;

    // Due soon
    const horizon = U.addDays(U.todayISO(), 14);
    const dueItems = [];
    for (const m of st.milestones) if (m.status !== "Done" && m.due && m.due <= horizon) dueItems.push({ kind: "Milestone", title: m.title, due: m.due, pid: m.projectId, status: m.status, entity: "milestones", id: m.id });
    for (const a of st.assignments) if (a.status !== "Done" && a.due && a.due <= horizon) dueItems.push({ kind: "Assignment", title: a.title, due: a.due, pid: a.projectId, status: a.status, entity: "assignments", id: a.id });
    for (const t of st.todos) if (!t.done && t.due && t.due <= horizon) dueItems.push({ kind: "To-do", title: t.title, due: t.due, pid: t.projectId, status: "", entity: "todos", id: t.id });
    dueItems.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));

    // This week
    const ws = U.weekStart(U.todayISO());
    const we = U.addDays(ws, 6);
    const wk = st.log.filter((l) => l.date >= ws && l.date <= we);
    const wkHours = wk.reduce((s, l) => s + U.num(l.hours), 0);
    const days = [0, 1, 2, 3, 4].map((i) => {
      const d = U.addDays(ws, i);
      return { d, h: wk.filter((l) => l.date === d).reduce((s, l) => s + U.num(l.hours), 0) };
    });
    const dayMax = Math.max(cap / 5, ...days.map((x) => x.h), 1);

    const active = st.projects.filter((p) => p.status === "Active" || p.status === "On hold");

    return `
    <section class="grid-load">
      <article class="panel load-panel">
        <div class="panel-head">
          <div>
            <h2 class="h-sec">Committed load</h2>
            <p class="sub">Active projects and open assignments against a ${U.fmtHrs(cap)}-hour week</p>
          </div>
          <div class="load-figure tone-text-${tone}">
            <span class="big mono">${U.pct(pct)}</span>
            <small class="mono">${U.fmtHrs(total)} / ${U.fmtHrs(cap)} h</small>
          </div>
        </div>
        <div class="rail ${over > 0 ? "is-over" : ""}" role="img" aria-label="${U.fmtHrs(total)} of ${U.fmtHrs(cap)} hours committed">
          ${rail}
          ${over > 0 ? `<span class="overflow" style="left:${capLeft.toFixed(2)}%"></span>` : ""}
          <span class="cap-mark ${capLeft > 85 ? "end" : ""}" style="left:${capLeft.toFixed(2)}%"><em>Capacity</em></span>
        </div>
        <p class="load-note tone-text-${tone}">${over > 0 ? `Over capacity by ${U.fmtHrs(over)} h/wk. Something should move, pause, or be handed off.` : pct >= 85 ? `${U.fmtHrs(-over)} h/wk of headroom. Close to full.` : `${U.fmtHrs(-over)} h/wk of headroom.`}</p>
        <ul class="legend">${legend}</ul>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div><h2 class="h-sec">This week</h2><p class="sub mono">${esc(U.weekLabel(ws))}</p></div>
          ${btn("Open log", "goto", 'data-tab="log"', "btn small")}
        </div>
        <div class="kpis">
          <div><span class="k-v mono">${wk.length}</span><span class="k-l">tasks completed</span></div>
          <div><span class="k-v mono">${U.fmtHrs(wkHours)}</span><span class="k-l">hours logged</span></div>
          <div><span class="k-v mono">${U.pct(cap ? (wkHours / cap) * 100 : 0)}</span><span class="k-l">of capacity</span></div>
        </div>
        <div class="daybars" aria-label="Hours logged per weekday">
          ${days.map((x) => `<div class="db ${x.d === U.todayISO() ? "today" : ""}"><span class="db-col"><span style="height:${((x.h / dayMax) * 100).toFixed(1)}%"></span></span><span class="db-l">${U.fmtDow(x.d)}</span><span class="db-v mono">${x.h ? U.fmtHrs(x.h) : ""}</span></div>`).join("")}
        </div>
      </article>
    </section>

    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><div><h2 class="h-sec">Due in the next 14 days</h2><p class="sub">Overdue items first</p></div></div>
        ${dueItems.length ? `<ul class="due-list">${dueItems.map((d) => `
          <li>
            ${due(d.due)}
            <div class="dl-main"><span class="dl-t">${esc(d.title)}</span><span class="dl-m"><span class="kind">${d.kind}</span>${chip(d.pid)}${d.status ? pill(d.status) : ""}</span></div>
            ${d.entity === "todos" ? `<label class="check"><input type="checkbox" data-action="todo-done" data-id="${esc(d.id)}"><span>Done</span></label>` : btn("Edit", "edit", `data-entity="${d.entity}" data-id="${esc(d.id)}"`, "btn small ghost")}
          </li>`).join("")}</ul>` : empty("Nothing due soon", "No milestones, assignments, or to-dos are due in the next two weeks.")}
      </article>

      <article class="panel">
        <div class="panel-head"><div><h2 class="h-sec">Projects in flight</h2><p class="sub">${active.length} active or on hold</p></div>${btn("All projects", "goto", 'data-tab="projects"', "btn small")}</div>
        ${active.length ? `<ul class="proj-list">${active.map((p) => {
          const ms = st.milestones.filter((m) => m.projectId === p.id);
          const done = ms.filter((m) => m.status === "Done").length;
          const open = st.todos.filter((t) => t.projectId === p.id && !t.done).length;
          return `<li>
            <div class="pl-top"><span class="pl-name"><span class="sw" style="--c: var(--c${(U.num(p.color) % 6) + 1})"></span>${esc(p.name)}</span>${pill(p.status)}</div>
            <div class="pl-meta">
              <span class="progress" title="${done} of ${ms.length} milestones done"><span style="width:${ms.length ? (done / ms.length) * 100 : 0}%"></span></span>
              <span class="mono">${done}/${ms.length} milestones</span>
              <span>${open} open to-do${open === 1 ? "" : "s"}</span>
              <span>${p.due ? "due " + esc(U.fmtDate(p.due)) : "no due date"}</span>
            </div>
          </li>`;
        }).join("")}</ul>` : empty("No active projects", "Add a project and set it to Active to track it here.", btn("Add project", "add", 'data-entity="projects"', "btn primary small"))}
      </article>
    </section>`;
  }

  function viewProjects() {
    const st = S.state;
    const f = ui.projFilter;
    let list = st.projects.slice();
    if (f === "Open") list = list.filter((p) => p.status !== "Complete");
    else if (f !== "All") list = list.filter((p) => p.status === f);
    list.sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
    const cap = U.num(st.settings.capacity) || 40;

    return `
    <div class="toolbar">
      <h2 class="h-view">Projects</h2>
      ${segmented("projFilter", ["Open", "Active", "Planned", "On hold", "Complete", "All"], f)}
      ${btn("Add project", "add", 'data-entity="projects"', "btn primary")}
    </div>
    ${list.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Project</th><th>Status</th><th>Priority</th><th>Lead</th><th>Start</th><th>Due</th><th class="n">Load</th><th>Milestones</th><th class="n">Open to-dos</th><th></th></tr></thead>
      <tbody>${list.map((p) => {
        const ms = st.milestones.filter((m) => m.projectId === p.id);
        const done = ms.filter((m) => m.status === "Done").length;
        const open = st.todos.filter((t) => t.projectId === p.id && !t.done).length;
        return `<tr>
          <td class="t-main"><span class="sw" style="--c: var(--c${(U.num(p.color) % 6) + 1})"></span><div><strong>${esc(p.name)}</strong>${p.code ? `<small class="mono">${esc(p.code)}</small>` : ""}</div></td>
          <td>${pill(p.status)}</td>
          <td>${prio(p.priority)}</td>
          <td>${esc(p.lead) || '<span class="muted">—</span>'}</td>
          <td class="mono">${p.start ? esc(U.fmtDate(p.start)) : "—"}</td>
          <td>${due(p.due, p.status === "Complete")}</td>
          <td class="n mono">${esc(U.loadLabel(p))}${p.loadUnit === "%" && U.num(p.loadValue) ? `<small>${U.fmtHrs(U.loadHours(p, cap))} h</small>` : ""}</td>
          <td><span class="progress" title="${done} of ${ms.length}"><span style="width:${ms.length ? (done / ms.length) * 100 : 0}%"></span></span> <span class="mono small">${done}/${ms.length}</span></td>
          <td class="n mono">${open}</td>
          <td>${rowActions("projects", p.id)}</td>
        </tr>`;
      }).join("")}</tbody></table></div>` : empty("No projects here", f === "All" ? "Add your first project to start tracking load and milestones." : "No projects match this filter.", btn("Add project", "add", 'data-entity="projects"', "btn primary small"))}`;
  }

  function viewMilestones() {
    const st = S.state;
    let list = st.milestones.slice();
    if (ui.msFilter === "Open") list = list.filter((m) => m.status !== "Done");
    else if (ui.msFilter === "Done") list = list.filter((m) => m.status === "Done");
    list.sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);

    // Group by month of due date
    const groups = new Map();
    for (const m of list) {
      const k = m.due ? m.due.slice(0, 7) : "none";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    const monthLabel = (k) => {
      if (k === "none") return "No due date";
      const d = U.parseISO(k + "-01");
      return d.toLocaleString("en-US", { month: "long", year: "numeric" });
    };

    return `
    <div class="toolbar">
      <h2 class="h-view">Milestones</h2>
      ${segmented("msFilter", ["Open", "Done", "All"], ui.msFilter)}
      ${btn("Add milestone", "add", 'data-entity="milestones"', "btn primary")}
    </div>
    ${list.length ? [...groups.entries()].map(([k, ms]) => `
      <h3 class="group-label">${esc(monthLabel(k))}</h3>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th class="w-due">Due</th><th>Milestone</th><th>Project</th><th>Status</th><th>Completed</th><th></th></tr></thead>
        <tbody>${ms.map((m) => `<tr>
          <td class="w-due">${due(m.due, m.status === "Done")}</td>
          <td class="t-main"><div><strong>${esc(m.title)}</strong>${m.notes ? `<small>${esc(m.notes)}</small>` : ""}</div></td>
          <td>${chip(m.projectId)}</td>
          <td>${pill(m.status)}</td>
          <td class="mono">${m.completedOn ? esc(U.fmtDate(m.completedOn)) : m.status !== "Done" ? btn("Mark done", "ms-done", `data-id="${esc(m.id)}"`, "btn small") : "—"}</td>
          <td>${rowActions("milestones", m.id)}</td>
        </tr>`).join("")}</tbody></table></div>`).join("")
      : empty("No milestones", "Milestones mark the dates a project is judged against.", btn("Add milestone", "add", 'data-entity="milestones"', "btn primary small"))}`;
  }

  function viewAssignments() {
    const st = S.state;
    const cap = U.num(st.settings.capacity) || 40;
    let list = st.assignments.slice();
    if (ui.asFilter === "Open") list = list.filter((a) => a.status !== "Done");
    else if (ui.asFilter !== "All") list = list.filter((a) => a.status === ui.asFilter);
    list.sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);

    return `
    <div class="toolbar">
      <h2 class="h-view">Work assignments</h2>
      ${segmented("asFilter", ["Open", "Blocked", "Done", "All"], ui.asFilter)}
      ${btn("Add assignment", "add", 'data-entity="assignments"', "btn primary")}
    </div>
    ${list.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Assignment</th><th>Project</th><th>Assigned by</th><th>Start</th><th class="w-due">Due</th><th>Status</th><th class="n">Load</th><th></th></tr></thead>
      <tbody>${list.map((a) => `<tr>
        <td class="t-main"><div><strong>${esc(a.title)}</strong>${a.notes ? `<small>${esc(a.notes)}</small>` : ""}</div></td>
        <td>${chip(a.projectId)}</td>
        <td>${esc(a.assignedBy) || '<span class="muted">—</span>'}</td>
        <td class="mono">${a.start ? esc(U.fmtDate(a.start)) : "—"}</td>
        <td class="w-due">${due(a.due, a.status === "Done")}</td>
        <td>${pill(a.status)}</td>
        <td class="n mono">${esc(U.loadLabel(a))}${a.loadUnit === "%" && U.num(a.loadValue) ? `<small>${U.fmtHrs(U.loadHours(a, cap))} h</small>` : ""}</td>
        <td>${rowActions("assignments", a.id)}</td>
      </tr>`).join("")}</tbody></table></div>`
      : empty("No assignments here", "Log taskings you receive, who assigned them, and the time they take.", btn("Add assignment", "add", 'data-entity="assignments"', "btn primary small"))}
    <p class="hint">Set load on a project or on its assignments, not both, so committed hours are not counted twice.</p>`;
  }

  function projectOptions(selected, noneLabel = "No project") {
    const ps = S.state.projects.slice().sort((a, b) => a.name.localeCompare(b.name));
    return `<option value="">${esc(noneLabel)}</option>` + ps.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  }

  function viewTodos() {
    const st = S.state;
    const today = U.todayISO();
    const weekEnd = U.addDays(U.weekStart(today), 6);
    const open = st.todos.filter((t) => !t.done);
    const rank = { High: 0, Medium: 1, Low: 2 };
    const sort = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
    const groups = [
      ["Overdue", open.filter((t) => t.due && t.due < today)],
      ["Today", open.filter((t) => t.due === today)],
      ["Rest of this week", open.filter((t) => t.due > today && t.due <= weekEnd)],
      ["Later", open.filter((t) => t.due > weekEnd)],
      ["No date", open.filter((t) => !t.due)],
    ];
    const doneList = st.todos.filter((t) => t.done).sort((a, b) => (b.doneOn || "").localeCompare(a.doneOn || ""));
    const estOpen = open.reduce((s, t) => s + U.num(t.estHours), 0);

    const item = (t) => `<li class="todo ${t.done ? "is-done" : ""}">
      <label class="check big"><input type="checkbox" data-action="todo-done" data-id="${esc(t.id)}" ${t.done ? "checked" : ""}><span class="sr">Done</span></label>
      ${prio(t.priority)}
      <div class="td-main"><span class="td-t">${esc(t.title)}</span><span class="td-m">${chip(t.projectId)}${U.num(t.estHours) ? `<span class="mono">${U.fmtHrs(U.num(t.estHours))} h est.</span>` : ""}${t.done && t.doneOn ? `<span>done ${esc(U.fmtDate(t.doneOn))}</span>` : ""}</span></div>
      ${t.done ? "" : due(t.due)}
      ${rowActions("todos", t.id)}
    </li>`;

    return `
    <div class="toolbar">
      <h2 class="h-view">To-do</h2>
      <span class="sub mono">${open.length} open · ${U.fmtHrs(estOpen)} h estimated</span>
    </div>
    <form class="quick-add panel" id="todo-quick" autocomplete="off">
      <label class="qa-title"><span class="sr">Task</span><input id="qa-title" name="title" placeholder="Add a to-do, then press Enter" required></label>
      <label><span class="lbl">Project</span><select id="qa-project">${projectOptions("")}</select></label>
      <label><span class="lbl">Due</span><input type="date" id="qa-due"></label>
      <label><span class="lbl">Priority</span><select id="qa-prio"><option>High</option><option selected>Medium</option><option>Low</option></select></label>
      <label class="qa-num"><span class="lbl">Est. h</span><input type="number" id="qa-est" min="0" step="0.25" inputmode="decimal"></label>
      <button class="btn primary" type="submit">Add</button>
    </form>
    ${open.length ? groups.filter(([, l]) => l.length).map(([label, l]) => `
      <h3 class="group-label ${label === "Overdue" ? "tone-text-bad" : ""}">${label} <span class="count">${l.length}</span></h3>
      <ul class="todo-list">${l.sort(sort).map(item).join("")}</ul>`).join("") : empty("All clear", "No open to-dos. Add one above.")}
    <div class="done-toggle">${btn((ui.showDone ? "Hide" : "Show") + ` completed (${doneList.length})`, "toggle-done", "", "btn ghost small")}</div>
    ${ui.showDone && doneList.length ? `<ul class="todo-list">${doneList.slice(0, 50).map(item).join("")}</ul>` : ""}
    <p class="hint">Checking a to-do adds it to this week's log with its estimated hours. Edit the log entry to record actual time and outcome.</p>`;
  }

  function viewLog() {
    const st = S.state;
    const cap = U.num(st.settings.capacity) || 40;
    const ws = ui.weekOf;
    const we = U.addDays(ws, 6);
    const entries = st.log.filter((l) => l.date >= ws && l.date <= we);
    const hours = entries.reduce((s, l) => s + U.num(l.hours), 0);
    const util = cap ? (hours / cap) * 100 : 0;
    const msDone = st.milestones.filter((m) => m.status === "Done" && (m.completedOn || "") >= ws && (m.completedOn || "") <= we);
    const thisWeek = ws === U.weekStart(U.todayISO());
    const defaultDate = thisWeek ? U.todayISO() : ws;
    const dueOpen = st.todos.filter((t) => !t.done && t.due && t.due <= we).sort((a, b) => a.due.localeCompare(b.due));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(ws, i);
      const es = entries.filter((e) => e.date === d);
      if (i < 5 || es.length) days.push({ d, es });
    }

    return `
    <div class="toolbar">
      <h2 class="h-view">Weekly log</h2>
      <div class="weeknav">
        ${btn("‹", "week", 'data-delta="-7" aria-label="Previous week"', "btn ghost icon")}
        <span class="mono wk-label">${esc(U.weekLabel(ws))}</span>
        ${btn("›", "week", 'data-delta="7" aria-label="Next week"', "btn ghost icon")}
        ${thisWeek ? "" : btn("This week", "week", 'data-delta="0"', "btn small")}
      </div>
      <span class="spacer"></span>
      ${btn("Import Outlook meetings", "outlook-import", 'title="Add meetings from an Outlook calendar export (.ics or .csv)"', "btn")}
    </div>

    <section class="log-summary panel">
      <div class="ls-kpi"><span class="k-v mono">${entries.length}</span><span class="k-l">tasks completed</span></div>
      <div class="ls-kpi"><span class="k-v mono">${U.fmtHrs(hours)}<small> / ${U.fmtHrs(cap)} h</small></span><span class="k-l">hours logged</span></div>
      <div class="ls-meter"><span class="k-l">Utilization ${U.pct(util)}</span><span class="meter"><span class="${util > 100 ? "over" : ""}" style="width:${Math.min(100, util).toFixed(1)}%"></span></span></div>
      <div class="ls-kpi"><span class="k-v mono">${msDone.length}</span><span class="k-l">milestones met</span></div>
    </section>

    <form class="log-add panel" id="log-add" autocomplete="off">
      <h3 class="h-sub">Log a completed task</h3>
      <div class="la-grid">
        <label class="la-title"><span class="lbl">Completed task</span><input id="la-title" required placeholder="What did you finish?"></label>
        <label><span class="lbl">Date</span><input type="date" id="la-date" value="${defaultDate}" required></label>
        <label><span class="lbl">Project</span><select id="la-project">${projectOptions("")}</select></label>
        <label><span class="lbl">Category</span><select id="la-cat">${WB.schema.log.fields.find((f) => f.key === "category").options.map((o) => `<option>${o}</option>`).join("")}</select></label>
        <label class="la-num"><span class="lbl">Hours</span><input type="number" id="la-hours" min="0" step="0.25" inputmode="decimal"></label>
        <label class="la-out"><span class="lbl">Outcome / impact</span><input id="la-outcome" placeholder="Result, decision, or metric (optional)"></label>
        <button class="btn primary" type="submit">Add to log</button>
      </div>
    </form>

    <div class="days">
      ${days.map(({ d, es }) => `
        <section class="day ${d === U.todayISO() ? "is-today" : ""}">
          <header><span class="day-name">${U.fmtDow(d)}</span><span class="mono">${esc(U.fmtDate(d))}</span><span class="mono day-h">${es.length ? U.fmtHrs(es.reduce((s, e) => s + U.num(e.hours), 0)) + " h" : ""}</span></header>
          ${es.length ? `<ul>${es.map((e) => `<li>
            <div class="le-main"><span class="le-t">${esc(e.title)}</span>${e.outcome ? `<span class="le-o">${esc(e.outcome)}</span>` : ""}<span class="le-m">${chip(e.projectId)}<span class="kind">${esc(e.category)}</span></span></div>
            <span class="mono le-h">${U.fmtHrs(U.num(e.hours))} h</span>
            ${rowActions("log", e.id)}
          </li>`).join("")}</ul>` : `<p class="day-empty">Nothing logged</p>`}
        </section>`).join("")}
    </div>

    ${dueOpen.length ? `<section class="panel">
      <h3 class="h-sub">Open to-dos due by ${esc(U.fmtDate(we))}</h3>
      <ul class="todo-list compact">${dueOpen.map((t) => `<li class="todo">
        <label class="check big"><input type="checkbox" data-action="todo-done" data-id="${esc(t.id)}"><span class="sr">Done</span></label>
        ${prio(t.priority)}<div class="td-main"><span class="td-t">${esc(t.title)}</span><span class="td-m">${chip(t.projectId)}</span></div>${due(t.due)}
      </li>`).join("")}</ul>
    </section>` : ""}`;
  }

  /* ---------- report ---------- */
  function reportRange() {
    const P = WB.report.periods();
    if (ui.period === "custom") return { from: ui.customFrom, to: ui.customTo, label: "Custom range" };
    return P[ui.period] || P["this-week"];
  }

  function viewReport() {
    const P = WB.report.periods();
    const r = reportRange();
    const m = WB.report.build(S.state, r.from, r.to);
    const s = S.state.settings;
    return `
    <div class="toolbar">
      <h2 class="h-view">Performance report</h2>
      <span class="sub">Completed work, hours, and milestones for a period</span>
    </div>
    <div class="report-layout">
      <aside class="panel report-controls">
        <h3 class="h-sub">Period</h3>
        <div class="period-list">
          ${Object.entries(P).map(([k, v]) => `<label class="radio"><input type="radio" name="period" value="${k}" data-action="period" ${ui.period === k ? "checked" : ""}><span>${esc(v.label)}<small class="mono">${esc(U.fmtDate(v.from))} – ${esc(U.fmtDate(v.to))}</small></span></label>`).join("")}
          <label class="radio"><input type="radio" name="period" value="custom" data-action="period" ${ui.period === "custom" ? "checked" : ""}><span>Custom range</span></label>
          <div class="custom-range" ${ui.period === "custom" ? "" : "hidden"}>
            <label><span class="lbl">From</span><input type="date" id="rp-from" value="${esc(ui.customFrom)}"></label>
            <label><span class="lbl">To</span><input type="date" id="rp-to" value="${esc(ui.customTo)}"></label>
          </div>
        </div>
        <h3 class="h-sub">Summary notes</h3>
        <textarea id="rp-notes" rows="6" placeholder="Highlights, context, or next steps. Saved with this period.">${esc(m.notes)}</textarea>
        ${!s.name && !s.role ? `<p class="hint">Add your name and role in ${btn("Settings", "settings", "", "linkbtn")} so they appear on the report.</p>` : ""}
        <h3 class="h-sub">Export</h3>
        <div class="export-grid">
          ${btn("Web page (.html)", "rp-export", 'data-fmt="html"', "btn")}
          ${btn("Excel (.xlsx)", "rp-export", 'data-fmt="xlsx"', "btn")}
          ${btn("Markdown (.md)", "rp-export", 'data-fmt="md"', "btn")}
          ${btn("Task list (.csv)", "rp-export", 'data-fmt="csv"', "btn")}
          ${btn("Copy as Markdown", "rp-copy", "", "btn ghost")}
        </div>
        <p class="hint">The .html file opens in any browser or in Word and prints cleanly.</p>
      </aside>
      <div class="paper" id="rp-preview"><div class="report-doc">${WB.report.toHTML(m)}</div></div>
    </div>`;
  }

  function refreshReportPreview() {
    const el = $("#rp-preview");
    if (!el) return;
    const r = reportRange();
    el.innerHTML = `<div class="report-doc">${WB.report.toHTML(WB.report.build(S.state, r.from, r.to))}</div>`;
  }

  /* ================= SHELL ================= */

  function renderTabs() {
    $("#tabs").innerHTML = TABS.map((t) => `<a href="#${t.id}" role="tab" class="tab ${ui.tab === t.id ? "on" : ""}" aria-selected="${ui.tab === t.id}" data-action="tab" data-tab="${t.id}">${t.label}${badge(t.id)}</a>`).join("");
  }
  function badge(id) {
    const st = S.state;
    const today = U.todayISO();
    let n = 0;
    if (id === "todos") n = st.todos.filter((t) => !t.done && t.due && t.due < today).length;
    if (id === "milestones") n = st.milestones.filter((m) => m.status !== "Done" && ((m.due && m.due < today) || m.status === "At risk")).length;
    if (id === "assignments") n = st.assignments.filter((a) => a.status === "Blocked" || (a.status !== "Done" && a.due && a.due < today)).length;
    return n ? `<span class="tab-badge" title="${n} need attention">${n}</span>` : "";
  }

  function renderStamp() {
    const t = U.todayISO();
    const s = S.state.settings;
    $("#stamp").textContent = [U.fiscal(t).label, U.weekLabel(U.weekStart(t)), s.name].filter(Boolean).join("  ·  ");
    $("#save-state").textContent = S.backend === "cloud" ? "Saved to your account" : "Saved in this browser";
  }

  function renderBanner() {
    const ex = S.state.meta.example;
    $("#banner").innerHTML = ex
      ? `<div class="banner" role="note"><span><strong>Example data.</strong> ${ex === "edited" ? "Your edits are saved alongside the example rows." : "Nothing is saved until you make a change."} Start empty or import your own spreadsheet when ready.</span>
         <span class="banner-actions">${btn("Start empty", "start-empty", "", "btn small")}${btn("Import", "open-import", "", "btn small ghost")}${btn("Keep and hide", "keep-example", "", "btn small ghost")}</span></div>`
      : "";
  }

  const VIEWS = { overview: viewOverview, projects: viewProjects, milestones: viewMilestones, assignments: viewAssignments, todos: viewTodos, log: viewLog, report: viewReport };

  function render() {
    renderTabs();
    renderBanner();
    renderStamp();
    const v = $("#view");
    v.innerHTML = (VIEWS[ui.tab] || viewOverview)();
    v.dataset.view = ui.tab;
  }
  WB.render = render;

  /* ================= MODAL ================= */
  const modal = () => $("#modal");

  function openModal(title, bodyHTML, onSubmit, submitLabel = "Save", extraFoot = "") {
    const d = modal();
    d.classList.remove("wide");
    d.innerHTML = `<form method="dialog" class="modal-form" id="modal-form" novalidate>
      <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn ghost icon" data-action="close-modal" aria-label="Close">×</button></header>
      <div class="modal-body">${bodyHTML}</div>
      <footer class="modal-foot">${extraFoot}<span class="spacer"></span>${btn("Cancel", "close-modal", "", "btn ghost")}${onSubmit ? `<button type="submit" class="btn primary" id="modal-submit">${esc(submitLabel)}</button>` : ""}</footer>
    </form>`;
    const form = $("#modal-form", d);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (onSubmit && onSubmit(form) !== false) closeModal();
    });
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    const first = d.querySelector(".modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea");
    if (first) first.focus();
  }
  function closeModal() {
    const d = modal();
    if (typeof d.close === "function" && d.open) d.close();
    else d.removeAttribute("open");
  }

  function fieldHTML(entity, f, rec) {
    const id = "f-" + f.key;
    const v = rec[f.key] ?? "";
    const req = f.required ? "required" : "";
    const label = `<span class="lbl">${esc(f.header)}${f.required ? " *" : ""}</span>`;
    switch (f.type) {
      case "text":
        return `<label class="fld">${label}<input id="${id}" value="${esc(v)}" ${req} placeholder="${esc(f.placeholder || "")}"></label>`;
      case "textarea":
        return `<label class="fld wide">${label}<textarea id="${id}" rows="3">${esc(v)}</textarea></label>`;
      case "date":
        return `<label class="fld">${label}<input type="date" id="${id}" value="${esc(v)}" ${req}></label>`;
      case "number":
        return `<label class="fld">${label}<input type="number" id="${id}" value="${esc(v)}" step="${f.step || "any"}" min="${f.min ?? ""}" inputmode="decimal"></label>`;
      case "select":
        return `<label class="fld">${label}<select id="${id}">${f.options.map((o) => `<option value="${esc(WB.optValue(o))}" ${WB.optValue(o) === v ? "selected" : ""}>${esc(WB.optLabel(o))}</option>`).join("")}</select></label>`;
      case "ref":
        return `<label class="fld">${"<span class=\"lbl\">Project</span>"}<select id="${id}">${projectOptions(v)}</select></label>`;
      case "bool":
        return `<label class="fld check-fld"><input type="checkbox" id="${id}" ${v ? "checked" : ""}><span>${esc(f.header)}</span></label>`;
      default:
        return "";
    }
  }

  function openEntityForm(entity, id, preset) {
    const def = WB.schema[entity];
    const rec = id ? Object.assign({}, S.get(entity, id)) : Object.assign(WB.blank(entity), preset || {});
    const fields = def.fields.filter((f) => f.type !== "id" && f.type !== "hidden");
    let body = `<div class="form-grid">`;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.group === "load") {
        const pair = fields.filter((x) => x.group === "load");
        if (f !== pair[0]) continue;
        body += `<div class="fld load-pair"><span class="lbl">Expected time load</span><div class="pair">
          <input type="number" id="f-loadValue" value="${esc(rec.loadValue ?? "")}" min="0" step="0.5" inputmode="decimal" aria-label="Load amount">
          <select id="f-loadUnit" aria-label="Load unit">${f === pair[0] ? pair[1].options.map((o) => `<option value="${o.value}" ${o.value === (rec.loadUnit || "hrs") ? "selected" : ""}>${o.label}</option>`).join("") : ""}</select>
        </div><small class="muted">Capacity is ${U.fmtHrs(S.state.settings.capacity)} h/week</small></div>`;
        continue;
      }
      body += fieldHTML(entity, f, rec);
    }
    body += `</div><p class="form-error" id="form-error" hidden></p>`;

    openModal((id ? "Edit " : "New ") + def.singular.toLowerCase(), body, (form) => {
      const out = { id: rec.id };
      for (const f of def.fields) {
        const el = form.querySelector("#f-" + f.key);
        if (!el) continue;
        if (f.type === "bool") out[f.key] = el.checked;
        else if (f.type === "number") out[f.key] = el.value === "" ? "" : U.num(el.value);
        else out[f.key] = el.value.trim();
      }
      const missing = def.fields.find((f) => f.required && !out[f.key]);
      if (missing) {
        const err = form.querySelector("#form-error");
        err.textContent = missing.header + " is required.";
        err.hidden = false;
        form.querySelector("#f-" + missing.key).focus();
        return false;
      }
      if (entity === "milestones") {
        if (out.status === "Done" && !out.completedOn) out.completedOn = U.todayISO();
        if (out.status !== "Done") out.completedOn = "";
      }
      if (entity === "todos") {
        const wasDone = !!(id && S.get("todos", id).done);
        const savedId = S.upsert(entity, Object.assign({}, out, { done: wasDone }));
        if (!!out.done !== wasDone) S.setTodoDone(savedId, out.done);
        toast(id ? "To-do updated" : "To-do added");
        return;
      }
      S.upsert(entity, out);
      toast(def.singular + (id ? " updated" : " added"));
    }, id ? "Save changes" : "Add " + def.singular.toLowerCase());
  }

  function openSettings() {
    const s = S.state.settings;
    const body = `<div class="form-grid">
      <label class="fld"><span class="lbl">Name</span><input id="s-name" value="${esc(s.name)}"></label>
      <label class="fld"><span class="lbl">Role / title</span><input id="s-role" value="${esc(s.role)}"></label>
      <label class="fld"><span class="lbl">Organization</span><input id="s-org" value="${esc(s.org)}"></label>
      <label class="fld"><span class="lbl">Weekly capacity (hours)</span><input type="number" id="s-cap" value="${esc(s.capacity)}" min="1" step="0.5"></label>
    </div>
    <div class="danger-zone">
      <div><strong>Clear all data</strong><p class="muted">Removes every project, milestone, assignment, to-do, and log entry. Export a backup first.</p></div>
      ${btn("Clear all data", "clear-all", "", "btn danger-q")}
    </div>`;
    openModal("Settings", body, (form) => {
      s.name = form.querySelector("#s-name").value.trim();
      s.role = form.querySelector("#s-role").value.trim();
      s.org = form.querySelector("#s-org").value.trim();
      s.capacity = U.num(form.querySelector("#s-cap").value) || 40;
      S.commit();
      toast("Settings saved");
    });
  }

  function openExport() {
    const body = `<div class="export-options">
      <div class="xo"><div><strong>Workbook (.xlsx)</strong><p class="muted">Every list on its own sheet: projects, milestones, assignments, to-dos, weekly log, settings. Edit it in Excel and import it back.</p></div>${btn("Export workbook", "x-xlsx", "", "btn primary")}</div>
      <div class="xo"><div><strong>Single list (.csv)</strong><p class="muted">One list as comma-separated values.</p></div>
        <div class="xo-row"><select id="x-csv-entity" aria-label="List to export">${WB.ENTITIES.map((e) => `<option value="${e}">${WB.schema[e].label}</option>`).join("")}</select>${btn("Export CSV", "x-csv", "", "btn")}</div></div>
      <div class="xo"><div><strong>Full backup (.json)</strong><p class="muted">Exact copy of everything, including report notes. Best for moving between browsers.</p></div>${btn("Export backup", "x-json", "", "btn")}</div>
    </div>`;
    openModal("Export data", body, null);
  }

  let pendingImport = null;
  function openImport() {
    pendingImport = null;
    const body = `
      <label class="drop" id="drop">
        <input type="file" id="imp-file" accept=".xlsx,.xls,.csv,.json" class="sr">
        <strong>Choose a file</strong><span class="muted">or drop it here · .xlsx, .csv, or .json</span>
        <span class="mono" id="imp-name"></span>
      </label>
      <label class="fld" id="imp-csv-wrap" hidden><span class="lbl">This CSV contains</span><select id="imp-csv-entity">${WB.ENTITIES.map((e) => `<option value="${e}">${WB.schema[e].label}</option>`).join("")}</select></label>
      <fieldset class="imp-mode"><legend class="lbl">How to import</legend>
        <label class="radio"><input type="radio" name="imp-mode" value="merge" checked><span>Merge<small>Add new rows; rows with a matching ID are updated</small></span></label>
        <label class="radio"><input type="radio" name="imp-mode" value="replace"><span>Replace everything<small>Current data is removed first</small></span></label>
      </fieldset>
      <div id="imp-summary" class="imp-summary" hidden></div>
      <p class="hint">Spreadsheet columns are matched by header name (for example Project, Due, Status, Load, Load unit). Rows link to projects by Project ID, or by project name when there is no ID. Export a workbook first to see the expected layout. To bring in meetings from an Outlook calendar export, use <a href="#log" data-action="goto" data-tab="log">Weekly log › Import Outlook meetings</a>.</p>`;
    openModal("Import data", body, () => {
      if (!pendingImport) return false;
      const mode = document.querySelector('input[name="imp-mode"]:checked').value;
      const { data, hasSettings } = pendingImport;
      if (mode === "replace") {
        const next = Object.assign({}, data);
        next.settings = hasSettings ? Object.assign({}, S.state.settings, data.settings) : S.state.settings;
        next.reportNotes = data.reportNotes || {};
        S.replaceAll(next);
        toast("Data replaced from file");
      } else {
        const inc = Object.assign({}, data);
        if (!hasSettings) delete inc.settings;
        const r = S.merge(inc);
        toast(`Imported: ${r.added} added, ${r.updated} updated`);
      }
    }, "Import");
    $("#modal-submit").disabled = true;

    const fileInput = $("#imp-file");
    const handle = async (file) => {
      if (!file) return;
      $("#imp-name").textContent = file.name;
      const isCSV = /\.csv$/i.test(file.name);
      $("#imp-csv-wrap").hidden = !isCSV;
      const parse = async () => {
        const sum = $("#imp-summary");
        try {
          pendingImport = await WB.io.parseFile(file, $("#imp-csv-entity").value);
          const counts = WB.ENTITIES.map((e) => [WB.schema[e].label, pendingImport.data[e].length]).filter(([, n]) => n);
          sum.hidden = false;
          sum.innerHTML = counts.length
            ? `<strong>Found</strong> ${counts.map(([l, n]) => `<span class="mono">${n}</span> ${esc(l.toLowerCase())}`).join(" · ")}`
            : `<strong class="tone-text-bad">No rows found.</strong> Check that sheet names match the export (Projects, Milestones, Assignments, To-dos, Weekly log).`;
          $("#modal-submit").disabled = !counts.length;
        } catch (err) {
          pendingImport = null;
          sum.hidden = false;
          sum.innerHTML = `<strong class="tone-text-bad">Could not read this file.</strong> ${esc(err.message || "")}`;
          $("#modal-submit").disabled = true;
        }
      };
      $("#imp-csv-entity").onchange = parse;
      await parse();
    };
    fileInput.addEventListener("change", () => handle(fileInput.files[0]));
    const drop = $("#drop");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); });
  }

  /* ================= OUTLOOK MEETINGS ================= */
  let olState = null; // { source, rows: [{ m, on, hours, projectId, logged }] }

  function openOutlookImport() {
    const ws = ui.weekOf;
    olState = { source: null, rows: [] };
    const cats = WB.schema.log.fields.find((f) => f.key === "category").options;
    const body = `
      <label class="drop" id="ol-drop">
        <input type="file" id="ol-file" accept=".ics,.ical,.vcs,.csv" class="sr">
        <strong>Choose an Outlook calendar export</strong><span class="muted">or drop it here · .ics or .csv</span>
        <span class="mono" id="ol-name"></span>
      </label>
      <div class="ol-opts">
        <label><span class="lbl">From</span><input type="date" id="ol-from" value="${ws}"></label>
        <label><span class="lbl">To</span><input type="date" id="ol-to" value="${U.addDays(ws, 6)}"></label>
        <label><span class="lbl">Default category</span><select id="ol-cat">${cats.map((o) => `<option ${o === "Meeting" ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>
        <label class="check ol-allday"><input type="checkbox" id="ol-allday"> Include all-day events</label>
      </div>
      <div id="ol-list" class="ol-list" hidden></div>
      <details class="hint ol-help"><summary>How to export from Outlook</summary>
        <p><strong>Classic Outlook (Windows):</strong> File › Open &amp; Export › Import/Export › Export to a file › Comma Separated Values › Calendar. Pick the date range when asked. Or open the calendar and use File › Save Calendar for an .ics file.</p>
        <p><strong>New Outlook / Outlook on the web:</strong> drag a meeting to your desktop for a single .ics, or publish the calendar (Settings › Calendar › Shared calendars) and download the ICS link.</p>
        <p>Recurring meetings in .ics files are expanded for the dates above. Meetings already in the log are skipped, so you can import the same file again later.</p>
      </details>`;
    openModal("Import Outlook meetings", body, olSubmit, "Add to log");
    modal().classList.add("wide");
    $("#modal-submit").disabled = true;

    const handle = async (file) => {
      if (!file) return;
      $("#ol-name").textContent = file.name;
      try {
        olState.source = await WB.outlook.read(file);
        olRefresh();
      } catch (err) {
        olState.source = null;
        const box = $("#ol-list");
        box.hidden = false;
        box.innerHTML = `<p class="imp-summary"><strong class="tone-text-bad">Could not read this file.</strong> ${esc(err.message || "")}</p>`;
        $("#modal-submit").disabled = true;
      }
    };
    const fileInput = $("#ol-file");
    fileInput.addEventListener("change", () => handle(fileInput.files[0]));
    const drop = $("#ol-drop");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); });
    for (const id of ["ol-from", "ol-to", "ol-allday"]) $("#" + id).addEventListener("change", olRefresh);

    // Row edits (checkbox, hours, project) update state without re-rendering the list
    $("#ol-list").addEventListener("change", (e) => {
      const li = e.target.closest("[data-i]");
      if (!li) return;
      const r = olState.rows[+li.dataset.i];
      if (e.target.matches(".ol-on")) r.on = e.target.checked;
      if (e.target.matches(".ol-h")) r.hours = U.num(e.target.value);
      if (e.target.matches(".ol-p")) r.projectId = e.target.value;
      li.classList.toggle("off", !r.on);
      olSummary();
    });
  }

  function olRefresh() {
    if (!olState || !olState.source) return;
    let from = $("#ol-from").value, to = $("#ol-to").value;
    if (!from || !to) return;
    if (from > to) [from, to] = [to, from];
    const allDay = $("#ol-allday").checked;
    const loggedKeys = new Set(S.state.log.map((l) => l.sourceId).filter(Boolean));
    const prev = new Map(olState.rows.map((r) => [r.m.key, r]));
    const list = WB.outlook.prepare(olState.source.meetings(from, to), from, to).filter((m) => allDay || !m.allDay);
    olState.rows = list.map((m) => {
      const kept = prev.get(m.key);
      if (kept) return Object.assign(kept, { m });
      const g = WB.outlook.guessProject(m, S.state);
      const logged = loggedKeys.has(m.key);
      return { m, logged, on: !logged && m.showAs !== "Free" && !m.allDay && m.minutes > 0, hours: m.hours, projectId: g.projectId || "", category: g.category || "" };
    });
    olRender(from, to);
  }

  function olRender(from, to) {
    const box = $("#ol-list");
    box.hidden = false;
    if (!olState.rows.length) {
      box.innerHTML = `<p class="imp-summary">No meetings between ${esc(U.fmtDate(from))} and ${esc(U.fmtDate(to, true))}. Adjust the dates or check the export's date range.</p>`;
      $("#modal-submit").disabled = true;
      return;
    }
    let lastDate = "";
    const items = olState.rows.map((r, i) => {
      const m = r.m;
      const head = m.date !== lastDate ? `<li class="ol-day">${esc(U.fmtDow(m.date))} <span class="mono">${esc(U.fmtDate(m.date))}</span></li>` : "";
      lastDate = m.date;
      const tags = [
        r.logged ? `<span class="pill tone-ok">In log</span>` : "",
        m.showAs !== "Busy" ? `<span class="pill tone-neutral">${esc(m.showAs)}</span>` : "",
      ].join("");
      const meta = [m.location, m.organizer].filter(Boolean).map(esc).join(" · ");
      return head + `<li class="ol-row ${r.on ? "" : "off"} ${r.logged ? "logged" : ""}" data-i="${i}">
        <label class="check big"><input type="checkbox" class="ol-on" ${r.on ? "checked" : ""} ${r.logged ? "disabled" : ""}><span class="sr">Import</span></label>
        <div class="ol-main"><span class="ol-t">${esc(m.subject)}</span>${tags}
          <span class="ol-m"><span class="mono">${esc(WB.outlook.timeLabel(m))}</span>${meta ? " · " + meta : ""}</span></div>
        <label class="ol-hrs"><span class="sr">Hours</span><input type="number" class="ol-h" min="0" step="0.25" value="${r.hours}" ${r.logged ? "disabled" : ""}><small>h</small></label>
        <label class="ol-proj"><span class="sr">Project</span><select class="ol-p" ${r.logged ? "disabled" : ""}>${projectOptions(r.projectId)}</select></label>
      </li>`;
    }).join("");
    box.innerHTML = `<div class="ol-bar"><span id="ol-sum"></span><span class="spacer"></span>
        ${btn("Select all", "ol-all", 'data-on="1"', "btn small ghost")}${btn("Select none", "ol-all", 'data-on="0"', "btn small ghost")}</div>
      <ul class="ol-items">${items}</ul>`;
    olSummary();
  }

  function olSetAll(on) {
    if (!olState) return;
    for (const r of olState.rows) if (!r.logged) r.on = on;
    olRender($("#ol-from").value, $("#ol-to").value);
  }

  function olSummary() {
    const sel = olState.rows.filter((r) => r.on && !r.logged);
    const hrs = sel.reduce((s, r) => s + U.num(r.hours), 0);
    const logged = olState.rows.filter((r) => r.logged).length;
    const sum = $("#ol-sum");
    if (sum) sum.innerHTML = `<strong class="mono">${sel.length}</strong> of ${olState.rows.length} selected · <span class="mono">${U.fmtHrs(hrs)} h</span>${logged ? ` · ${logged} already in log` : ""}`;
    const b = $("#modal-submit");
    b.disabled = !sel.length;
    b.textContent = sel.length ? `Add ${sel.length} to log` : "Add to log";
  }

  function olSubmit() {
    if (!olState) return false;
    const sel = olState.rows.filter((r) => r.on && !r.logged);
    if (!sel.length) return false;
    const defCat = $("#ol-cat").value;
    const have = new Set(S.state.log.map((l) => l.sourceId).filter(Boolean));
    let added = 0;
    for (const r of sel) {
      if (have.has(r.m.key)) continue;
      have.add(r.m.key);
      S.state.log.push({
        id: U.uid("l"), date: r.m.date, title: r.m.subject, projectId: r.projectId,
        hours: U.num(r.hours), category: r.category || defCat, outcome: "", todoId: "", sourceId: r.m.key,
      });
      added++;
    }
    const first = sel[0].m.date;
    if (U.weekStart(first) !== ui.weekOf && !sel.some((r) => U.weekStart(r.m.date) === ui.weekOf)) ui.weekOf = U.weekStart(first);
    S.commit();
    toast(`Added ${added} meeting${added === 1 ? "" : "s"} to the log`);
  }

  /* ================= TOAST ================= */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }
  WB.toast = toast;

  async function runSave(promiseFn, okMsg) {
    try {
      const res = await promiseFn();
      if (res === "saved") toast(okMsg);
      else if (res === "delivered") toast("Sent");
      else if (res === "declined") toast("Download cancelled");
    } catch (err) {
      toast("Could not save the file. " + ((err && err.message) || ""));
    }
  }

  /* ================= EVENTS ================= */
  const armed = new WeakMap();

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    const st = S.state;

    switch (a) {
      case "tab":
      case "goto":
        e.preventDefault();
        if (el.closest("#modal")) closeModal();
        setTab(el.dataset.tab);
        break;
      case "add":
        openEntityForm(el.dataset.entity);
        break;
      case "edit":
        openEntityForm(el.dataset.entity, el.dataset.id);
        break;
      case "del": {
        if (!armed.get(el)) {
          armed.set(el, true);
          el.textContent = "Confirm";
          el.classList.add("armed");
          setTimeout(() => { if (el.isConnected) { armed.delete(el); el.textContent = "Delete"; el.classList.remove("armed"); } }, 3500);
          return;
        }
        const ent = el.dataset.entity;
        const n = S.remove(ent, el.dataset.id);
        toast(WB.schema[ent].singular + " deleted" + (n ? `; ${n} linked item${n === 1 ? "" : "s"} kept without a project` : ""));
        break;
      }
      case "filter":
        ui[el.dataset.name] = el.dataset.value;
        render();
        break;
      case "ms-done": {
        const m = S.get("milestones", el.dataset.id);
        m.status = "Done";
        m.completedOn = U.todayISO();
        S.commit();
        toast("Milestone marked done");
        break;
      }
      case "toggle-done":
        ui.showDone = !ui.showDone;
        render();
        break;
      case "week": {
        const delta = +el.dataset.delta;
        ui.weekOf = delta === 0 ? U.weekStart(U.todayISO()) : U.addDays(ui.weekOf, delta);
        render();
        break;
      }
      case "settings":
        openSettings();
        break;
      case "open-import":
        openImport();
        break;
      case "open-export":
        openExport();
        break;
      case "outlook-import":
        openOutlookImport();
        break;
      case "ol-all":
        olSetAll(el.dataset.on === "1");
        break;
      case "close-modal":
        closeModal();
        break;
      case "x-xlsx":
        runSave(() => WB.io.exportWorkbook(st), "Workbook saved");
        break;
      case "x-csv":
        runSave(() => WB.io.exportCSV(st, $("#x-csv-entity").value), "CSV saved");
        break;
      case "x-json":
        runSave(() => WB.io.exportJSON(st), "Backup saved");
        break;
      case "clear-all":
        if (!armed.get(el)) {
          armed.set(el, true);
          el.textContent = "Click again to clear everything";
          el.classList.add("armed");
          return;
        }
        S.clearAll();
        closeModal();
        toast("All data cleared");
        break;
      case "start-empty":
        S.clearAll();
        toast("Started with an empty workspace");
        break;
      case "keep-example":
        S.dismissExample();
        break;
      case "rp-export": {
        const r = reportRange();
        const m = WB.report.build(st, r.from, r.to);
        const base = "performance-report-" + r.from + "_to_" + r.to;
        const fmt = el.dataset.fmt;
        if (fmt === "html") runSave(() => WB.io.saveFile(base + ".html", WB.report.toStandaloneHTML(m)), "Report saved");
        if (fmt === "md") runSave(() => WB.io.saveFile(base + ".md", WB.report.toMarkdown(m)), "Report saved");
        if (fmt === "csv") runSave(() => WB.io.saveFile(base + ".csv", WB.report.toCSV(m)), "Task list saved");
        if (fmt === "xlsx") runSave(() => WB.io.saveFile(base + ".xlsx", XLSX.write(WB.report.toWorkbook(m), { bookType: "xlsx", type: "array" })), "Report workbook saved");
        break;
      }
      case "rp-copy": {
        const r = reportRange();
        const md = WB.report.toMarkdown(WB.report.build(st, r.from, r.to));
        const done = () => toast("Report copied as Markdown");
        try {
          navigator.clipboard.writeText(md).then(done, () => fallbackCopy(md));
        } catch (_) {
          fallbackCopy(md);
        }
        break;
      }
    }
  });

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
    toast(ok ? "Report copied as Markdown" : "Copy is blocked here. Use the Markdown export instead.");
  }

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches('[data-action="todo-done"]')) {
      S.setTodoDone(el.dataset.id, el.checked);
      toast(el.checked ? "Done. Added to this week's log." : "Marked not done; log entry removed");
    }
    if (el.matches('[data-action="period"]')) {
      ui.period = el.value;
      render();
    }
    if (el.id === "rp-from" || el.id === "rp-to") {
      ui.customFrom = $("#rp-from").value || ui.customFrom;
      ui.customTo = $("#rp-to").value || ui.customTo;
      if (ui.customFrom > ui.customTo) [ui.customFrom, ui.customTo] = [ui.customTo, ui.customFrom];
      render();
    }
  });

  const saveNotes = U.debounce((key, value) => {
    S.state.reportNotes[key] = value;
    S.commit({ silent: true });
  }, 500);

  document.addEventListener("input", (e) => {
    if (e.target.id === "rp-notes") {
      const r = reportRange();
      const key = r.from + "_" + r.to;
      S.state.reportNotes[key] = e.target.value;
      refreshReportPreview();
      saveNotes(key, e.target.value);
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "todo-quick") {
      e.preventDefault();
      const title = $("#qa-title").value.trim();
      if (!title) return;
      S.upsert("todos", {
        title, projectId: $("#qa-project").value, due: $("#qa-due").value, priority: $("#qa-prio").value,
        estHours: $("#qa-est").value === "" ? "" : U.num($("#qa-est").value), done: false, doneOn: "", notes: "",
      });
      toast("To-do added");
      const t = $("#qa-title");
      if (t) t.focus();
    }
    if (e.target.id === "log-add") {
      e.preventDefault();
      const title = $("#la-title").value.trim();
      const date = $("#la-date").value;
      if (!title || !date) return;
      S.upsert("log", {
        title, date, projectId: $("#la-project").value, category: $("#la-cat").value,
        hours: U.num($("#la-hours").value), outcome: $("#la-outcome").value.trim(), todoId: "",
      });
      toast("Logged");
      const t = $("#la-title");
      if (t) t.focus();
    }
  });

  /* ================= TABS / ROUTING ================= */
  function setTab(id) {
    if (!VIEWS[id]) id = "overview";
    ui.tab = id;
    try { if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id); } catch (_) {}
    try { sessionStorage.setItem("wb-tab", id); } catch (_) {}
    render();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (VIEWS[id] && id !== ui.tab) { ui.tab = id; render(); }
  });

  /* ================= THEME ================= */
  function initTheme() {
    const root = document.documentElement;
    const toggle = $("#theme-toggle");
    let saved = null;
    try { saved = localStorage.getItem("wb-theme"); } catch (_) {}
    if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const isDark = () => {
      const t = root.getAttribute("data-theme");
      return t ? t === "dark" : !!(mq && mq.matches);
    };
    const sync = () => {
      const d = isDark();
      toggle.checked = d;
      toggle.setAttribute("aria-checked", String(d));
      $("#theme-label").textContent = d ? "Dark" : "Light";
    };
    toggle.addEventListener("change", () => {
      const next = toggle.checked ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("wb-theme", next); } catch (_) {}
      sync();
    });
    if (mq && mq.addEventListener) mq.addEventListener("change", sync);
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    sync();
  }

  /* ================= BOOT ================= */
  function boot() {
    const rs = document.createElement("style");
    rs.textContent = WB.report.css;
    document.head.appendChild(rs);
    S.init();
    S.subscribe(() => render());
    initTheme();
    let start = location.hash.slice(1);
    if (!VIEWS[start]) { try { start = sessionStorage.getItem("wb-tab") || "overview"; } catch (_) { start = "overview"; } }
    ui.tab = VIEWS[start] ? start : "overview";
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
