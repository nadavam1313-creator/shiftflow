// ShiftFlow — shared helpers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { h, render } from "https://esm.sh/preact@10.24.3";
import { useState, useEffect, useMemo, useRef, useCallback } from "https://esm.sh/preact@10.24.3/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { SUPABASE_URL, SUPABASE_ANON_KEY, CATEGORIES, LAUNCH_DATE } from "./config.js";

export const html = htm.bind(h);
export { render, useState, useEffect, useMemo, useRef, useCallback, CATEGORIES };

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, flowType: "pkce", detectSessionInUrl: true },
});

// Run a supabase query and throw on error
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ---------- dates (Israel time) ----------
const TZ = "Asia/Jerusalem";
const pad = (n) => String(n).padStart(2, "0");
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export const todayIL = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const hourIL = () =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
export const dayOfWeekIL = () => parseKey(todayIL()).getDay();
export function addDaysKey(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
export function currentWeekSunday() {
  const t = todayIL();
  return addDaysKey(t, -parseKey(t).getDay());
}
export const nextWeekSunday = () => addDaysKey(currentWeekSunday(), 7);
export function formatShort(key) {
  const d = parseKey(key);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}
export const formatWeekRange = (sun) => `${formatShort(sun)} – ${formatShort(addDaysKey(sun, 6))}`;
export const currentMonthIL = () => todayIL().slice(0, 7);
export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  return { start: `${ym}-01`, end: `${ym}-${pad(new Date(y, m, 0).getDate())}` };
}
export function recentMonthsIL(n) {
  const [y, m] = currentMonthIL().split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
}
export function formatMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}
export function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}
export function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: TZ, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
export function shiftPhaseNow() {
  const h = hourIL();
  return h < 14 ? "פתיחת משמרת" : h < 20 ? "במהלך משמרת" : "סוף משמרת";
}

// ---------- shifts ----------
export const DAYS = [
  { key: "sunday", label: "ראשון" },
  { key: "monday", label: "שני" },
  { key: "tuesday", label: "שלישי" },
  { key: "wednesday", label: "רביעי" },
  { key: "thursday", label: "חמישי" },
  { key: "friday", label: "שישי" },
  { key: "saturday", label: 'מוצ"ש' },
];
export const DAY_SHIFTS = {
  sunday: ["morning", "evening"],
  monday: ["morning", "evening"],
  tuesday: ["morning", "evening"],
  wednesday: ["morning", "evening"],
  thursday: ["morning", "evening"],
  friday: ["morning"],
  saturday: ["night"],
};
export const SHIFT_LABELS = { morning: "בוקר", evening: "ערב", night: 'מוצ"ש' };
// extra groups in the weekly schedule (from the manager's schedule sheet): shown to employees, count as "on shift" that day
export const EXTRA_ROLES = { walter: "וולטר", kitchen: "מטבח", closing: "סגירה" };
export const SHIFT_HOURS = { morning: "10:00-16:00", evening: "מ-16:00", night: "20 דק׳ אחרי צאת שבת - 00:00" };
export const ALL_SLOTS = DAYS.flatMap((d) => DAY_SHIFTS[d.key].map((s) => ({ day: d, shift: s, key: `${d.key}_${s}` })));
// ---------- Hebrew calendar: holidays & school vacations (Israel) ----------
const hebFmt = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", timeZone: "UTC" });
function hebrewOf(key) {
  const [y, m, d] = key.split("-").map(Number);
  const parts = hebFmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  return { month: parts.find((p) => p.type === "month").value, day: Number(parts.find((p) => p.type === "day").value) };
}
// Returns the holiday / school-vacation name for a date ("YYYY-MM-DD"), or null.
// Rules follow the Israeli Ministry of Education calendar (checked against תשפ"ז 2026-27).
export function holidayFor(key) {
  const month = Number(key.slice(5, 7));
  if (month === 7 || month === 8) return "חופש גדול";
  const { month: hm, day } = hebrewOf(key);
  if ((hm === "Elul" && day === 29) || (hm === "Tishri" && day <= 2)) return "ראש השנה";
  if (hm === "Tishri" && day >= 9 && day <= 10) return "יום כיפור";
  if (hm === "Tishri" && day >= 11 && day <= 22) return "חופשת סוכות";
  for (let back = 0; back <= 7; back++) {           // 8 days of Hanukkah from 25 Kislev
    const h = hebrewOf(addDaysKey(key, -back));
    if (h.month === "Kislev" && h.day === 25) return "חנוכה";
  }
  if ((hm === "Adar" || hm === "Adar II") && (day === 14 || day === 15)) return "פורים";
  if (hm === "Nisan" && day >= 6 && day <= 21) return "חופשת פסח";
  if (hm === "Iyar") {
    const dow5 = (parseKey(key).getDay() + (5 - day) + 70) % 7; // weekday of 5 Iyar
    const atzmaut = dow5 === 5 ? 4 : dow5 === 6 ? 3 : dow5 === 1 ? 6 : 5; // moved when 5 Iyar is Fri/Sat/Mon
    if (day === atzmaut) return "יום העצמאות";
    if (day === 18) return 'ל"ג בעומר';
  }
  if (hm === "Sivan" && day >= 5 && day <= 7) return "שבועות";
  return null;
}

