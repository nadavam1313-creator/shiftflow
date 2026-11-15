// ShiftFlow — shift requests, schedule, schedule editor
import {
  html, useState, useEffect, useRef, sb, q, toast, Spinner, ErrorBox, useLoad, isManagerRole, NoAccess, WeekToggle,
  DAYS, DAY_SHIFTS, SHIFT_LABELS, SHIFT_HOURS, ALL_SLOTS, currentWeekSunday, nextWeekSunday, formatWeekRange,
  dayOfWeekIL, addDaysKey, formatShort, formatDateTime,
} from "./lib.js";

const MIN_SHIFTS = 3;
const MANAGER_NAME = "מיכל"; // shown in the "locked" message

// ================= employee: submit availability =================
export function ShiftRequest({ profile }) {
  const weekStart = nextWeekSunday();
  const day = dayOfWeekIL();
  const open = day !== 5 && day !== 6; // Sunday–Thursday
  const [avail, setAvail] = useState({});
  const [slotNotes, setSlotNotes] = useState({});
  const [notes, setNotes] = useState("");
  const [openNote, setOpenNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const { loading, error, data: existing, reload, setData } = useLoad(async () => {
    const row = await q(sb.from("shift_submissions").select("*")
      .eq("employee_email", profile.email).eq("week_start", weekStart).maybeSingle());
    return row;
  }, [weekStart]);

  useEffect(() => {
    if (existing) {
      setAvail(existing.availability || {});
      setSlotNotes(existing.slot_notes || {});
      setNotes(existing.notes || "");
    }
  }, [existing]);

  const count = Object.values(avail).filter(Boolean).length;

  const submit = async () => {
    if (count < MIN_SHIFTS) return toast(`יש לבחור לפחות ${MIN_SHIFTS} משמרות (בחרת ${count})`, "bad");
    setBusy(true);
    const row = {
      employee_email: profile.email,
      employee_name: profile.full_name || profile.email,
      week_start: weekStart,
      availability: avail,
      slot_notes: slotNotes,
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

  if (!open && !(existing && !existing.locked)) {
    return html`<div class="empty">
      <p class="huge">🕐</p><p class="big">הגשת משמרות</p>
      <p class="muted">ניתן להגיש משמרות מיום ראשון עד סוף יום חמישי.</p>
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

    ${DAYS.map((d, i) => html`<div class="card">
      <b>${d.label} <span class="muted small">${formatShort(addDaysKey(weekStart, i))}</span></b>
      <div class="stack-sm" style="margin-top:8px">
        ${DAY_SHIFTS[d.key].map((s) => {
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
              ${!locked && html`<button class=${"icon-btn " + (note ? "on" : "")} title="בקשה מיוחדת"
                onClick=${() => setOpenNote(openNote === key ? null : key)}>${openNote === key ? "✕" : "💬"}</button>`}
            </div>
            ${openNote === key && !locked
              ? html`<input class="mt" value=${note} placeholder="למשל: יכול רק עד 15:00..." autofocus
                  onInput=${(e) => setSlotNotes((n) => ({ ...n, [key]: e.target.value }))} />`
              : note && html`<p class="small note-line">💬 ${note}</p>`}
          </div>`;
        })}
      </div>
    </div>`)}

    ${locked
      ? notes && html`<p class="note">💬 ${notes}</p>`
      : html`<label>הערות כלליות (לא חובה)<textarea rows="2" value=${notes} onInput=${(e) => setNotes(e.target.value)} placeholder="הערות כלליות לשבוע..."></textarea></label>
        <button class="btn primary wide big-btn" disabled=${busy} onClick=${submit}>
          ${busy ? "שולח…" : `${existing ? "עדכן משמרות" : "הגש משמרות"} (${count} נבחרו)`}
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
  const isMe = (n) => n === profile.email || n === profile.full_name;
  const label = (n) => names[n] || n;
  const myCount = data ? ALL_SLOTS.filter((s) => (data[s.key] || []).some(isMe)).length : 0;

  return html`<div class="stack">
    <div class="row between wrap gap"><h2>סידור עבודה</h2><${WeekToggle} value=${week} onChange=${setWeek} /></div>
    ${loading ? html`<${Spinner} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />`
      : !data ? html`<div class="empty"><p class="huge">📅</p><p>הסידור לשבוע זה טרם פורסם</p><p class="small muted">כשהמנהלת תפרסם את הסידור הוא יופיע כאן</p></div>`
      : html`
        <div class="note">${myCount > 0 ? html`בשבוע הזה יש לך ${myCount === 1 ? html`<b>משמרת אחת</b> — מסומנת` : html`<b>${myCount}</b> משמרות — מסומנות`} בצבע 👇` : "אין לך משמרות בשבוע זה"}</div>
        ${DAYS.map((d, i) => {
          const shifts = DAY_SHIFTS[d.key].filter((s) => (data[`${d.key}_${s}`] || []).length);
          if (!shifts.length) return null;
          return html`<div class="card">
            <b>${d.label} <span class="muted small">${formatShort(addDaysKey(week, i))}</span></b>
            ${shifts.map((s) => html`<div class="mt">
              <p class="small muted">${SHIFT_LABELS[s]}</p>
              <div class="chips">${data[`${d.key}_${s}`].map((n) => html`<span class=${"chip " + (isMe(n) ? "me" : "")}>${label(n)}</span>`)}</div>
            </div>`)}
          </div>`;
        })}`}
  </div>`;
}

// ================= manager: submissions overview =================
export function ShiftManager({ profile }) {
  const [week, setWeek] = useState(nextWeekSunday());
  const [open, setOpen] = useState({});
  const { loading, error, data: subs, reload, setData } = useLoad(
    () => q(sb.from("shift_submissions").select("*").eq("week_start", week).order("employee_name")), [week]);

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
    ${loading ? html`<${Spinner} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />`
      : subs.length === 0 ? html`<div class="empty"><p>עדיין אף עובד לא הגיש משמרות לשבוע זה</p></div>`
      : html`
        ${DAYS.map((d) => html`<div class="card">
          <button class="row between wide plain" onClick=${() => setOpen((o) => ({ ...o, [d.key]: !o[d.key] }))}>
            <b>${d.label}</b>
            <span class="muted small">${DAY_SHIFTS[d.key].map((s) => `${SHIFT_LABELS[s]}: ${subs.filter((x) => x.availability?.[`${d.key}_${s}`]).length}`).join(" · ")} ${open[d.key] ? "▲" : "▼"}</span>
          </button>
          ${open[d.key] && DAY_SHIFTS[d.key].map((s) => {
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
          <div class="chips mt">${ALL_SLOTS.map((x) => html`<span class=${"chip " + (s.availability?.[x.key] ? "ok" : "off")}>${x.day.label} ${SHIFT_LABELS[x.shift]}</span>`)}</div>
          ${s.notes && html`<p class="small note-line">💬 ${s.notes}</p>`}
          <p class="small muted mt">עודכן: ${formatDateTime(s.updated_at)}</p>
        </div>`)}`}
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
    const [subs, pub, people] = await Promise.all([
      q(sb.from("shift_submissions").select("*").eq("week_start", week)),
      q(sb.from("published_schedules").select("*").eq("week_start", week).maybeSingle()),
      q(sb.from("profiles").select("full_name,email,role").neq("role", "pending").order("full_name")),
    ]);
    return { subs, pub, people };
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
          <p class="small muted">${SHIFT_LABELS[s]} · ${selected.length} משובצים</p>
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
