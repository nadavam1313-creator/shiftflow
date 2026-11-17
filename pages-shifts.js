// ShiftFlow — shift requests, schedule, schedule editor
import {
  html, useState, useEffect, useRef, sb, q, toast, Spinner, ErrorBox, useLoad, isManagerRole, NoAccess, WeekToggle, isPaused, LAUNCH_LABEL,
  DAYS, DAY_SHIFTS, SHIFT_LABELS, SHIFT_HOURS, ALL_SLOTS, currentWeekSunday, nextWeekSunday, formatWeekRange,
  dayOfWeekIL, addDaysKey, formatShort, formatDateTime, WEEKDAY_MORNINGS, slotChecker, loadWeekSettings, morningState, EXTRA_ROLES,
} from "./lib.js";

const MIN_SHIFTS = 3;
// at least one weekend shift (Thursday, Friday or Saturday night) is required
const WEEKEND_SLOTS = ["thursday_morning", "thursday_evening", "friday_morning", "saturday_night"];
const MANAGER_NAME = "מיכל"; // shown in the "locked" message

// ================= employee: submit availability =================
export function ShiftRequest({ profile }) {
  if (isPaused(profile)) return html`<div class="stack"><h2>הגשת משמרות</h2>
    <div class="empty"><p>⏸️ הגשת המשמרות נפתחת ב${LAUNCH_LABEL}.</p><p class="muted">בינתיים רק נרשמים ומתחברים — המנהל מגדיר את כולם.</p></div></div>`;
  return html`<${ShiftRequestForm} profile=${profile} />`;
}

