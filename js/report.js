/* Workload Balancer — performance report.
   buildReport() produces a plain data model; renderers turn it into an in-page
   preview, a standalone HTML file, Markdown, or spreadsheet rows. */
(function () {
  const WB = (window.WB = window.WB || {});
  const U = WB.util;
  const R = (WB.report = {});
  const esc = U.esc;

  R.periods = () => {
    const t = U.todayISO();
    const ws = U.weekStart(t);
    const q = U.fiscalQuarterRange(t);
    return {
      "this-week": { label: "This week", from: ws, to: U.addDays(ws, 6) },
      "last-week": { label: "Last week", from: U.addDays(ws, -7), to: U.addDays(ws, -1) },
      "last-4": { label: "Last 4 weeks", from: U.addDays(ws, -21), to: U.addDays(ws, 6) },
      quarter: { label: "This fiscal quarter (" + U.fiscal(t).label + ")", from: q.from, to: q.to },
    };
  };

  R.build = (state, from, to) => {
    const S = WB.store;
    const cap = U.num(state.settings.capacity) || 40;
    const inP = (iso) => iso && iso >= from && iso <= to;
    const entries = state.log.filter((l) => inP(l.date)).sort((a, b) => (a.date < b.date ? -1 : 1));

    // Weeks
    const weeks = [];
    for (let ws = U.weekStart(from); ws <= to; ws = U.addDays(ws, 7)) {
      const we = U.addDays(ws, 6);
      const es = entries.filter((e) => e.date >= ws && e.date <= we);
      const hours = es.reduce((s, e) => s + U.num(e.hours), 0);
      weeks.push({ ws, label: U.weekLabel(ws), tasks: es.length, hours, util: cap ? (hours / cap) * 100 : 0 });
    }
    const hours = entries.reduce((s, e) => s + U.num(e.hours), 0);
    const capHours = cap * weeks.length;

    // By project
    const groups = new Map();
    for (const e of entries) {
      const k = e.projectId || "";
      if (!groups.has(k)) groups.set(k, { projectId: k, name: S.projectName(k) || "Other work (no project)", hours: 0, entries: [] });
      const g = groups.get(k);
      g.hours += U.num(e.hours);
      g.entries.push(e);
    }
    const byProject = [...groups.values()].sort((a, b) => b.hours - a.hours);

    // By category
    const cats = {};
    for (const e of entries) cats[e.category || "Other"] = (cats[e.category || "Other"] || 0) + U.num(e.hours);

    const milestonesDone = state.milestones
      .filter((m) => m.status === "Done" && inP(m.completedOn || m.due))
      .map((m) => ({ ...m, project: S.projectName(m.projectId) }));

    const horizon = U.addDays(to, 30);
    const upcoming = state.milestones
      .filter((m) => m.status !== "Done" && m.due && m.due > to && m.due <= horizon)
      .sort((a, b) => (a.due < b.due ? -1 : 1))
      .map((m) => ({ ...m, project: S.projectName(m.projectId) }));

    const risks = [];
    for (const m of state.milestones) {
      if (m.status === "Done") continue;
      if (m.status === "At risk") risks.push({ kind: "Milestone at risk", title: m.title, project: S.projectName(m.projectId), due: m.due, note: m.notes });
      else if (m.due && m.due <= to) risks.push({ kind: "Milestone past due", title: m.title, project: S.projectName(m.projectId), due: m.due, note: m.notes });
    }
    for (const a of state.assignments) {
      if (a.status === "Done") continue;
      if (a.status === "Blocked") risks.push({ kind: "Assignment blocked", title: a.title, project: S.projectName(a.projectId), due: a.due, note: a.notes });
      else if (a.due && a.due <= to) risks.push({ kind: "Assignment past due", title: a.title, project: S.projectName(a.projectId), due: a.due, note: a.notes });
    }

    const assignmentsDone = state.assignments.filter((a) => a.status === "Done" && inP(a.due));
    const key = from + "_" + to;

    return {
      key, from, to,
      person: state.settings,
      fiscal: U.fiscal(to).label,
      generated: U.todayISO(),
      capacity: cap,
      totals: {
        tasks: entries.length, hours, capHours,
        util: capHours ? (hours / capHours) * 100 : 0,
        milestones: milestonesDone.length,
        projects: byProject.filter((g) => g.projectId).length,
        assignments: assignmentsDone.length,
      },
      weeks, byProject, cats, milestonesDone, upcoming, risks, assignmentsDone,
      notes: (state.reportNotes || {})[key] || "",
    };
  };

  const rangeText = (m) => U.fmtDate(m.from, true) + " – " + U.fmtDate(m.to, true);

  /* ---------- HTML body (shared by preview and standalone file) ---------- */
  R.toHTML = (m) => {
    const p = m.person;
    const who = [p.name, p.role, p.org].filter(Boolean).map(esc).join(" · ") || "Name and role not set";
    const maxWeek = Math.max(m.capacity, ...m.weeks.map((w) => w.hours), 1);
    const catTotal = Object.values(m.cats).reduce((a, b) => a + b, 0) || 1;
    let h = "";
    h += `<header class="rp-head">
      <div class="rp-kicker">Weekly accomplishments · ${esc(m.fiscal)}</div>
      <h2 class="rp-title">Performance report</h2>
      <div class="rp-meta"><span>${who}</span><span>${esc(rangeText(m))}</span><span>Generated ${esc(U.fmtDate(m.generated, true))}</span></div>
    </header>`;

    h += `<section class="rp-stats">
      ${stat("Tasks completed", m.totals.tasks)}
      ${stat("Hours logged", U.fmtHrs(m.totals.hours), "of " + U.fmtHrs(m.totals.capHours) + " available")}
      ${stat("Utilization", U.pct(m.totals.util), "capacity " + U.fmtHrs(m.capacity) + " h/wk")}
      ${stat("Milestones met", m.totals.milestones)}
    </section>`;

    if (m.notes.trim()) {
      h += `<section class="rp-sec"><h3>Summary</h3>${m.notes.split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`).join("")}</section>`;
    }

    if (m.weeks.length > 1) {
      h += `<section class="rp-sec"><h3>Weekly trend</h3><table class="rp-table"><thead><tr><th>Week</th><th class="n">Tasks</th><th class="n">Hours</th><th class="n">Util.</th><th class="bar-col">Hours vs. capacity</th></tr></thead><tbody>`;
      for (const w of m.weeks) {
        const pct = Math.min(100, (w.hours / maxWeek) * 100);
        const capPct = (m.capacity / maxWeek) * 100;
        h += `<tr><td>${esc(w.label)}</td><td class="n">${w.tasks}</td><td class="n">${U.fmtHrs(w.hours)}</td><td class="n">${U.pct(w.util)}</td>
          <td class="bar-col"><div class="rp-bar"><span style="width:${pct.toFixed(1)}%"></span><i style="left:${capPct.toFixed(1)}%"></i></div></td></tr>`;
      }
      h += `</tbody></table></section>`;
    }

    h += `<section class="rp-sec"><h3>Completed work by project</h3>`;
    if (!m.byProject.length) h += `<p class="rp-empty">No completed tasks logged in this period.</p>`;
    for (const g of m.byProject) {
      h += `<div class="rp-group"><div class="rp-group-head"><strong>${esc(g.name)}</strong><span>${g.entries.length} task${g.entries.length === 1 ? "" : "s"} · ${U.fmtHrs(g.hours)} h</span></div>
        <table class="rp-table"><thead><tr><th class="d">Date</th><th>Task</th><th>Category</th><th class="n">Hours</th><th>Outcome / impact</th></tr></thead><tbody>`;
      for (const e of g.entries) {
        h += `<tr><td class="d">${esc(U.fmtDate(e.date))}</td><td>${esc(e.title)}</td><td>${esc(e.category)}</td><td class="n">${U.fmtHrs(U.num(e.hours))}</td><td>${esc(e.outcome) || '<span class="rp-dim">—</span>'}</td></tr>`;
      }
      h += `</tbody></table></div>`;
    }
    h += `</section>`;

    if (Object.keys(m.cats).length) {
      h += `<section class="rp-sec"><h3>Time by category</h3><div class="rp-cats">`;
      for (const [c, v] of Object.entries(m.cats).sort((a, b) => b[1] - a[1])) {
        h += `<div class="rp-cat"><span>${esc(c)}</span><div class="rp-bar"><span style="width:${((v / catTotal) * 100).toFixed(1)}%"></span></div><b>${U.fmtHrs(v)} h · ${U.pct((v / catTotal) * 100)}</b></div>`;
      }
      h += `</div></section>`;
    }

    h += `<section class="rp-sec rp-two">
      <div><h3>Milestones met</h3>${list(m.milestonesDone.map((x) => [x.title, x.project, U.fmtDate(x.completedOn || x.due)]), "None in this period.")}</div>
      <div><h3>Coming up (next 30 days)</h3>${list(m.upcoming.map((x) => [x.title, x.project, U.fmtDate(x.due) + (x.status === "At risk" ? " · at risk" : "")]), "No milestones due.")}</div>
    </section>`;

    h += `<section class="rp-sec"><h3>Risks and blockers</h3>${list(m.risks.map((r) => [r.kind + ": " + r.title, [r.project, r.note].filter(Boolean).join(" — "), r.due ? "due " + U.fmtDate(r.due) : ""]), "Nothing flagged.")}</section>`;
    return h;

    function stat(label, value, sub) {
      return `<div class="rp-stat"><div class="rp-stat-l">${esc(label)}</div><div class="rp-stat-v">${esc(value)}</div>${sub ? `<div class="rp-stat-s">${esc(sub)}</div>` : ""}</div>`;
    }
    function list(items, empty) {
      if (!items.length) return `<p class="rp-empty">${esc(empty)}</p>`;
      return `<ul class="rp-list">${items.map(([a, b, c]) => `<li><span>${esc(a)}${b ? `<small>${esc(b)}</small>` : ""}</span><em>${esc(c)}</em></li>`).join("")}</ul>`;
    }
  };

  /* Standalone file: fixed light palette suitable for printing / attaching */
  R.toStandaloneHTML = (m) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Performance report ${esc(m.from)} to ${esc(m.to)}</title>
<style>
body{margin:0;background:#fff;color:#16202b;font:14px/1.5 "Public Sans",Arial,Helvetica,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:40px 28px}
${R.css}
@media print{.wrap{padding:0}.rp-sec{break-inside:avoid}}
</style></head><body><div class="wrap report-doc">${R.toHTML(m)}
<p class="rp-foot">Generated with Workload Balancer</p></div></body></html>`;

  /* Report CSS, scoped by .report-doc; colors via --rp-* with light defaults */
  R.css = `
.report-doc{--rp-fg:#16202b;--rp-muted:#5a6878;--rp-line:#d8dee6;--rp-soft:#eef2f6;--rp-accent:#1d5c8f;color:var(--rp-fg)}
.report-doc h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--rp-muted);margin:0 0 10px;font-weight:600}
.rp-head{border-bottom:2px solid var(--rp-fg);padding-bottom:14px;margin-bottom:20px}
.rp-kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--rp-accent);font-weight:600}
.rp-title{font-size:28px;line-height:1.15;margin:4px 0 8px;font-weight:800;letter-spacing:-.01em}
.rp-meta{display:flex;flex-wrap:wrap;gap:4px 18px;color:var(--rp-muted);font-size:13px}
.rp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border:1px solid var(--rp-line);border-radius:6px;margin-bottom:22px}
.rp-stat{padding:12px 14px;border-left:1px solid var(--rp-line)}.rp-stat:first-child{border-left:0}
.rp-stat-l{font-size:12px;color:var(--rp-muted)}.rp-stat-v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.rp-stat-s{font-size:11.5px;color:var(--rp-muted)}
.rp-sec{margin:0 0 24px}.rp-sec p{margin:0 0 8px;max-width:68ch}
.rp-two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.rp-table{width:100%;border-collapse:collapse;font-size:13px}
.rp-table th{text-align:left;font-weight:600;color:var(--rp-muted);font-size:12px;border-bottom:1px solid var(--rp-line);padding:6px 8px}
.rp-table td{border-bottom:1px solid var(--rp-line);padding:7px 8px;vertical-align:top}
.rp-table .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-table .d{white-space:nowrap;font-variant-numeric:tabular-nums;width:64px}
.rp-table .bar-col{width:38%}
.rp-group{margin-bottom:16px}
.rp-group-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:6px 8px;background:var(--rp-soft);border-radius:4px;font-size:13.5px}
.rp-group-head span{color:var(--rp-muted);font-variant-numeric:tabular-nums}
.rp-bar{position:relative;height:8px;background:var(--rp-soft);border-radius:4px;min-width:60px}
.rp-bar span{position:absolute;inset:0 auto 0 0;background:var(--rp-accent);border-radius:4px}
.rp-bar i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--rp-fg);opacity:.55}
.rp-cats{display:grid;gap:8px}
.rp-cat{display:grid;grid-template-columns:120px 1fr 120px;gap:12px;align-items:center;font-size:13px}
.rp-cat b{font-weight:500;text-align:right;font-variant-numeric:tabular-nums;color:var(--rp-muted)}
.rp-list{list-style:none;margin:0;padding:0}
.rp-list li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--rp-line);font-size:13px}
.rp-list small{display:block;color:var(--rp-muted);font-size:12px}
.rp-list em{font-style:normal;color:var(--rp-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.rp-empty,.rp-dim{color:var(--rp-muted)}
.rp-foot{color:var(--rp-muted);font-size:11px;margin-top:28px}
@media (max-width:640px){.rp-stats{grid-template-columns:1fr 1fr}.rp-stat:nth-child(3){border-left:0}.rp-stat:nth-child(n+3){border-top:1px solid var(--rp-line)}.rp-two{grid-template-columns:1fr}.rp-cat{grid-template-columns:90px 1fr;}.rp-cat b{grid-column:2;text-align:left}}
`;

  /* ---------- Markdown ---------- */
  R.toMarkdown = (m) => {
    const p = m.person;
    const lines = [];
    lines.push(`# Performance report — ${rangeText(m)}`);
    lines.push("");
    lines.push([p.name, p.role, p.org].filter(Boolean).join(" · ") || "");
    lines.push(`${m.fiscal} · Generated ${U.fmtDate(m.generated, true)}`);
    lines.push("");
    lines.push(`| Tasks completed | Hours logged | Utilization | Milestones met |`);
    lines.push(`|---:|---:|---:|---:|`);
    lines.push(`| ${m.totals.tasks} | ${U.fmtHrs(m.totals.hours)} of ${U.fmtHrs(m.totals.capHours)} | ${U.pct(m.totals.util)} | ${m.totals.milestones} |`);
    lines.push("");
    if (m.notes.trim()) { lines.push("## Summary", "", m.notes.trim(), ""); }
    if (m.weeks.length > 1) {
      lines.push("## Weekly trend", "", "| Week | Tasks | Hours | Utilization |", "|---|---:|---:|---:|");
      for (const w of m.weeks) lines.push(`| ${w.label} | ${w.tasks} | ${U.fmtHrs(w.hours)} | ${U.pct(w.util)} |`);
      lines.push("");
    }
    lines.push("## Completed work by project", "");
    if (!m.byProject.length) lines.push("_No completed tasks logged in this period._", "");
    for (const g of m.byProject) {
      lines.push(`### ${g.name} — ${g.entries.length} tasks, ${U.fmtHrs(g.hours)} h`, "");
      for (const e of g.entries) lines.push(`- **${U.fmtDate(e.date)}** · ${e.title} (${e.category}, ${U.fmtHrs(U.num(e.hours))} h)${e.outcome ? " — " + e.outcome : ""}`);
      lines.push("");
    }
    lines.push("## Milestones met", "");
    lines.push(...(m.milestonesDone.length ? m.milestonesDone.map((x) => `- ${x.title}${x.project ? " (" + x.project + ")" : ""} — ${U.fmtDate(x.completedOn || x.due)}`) : ["_None in this period._"]), "");
    lines.push("## Coming up (next 30 days)", "");
    lines.push(...(m.upcoming.length ? m.upcoming.map((x) => `- ${x.title}${x.project ? " (" + x.project + ")" : ""} — due ${U.fmtDate(x.due)}${x.status === "At risk" ? " · **at risk**" : ""}`) : ["_No milestones due._"]), "");
    lines.push("## Risks and blockers", "");
    lines.push(...(m.risks.length ? m.risks.map((r) => `- **${r.kind}:** ${r.title}${r.project ? " (" + r.project + ")" : ""}${r.due ? " — due " + U.fmtDate(r.due) : ""}${r.note ? ". " + r.note : ""}`) : ["_Nothing flagged._"]), "");
    return lines.join("\n");
  };

  /* ---------- Spreadsheet ---------- */
  R.toWorkbook = (m) => {
    const wb = XLSX.utils.book_new();
    const summary = [
      ["Performance report"], [],
      ["Name", m.person.name], ["Role", m.person.role], ["Organization", m.person.org],
      ["Period start", m.from], ["Period end", m.to], ["Fiscal period", m.fiscal], ["Generated", m.generated], [],
      ["Tasks completed", m.totals.tasks], ["Hours logged", U.round1(m.totals.hours)], ["Capacity hours", m.totals.capHours],
      ["Utilization %", Math.round(m.totals.util)], ["Milestones met", m.totals.milestones], [],
      ["Summary notes", m.notes],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1["!cols"] = [{ wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");

    const weeks = [["Week start", "Week", "Tasks", "Hours", "Utilization %"], ...m.weeks.map((w) => [w.ws, w.label, w.tasks, U.round1(w.hours), Math.round(w.util)])];
    const ws2 = XLSX.utils.aoa_to_sheet(weeks);
    ws2["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Weekly trend");

    const tasks = [["Date", "Week", "Project", "Task", "Category", "Hours", "Outcome / impact"]];
    for (const g of m.byProject) for (const e of g.entries) tasks.push([e.date, "Wk " + U.isoWeek(e.date), g.name, e.title, e.category, U.num(e.hours), e.outcome]);
    const ws3 = XLSX.utils.aoa_to_sheet(tasks);
    ws3["!cols"] = [{ wch: 12 }, { wch: 7 }, { wch: 30 }, { wch: 44 }, { wch: 14 }, { wch: 7 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Completed tasks");

    const ms = [["Type", "Title", "Project", "Date", "Note"]];
    for (const x of m.milestonesDone) ms.push(["Milestone met", x.title, x.project, x.completedOn || x.due, ""]);
    for (const x of m.upcoming) ms.push(["Upcoming milestone", x.title, x.project, x.due, x.status]);
    for (const r of m.risks) ms.push([r.kind, r.title, r.project, r.due, r.note]);
    const ws4 = XLSX.utils.aoa_to_sheet(ms);
    ws4["!cols"] = [{ wch: 20 }, { wch: 44 }, { wch: 30 }, { wch: 12 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws4, "Milestones & risks");
    return wb;
  };

  R.toCSV = (m) => {
    const rows = [["Date", "Week", "Project", "Task", "Category", "Hours", "Outcome / impact"]];
    for (const g of m.byProject) for (const e of g.entries) rows.push([e.date, "Wk " + U.isoWeek(e.date), g.name, e.title, e.category, U.num(e.hours), e.outcome]);
    return XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows));
  };
})();
