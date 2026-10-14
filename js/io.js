/* Workload Balancer — import / export.
   Spreadsheet I/O uses SheetJS (global XLSX). One sheet per entity, columns
   named by schema headers; a readable "Project" name column rides along with
   every "Project ID" so the workbook is usable on its own. */
(function () {
  const WB = (window.WB = window.WB || {});
  const U = WB.util;
  const io = (WB.io = {});

  /* ---------- saving a file ---------- */
  io.saveFile = async (filename, data) => {
    let dl = null;
    if (window.claude && typeof window.claude.use === "function") {
      try { dl = await window.claude.use("downloads"); } catch (_) { dl = null; }
    }
    if (dl) {
      try {
        const res = await dl.save({ filename, data });
        return res.status === "saved" ? "saved" : "delivered";
      } catch (err) {
        if (err && err.code === "declined") return "declined";
        throw err;
      }
    }
    // Standalone / local fallback
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return "saved";
  };

  io.stamp = () => U.todayISO();

  /* ---------- record <-> row ---------- */
  io.toRow = (entity, rec) => {
    const row = {};
    for (const f of WB.schema[entity].fields) {
      if (f.type === "hidden" && f.key !== "todoId") continue;
      let v = rec[f.key];
      if (f.type === "bool") v = v ? "Yes" : "No";
      if (f.type === "number") v = v === "" || v === undefined ? "" : U.num(v);
      row[f.header] = v === undefined ? "" : v;
      if (f.type === "ref") row["Project"] = WB.store.projectName(rec[f.key]);
    }
    return row;
  };

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9%]/g, "");

  io.fromRow = (entity, row, projectsForLookup) => {
    const fields = WB.schema[entity].fields;
    const keys = Object.keys(row);
    const findCol = (f) => keys.find((k) => norm(k) === norm(f.header) || norm(k) === norm(f.key));
    const rec = WB.blank(entity);
    for (const f of fields) {
      const col = findCol(f);
      if (col === undefined) continue;
      let v = row[col];
      if (f.type === "date") v = U.normDate(v);
      else if (f.type === "number") v = v === "" || v === null || v === undefined ? "" : U.num(v);
      else if (f.type === "bool") v = /^(y|yes|true|1|x|done|✓)$/i.test(String(v).trim());
      else if (f.type === "select") {
        const s = String(v ?? "").trim();
        const hit = f.options.find((o) => norm(WB.optValue(o)) === norm(s) || norm(WB.optLabel(o)) === norm(s));
        v = hit ? WB.optValue(hit) : (s || WB.optValue(f.default || f.options[0]));
      } else if (f.key === "color") v = v === "" ? "" : U.num(v);
      else v = v === null || v === undefined ? "" : String(v);
      rec[f.key] = v;
    }
    // Resolve project by ID, else by name
    if (fields.some((f) => f.type === "ref")) {
      const nameCol = keys.find((k) => norm(k) === "project");
      const byId = rec.projectId && projectsForLookup.find((p) => p.id === rec.projectId);
      if (!byId) {
        const name = nameCol ? String(row[nameCol] || "").trim() : "";
        const byName = name && projectsForLookup.find((p) => norm(p.name) === norm(name));
        rec.projectId = byName ? byName.id : "";
      }
    }
    if (entity === "projects" && !rec.name) {
      const nameCol = keys.find((k) => norm(k) === "project" || norm(k) === "name");
      if (nameCol) rec.name = String(row[nameCol]);
    }
    if (!rec.id) rec.id = U.uid(entity.slice(0, 1));
    return rec;
  };

  /* ---------- workbook export ---------- */
  io.buildWorkbook = (state) => {
    const wb = XLSX.utils.book_new();
    for (const e of WB.ENTITIES) {
      const rows = state[e].map((r) => io.toRow(e, r));
      const headers = headerList(e);
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      if (!rows.length) XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(10, Math.min(48, h.length + 4, maxLen(rows, h) + 2)) }));
      XLSX.utils.book_append_sheet(wb, ws, WB.schema[e].sheet);
    }
    const s = state.settings;
    const settings = XLSX.utils.aoa_to_sheet([
      ["Setting", "Value"], ["Name", s.name], ["Role", s.role], ["Organization", s.org], ["Capacity (hrs/week)", s.capacity],
      ["Exported", U.todayISO()],
    ]);
    settings["!cols"] = [{ wch: 22 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, settings, "Settings");
    return wb;
  };

  function headerList(e) {
    const out = [];
    for (const f of WB.schema[e].fields) {
      if (f.type === "hidden" && f.key !== "todoId") continue;
      out.push(f.header);
      if (f.type === "ref") out.push("Project");
    }
    return out;
  }
  function maxLen(rows, h) {
    let m = 0;
    for (const r of rows.slice(0, 200)) m = Math.max(m, String(r[h] ?? "").length);
    return m;
  }

  io.exportWorkbook = async (state) => {
    const wb = io.buildWorkbook(state);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return io.saveFile("workload-balancer-" + io.stamp() + ".xlsx", buf);
  };

  io.exportJSON = async (state) => {
    const out = Object.assign({ app: "workload-balancer", exported: new Date().toISOString() }, state);
    return io.saveFile("workload-balancer-backup-" + io.stamp() + ".json", JSON.stringify(out, null, 2));
  };

  io.exportCSV = async (state, entity) => {
    const rows = state[entity].map((r) => io.toRow(entity, r));
    const ws = XLSX.utils.json_to_sheet(rows, { header: headerList(entity) });
    const csv = XLSX.utils.sheet_to_csv(ws);
    return io.saveFile("workload-" + entity + "-" + io.stamp() + ".csv", csv);
  };

  /* ---------- import ---------- */
  const SHEET_MATCH = {
    projects: ["projects", "project"],
    milestones: ["milestones", "milestone"],
    assignments: ["assignments", "assignment", "workassignments"],
    todos: ["todos", "todo", "todolist", "tasks"],
    log: ["weeklylog", "log", "completed", "completedtasks", "weeklytasks"],
  };

  /* Returns a partial state { projects:[...], ... , settings? } */
  io.parseFile = async (file, csvEntity) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".json")) {
      const obj = JSON.parse(await file.text());
      const out = WB.store.normalize(obj);
      return { data: out, hasSettings: !!obj.settings };
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false, dateNF: "yyyy-mm-dd" });
    const out = { projects: [], milestones: [], assignments: [], todos: [], log: [] };
    let hasSettings = false;

    if (name.endsWith(".csv")) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      out[csvEntity] = rows;
    } else {
      for (const sn of wb.SheetNames) {
        const key = norm(sn);
        const entity = Object.keys(SHEET_MATCH).find((e) => SHEET_MATCH[e].includes(key));
        if (entity) out[entity] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "", raw: true });
        if (key === "settings") {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
          const s = {};
          for (const [k, v] of rows) {
            const nk = norm(k);
            if (nk === "name") s.name = String(v);
            if (nk === "role") s.role = String(v);
            if (nk === "organization") s.org = String(v);
            if (nk.startsWith("capacity")) s.capacity = U.num(v) || 40;
          }
          out.settings = s;
          hasSettings = true;
        }
      }
    }
    // Projects first so other sheets can resolve project names
    const lookup = WB.store.state.projects.slice();
    const projects = out.projects.filter(nonEmpty).map((r) => io.fromRow("projects", r, lookup));
    for (const p of projects) if (!lookup.some((x) => x.id === p.id)) lookup.push(p);
    const result = { projects };
    for (const e of ["milestones", "assignments", "todos", "log"]) {
      result[e] = out[e].filter(nonEmpty).map((r) => io.fromRow(e, r, lookup));
    }
    projects.forEach((p, i) => { if (p.color === "" || p.color === undefined) p.color = i % 6; });
    if (out.settings) result.settings = out.settings;
    return { data: result, hasSettings };
  };

  function nonEmpty(row) {
    return Object.values(row).some((v) => String(v ?? "").trim() !== "");
  }
})();