function ShiftRequestForm({ profile }) {
  const weekStart = nextWeekSunday();
  const day = dayOfWeekIL();
  const open = day >= 2 && day <= 3; // submission window: Tuesday–end of Wednesday (Thursday closed)
  const [avail, setAvail] = useState({});
  const [slotNotes, setSlotNotes] = useState({});
  const [notes, setNotes] = useState("");
  const [openNote, setOpenNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [settings, setSettings] = useState({ open_slots: [], closed_slots: [] });
  const { loading, error, data: existing, reload, setData } = useLoad(async () => {
    const [row, ws] = await Promise.all([
      q(sb.from("shift_submissions").select("*").eq("employee_email", profile.email).eq("week_start", weekStart).maybeSingle()),
      loadWeekSettings(weekStart),
    ]);
    setSettings(ws);
    return row;
  }, [weekStart]);
  const isOpen = slotChecker(weekStart, settings);
  const openMornings = WEEKDAY_MORNINGS.map((k) => ({ k, st: morningState(weekStart, k, settings) })).filter((x) => x.st.open);
  const holidayNames = [...new Set(openMornings.map((x) => x.st.auto).filter(Boolean))];

  useEffect(() => {
    if (existing) {
      setAvail(existing.availability || {});
      setSlotNotes(existing.slot_notes || {});
      setNotes(existing.notes || "");
    }
  }, [existing]);

  const count = Object.entries(avail).filter(([k, v]) => v && isOpen(k)).length;
  const hasWeekend = WEEKEND_SLOTS.some((k) => avail[k] && isOpen(k));

  const submit = async () => {
    if (count < MIN_SHIFTS) return toast(`יש לבחור לפחות ${MIN_SHIFTS} משמרות (בחרת ${count})`, "bad");
    if (!hasWeekend) return toast("חובה לבחור לפחות משמרת אחת בסופ״ש — חמישי, שישי או מוצ״ש", "bad");
    setBusy(true);
    const row = {
      employee_email: profile.email,
      employee_name: profile.full_name || profile.email,
      week_start: weekStart,
      availability: Object.fromEntries(Object.entries(avail).filter(([k]) => isOpen(k))),
      slot_notes: Object.fromEntries(Object.entries(slotNotes).filter(([k]) => isOpen(k))),
      notes,
      locked: true,
      updated_at: new Date().toISOString(),
    };
    try {
      const saved = existing
        ? await q(sb.from("shift_submissions").update(row).eq("id", existing.id).select().single())
        : await q(sb.from("shift_submissions").insert(row).select().single());
      setData(saved);
      setJustSubmitted(true);
      toast("המשמרות הוגשו בהצלחה!");
    } catch (e) {
      toast("ההגשה נכשלה: " + e.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const header = html`<div><h2>הגשת משמרות</h2><p class="muted">שבוע: <b>${formatWeekRange(weekStart)}</b></p></div>`;

  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;

  if (justSubmitted) {
    return html`<div class="empty">
      <p class="huge">✅</p><p class="big">הוגש בהצלחה!</p>
      <p class="muted">המשמרות שלך לשבוע ${formatWeekRange(weekStart)} נשמרו.</p>
      <p class="note warn">🔒 לשינוי משמרות יש לפנות ל${MANAGER_NAME}</p>
    </div>`;
  }

  if (!open) {
    return html`<div class="empty">
      <p class="huge">🕐</p><p class="big">הגשת משמרות</p>
      <p class="muted">ההגשה פתוחה מיום שלישי בבוקר עד סוף יום רביעי. ביום חמישי ההגשה סגורה.</p>
      <p class="muted">השבוע הקרוב: <b>${formatWeekRange(weekStart)}</b></p>
      ${existing && html`<a class="btn" href="#/schedule">לסידור העבודה</a>`}
    </div>`;
  }

  const locked = existing?.locked;

  return html`<div class="stack">
    ${header}
    ${locked && html`<div class="note warn center-text">
      <p class="big">🔒 המשמרות שלך הוגשו ונעולות</p>
      <p>כדי לשנות משמרות יש לפנות ל${MANAGER_NAME} לקבלת אישור עריכה.</p>
    </div>`}
    ${existing && !locked && html`<div class="note ok">✓ המנהלת פתחה לך את ההגשה לעריכה — אפשר לעדכן</div>`}

    ${!locked && html`<div class="note small">📌 לפחות ${MIN_SHIFTS} משמרות, ומהן <b>לפחות אחת בסופ״ש</b> (חמישי, שישי או מוצ״ש). רוצים לצאת מוקדם או להגיע מאוחר? לחצו על 💬 ליד המשמרת וכתבו הערה — ${MANAGER_NAME} תחליט על השיבוץ. ההגשה נסגרת בסוף יום רביעי.</div>`}
    ${openMornings.length > 0 && html`<div class="note ok">☀️ השבוע אפשר להגיש גם משמרות בוקר${holidayNames.length ? ` (${holidayNames.join(", ")})` : ""}</div>`}
    ${DAYS.map((d, i) => {
      const shifts = DAY_SHIFTS[d.key].filter((s) => isOpen(`${d.key}_${s}`));
      if (!shifts.length) return null;
      return html`<div class="card">
      <b>${d.label} <span class="muted small">${formatShort(addDaysKey(weekStart, i))}</span></b>
      <div class="stack-sm" style="margin-top:8px">
        ${shifts.map((s) => {
          const key = `${d.key}_${s}`;
          const on = !!avail[key];
          const note = slotNotes[key] || "";
          return html`<div>
            <div class="row gap">
              <button class=${"slot " + (on ? "on" : "")} disabled=${locked}
                onClick=${() => setAvail((a) => ({ ...a, [key]: !a[key] }))}>
                <span>${SHIFT_LABELS[s]} <small>(${SHIFT_HOURS[s]})</small></span>
                <b>${on ? "✓ זמין" : "✗ לא זמין"}</b>
              </button>
              ${!locked && html`<button class=${"icon-btn " + (note ? "on" : "")} title="הערה למשמרת"
                onClick=${() => setOpenNote(openNote === key ? null : key)}>${openNote === key ? "✕" : "💬"}</button>`}
            </div>
            ${openNote === key && !locked
              ? html`<input class="mt" value=${note} placeholder="למשל: צריך לצאת ב-21:00 / אגיע ב-17:30" autofocus
                  onInput=${(e) => setSlotNotes((n) => ({ ...n, [key]: e.target.value }))} />`
              : note && html`<p class="small note-line">💬 ${note}</p>`}
          </div>`;
        })}
      </div>
    </div>`;
    })}

    ${locked
      ? notes && html`<p class="note">💬 ${notes}</p>`
      : html`<label>הערות כלליות (לא חובה)<textarea rows="2" value=${notes} onInput=${(e) => setNotes(e.target.value)} placeholder="הערות כלליות לשבוע..."></textarea></label>
        <button class="btn primary wide big-btn" disabled=${busy} onClick=${submit}>
          ${busy ? "שולח…" : `${existing ? "עדכן משמרות" : "הגש משמרות"} (${count} נבחרו${hasWeekend ? "" : " · חסרה משמרת סופ״ש"})`}
        </button>`}
  </div>`;
}

// ================= everyone: published schedule =================
export function PublishedSchedule({ profile }) {
  const [week, setWeek] = useState(currentWeekSunday());
  const [names, setNames] = useState({});
  useEffect(() => {
    sb.from("profiles").select("email,full_name").then(({ data }) => data && setNames(Object.fromEntries(data.map((p) => [p.email, p.full_name || p.email]))));
  }, []);
  const { loading, error, data, reload } = useLoad(async () => {
    const row = await q(sb.from("published_schedules").select("*").eq("week_start", week).eq("is_published", true).maybeSingle());
    return row?.schedule || null;
  }, [week]);

  // schedule entries are emails (or free-text names for people without an account)
  const isMe = (n) => n === profile.email || n === profile.full_name || (!!profile.full_name && names[n] === profile.full_name);
  const label = (n) => names[n] || n;
  // one chip per person, even if they have two accounts with the same name
  const uniq = (list) => { const seen = new Set(); return list.filter((n) => { const l = label(n); if (seen.has(l)) return false; seen.add(l); return true; }); };
  // the schedule is split by place: Bowling (shifts, kitchen, closing) and Walter Park (the Gymboree)
  const SHIFT_ICON = { morning: "☀️", evening: "🌙", night: "🌙" };
  const BOWLING_ROWS = (dayKey) => [...DAY_SHIFTS[dayKey].map((s) => [s, SHIFT_LABELS[s]]), ["kitchen", "מטבח"], ["closing", "סגירה"]];
  const listOf = (dayKey, k) => uniq(data?.[`${dayKey}_${k}`] || []);
  const mine = [];
  if (data) DAYS.forEach((d, i) => {
    BOWLING_ROWS(d.key).forEach(([k, l]) => { if ((data[`${d.key}_${k}`] || []).some(isMe)) mine.push({ day: d.label, date: formatShort(addDaysKey(week, i)), place: "באולינג", what: l }); });
    if ((data[`${d.key}_walter`] || []).some(isMe)) mine.push({ day: d.label, date: formatShort(addDaysKey(week, i)), place: "וולטר פארק", what: "" });
  });
  const Row = ({ dayKey, k, l }) => {
    const list = listOf(dayKey, k);
    if (!list.length) return null;
    return html`<div class="sched-row"><span class="sched-label">${l}</span>
      <div class="chips">${list.map((n) => html`<span class=${"chip " + (isMe(n) ? "me" : "")}>${label(n)}</span>`)}</div></div>`;
  };

  return html`<div class="stack">
    <div class="row between wrap gap"><h2>סידור עבודה</h2><${WeekToggle} value=${week} onChange=${setWeek} /></div>
    ${loading ? html`<${Spinner} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />`
      : !data ? html`<div class="empty"><p class="huge">📅</p><p>הסידור לשבוע זה טרם פורסם</p><p class="small muted">כשהמנהלת תפרסם את הסידור הוא יופיע כאן</p></div>`
      : html`
        <div class="card my-shifts">
          <b>המשמרות שלי השבוע</b>
          ${mine.length === 0 ? html`<p class="small muted mt">אין לך משמרות בשבוע זה</p>`
            : mine.map((m) => html`<div class="my-shift"><b>${m.day}</b> <span class="muted">${m.date}</span>
                <span class=${"place-tag " + (m.place === "באולינג" ? "bowling" : "walter")}>${m.place}</span>${m.what && html` <span>${m.what}</span>`}</div>`)}
        </div>
        ${DAYS.map((d, i) => {
          const bowl = BOWLING_ROWS(d.key).filter(([k]) => listOf(d.key, k).length);
          const walter = listOf(d.key, "walter");
          if (!bowl.length && !walter.length) return null;
          return html`<div class="card sched-day">
            <div class="sched-day-head"><b>${d.label}</b> <span class="muted small">${formatShort(addDaysKey(week, i))}</span></div>
            ${bowl.length > 0 && html`<div class="sched-place bowling">
              <div class="sched-place-head"><img src="logo-bowling.png" alt="" />באולינג</div>
              ${DAY_SHIFTS[d.key].map((sh, si, arr) => {
                const people = listOf(d.key, sh);
                const closing = si === arr.length - 1 ? listOf(d.key, "closing") : [];
                if (!people.length && !closing.length) return null;
                return html`<div class=${"shift-block " + sh}>
                  <div class="shift-head"><span>${SHIFT_ICON[sh]} ${SHIFT_LABELS[sh]}</span><small>${SHIFT_HOURS[sh]}</small></div>
                  ${people.length > 0 && html`<div class="chips">${people.map((n) => html`<span class=${"chip " + (isMe(n) ? "me" : "")}>${label(n)}</span>`)}</div>`}
                  ${closing.length > 0 && html`<div class="sched-row"><span class="sched-label">🔒 סגירה</span>
                    <div class="chips">${closing.map((n) => html`<span class=${"chip " + (isMe(n) ? "me" : "")}>${label(n)}</span>`)}</div></div>`}
                </div>`;
              })}
              <${Row} dayKey=${d.key} k="kitchen" l="🍳 מטבח" />
            </div>`}
            ${walter.length > 0 && html`<div class="sched-place walter">
              <div class="sched-place-head"><img src="logo-walter.png" alt="" />וולטר פארק</div>
              <div class="sched-row"><span class="sched-label">עובדים</span>
                <div class="chips">${walter.map((n) => html`<span class=${"chip " + (isMe(n) ? "me" : "")}>${label(n)}</span>`)}</div></div>
            </div>`}
          </div>`;
        })}`}
  </div>`;
}

// ================= manager: submissions overview =================
export function ShiftManager({ profile }) {
  const [week, setWeek] = useState(nextWeekSunday());
  const [open, setOpen] = useState({});
  const [settings, setSettings] = useState({ open_slots: [], closed_slots: [] });
  const { loading, error, data: subs, reload, setData } = useLoad(async () => {
    const [rows, ws] = await Promise.all([
      q(sb.from("shift_submissions").select("*").eq("week_start", week).order("employee_name")),
      loadWeekSettings(week),
    ]);
    setSettings(ws);
    return rows;
  }, [week]);
  const isOpen = slotChecker(week, settings);

  if (!isManagerRole(profile.role)) return html`<${NoAccess} />`;

  const unlock = async (s) => {
    try {
      const rows = await q(sb.from("shift_submissions").update({ locked: false }).eq("id", s.id).select());
      if (!rows.length) throw new Error("אין הרשאה");
      setData((list) => list.map((x) => (x.id === s.id ? { ...x, locked: false } : x)));
      toast(`ההגשה של ${s.employee_name} נפתחה לעריכה`);
    } catch (e) {
      toast("ביטול הנעילה נכשל: " + e.message, "bad");
    }
  };

  return html`<div class="stack">
    <div class="row between wrap gap">
      <div><h2>בקשות משמרות</h2>${subs && html`<p class="muted small">${subs.length} עובדים הגישו</p>`}</div>
      <${WeekToggle} value=${week} onChange=${setWeek} />
    </div>
    ${!loading && !error && html`<${MorningsPanel} week=${week} settings=${settings} onChange=${setSettings} />`}
    ${loading ? html`<${Spinner} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />`
      : subs.length === 0 ? html`<div class="empty"><p>עדיין אף עובד לא הגיש משמרות לשבוע זה</p></div>`
      : html`
        ${DAYS.map((d) => html`<div class="card">
          <button class="row between wide plain" onClick=${() => setOpen((o) => ({ ...o, [d.key]: !o[d.key] }))}>
            <b>${d.label}</b>
            <span class="muted small">${DAY_SHIFTS[d.key].filter((s) => isOpen(`${d.key}_${s}`)).map((s) => `${SHIFT_LABELS[s]}: ${subs.filter((x) => x.availability?.[`${d.key}_${s}`]).length}`).join(" · ")} ${open[d.key] ? "▲" : "▼"}</span>
          </button>
          ${open[d.key] && DAY_SHIFTS[d.key].filter((s) => isOpen(`${d.key}_${s}`)).map((s) => {
            const key = `${d.key}_${s}`;
            const yes = subs.filter((x) => x.availability?.[key]);
            const no = subs.filter((x) => !x.availability?.[key]);
            return html`<div class="mt">
              <p class="small muted">${SHIFT_LABELS[s]} · ${yes.length} זמינים</p>
              <div class="chips">
                ${yes.map((x) => html`<span class="chip ok" title=${x.slot_notes?.[key] || ""}>${x.employee_name}${x.slot_notes?.[key] ? " 💬" : ""}</span>`)}
                ${no.map((x) => html`<span class="chip off">${x.employee_name}</span>`)}
              </div>
              ${yes.filter((x) => x.slot_notes?.[key]).map((x) => html`<p class="small note-line">💬 ${x.employee_name}: ${x.slot_notes[key]}</p>`)}
            </div>`;
          })}
        </div>`)}

        <h3>לפי עובד</h3>
        ${subs.map((s) => html`<div class="card">
          <div class="row between">
            <div><b>${s.employee_name}</b><p class="small muted" dir="ltr">${s.employee_email}</p></div>
            ${s.locked
              ? html`<button class="btn sm warn" onClick=${() => unlock(s)}>🔓 בטל נעילה</button>`
              : html`<span class="pill ok">✏️ פתוח לעריכה</span>`}
          </div>
          <div class="chips mt">${ALL_SLOTS.filter((x) => isOpen(x.key)).map((x) => html`<span class=${"chip " + (s.availability?.[x.key] ? "ok" : "off")}>${x.day.label} ${SHIFT_LABELS[x.shift]}</span>`)}</div>
          ${s.notes && html`<p class="small note-line">💬 ${s.notes}</p>`}
          <p class="small muted mt">עודכן: ${formatDateTime(s.updated_at)}</p>
        </div>`)}`}
  </div>`;
}

// manager: open weekday mornings for employee requests in a specific week
function MorningsPanel({ week, settings, onChange }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (key) => {
    const st = morningState(week, key, settings);
    const without = (arr) => arr.filter((k) => k !== key);
    // flip the current state; a manual choice that matches the automatic one is simply removed
    let open_slots = without(settings.open_slots), closed_slots = without(settings.closed_slots);
    const wantOpen = !st.open;
    if (wantOpen && !st.auto) open_slots = [...open_slots, key];
    if (!wantOpen && st.auto) closed_slots = [...closed_slots, key];
    const next = { open_slots, closed_slots };
    setBusy(true);
    try {
      await q(sb.from("week_settings").upsert({ week_start: week, ...next, updated_at: new Date().toISOString() }, { onConflict: "week_start" }));
      onChange(next);
      toast(wantOpen ? "משמרת הבוקר נפתחה להגשה" : "משמרת הבוקר נסגרה להגשה");
    } catch (e) {
      toast("השמירה נכשלה: " + e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="card">
    <b>☀️ משמרות בוקר (ראשון–חמישי)</b>
    <p class="small muted">נפתחות להגשה אוטומטית בחגים ובחופשות (לפי הלוח העברי ולוח החופשות של משרד החינוך, כולל חנוכה וחופש גדול). בשאר הימים הן סגורות. לחיצה על יום פותחת או סוגרת אותו ידנית לשבוע הזה. בכל מקרה אפשר לשבץ בוקר ידנית ב"עריכת סידור".</p>
    <div class="chips mt">${WEEKDAY_MORNINGS.map((key) => {
      const day = DAYS.find((d) => key.startsWith(d.key));
      const st = morningState(week, key, settings);
      return html`<button class=${"chip " + (st.open ? "sel" : "")} disabled=${busy} onClick=${() => toggle(key)}
        title=${st.auto || ""}>${st.open ? "✓ " : ""}${day.label}${st.auto ? ` · ${st.auto}` : ""}${st.manual ? " ✋" : ""}</button>`;
    })}</div>
    <p class="small muted mt">✓ = פתוח להגשה · ✋ = נקבע ידנית</p>
  </div>`;
}

// ================= manager: build & publish the schedule =================
export function ScheduleEditor({ profile }) {
  const [week, setWeek] = useState(nextWeekSunday());
  const [schedule, setSchedule] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(null);
  const [manual, setManual] = useState("");
  const inputRef = useRef(null);

  const { loading, error, data, reload, setData } = useLoad(async () => {
    const [subs, pub, people, settings] = await Promise.all([
      q(sb.from("shift_submissions").select("*").eq("week_start", week)),
      q(sb.from("published_schedules").select("*").eq("week_start", week).maybeSingle()),
      q(sb.from("profiles").select("full_name,email,role").neq("role", "pending").order("full_name")),
      loadWeekSettings(week),
    ]);
    return { subs, pub, people, settings };
  }, [week]);

  useEffect(() => {
    if (data) { setSchedule(data.pub?.schedule || {}); setDirty(false); }
  }, [data]);
  // warn before leaving with unsaved changes
  useEffect(() => {
    window.__sfDirty = dirty;
    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", onUnload);
    return () => { removeEventListener("beforeunload", onUnload); window.__sfDirty = false; };
  }, [dirty]);
  useEffect(() => { adding && setTimeout(() => inputRef.current?.focus(), 30); }, [adding]);

  if (!isManagerRole(profile.role)) return html`<${NoAccess} />`;

  const changeWeek = (w) => {
    if (w === week) return;
    if (dirty && !window.confirm("יש שינויים שלא נשמרו. לעבור שבוע בלי לשמור?")) return;
    setWeek(w);
  };
  const updateSlot = (key, fn) => { setSchedule((s) => ({ ...s, [key]: fn(s[key] || []) })); setDirty(true); };
  const add = (key, name) => updateSlot(key, (cur) => (cur.includes(name) ? cur : [...cur, name]));
  const remove = (key, name) => updateSlot(key, (cur) => cur.filter((n) => n !== name));

  // publish: true = publish, false = unpublish (back to draft), undefined = keep current state
  const persist = async (publish) => {
    setSaving(true);
    const isPub = publish === undefined ? !!data.pub?.is_published : publish;
    const row = {
      week_start: week, schedule, is_published: isPub,
      published_at: publish ? new Date().toISOString() : data.pub?.published_at || null,
      updated_at: new Date().toISOString(),
    };
    try {
      const saved = await q(sb.from("published_schedules").upsert(row, { onConflict: "week_start" }).select().single());
      setData((d) => ({ ...d, pub: saved }));
      setDirty(false);
      toast(publish === true ? "🎉 הסידור פורסם לכל העובדים!" : publish === false ? "הסידור הוסתר מהעובדים (טיוטה)" : "✅ הסידור נשמר");
    } catch (e) {
      toast("השמירה נכשלה: " + e.message, "bad");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const { subs, pub, people } = data;
  const isPub = !!pub?.is_published;
  const byEmail = Object.fromEntries(people.map((p) => [p.email, p.full_name || p.email]));
  const byName = Object.fromEntries(people.map((p) => [(p.full_name || "").trim(), p.email]));
  const label = (e) => byEmail[e] || e;
  const keyOf = (s) => s.employee_email; // schedule stores emails
  const clash = (dayKey, shift, who) =>
    DAY_SHIFTS[dayKey].filter((x) => x !== shift && (schedule[`${dayKey}_${x}`] || []).includes(who));
  const countFor = (who) => ALL_SLOTS.filter((s) => (schedule[s.key] || []).includes(who)).length;
  const addManual = (key) => {
    const typed = manual.trim();
    if (typed) add(key, byName[typed] || typed);
    setManual(""); setAdding(null);
  };

  return html`<div class="stack">
    <div class="row between wrap gap">
      <div>
        <h2>עריכת סידור עבודה</h2>
        <div class="row gap">${isPub && html`<span class="pill ok">✅ מפורסם</span>`}${dirty && html`<span class="pill warn">● לא נשמר</span>`}</div>
      </div>
      <${WeekToggle} value=${week} onChange=${changeWeek} />
    </div>
    <div class="row gap sticky-bar">
      <button class="btn grow" disabled=${saving} onClick=${() => persist(undefined)}>💾 ${isPub ? "שמור ועדכן" : "שמור טיוטה"}</button>
      ${!isPub && html`<button class="btn primary grow" disabled=${saving} onClick=${() => persist(true)}>📤 פרסם לכולם</button>`}
    </div>
    ${isPub && html`<div class="row between small"><span class="muted">העובדים רואים את הסידור. שמירה מעדכנת אותם מיד.</span>
      <button class="link small" disabled=${saving} onClick=${() => persist(false)}>הסתר מהעובדים</button></div>`}
    ${subs.length === 0 && html`<div class="note warn">⚠️ אין הגשות לשבוע זה — ניתן לשבץ עובדים ידנית.</div>`}

    ${DAYS.map((d, i) => html`<div class="card">
      <b>${d.label} <span class="muted small">${formatShort(addDaysKey(week, i))}</span></b>
      ${DAY_SHIFTS[d.key].map((s) => {
        const key = `${d.key}_${s}`;
        const selected = schedule[key] || [];
        const avail = subs.filter((x) => x.availability?.[key] && !selected.includes(keyOf(x)));
        return html`<div class="slot-block">
          <p class="small muted">${SHIFT_LABELS[s]} · ${selected.length} משובצים
            ${!slotChecker(week, data.settings)(key) && html`<span class="pill">סגור להגשה — שיבוץ ידני</span>`}
            ${WEEKDAY_MORNINGS.includes(key) && morningState(week, key, data.settings).auto && html`<span class="pill ok">${morningState(week, key, data.settings).auto}</span>`}</p>
          ${selected.length > 0 && html`<div class="chips">${selected.map((n) => html`<span class="chip sel">✓ ${label(n)}<button onClick=${() => remove(key, n)}>✕</button></span>`)}</div>`}
          ${avail.map((x) => {
            const c = clash(d.key, s, keyOf(x));
            return html`<button class="pick" onClick=${() => add(key, keyOf(x))}>
              <span>+</span>
              <div class="grow">
                <span>${label(keyOf(x))} <small class="muted">(${countFor(keyOf(x))} משמרות)</small></span>
                ${x.slot_notes?.[key] && html`<small class="note-line">💬 ${x.slot_notes[key]}</small>`}
                ${c.length > 0 && html`<small class="warn-text">⚠️ כבר משובץ ב${c.map((y) => SHIFT_LABELS[y]).join(", ")}</small>`}
              </div>
            </button>`;
          })}
          ${adding === key
            ? html`<div class="row gap mt">
                <input ref=${inputRef} list="people" value=${manual} placeholder="שם עובד..." onInput=${(e) => setManual(e.target.value)}
                  onKeyDown=${(e) => { if (e.key === "Enter") addManual(key); if (e.key === "Escape") setAdding(null); }} />
                <button class="btn sm primary" onClick=${() => addManual(key)}>הוסף</button>
                <button class="btn sm" onClick=${() => setAdding(null)}>ביטול</button>
              </div>`
            : html`<button class="link small" onClick=${() => { setAdding(key); setManual(""); }}>+ הוסף ידנית</button>`}
        </div>`;
      })}
    </div>`)}
    <datalist id="people">${people.map((p) => html`<option value=${p.full_name || p.email} />`)}</datalist>
  </div>`;
}
