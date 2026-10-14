/* Workload Balancer — example data, generated relative to today so the
   prototype opens in a working state. Shown with an "Example data" banner
   and never saved until the person edits something. */
(function () {
  const WB = (window.WB = window.WB || {});
  const U = WB.util;

  WB.sample = function () {
    const t = U.todayISO();
    const d = (n) => U.addDays(t, n);
    const ws = U.weekStart(t);
    const w = (week, day) => U.addDays(ws, week * 7 + day); // week 0 = this week, day 0 = Mon

    const projects = [
      { id: "p_inv", name: "Enterprise data inventory", code: "DATA-INV", status: "Active", priority: "High", lead: "Office of the CDO", start: d(-60), due: d(45), loadValue: 12, loadUnit: "hrs", color: 0, notes: "Catalog authoritative datasets and owners." },
      { id: "p_cls", name: "Document intake classifier pilot", code: "AI-CLS", status: "Active", priority: "High", lead: "AI working group", start: d(-30), due: d(70), loadValue: 30, loadUnit: "%", color: 1, notes: "Pilot an ML classifier for incoming correspondence." },
      { id: "p_dsh", name: "Rulemaking metrics dashboard v2", code: "DASH-2", status: "Active", priority: "Medium", lead: "Program office", start: d(-14), due: d(28), loadValue: 8, loadUnit: "hrs", color: 2, notes: "" },
      { id: "p_gov", name: "Data governance charter refresh", code: "GOV", status: "Planned", priority: "Low", lead: "Data governance board", start: d(21), due: d(110), loadValue: 4, loadUnit: "hrs", color: 3, notes: "" },
    ];

    const milestones = [
      { id: "m1", title: "Inventory schema approved", projectId: "p_inv", due: d(-10), status: "Done", completedOn: d(-11), notes: "" },
      { id: "m2", title: "First 200 datasets catalogued", projectId: "p_inv", due: d(9), status: "In progress", completedOn: "", notes: "" },
      { id: "m3", title: "Labelled training set frozen", projectId: "p_cls", due: d(3), status: "At risk", completedOn: "", notes: "Waiting on SME review of 300 samples." },
      { id: "m4", title: "Pilot go / no-go briefing", projectId: "p_cls", due: d(38), status: "Not started", completedOn: "", notes: "" },
      { id: "m5", title: "Dashboard data model locked", projectId: "p_dsh", due: w(0, 1), status: "Done", completedOn: w(0, 1), notes: "" },
      { id: "m6", title: "User acceptance testing", projectId: "p_dsh", due: d(17), status: "Not started", completedOn: "", notes: "" },
    ];

    const assignments = [
      { id: "a1", title: "Respond to data call on AI use-case inventory", projectId: "", assignedBy: "CDO", start: d(-5), due: d(4), status: "In progress", loadValue: 4, loadUnit: "hrs", notes: "" },
      { id: "a2", title: "Peer review: records retention model", projectId: "p_cls", assignedBy: "Branch chief", start: d(-2), due: d(8), status: "Assigned", loadValue: 3, loadUnit: "hrs", notes: "" },
      { id: "a3", title: "Mentor summer analyst write-up", projectId: "", assignedBy: "Division director", start: d(-40), due: d(-3), status: "Done", loadValue: 0, loadUnit: "hrs", notes: "" },
      { id: "a4", title: "Data quality metrics for quarterly report", projectId: "p_inv", assignedBy: "CDO", start: d(1), due: d(20), status: "Blocked", loadValue: 5, loadUnit: "%", notes: "Needs access to source system." },
    ];

    const todos = [
      { id: "t1", title: "Draft SME review instructions for labelling", projectId: "p_cls", due: d(1), priority: "High", estHours: 1.5, done: false, doneOn: "", notes: "" },
      { id: "t2", title: "Send dataset owner survey reminder", projectId: "p_inv", due: d(0), priority: "Medium", estHours: 0.5, done: false, doneOn: "", notes: "" },
      { id: "t3", title: "Review dashboard filter wireframes", projectId: "p_dsh", due: d(2), priority: "Medium", estHours: 1, done: false, doneOn: "", notes: "" },
      { id: "t4", title: "Book room for go / no-go briefing", projectId: "p_cls", due: d(25), priority: "Low", estHours: 0.25, done: false, doneOn: "", notes: "" },
      { id: "t5", title: "Reconcile duplicate dataset entries", projectId: "p_inv", due: d(-1), priority: "High", estHours: 2, done: false, doneOn: "", notes: "" },
      { id: "t6", title: "Update team on AI use-case data call", projectId: "", due: "", priority: "Low", estHours: 0.5, done: false, doneOn: "", notes: "" },
      { id: "t7", title: "Write data dictionary for dashboard", projectId: "p_dsh", due: w(0, 0), priority: "Medium", estHours: 2, done: true, doneOn: w(0, 0), notes: "" },
    ];

    const L = (id, date, title, projectId, hours, category, outcome, todoId) => ({ id, date, title, projectId, hours, category, outcome, todoId: todoId || "" });
    const log = [
      L("l1", w(0, 0), "Write data dictionary for dashboard", "p_dsh", 2, "Documentation", "Shared with program office; unblocks UAT prep.", "t7"),
      L("l2", w(0, 0), "Classifier error analysis on 1,200 docs", "p_cls", 3.5, "Analysis", "Found two mislabelled classes; recall up 6 pts after fix."),
      L("l3", w(0, 1), "Locked dashboard data model", "p_dsh", 2.5, "Development", "Milestone met on schedule."),
      L("l4", w(-1, 0), "Inventory working session with 3 offices", "p_inv", 2, "Meeting", "41 datasets added with named stewards."),
      L("l5", w(-1, 1), "Built de-duplication script for catalog", "p_inv", 4, "Development", "Removed 63 duplicate records."),
      L("l6", w(-1, 2), "Drafted labelling guide v1", "p_cls", 3, "Documentation", ""),
      L("l7", w(-1, 3), "Peer reviewed analyst model notebook", "", 1.5, "Review", "Returned 9 comments; approved with changes."),
      L("l8", w(-1, 4), "Weekly sync with AI working group", "p_cls", 1, "Coordination", ""),
      L("l9", w(-2, 0), "Approved inventory schema", "p_inv", 1.5, "Review", "Schema signed off by governance board."),
      L("l10", w(-2, 2), "Trained baseline classifier", "p_cls", 5, "Development", "Baseline F1 0.81 on held-out set."),
      L("l11", w(-2, 3), "Dashboard requirements interviews", "p_dsh", 3, "Analysis", "Captured 14 requirements from 5 users."),
      L("l12", w(-3, 1), "Data call response: AI use cases", "", 2.5, "Coordination", "Submitted on time."),
      L("l13", w(-3, 3), "Catalogued legacy reporting datasets", "p_inv", 4, "Analysis", "28 datasets catalogued."),
    ];

    return {
      version: 1,
      meta: { example: true },
      settings: { name: "", role: "", org: "", capacity: 40 },
      projects, milestones, assignments, todos, log,
      reportNotes: {},
    };
  };
})();
