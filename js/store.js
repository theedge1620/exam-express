/* Workload Balancer — state + persistence.
   Storage adapters, in order of preference:
     1. Claude artifact `db` capability (private per-person document) when the page runs as a claude.ai artifact
     2. localStorage (always kept as a local mirror; the only store when run from disk / a dev server)
   Swap or extend adapters here (e.g. a REST backend) without touching the UI. */
(function () {
  const WB = (window.WB = window.WB || {});
  const U = WB.util;
  const KEY = "workload-balancer:v1";

  const store = (WB.store = {
    state: null,
    backend: "local", // "local" | "cloud"
    _listeners: [],
    _db: null,
    _touched: false,
  });

  store.empty = () => ({
    version: 1,
    meta: {},
    settings: { name: "", role: "", org: "", capacity: 40 },
    projects: [], milestones: [], assignments: [], todos: [], log: [],
    reportNotes: {},
  });

  store.normalize = (s) => {
    const base = store.empty();
    const out = Object.assign(base, s || {});
    out.settings = Object.assign(store.empty().settings, (s && s.settings) || {});
    out.settings.capacity = U.num(out.settings.capacity) || 40;
    out.meta = out.meta || {};
    out.reportNotes = out.reportNotes || {};
    for (const e of WB.ENTITIES) out[e] = Array.isArray(out[e]) ? out[e] : [];
    return out;
  };

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
  function writeLocal(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (_) {}
  }

  store.subscribe = (fn) => store._listeners.push(fn);
  const emit = () => store._listeners.forEach((fn) => fn(store.state));

  /* ---------- cloud (artifact db) ---------- */
  const pushCloud = U.debounce(async () => {
    if (!store._db) return;
    try {
      await store._db.set(JSON.parse(JSON.stringify(store.state)));
    } catch (err) {
      if (err && (err.code === "invalid_argument" || err.code === "revoked" || err.code === "not_granted")) {
        store._db = null;
        store.backend = "local";
        emit();
      } else if (err && err.code === "quota_exceeded") {
        WB.toast && WB.toast("Cloud save is full. Export a backup and remove old log entries.");
      }
    }
  }, 700);

  async function connectCloud() {
    if (!window.claude || typeof window.claude.use !== "function") return;
    try {
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const ref = db.doc("data/users/" + id + "/state");
      const snap = await ref.get();
      store._db = ref;
      store.backend = "cloud";
      if (snap.exists && !store._touched) {
        store.state = store.normalize(JSON.parse(JSON.stringify(snap.data())));
        writeLocal(store.state);
      } else if (store._touched || !store.state.meta.example) {
        pushCloud();
      }
      emit();
    } catch (_) {
      /* stay local */
    }
  }

  store.init = () => {
    const local = readLocal();
    store.state = local ? store.normalize(local) : store.normalize(WB.sample());
    connectCloud();
    return store.state;
  };

  /* Persist after any change */
  store.commit = (opts = {}) => {
    store._touched = true;
    if (!opts.keepExample && store.state.meta.example) store.state.meta.example = "edited";
    writeLocal(store.state);
    pushCloud();
    if (!opts.silent) emit();
  };

  /* ---------- CRUD ---------- */
  store.get = (entity, id) => store.state[entity].find((r) => r.id === id);

  store.upsert = (entity, rec) => {
    const list = store.state[entity];
    if (!rec.id) rec.id = U.uid(entity.slice(0, 1));
    const i = list.findIndex((r) => r.id === rec.id);
    if (i >= 0) list[i] = Object.assign({}, list[i], rec);
    else list.push(rec);
    if (entity === "projects" && (rec.color === "" || rec.color === undefined)) {
      const r = store.get("projects", rec.id);
      r.color = nextColor();
    }
    store.commit();
    return rec.id;
  };

  function nextColor() {
    const used = store.state.projects.map((p) => p.color).filter((c) => c !== "" && c !== undefined);
    for (let c = 0; c < 6; c++) if (!used.includes(c)) return c;
    return store.state.projects.length % 6;
  }

  store.remove = (entity, id) => {
    store.state[entity] = store.state[entity].filter((r) => r.id !== id);
    let unlinked = 0;
    if (entity === "projects") {
      for (const e of ["milestones", "assignments", "todos", "log"]) {
        for (const r of store.state[e]) if (r.projectId === id) { r.projectId = ""; unlinked++; }
      }
    }
    if (entity === "todos") store.state.log = store.state.log.filter((l) => l.todoId !== id);
    store.commit();
    return unlinked;
  };

  /* Completing a to-do writes a matching log entry so it counts toward the week */
  store.setTodoDone = (id, done) => {
    const t = store.get("todos", id);
    if (!t) return;
    t.done = !!done;
    if (done) {
      t.doneOn = U.todayISO();
      if (!store.state.log.some((l) => l.todoId === id)) {
        store.state.log.push({
          id: U.uid("l"), date: t.doneOn, title: t.title, projectId: t.projectId || "",
          hours: U.num(t.estHours), category: "Other", outcome: "", todoId: id,
        });
      }
    } else {
      t.doneOn = "";
      store.state.log = store.state.log.filter((l) => l.todoId !== id);
    }
    store.commit();
  };

  store.replaceAll = (next) => {
    store.state = store.normalize(next);
    store.state.meta.example = false;
    store.commit({ keepExample: true });
  };

  store.merge = (incoming) => {
    const inc = store.normalize(incoming);
    let added = 0, updated = 0;
    for (const e of WB.ENTITIES) {
      for (const rec of inc[e]) {
        const i = store.state[e].findIndex((r) => r.id === rec.id);
        if (i >= 0) { store.state[e][i] = Object.assign({}, store.state[e][i], rec); updated++; }
        else { store.state[e].push(rec); added++; }
      }
    }
    if (incoming && incoming.settings) Object.assign(store.state.settings, inc.settings);
    store.state.meta.example = false;
    store.commit({ keepExample: true });
    return { added, updated };
  };

  store.clearAll = () => {
    const keep = store.state.settings;
    store.state = store.empty();
    store.state.settings = keep;
    store.commit({ keepExample: true });
  };

  store.dismissExample = () => {
    store.state.meta.example = false;
    store.commit({ keepExample: true });
  };

  store.projectName = (id) => {
    const p = id && store.get("projects", id);
    return p ? p.name : "";
  };
})();
