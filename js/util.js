/* Workload Balancer — shared helpers (dates, ids, escaping, load math).
   Classic script: attaches to window.WB so the app runs from file:// too. */
(function () {
  const WB = (window.WB = window.WB || {});
  const U = (WB.util = {});

  U.uid = (prefix = "id") =>
    prefix + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

  U.esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  U.num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  U.round1 = (n) => Math.round(n * 10) / 10;
  U.fmtHrs = (h) => {
    const r = U.round1(h);
    return (Number.isInteger(r) ? r.toString() : r.toFixed(1));
  };
  U.pct = (n) => Math.round(n) + "%";

  /* ---------- dates (ISO yyyy-mm-dd, local time) ---------- */
  U.toISO = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  U.parseISO = (s) => {
    if (!s) return null;
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s).trim());
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s).trim());
    if (us) {
      let y = +us[3];
      if (y < 100) y += 2000;
      return new Date(y, +us[1] - 1, +us[2]);
    }
    return null;
  };

  /* Normalise anything date-like (ISO, US m/d/y, Excel serial, Date) to ISO or "" */
  U.normDate = (v) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number" && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return U.toISO(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
    const d = U.parseISO(v);
    return d ? U.toISO(d) : "";
  };

  U.todayISO = () => U.toISO(new Date());

  U.addDays = (iso, n) => {
    const d = U.parseISO(iso);
    d.setDate(d.getDate() + n);
    return U.toISO(d);
  };

  U.daysBetween = (a, b) => Math.round((U.parseISO(b) - U.parseISO(a)) / 86400000);
  U.daysUntil = (iso) => U.daysBetween(U.todayISO(), iso);

  /* Monday-start week */
  U.weekStart = (iso) => {
    const d = U.parseISO(iso);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return U.toISO(d);
  };

  U.isoWeek = (iso) => {
    const d = U.parseISO(iso);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  };

  /* U.S. federal fiscal year: FY starts Oct 1 */
  U.fiscal = (iso) => {
    const d = U.parseISO(iso);
    const m = d.getMonth();
    const fy = m >= 9 ? d.getFullYear() + 1 : d.getFullYear();
    const q = Math.floor(((m + 3) % 12) / 3) + 1;
    return { fy, q, label: "FY" + String(fy).slice(-2) + " Q" + q };
  };

  U.fiscalQuarterRange = (iso) => {
    const d = U.parseISO(iso);
    const m = d.getMonth();
    const startMonth = [9, 0, 3, 6][Math.floor(((m + 3) % 12) / 3)];
    let y = d.getFullYear();
    const start = new Date(y, startMonth, 1);
    const end = new Date(y, startMonth + 3, 0);
    return { from: U.toISO(start), to: U.toISO(end) };
  };

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  U.fmtDate = (iso, withYear) => {
    const d = U.parseISO(iso);
    if (!d) return "—";
    return MONTHS[d.getMonth()] + " " + d.getDate() + (withYear ? ", " + d.getFullYear() : "");
  };
  U.fmtDow = (iso) => DOW[U.parseISO(iso).getDay()];

  U.weekLabel = (ws) => {
    const we = U.addDays(ws, 6);
    const sameYear = ws.slice(0, 4) === we.slice(0, 4);
    return "Wk " + U.isoWeek(ws) + " · " + U.fmtDate(ws) + " – " + U.fmtDate(we, true) + (sameYear ? "" : "");
  };

  U.relDays = (iso) => {
    if (!iso) return "";
    const n = U.daysUntil(iso);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "yesterday";
    return n < 0 ? Math.abs(n) + " days late" : "in " + n + " days";
  };

  /* ---------- load math ---------- */
  U.loadHours = (item, capacity) => {
    const v = U.num(item.loadValue);
    return item.loadUnit === "%" ? (v / 100) * capacity : v;
  };
  U.loadLabel = (item) => {
    if (!U.num(item.loadValue)) return "—";
    return item.loadUnit === "%" ? U.fmtHrs(U.num(item.loadValue)) + "%" : U.fmtHrs(U.num(item.loadValue)) + " h/wk";
  };

  U.debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
})();