// Sun–Thu mornings are closed for employee requests, except on holidays / school vacations
// (opened automatically). A manager can still open or close a specific morning per week.
export const WEEKDAY_MORNINGS = ["sunday", "monday", "tuesday", "wednesday", "thursday"].map((d) => `${d}_morning`);
const DAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
export const dateOfSlot = (week, key) => addDaysKey(week, DAY_INDEX[key.split("_")[0]]);
export async function loadWeekSettings(week) {
  const { data } = await sb.from("week_settings").select("open_slots,closed_slots").eq("week_start", week).maybeSingle();
  return { open_slots: data?.open_slots || [], closed_slots: data?.closed_slots || [] };
}
// state of a weekday morning: { open, auto (holiday name or null), manual: "open" | "closed" | null }
export function morningState(week, key, settings) {
  const auto = holidayFor(dateOfSlot(week, key));
  if (settings.closed_slots.includes(key)) return { open: false, auto, manual: "closed" };
  if (settings.open_slots.includes(key)) return { open: true, auto, manual: "open" };
  return { open: !!auto, auto, manual: null };
}
export const slotChecker = (week, settings) => (key) =>
  !WEEKDAY_MORNINGS.includes(key) || morningState(week, key, settings).open;

export const PHASES = ["פתיחת משמרת", "במהלך משמרת", "סוף משמרת"];

export const ROLE_LABELS = { pending: "ממתין לאישור", employee: "עובד", manager: 'אחמ"ש', admin: "מנהל" };
export const isManagerRole = (r) => r === "manager" || r === "admin";
// before the launch date employees can only sign up and look around (managers can work normally)
export const isPaused = (profile) => !isManagerRole(profile?.role) && todayIL() < LAUNCH_DATE;
export const LAUNCH_LABEL = "יום שני 16.11";

// ---------- toast ----------
let toastListener = null;
export function onToast(fn) { toastListener = fn; }
export function toast(text, kind = "ok") { toastListener && toastListener({ text, kind, id: Math.random() }); }

// ---------- small UI pieces ----------
export const Spinner = () => html`<div class="center pad"><div class="spinner"></div></div>`;
export const ErrorBox = ({ error, retry }) => html`
  <div class="empty">
    <p>משהו השתבש בטעינה</p>
    <p class="muted small">${String(error?.message || error || "")}</p>
    ${retry && html`<button class="btn" onClick=${retry}>נסה שוב</button>`}
  </div>`;

// load data with loading/error state
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }));
    return () => { alive = false; };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), setData: (d) => setState((s) => ({ ...s, data: typeof d === "function" ? d(s.data) : d })) };
}

export function WeekToggle({ value, onChange }) {
  const opts = [
    { key: currentWeekSunday(), label: "השבוע" },
    { key: nextWeekSunday(), label: "שבוע הבא" },
  ];
  return html`<div class="seg">
    ${opts.map((o) => html`<button class=${value === o.key ? "on" : ""} onClick=${() => onChange(o.key)}>
      ${o.label}<small>${formatWeekRange(o.key)}</small></button>`)}
  </div>`;
}

