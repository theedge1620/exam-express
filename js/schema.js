/* Workload Balancer — entity schema.
   One definition drives the edit forms, spreadsheet columns, and import mapping.
   field.type: id | text | textarea | date | number | select | ref | bool | hidden */
(function () {
  const WB = (window.WB = window.WB || {});

  const LOAD_UNITS = [
    { value: "hrs", label: "hrs / week" },
    { value: "%", label: "% of capacity" },
  ];

  WB.schema = {
    projects: {
      label: "Projects",
      singular: "Project",
      sheet: "Projects",
      titleKey: "name",
      fields: [
        { key: "id", header: "ID", type: "id" },
        { key: "name", header: "Project", type: "text", required: true },
        { key: "code", header: "Code", type: "text", placeholder: "Short tag, e.g. DATA-INV" },
        { key: "status", header: "Status", type: "select", options: ["Planned", "Active", "On hold", "Complete"], default: "Active" },
        { key: "priority", header: "Priority", type: "select", options: ["High", "Medium", "Low"], default: "Medium" },
        { key: "lead", header: "Lead / sponsor", type: "text" },
        { key: "start", header: "Start", type: "date" },
        { key: "due", header: "Due", type: "date" },
        { key: "loadValue", header: "Load", type: "number", step: 0.5, min: 0, group: "load" },
        { key: "loadUnit", header: "Load unit", type: "select", options: LOAD_UNITS, default: "hrs", group: "load" },
        { key: "notes", header: "Notes", type: "textarea" },
        { key: "color", header: "Color", type: "hidden" },
      ],
    },
    milestones: {
      label: "Milestones",
      singular: "Milestone",
      sheet: "Milestones",
      titleKey: "title",
      fields: [
        { key: "id", header: "ID", type: "id" },
        { key: "title", header: "Milestone", type: "text", required: true },
        { key: "projectId", header: "Project ID", type: "ref", ref: "projects" },
        { key: "due", header: "Due", type: "date" },
        { key: "status", header: "Status", type: "select", options: ["Not started", "In progress", "At risk", "Done"], default: "Not started" },
        { key: "completedOn", header: "Completed on", type: "date" },
        { key: "notes", header: "Notes", type: "textarea" },
      ],
    },
    assignments: {
      label: "Assignments",
      singular: "Assignment",
      sheet: "Assignments",
      titleKey: "title",
      fields: [
        { key: "id", header: "ID", type: "id" },
        { key: "title", header: "Assignment", type: "text", required: true },
        { key: "projectId", header: "Project ID", type: "ref", ref: "projects" },
        { key: "assignedBy", header: "Assigned by", type: "text" },
        { key: "start", header: "Start", type: "date" },
        { key: "due", header: "Due", type: "date" },
        { key: "status", header: "Status", type: "select", options: ["Assigned", "In progress", "Blocked", "Done"], default: "Assigned" },
        { key: "loadValue", header: "Load", type: "number", step: 0.5, min: 0, group: "load" },
        { key: "loadUnit", header: "Load unit", type: "select", options: LOAD_UNITS, default: "hrs", group: "load" },
        { key: "notes", header: "Notes", type: "textarea" },
      ],
    },
    todos: {
      label: "To-dos",
      singular: "To-do",
      sheet: "To-dos",
      titleKey: "title",
      fields: [
        { key: "id", header: "ID", type: "id" },
        { key: "title", header: "Task", type: "text", required: true },
        { key: "projectId", header: "Project ID", type: "ref", ref: "projects" },
        { key: "due", header: "Due", type: "date" },
        { key: "priority", header: "Priority", type: "select", options: ["High", "Medium", "Low"], default: "Medium" },
        { key: "estHours", header: "Est. hours", type: "number", step: 0.25, min: 0 },
        { key: "done", header: "Done", type: "bool" },
        { key: "doneOn", header: "Done on", type: "date" },
        { key: "notes", header: "Notes", type: "textarea" },
      ],
    },
    log: {
      label: "Weekly log",
      singular: "Log entry",
      sheet: "Weekly log",
      titleKey: "title",
      fields: [
        { key: "id", header: "ID", type: "id" },
        { key: "date", header: "Date", type: "date", required: true },
        { key: "title", header: "Completed task", type: "text", required: true },
        { key: "projectId", header: "Project ID", type: "ref", ref: "projects" },
        { key: "hours", header: "Hours", type: "number", step: 0.25, min: 0 },
        { key: "category", header: "Category", type: "select", options: ["Analysis", "Development", "Review", "Meeting", "Coordination", "Documentation", "Training", "Other"], default: "Analysis" },
        { key: "outcome", header: "Outcome / impact", type: "textarea" },
        { key: "todoId", header: "To-do ID", type: "hidden" },
      ],
    },
  };

  WB.ENTITIES = ["projects", "milestones", "assignments", "todos", "log"];

  WB.optValue = (o) => (typeof o === "string" ? o : o.value);
  WB.optLabel = (o) => (typeof o === "string" ? o : o.label);

  /* Build a fresh record with defaults */
  WB.blank = (entity) => {
    const rec = {};
    for (const f of WB.schema[entity].fields) {
      if (f.default !== undefined) rec[f.key] = WB.optValue(f.default);
      else if (f.type === "bool") rec[f.key] = false;
      else rec[f.key] = "";
    }
    return rec;
  };
})();
