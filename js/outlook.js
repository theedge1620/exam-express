/* Workload Balancer — Outlook calendar import.
   Reads the two formats Outlook can export and returns a flat list of meeting
   occurrences in local time:
     • iCalendar (.ics): "Save calendar" in classic Outlook, calendar export /
       publish in new Outlook and Outlook on the web, or a single invite dragged
       out of Outlook. Recurring series (RRULE) are expanded inside the requested
       date range, with EXDATE exclusions and RECURRENCE-ID overrides applied.
       TZID times are converted from IANA or common Windows zone names.
     • CSV: classic Outlook File › Open & Export › Import/Export › Export to a
       file › Comma Separated Values (Calendar). Outlook already expands
       recurrences for the range chosen at export time.
   Each occurrence carries a stable `key` used to skip meetings already logged. */
(function () {
  const WB = (window.WB = window.WB || {});
  const U = WB.util;
  const OL = (WB.outlook = {});

  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes());
  const DAY = 86400000;

  /* ---------- time zones ---------- */
  const WIN_TZ = {
    "eastern standard time": "America/New_York", "us eastern standard time": "America/Indiana/Indianapolis",
    "central standard time": "America/Chicago", "mountain standard time": "America/Denver",
    "us mountain standard time": "America/Phoenix", "pacific standard time": "America/Los_Angeles",
    "alaskan standard time": "America/Anchorage", "hawaiian standard time": "Pacific/Honolulu",
    "atlantic standard time": "America/Halifax", "newfoundland standard time": "America/St_Johns",
    "gmt standard time": "Europe/London", "greenwich standard time": "Atlantic/Reykjavik",
    "w. europe standard time": "Europe/Berlin", "romance standard time": "Europe/Paris",
    "central europe standard time": "Europe/Budapest", "central european standard time": "Europe/Warsaw",
    "e. europe standard time": "Europe/Chisinau", "fle standard time": "Europe/Kiev", "gtb standard time": "Europe/Bucharest",
    "israel standard time": "Asia/Jerusalem", "arabian standard time": "Asia/Dubai", "india standard time": "Asia/Kolkata",
    "china standard time": "Asia/Shanghai", "singapore standard time": "Asia/Singapore", "tokyo standard time": "Asia/Tokyo",
    "korea standard time": "Asia/Seoul", "aus eastern standard time": "Australia/Sydney", "e. australia standard time": "Australia/Brisbane",
    "cen. australia standard time": "Australia/Adelaide", "w. australia standard time": "Australia/Perth",
    "new zealand standard time": "Pacific/Auckland", "utc": "UTC", "coordinated universal time": "UTC",
  };

  const zoneOk = {};
  function ianaZone(tzid) {
    if (!tzid) return null;
    let z = String(tzid).replace(/^"|"$/g, "").replace(/^\/+/, "").trim();
    const win = WIN_TZ[z.toLowerCase()];
    if (win) z = win;
    if (/^(utc|gmt|z)$/i.test(z)) return "UTC";
    if (!(z in zoneOk)) {
      try { new Intl.DateTimeFormat("en-US", { timeZone: z }); zoneOk[z] = true; } catch (_) { zoneOk[z] = false; }
    }
    return zoneOk[z] ? z : null;
  }

  // Offset (ms) of `zone` from UTC at instant `ms`
  const fmtCache = {};
  function zoneOffset(zone, ms) {
    const f = fmtCache[zone] || (fmtCache[zone] = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
    const p = {};
    for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
  }

  /* A wall-clock time ({y,m,d,h,mi,s}, m 1-based) in a zone → epoch ms.
     zone: "UTC", an IANA name, or null for the browser's local zone. */
  function wallToMs(w, zone) {
    if (!zone) return new Date(w.y, w.m - 1, w.d, w.h, w.mi, w.s).getTime();
    const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
    if (zone === "UTC") return guess;
    let ms = guess - zoneOffset(zone, guess);
    const o2 = zoneOffset(zone, ms);
    if (guess - o2 !== ms) ms = guess - o2;
    return ms;
  }

  /* ---------- iCalendar ---------- */
  function unescapeText(s) {
    return String(s).replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
  }

  function parseLine(line) {
    // NAME;P1=V1;P2="a:b":VALUE — colon inside quotes belongs to the params
    let i = 0, q = false;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === ":" && !q) break;
    }
    const head = line.slice(0, i);
    const value = line.slice(i + 1);
    const parts = head.split(";");
    const params = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
    }
    return { name: parts[0].toUpperCase(), params, value };
  }

  /* DATE or DATE-TIME → { ms, allDay, wall, zone } */
  function parseICSDate(value, params) {
    const v = String(value || "").trim();
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (!m) return null;
    const wall = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
    const allDay = !m[4] || (params && params.VALUE === "DATE");
    const zone = m[7] ? "UTC" : allDay ? null : ianaZone(params && params.TZID);
    return { ms: wallToMs(wall, zone), allDay, wall, zone };
  }

  function parseDuration(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || "").trim());
    if (!m) return 0;
    const ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 3600000) + ((+m[5] || 0) * 60000) + ((+m[6] || 0) * 1000);
    return m[1] === "-" ? -ms : ms;
  }

  function readVEvents(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    const events = [];
    let ev = null, depth = 0;
    for (const raw of lines) {
      if (!raw) continue;
      const up = raw.toUpperCase();
      if (up === "BEGIN:VEVENT") { ev = { props: {} }; depth = 0; continue; }
      if (!ev) continue;
      if (up === "END:VEVENT") { events.push(ev); ev = null; continue; }
      if (up.startsWith("BEGIN:")) { depth++; continue; } // VALARM etc.
      if (up.startsWith("END:")) { depth--; continue; }
      if (depth > 0) continue;
      const p = parseLine(raw);
      (ev.props[p.name] = ev.props[p.name] || []).push(p);
    }
    return events;
  }

  const one = (ev, name) => (ev.props[name] ? ev.props[name][0] : null);
  const text1 = (ev, name) => { const p = one(ev, name); return p ? unescapeText(p.value).trim() : ""; };

  function eventBase(ev) {
    const ds = one(ev, "DTSTART");
    const start = ds && parseICSDate(ds.value, ds.params);
    if (!start) return null;
    let durMs;
    const de = one(ev, "DTEND");
    const du = one(ev, "DURATION");
    if (de) { const e = parseICSDate(de.value, de.params); durMs = e ? e.ms - start.ms : 0; }
    else if (du) durMs = parseDuration(du.value);
    else durMs = start.allDay ? DAY : 0;
    const busy = (text1(ev, "X-MICROSOFT-CDO-BUSYSTATUS") || "").toUpperCase();
    const transp = (text1(ev, "TRANSP") || "").toUpperCase();
    const showAs = busy === "FREE" || (!busy && transp === "TRANSPARENT") ? "Free"
      : busy === "TENTATIVE" ? "Tentative" : busy === "OOF" ? "Away" : busy === "WORKINGELSEWHERE" ? "Elsewhere" : "Busy";
    const org = one(ev, "ORGANIZER");
    const subject = text1(ev, "SUMMARY") || "(No subject)";
    const status = (text1(ev, "STATUS") || "").toUpperCase();
    return {
      uid: text1(ev, "UID") || subject + "|" + ds.value,
      subject, start, durMs: Math.max(0, durMs),
      location: text1(ev, "LOCATION"),
      organizer: org ? (org.params.CN || org.value.replace(/^mailto:/i, "")) : "",
      categories: (ev.props.CATEGORIES || []).map((p) => unescapeText(p.value)).join(", "),
      showAs,
      cancelled: status === "CANCELLED" || /^(canceled|cancelled)\s*:/i.test(subject),
    };
  }

  function occurrence(base, startMs, overrideOf) {
    const s = new Date(startMs);
    const allDay = base.start.allDay;
    const minutes = allDay ? 0 : Math.round(base.durMs / 60000);
    const e = new Date(startMs + base.durMs);
    return {
      key: "outlook:" + base.uid + "@" + (overrideOf || startMs),
      subject: base.subject,
      date: U.toISO(s),
      start: allDay ? "" : hhmm(s),
      end: allDay ? "" : hhmm(e),
      minutes, allDay,
      location: base.location, organizer: base.organizer, categories: base.categories,
      showAs: base.showAs, cancelled: base.cancelled,
    };
  }

  /* ---------- RRULE expansion ---------- */
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function parseRRule(v) {
    const r = {};
    for (const part of String(v).split(";")) {
      const [k, val] = part.split("=");
      if (k && val !== undefined) r[k.toUpperCase()] = val;
    }
    return {
      freq: (r.FREQ || "").toUpperCase(),
      interval: Math.max(1, +r.INTERVAL || 1),
      count: r.COUNT ? +r.COUNT : 0,
      until: r.UNTIL ? parseICSDate(r.UNTIL, {}) : null,
      byday: r.BYDAY ? r.BYDAY.split(",").map((s) => {
        const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(s.trim().toUpperCase());
        return m ? { n: m[1] ? +m[1] : 0, wd: WD[m[2]] } : null;
      }).filter(Boolean) : [],
      bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : [],
      bymonth: r.BYMONTH ? r.BYMONTH.split(",").map(Number) : [],
      bysetpos: r.BYSETPOS ? r.BYSETPOS.split(",").map(Number) : [],
      wkst: WD[(r.WKST || "MO").toUpperCase()] ?? 1,
    };
  }

  // Days of a month (1..n) that satisfy BYDAY / BYMONTHDAY / BYSETPOS
  function monthDays(y, m, rule, startDay) {
    const n = new Date(y, m, 0).getDate();
    let days = [];
    if (rule.bymonthday.length) {
      for (const d of rule.bymonthday) { const dd = d < 0 ? n + 1 + d : d; if (dd >= 1 && dd <= n) days.push(dd); }
    } else if (rule.byday.length) {
      for (const { n: ord, wd } of rule.byday) {
        const hits = [];
        for (let d = 1; d <= n; d++) if (new Date(y, m - 1, d).getDay() === wd) hits.push(d);
        if (!ord) days.push(...hits);
        else { const h = ord > 0 ? hits[ord - 1] : hits[hits.length + ord]; if (h) days.push(h); }
      }
    } else if (startDay <= n) days.push(startDay);
    days = [...new Set(days)].sort((a, b) => a - b);
    if (rule.bysetpos.length) days = rule.bysetpos.map((p) => (p > 0 ? days[p - 1] : days[days.length + p])).filter(Boolean);
    return days;
  }

  /* Wall-clock dates (in the series' zone) of every occurrence up to `toMs` */
  function expand(base, rule, toMs) {
    const sw = base.start.wall;
    const d0 = new Date(sw.y, sw.m - 1, sw.d);
    const untilMs = rule.until ? rule.until.ms : Infinity;
    const out = [];
    let count = 0;
    const wkOffset = (d0.getDay() - rule.wkst + 7) % 7; // days from the week start (WKST) to DTSTART
    const monthCache = {};
    const maxDays = 366 * 30;
    for (let i = 0; i < maxDays; i++) {
      const d = new Date(sw.y, sw.m - 1, sw.d + i);
      const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(), wd = d.getDay();
      let hit = false;
      if (rule.freq === "DAILY") {
        hit = i % rule.interval === 0 && (!rule.byday.length || rule.byday.some((b) => b.wd === wd)) && (!rule.bymonth.length || rule.bymonth.includes(m));
      } else if (rule.freq === "WEEKLY") {
        const days = rule.byday.length ? rule.byday.map((b) => b.wd) : [d0.getDay()];
        hit = Math.floor((i + wkOffset) / 7) % rule.interval === 0 && days.includes(wd);
      } else if (rule.freq === "MONTHLY" || rule.freq === "YEARLY") {
        const months = (y - sw.y) * 12 + (m - sw.m);
        const okPeriod = rule.freq === "MONTHLY"
          ? months % rule.interval === 0 && (!rule.bymonth.length || rule.bymonth.includes(m))
          : (y - sw.y) % rule.interval === 0 && (rule.bymonth.length ? rule.bymonth.includes(m) : m === sw.m);
        if (okPeriod) {
          const ck = y + "-" + m;
          const list = monthCache[ck] || (monthCache[ck] = monthDays(y, m, rule, sw.d));
          hit = list.includes(day);
        }
      } else {
        break;
      }
      if (!hit) continue;
      const wall = { y, m, d: day, h: sw.h, mi: sw.mi, s: sw.s };
      const ms = base.start.allDay ? new Date(y, m - 1, day).getTime() : wallToMs(wall, base.start.zone);
      if (ms < base.start.ms) continue;
      if (ms > untilMs) break;
      count++;
      if (rule.count && count > rule.count) break;
      if (ms > toMs) break;
      out.push(ms);
    }
    return out;
  }

  function parseICS(text, fromISO, toISO) {
    const fromMs = U.parseISO(fromISO).getTime();
    const toMs = U.parseISO(toISO).getTime() + DAY - 1;
    const events = readVEvents(text);
    const overrides = {}; // uid -> Set(original start ms)
    const out = [];

    for (const ev of events) {
      const rid = one(ev, "RECURRENCE-ID");
      if (!rid) continue;
      const base = eventBase(ev);
      const r = rid && parseICSDate(rid.value, rid.params);
      if (!base || !r) continue;
      (overrides[base.uid] = overrides[base.uid] || new Set()).add(r.ms);
      out.push(occurrence(base, base.start.ms, r.ms));
    }

    for (const ev of events) {
      if (one(ev, "RECURRENCE-ID")) continue;
      const base = eventBase(ev);
      if (!base) continue;
      const rr = one(ev, "RRULE");
      if (!rr) { out.push(occurrence(base, base.start.ms)); continue; }
      const ex = new Set();
      for (const p of ev.props.EXDATE || []) {
        for (const v of p.value.split(",")) { const d = parseICSDate(v, Object.assign({ TZID: base.start.zone }, p.params)); if (d) ex.add(d.allDay ? U.toISO(new Date(d.wall.y, d.wall.m - 1, d.wall.d)) : d.ms); }
      }
      const ov = overrides[base.uid] || new Set();
      for (const ms of expand(base, parseRRule(rr.value), toMs)) {
        if (ms + Math.max(base.durMs, 1) <= fromMs) continue;
        if (ex.has(ms) || ex.has(U.toISO(new Date(ms))) || ov.has(ms)) continue;
        out.push(occurrence(base, ms));
      }
    }
    return out;
  }

  /* ---------- CSV (classic Outlook export) ---------- */
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  function parseTime(v) {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?$/i.exec(String(v || "").trim());
    if (!m) return null;
    let h = +m[1];
    if (m[3]) { const pm = m[3].toLowerCase() === "p"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    return { h, mi: +m[2] };
  }

  function parseCSVRows(rows) {
    if (!rows.length) return [];
    const keys = Object.keys(rows[0]);
    const col = (...names) => keys.find((k) => names.includes(norm(k)));
    const c = {
      subject: col("subject"), sd: col("startdate"), st: col("starttime"), ed: col("enddate"), et: col("endtime"),
      allDay: col("alldayevent"), org: col("meetingorganizer", "organizer"), cats: col("categories"),
      loc: col("location"), show: col("showtimeas"),
    };
    if (!c.subject || !c.sd) throw new Error("This CSV doesn't look like an Outlook calendar export (no Subject / Start Date columns).");

    // Outlook writes dates in the PC's regional format: detect d/m/y when any first part exceeds 12
    const dayFirst = rows.some((r) => { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/.exec(String(r[c.sd]).trim()); return m && +m[1] > 12; });
    const toDate = (v) => {
      if (typeof v === "number") return U.parseISO(U.normDate(v));
      const s = String(v || "").trim();
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
      if (m) { let y = +m[3]; if (y < 100) y += 2000; return dayFirst ? new Date(y, +m[2] - 1, +m[1]) : new Date(y, +m[1] - 1, +m[2]); }
      return U.parseISO(s);
    };
    const SHOW = { 0: "Free", 1: "Tentative", 2: "Busy", 3: "Away", 4: "Elsewhere", free: "Free", tentative: "Tentative", busy: "Busy", outofoffice: "Away", workingelsewhere: "Elsewhere" };

    const out = [];
    for (const r of rows) {
      const subject = String(r[c.subject] || "").trim();
      const sd = toDate(r[c.sd]);
      if (!sd) continue;
      const allDay = c.allDay ? /^(true|yes|1|wahr|vrai)$/i.test(String(r[c.allDay]).trim()) : false;
      const st = c.st && parseTime(r[c.st]);
      const start = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), st && !allDay ? st.h : 0, st && !allDay ? st.mi : 0);
      let end = start;
      const ed = c.ed && toDate(r[c.ed]);
      const et = c.et && parseTime(r[c.et]);
      if (ed) end = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), et && !allDay ? et.h : 0, et && !allDay ? et.mi : 0);
      const minutes = allDay ? 0 : Math.max(0, Math.round((end - start) / 60000));
      const show = c.show ? SHOW[norm(r[c.show])] || "Busy" : "Busy";
      out.push({
        key: "outlook:" + norm(subject).slice(0, 60) + "@" + U.toISO(start) + "T" + hhmm(start),
        subject: subject || "(No subject)",
        date: U.toISO(start), start: allDay ? "" : hhmm(start), end: allDay ? "" : hhmm(end),
        minutes, allDay,
        location: c.loc ? String(r[c.loc] || "") : "", organizer: c.org ? String(r[c.org] || "") : "",
        categories: c.cats ? String(r[c.cats] || "").replace(/;/g, ", ") : "",
        showAs: show, cancelled: /^(canceled|cancelled)\s*:/i.test(subject),
      });
    }
    return out;
  }

  /* ---------- public ---------- */
  /* Read a File once; returns a function that yields meetings for a date range. */
  OL.read = async (file) => {
    const name = file.name.toLowerCase();
    const text = await file.text();
    const looksICS = /BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text.slice(0, 4096));
    if (name.endsWith(".ics") || name.endsWith(".ical") || name.endsWith(".ifb") || name.endsWith(".vcs") || looksICS) {
      if (!looksICS) throw new Error("No calendar events found in this file.");
      return { format: "ics", meetings: (from, to) => parseICS(text, from, to) };
    }
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const wb = XLSX.read(text, { type: "string", raw: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      const all = parseCSVRows(rows);
      return { format: "csv", meetings: (from, to) => all.filter((m) => m.date >= from && m.date <= to) };
    }
    throw new Error("Use an Outlook calendar export: .ics or .csv.");
  };

  /* Filter, sort, and decorate meetings for the import list */
  OL.prepare = (list, from, to) =>
    list
      .filter((m) => !m.cancelled && m.date >= from && m.date <= to)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start) || a.subject.localeCompare(b.subject))
      .map((m) => Object.assign(m, { hours: Math.round((m.minutes / 60) * 4) / 4 }));

  /* Best-guess project: earlier imports of the same subject, then code / name match */
  OL.guessProject = (m, state) => {
    const prior = state.log.filter((l) => l.sourceId && l.title === m.subject && l.projectId).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (prior && state.projects.some((p) => p.id === prior.projectId)) return { projectId: prior.projectId, category: prior.category };
    const hay = " " + [m.subject, m.categories, m.location].join(" ").toLowerCase() + " ";
    const active = state.projects.filter((p) => p.status !== "Complete");
    const byCode = active.find((p) => p.code && new RegExp("(^|[^a-z0-9])" + p.code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(hay));
    if (byCode) return { projectId: byCode.id };
    const byName = active.find((p) => p.name && p.name.length >= 4 && hay.includes(p.name.toLowerCase()));
    return { projectId: byName ? byName.id : "" };
  };

  OL.timeLabel = (m) => {
    if (m.allDay) return "All day";
    const f = (t) => { const [h, mi] = t.split(":").map(Number); return ((h % 12) || 12) + (mi ? ":" + pad(mi) : "") + (h < 12 ? "a" : "p"); };
    return f(m.start) + "–" + f(m.end);
  };
})();