export function Modal({ title, children, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return html`<div class="modal-bg">
    <div class="modal">
      <div class="row between"><h3>${title}</h3><button class="icon-btn" onClick=${onClose}>✕</button></div>
      ${children}
    </div>
  </div>`;
}

// only allow http(s) links (photo URLs come from the database)
export const safeUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : null);

// shrink a phone photo before upload (max 1600px, JPEG)
export async function shrinkImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob || file;
  } catch {
    return file; // e.g. HEIC on browsers that can't decode it
  }
}

// ---------- location while working ----------
let lastFix = null;
export function getLocation() {
  if (lastFix && Date.now() - lastFix.at < 60000) return Promise.resolve(lastFix);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("הטלפון לא תומך בשיתוף מיקום"));
    navigator.geolocation.getCurrentPosition(
      (p) => { lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: Date.now() }; resolve(lastFix); },
      (e) => reject(new Error(e.code === 1
        ? "צריך לאשר שיתוף מיקום כדי לסמן משימות (בהגדרות הדפדפן ← מיקום ← לאפשר)"
        : "לא הצלחנו לקבל מיקום — ודאו שה-GPS פועל ונסו שוב")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

// ---------- live-photo check ----------
// Reads the EXIF "taken at" time of a JPEG (phone-local time, i.e. Israel). null if missing.
async function exifTakenAt(file) {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 < v.byteLength) {
      const marker = v.getUint16(p), len = v.getUint16(p + 2);
      if (marker === 0xffe1 && v.getUint32(p + 4) === 0x45786966) { // "Exif"
        const t = p + 10, le = v.getUint16(t) === 0x4949;
        const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
        const str = (o, n) => { let r = ""; for (let i = 0; i < n - 1; i++) r += String.fromCharCode(v.getUint8(t + o + i)); return r; };
        const scan = (ifd, want) => {
          const n = u16(ifd); const out = {};
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12, tag = u16(e);
            if (want.includes(tag)) out[tag] = tag === 0x8769 ? u32(e + 8) : str(u32(e + 8), u32(e + 4));
          }
          return out;
        };
        const ifd0 = scan(u32(4), [0x8769, 0x0132]);
        const exif = ifd0[0x8769] ? scan(ifd0[0x8769], [0x9003]) : {};
        const d = exif[0x9003] || ifd0[0x0132];
        const m = d && d.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
        return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
      }
      if ((marker & 0xff00) !== 0xff00) return null;
      p += 2 + len;
    }
  } catch {}
  return null;
}
const nowILasUTC = () => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return Date.UTC(+f.year, f.month - 1, +f.day, +f.hour, +f.minute, +f.second);
};
// a photo must have been taken in the last few minutes (camera, not the gallery)
export async function isFreshPhoto(file, maxMinutes = 5) {
  const taken = await exifTakenAt(file);
  const ageMin = taken != null ? (nowILasUTC() - taken) / 60000 : (Date.now() - (file.lastModified || 0)) / 60000;
  return ageMin <= maxMinutes && ageMin >= -maxMinutes;
}
// shrink + stamp the date, time and employee name on the photo
export async function stampPhoto(file, label, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const fs = Math.max(16, Math.round(c.width / 28));
    const text = `${formatDateTime(new Date().toISOString())} · ${label}`;
    g.font = `bold ${fs}px Heebo, Arial, sans-serif`;
    g.direction = "rtl";
    const h = fs * 1.9;
    g.fillStyle = "rgba(0,0,0,.55)";
    g.fillRect(0, c.height - h, c.width, h);
    g.fillStyle = "#fff";
    g.textBaseline = "middle";
    g.textAlign = "right";
    g.fillText("📷 " + text, c.width - fs * 0.6, c.height - h / 2);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob || file;
  } catch {
    return file;
  }
}

export function NoAccess() {
  return html`<div class="empty"><p class="big">אין הרשאה</p><p class="muted">העמוד הזה מיועד למנהלים</p></div>`;
}
