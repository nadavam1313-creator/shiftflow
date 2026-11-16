// ShiftFlow — leaderboard, manager dashboard, admin
import {
  html, useState, useMemo, sb, q, toast, Spinner, ErrorBox, useLoad, isManagerRole, NoAccess, Modal,
  CATEGORIES, PHASES, ROLE_LABELS, todayIL, currentMonthIL, monthRange, recentMonthsIL, formatMonth,
  formatTime, formatDateTime, safeUrl, parseKey, addDaysKey, DAYS, SHIFT_LABELS,
} from "./lib.js";

// which shift a mark belongs to, by the Israel time it was made
const slotOfMark = (dayKey, iso) => {
  if (dayKey === "friday") return "morning";
  if (dayKey === "saturday") return "night";
  const h = Number(new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hourCycle: "h23" }));
  return h < 16 ? "morning" : "evening";
};

// ================= leaderboard =================
// Everyone sees the full table (places and points); only admins see and edit the prize amounts.
export function Leaderboard({ profile }) {
  const mgr = isManagerRole(profile.role);
  const admin = profile.role === "admin";
  const [month, setMonth] = useState(currentMonthIL());
  const { loading, error, data, reload, setData } = useLoad(async () => {
    const [board, bonus] = await Promise.all([
      q(sb.rpc("leaderboard", { p_month: month })),
      admin ? q(sb.from("bonus_settings").select("*").eq("month", month).maybeSingle()) : Promise.resolve(null),
    ]);
    return { board, bonus };
  }, [month]);

  const b = data?.bonus?.data || {};
  const first = b.first_prize ?? 400;
  const second = b.second_prize ?? 200;
  const board = data?.board || [];
  const mine = board.find((e) => e.email === profile.email);
  // the closest person above me (to show how many points I need to pass them)
  const ahead = mine && [...board].reverse().find((e) => Number(e.points) > Number(mine.points));

  return html`<div class="stack">
    <div class="row between wrap gap">
      <div><h2>🏆 תחרות העובד המצטיין</h2><p class="muted">תתחרו, תצברו נקודות, תזכו בפרס 💪</p></div>
      <select value=${month} onChange=${(e) => setMonth(e.target.value)}>
        ${recentMonthsIL(6).map((m) => html`<option value=${m}>${formatMonth(m)}</option>`)}
      </select>
    </div>
    ${admin
      ? html`<div class="note gold"><b>🥇 מקום ראשון: ₪${first} • 🥈 מקום שני: ₪${second}</b><p class="small">רק אתה רואה את הסכומים</p></div>`
      : html`<div class="note gold"><b>🥇 בסוף החודש המקומות הראשונים זוכים בפרס — תתחרו! 🎉</b></div>`}
    ${loading ? html`<${Spinner} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />`
      : board.length === 0 ? html`<div class="empty"><p>אין נתונים לחודש זה עדיין</p></div>`
      : html`
        ${mine
          ? html`<div class="card center-text">
              <p class="muted">המקום שלך החודש</p>
              <p class="big">${["🥇", "🥈", "🥉"][Number(mine.rank) - 1] || ""} מקום ${mine.rank} · ${mine.points} נקודות</p>
              ${ahead && html`<p class="small" style="margin-top:4px">חסרות לך <b>${Number(ahead.points) - Number(mine.points) + 1}</b> נקודות כדי לעקוף את ${ahead.name} 🚀</p>`}
              ${Number(mine.rank) === 1 && html`<p class="small" style="margin-top:4px">את/ה בראש הטבלה! 👑</p>`}
            </div>`
          : !mgr && html`<div class="note">עוד אין לך נקודות החודש — כל משימה שמסמנים מוסיפה נקודות 💪</div>`}
        <div class="card" style="padding:0;overflow:hidden">
          <table class="board">
            <thead><tr><th>מקום</th><th>עובד</th><th>נקודות</th><th>פער מהמקום הראשון</th>${admin && html`<th>פרס</th>`}</tr></thead>
            <tbody>${board.map((e) => html`<tr class=${(e.email === profile.email ? "me " : "") + (Number(e.rank) === 1 ? "first" : "")}>
              <td class="rank-cell">${["🥇", "🥈", "🥉"][Number(e.rank) - 1] || e.rank}</td>
              <td><b>${e.name}</b>${e.email === profile.email && html` <span class="pill">את/ה</span>`}</td>
              <td><b>${e.points}</b></td>
              <td class="muted">${Number(e.rank) === 1 ? "—" : `-${Number(board[0].points) - Number(e.points)}`}</td>
              ${admin && html`<td>${Number(e.rank) <= 2 ? html`<span class="pill gold">₪${Number(e.rank) === 1 ? first : second}</span>` : ""}</td>`}
            </tr>`)}</tbody>
          </table>
        </div>`}
    ${admin && !loading && !error && html`<${BonusPanel} month=${month} bonus=${data.bonus} onSaved=${(r) => setData((d) => ({ ...d, bonus: r }))} />`}
  </div>`;
}

function BonusPanel({ month, bonus, onSaved }) {
  const d = bonus?.data || {};
  const [first, setFirst] = useState(d.first_prize ?? 400);
  const [second, setSecond] = useState(d.second_prize ?? 200);
  const [message, setMessage] = useState(d.message || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const row = await q(sb.from("bonus_settings").upsert({
        month, data: { ...d, first_prize: Number(first), second_prize: Number(second), message },
        updated_at: new Date().toISOString(),
      }, { onConflict: "month" }).select().single());
      onSaved(row);
      toast("הגדרות הבונוס נשמרו ✓");
    } catch (e) { toast("השמירה נכשלה: " + e.message, "bad"); } finally { setBusy(false); }
  };
  return html`<div class="card">
    <h3>⚙️ הגדרות פרסים — ${formatMonth(month)}</h3><p class="small muted">גלוי ונערך רק על ידך</p>
    <div class="row gap wrap">
      <label>פרס ראשון (₪)<input type="number" inputmode="numeric" value=${first} onInput=${(e) => setFirst(e.target.value)} /></label>
      <label>פרס שני (₪)<input type="number" inputmode="numeric" value=${second} onInput=${(e) => setSecond(e.target.value)} /></label>
    </div>
    <button class="btn primary" disabled=${busy} onClick=${save}>שמור</button>
  </div>`;
}

// ================= manager dashboard =================
export function ManagerDashboard({ profile }) {
  const [tab, setTab] = useState("tasks");
  const [date, setDate] = useState(todayIL());
  const mgr = isManagerRole(profile.role);
  // managers see everything; a shift lead sees only the categories they supervise
  const cats = mgr ? CATEGORIES : (profile.supervise_categories || []);
  if (!cats.length) return html`<${NoAccess} />`;
  return html`<div class="stack">
    <div><h2>לוח אחמ"ש${mgr ? "" : " — " + cats.join(", ")}</h2><p class="muted">מי ביצע כל משימה, מתי, ועם איזו תמונה</p></div>
    <div class="row gap wrap">
      ${mgr ? html`<div class="tabs grow">
        <button class=${tab === "tasks" ? "on" : ""} onClick=${() => setTab("tasks")}>ביצוע משימות</button>
        <button class=${tab === "activity" ? "on" : ""} onClick=${() => setTab("activity")}>יומן פעילות</button>
      </div>` : html`<div class="grow"></div>`}
      <input type="date" class="date-in" value=${date} onInput=${(e) => e.target.value && setDate(e.target.value)} />
    </div>
    ${tab === "tasks" || !mgr ? html`<${CompletionsBoard} date=${date} cats=${cats} />` : html`<${ActivityLog} date=${date} />`}
  </div>`;
}

function CompletionsBoard({ date, cats = CATEGORIES }) {
  const [openZone, setOpenZone] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const { loading, error, data, reload } = useLoad(async () => {
    const dayIdx = parseKey(date).getDay();
    const [allZones, allTasks, allComps, people, sched] = await Promise.all([
      q(sb.from("zones").select("*").order("category").order("sort_order")),
      q(sb.from("tasks").select("id,zone_id,title,shift_phases,requires_photo")),
      q(sb.from("task_completions").select("*").eq("shift_date", date)),
      q(sb.from("profiles").select("email,full_name")),
      q(sb.from("published_schedules").select("schedule").eq("week_start", addDaysKey(date, -dayIdx)).eq("is_published", true).maybeSingle()),
    ]);
    const zones = allZones.filter((z) => cats.includes(z.category));
    const zoneIds = new Set(zones.map((z) => z.id));
    const tasks = allTasks.filter((t) => zoneIds.has(t.zone_id));
    const comps = allComps.filter((c) => zoneIds.has(c.zone_id));
    const names = Object.fromEntries(people.map((p) => [p.email, p.full_name || p.email]));
    // who was on the published schedule that day, and in which shift
    const dayKey = DAYS[dayIdx].key;
    const onShift = {};
    for (const [k, list] of Object.entries(sched?.schedule || {})) {
      if (!k.startsWith(dayKey + "_")) continue;
      for (const who of list || []) (onShift[String(who).toLowerCase()] ||= []).push(k.slice(dayKey.length + 1));
    }
    return { zones, tasks, comps, names, dayKey, onShift, hasSchedule: !!sched };
  }, [date, cats.join()]);
  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const { zones, tasks, comps, names, dayKey, onShift, hasSchedule } = data;
  const who = (email) => names[email] || email?.split("@")[0];
  // a mark made by someone who wasn't on the published schedule at that time
  const offShift = (c) => {
    if (!hasSchedule || !c?.completed_by) return null;
    const shifts = onShift[c.completed_by.toLowerCase()] || onShift[(names[c.completed_by] || "").toLowerCase()];
    if (!shifts) return "לא משובץ היום";
    const slot = slotOfMark(dayKey, c.updated_at);
    return shifts.includes(slot) ? null : `סימן ב${SHIFT_LABELS[slot]} אבל משובץ ב${shifts.map((x) => SHIFT_LABELS[x]).join("/")}`;
  };
  const suspicious = comps.filter((c) => offShift(c));
  const doneIds = new Set(comps.filter((c) => c.status === "done").map((c) => c.task_id));
  const total = tasks.length;
  const done = tasks.filter((t) => doneIds.has(t.id)).length;
  return html`
    <div class="stats">
      <div><b>${done}/${total}</b><span>משימות בוצעו</span></div>
      <div><b>${total ? Math.round((done / total) * 100) : 0}%</b><span>ביצוע</span></div>
      <div><b>${new Set(comps.map((c) => c.completed_by)).size}</b><span>עובדים פעילים</span></div>
    </div>
    ${!hasSchedule
      ? html`<p class="note small">אין סידור מפורסם לשבוע הזה — אי אפשר לבדוק מי סימן משימות כשלא היה במשמרת.</p>`
      : suspicious.length > 0
      ? html`<div class="note warn"><b>🚩 ${suspicious.length} סימונים של עובדים שלא היו במשמרת לפי הסידור:</b>
          ${[...new Set(suspicious.map((c) => c.completed_by))].map((e) => html`<div class="small">• ${who(e)} — ${offShift(suspicious.find((c) => c.completed_by === e))} (${suspicious.filter((c) => c.completed_by === e).length} משימות)</div>`)}</div>`
      : comps.length > 0 && html`<p class="note ok small">✓ כל הסימונים היום נעשו ע״י עובדים שהיו משובצים במשמרת</p>`}
    ${cats.map((cat) => {
      const zs = zones.filter((z) => z.category === cat);
      if (!zs.length) return null;
      return html`<h3>${cat}</h3>${zs.map((z) => {
        const zt = tasks.filter((t) => t.zone_id === z.id);
        const zd = zt.filter((t) => doneIds.has(t.id));
        const isOpen = openZone === z.id;
        return html`<div class="card">
          <button class="row between wide plain" onClick=${() => setOpenZone(isOpen ? null : z.id)}>
            <b>${z.name}</b><span class=${"pill " + (zt.length && zd.length === zt.length ? "ok" : zd.length === 0 ? "bad" : "")}>${zd.length}/${zt.length} ${isOpen ? "▲" : "▼"}</span>
          </button>
          ${isOpen && html`<div class="mt">${PHASES.map((p) => {
            const pt = zt.filter((t) => t.shift_phases.includes(p));
            if (!pt.length) return null;
            return html`<p class="small muted mt">${p}</p>${pt.map((t) => {
              const c = comps.find((x) => x.task_id === t.id && x.shift_phase === p) || comps.find((x) => x.task_id === t.id && !PHASES.includes(x.shift_phase));
              const ph = safeUrl(c?.photo_url);
              const missingPhoto = c?.status === "done" && t.requires_photo && !ph && !c.alt_done;
              return html`<div class="board-row small">
                <span>${missingPhoto ? "⚠️" : c?.status === "done" ? "✅" : c?.status === "not_done" ? "❌" : "⬜"}</span>
                <div class="grow">
                  <span>${t.title}</span>
                  ${c && html`<div class="muted">${who(c.completed_by)} · ${formatTime(c.updated_at)}${missingPhoto ? " · חסרה תמונה" : ""}</div>`}
                  ${c && offShift(c) && html`<div class="warn-text">🚩 ${offShift(c)}</div>`}
                  ${c?.notes && html`<div class="note-line">📝 ${c.notes}</div>`}
                </div>
                ${ph && html`<img class="thumb" src=${ph} loading="lazy" onClick=${() => setLightbox(ph)} />`}
              </div>`;
            })}`;
          })}</div>`}
        </div>`;
      })}`;
    })}
    ${lightbox && html`<div class="lightbox" onClick=${() => setLightbox(null)}><img src=${lightbox} /></div>`}`;
}

function ActivityLog({ date }) {
  const { loading, error, data, reload } = useLoad(
    () => q(sb.from("activity_log").select("*").eq("shift_date", date).order("login_time", { ascending: false }).limit(500)), [date]);
  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  if (!data.length) return html`<div class="empty"><p>אין כניסות בתאריך זה</p></div>`;
  return html`${data.map((a) => html`<div class="list-item">
    <span>👤</span>
    <div class="grow"><b class="small">${a.employee_name}</b><p class="small muted" dir="ltr">${a.employee_email}</p></div>
    <div class="center-text small"><b>${formatTime(a.login_time)}</b><p class="muted">${a.shift_phase || ""}</p></div>
  </div>`)}`;
}

// ================= admin =================
export function Admin({ profile, tab = "users" }) {
  if (!isManagerRole(profile.role)) return html`<${NoAccess} />`;
  const tabs = [["users", "עובדים"], ["zones", "אזורים"], ["tasks", "משימות"]];
  return html`<div class="stack">
    <h2>ניהול מערכת</h2>
    <div class="tabs">${tabs.map(([k, l]) => html`<a class=${tab === k ? "on" : ""} href=${"#/admin/" + k}>${l}</a>`)}</div>
    ${tab === "zones" ? html`<${ZonesAdmin} />` : tab === "tasks" ? html`<${TasksAdmin} />` : html`<${UsersAdmin} profile=${profile} />`}
  </div>`;
}

function UsersAdmin({ profile }) {
  const [editing, setEditing] = useState(null);
  const [inviting, setInviting] = useState(false);
  const { loading, error, data, reload } = useLoad(async () => {
    const [people, invites, zones] = await Promise.all([
      q(sb.from("profiles").select("*").order("role").order("full_name")),
      q(sb.from("staff_invites").select("*").order("created_at", { ascending: false })),
      q(sb.from("zones").select("id,name,category").order("category").order("sort_order")),
    ]);
    return { people, invites, zones };
  }, []);
  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const registered = new Set(data.people.map((p) => p.email));
  const pending = data.people.filter((p) => p.role === "pending");
  const others = data.people.filter((p) => p.role !== "pending");
  const waitingInvites = data.invites.filter((i) => !registered.has(i.email));
  const appUrl = location.origin + location.pathname;

  const approve = async (p) => {
    try {
      await q(sb.from("profiles").update({ role: "employee" }).eq("id", p.id));
      toast(`${p.full_name} אושר/ה ✓`);
      reload();
    } catch (e) { toast(e.message, "bad"); }
  };

  return html`
    <div class="card">
      <b>איך מוסיפים עובד?</b>
      <p class="small">שלחו לעובד את הקישור <b dir="ltr">${appUrl}</b>. העובד לוחץ "עובד חדש? הרשמה" ונרשם עם האימייל שלו. אם הוספתם אותו מראש ב"הזמנה" — הוא נכנס מיד. אחרת הוא יופיע כאן ל"אישור".</p>
      <div class="row gap wrap">
        <button class="btn" onClick=${() => { navigator.clipboard?.writeText(appUrl).then(() => toast("הקישור הועתק ✓"), () => toast("העתיקו ידנית: " + appUrl)); }}>📋 העתק קישור</button>
        <button class="btn primary" onClick=${() => setInviting(true)}>+ הזמנה מראש</button>
      </div>
    </div>

    ${pending.length > 0 && html`<h3>⏳ ממתינים לאישור (${pending.length})</h3>
      ${pending.map((p) => html`<div class="list-item">
        <div class="grow"><b>${p.full_name}</b><p class="small muted" dir="ltr">${p.email}</p></div>
        <button class="btn sm ok" onClick=${() => approve(p)}>אשר</button>
        <button class="btn sm" onClick=${() => setEditing(p)}>עריכה</button>
      </div>`)}`}

    <h3>צוות (${others.length})</h3>
    ${others.map((p) => html`<div class="list-item">
      <div class="grow">
        <b>${p.full_name}</b> <span class=${"pill " + (isManagerRole(p.role) ? "ok" : "")}>${ROLE_LABELS[p.role]}</span>
        <p class="small muted" dir="ltr">${p.email}</p>
        <p class="small muted">${isManagerRole(p.role) ? "רואה את כל האזורים" : `${(p.allowed_zones || []).length} אזורים`}${(p.supervise_categories || []).length && !isManagerRole(p.role) ? ` · אחמ"ש ${p.supervise_categories.join(", ")}` : ""} · כניסה אחרונה: ${p.last_seen ? formatDateTime(p.last_seen) : "—"}</p>
      </div>
      <button class="btn sm" onClick=${() => setEditing(p)}>עריכה</button>
    </div>`)}

    ${waitingInvites.length > 0 && html`<h3>הוזמנו ועוד לא נרשמו (${waitingInvites.length})</h3>
      ${waitingInvites.map((i) => html`<div class="list-item">
        <div class="grow"><b>${i.full_name || i.email}</b> <span class="pill">${ROLE_LABELS[i.role]}</span><p class="small muted" dir="ltr">${i.email}</p></div>
        <button class="btn sm" onClick=${async () => {
          const { data: del, error: err } = await sb.from("staff_invites").delete().eq("email", i.email).select();
          if (err || !del?.length) toast("אין הרשאה לבטל את ההזמנה הזאת", "bad"); else toast("ההזמנה בוטלה");
          reload();
        }}>בטל</button>
      </div>`)}`}

    ${editing && html`<${PersonEditor} person=${editing} zones=${data.zones} me=${profile} onClose=${() => setEditing(null)} onSaved=${() => { setEditing(null); reload(); }} />`}
    ${inviting && html`<${InviteForm} zones=${data.zones} me=${profile} onClose=${() => setInviting(false)} onSaved=${() => { setInviting(false); reload(); }} />`}`;
}

function ZonePicker({ zones, value, onChange }) {
  return html`<div class="zone-pick">
    ${CATEGORIES.map((cat) => {
      const zs = zones.filter((z) => z.category === cat);
      if (!zs.length) return null;
      const all = zs.every((z) => value.includes(z.id));
      return html`<div>
        <label class="check"><input type="checkbox" checked=${all} onChange=${() => onChange(all ? value.filter((v) => !zs.some((z) => z.id === v)) : [...new Set([...value, ...zs.map((z) => z.id)])])} /> <b>${cat}</b></label>
        <div class="chips">${zs.map((z) => html`<label class=${"chip pick-chip " + (value.includes(z.id) ? "sel" : "")}>
          <input type="checkbox" hidden checked=${value.includes(z.id)} onChange=${() => onChange(value.includes(z.id) ? value.filter((v) => v !== z.id) : [...value, z.id])} />${z.name}</label>`)}</div>
      </div>`;
    })}
  </div>`;
}

function roleOptions(me) {
  return ["employee", "manager", ...(me.role === "admin" ? ["admin"] : [])];
}

function PersonEditor({ person, zones, me, onClose, onSaved }) {
  const [name, setName] = useState(person.full_name || "");
  const [role, setRole] = useState(person.role === "pending" ? "employee" : person.role);
  const [allowed, setAllowed] = useState(person.allowed_zones || []);
  const [sup, setSup] = useState(person.supervise_categories || []);
  const [busy, setBusy] = useState(false);
  const locked = person.role === "admin" && me.role !== "admin";
  const save = async () => {
    setBusy(true);
    try {
      const rows = await q(sb.from("profiles").update({ full_name: name.trim(), role, allowed_zones: allowed, supervise_categories: isManagerRole(role) ? [] : sup }).eq("id", person.id).select());
      if (!rows.length) throw new Error("אין הרשאה לערוך את המשתמש הזה");
      toast("נשמר ✓");
      onSaved();
    } catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${"עריכת " + (person.full_name || person.email)} onClose=${onClose}>
    ${locked ? html`<p>רק מנהל יכול לערוך מנהל אחר.</p>` : html`
      <label>שם מלא<input value=${name} onInput=${(e) => setName(e.target.value)} /></label>
      <label>תפקיד<select value=${role} onChange=${(e) => setRole(e.target.value)}>${roleOptions(me).map((r) => html`<option value=${r}>${ROLE_LABELS[r]}</option>`)}</select></label>
      ${!isManagerRole(role) && html`<p class="small muted">אזורים שהעובד רואה:</p><${ZonePicker} zones=${zones} value=${allowed} onChange=${setAllowed} />
        <p class="small muted mt">אחמ"ש — רואה מי ביצע כל משימה ואת התמונות ב:</p>
        <div class="chips">${CATEGORIES.map((c) => html`<label class=${"chip pick-chip " + (sup.includes(c) ? "sel" : "")}>
          <input type="checkbox" hidden checked=${sup.includes(c)} onChange=${() => setSup(sup.includes(c) ? sup.filter((x) => x !== c) : [...sup, c])} />${c}</label>`)}</div>`}
      <button class="btn primary wide mt" disabled=${busy} onClick=${save}>שמור</button>
      ${person.role === "pending" && html`<button class="btn wide mt bad" onClick=${async () => {
        if (!window.confirm(`לדחות את ${person.full_name || person.email}?`)) return;
        const { data: del, error: err } = await sb.from("profiles").delete().eq("id", person.id).select();
        if (err || !del?.length) return toast("הדחייה נכשלה", "bad");
        toast("הבקשה נדחתה"); onSaved();
      }}>דחה בקשה</button>`}`}
  <//>`;
}

function InviteForm({ zones, me, onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("employee");
  const [allowed, setAllowed] = useState([]);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await q(sb.from("staff_invites").upsert({ email: email.trim().toLowerCase(), full_name: name.trim(), role, allowed_zones: allowed }));
      toast("ההזמנה נשמרה — עכשיו שלחו לעובד את הקישור להרשמה");
      onSaved();
    } catch (err) { toast(err.message, "bad"); } finally { setBusy(false); }
  };
  return html`<${Modal} title="הזמנת עובד מראש" onClose=${onClose}>
    <form onSubmit=${save}>
      <label>אימייל של העובד<input type="email" required dir="ltr" value=${email} onInput=${(e) => setEmail(e.target.value)} /></label>
      <label>שם מלא<input required value=${name} onInput=${(e) => setName(e.target.value)} /></label>
      <label>תפקיד<select value=${role} onChange=${(e) => setRole(e.target.value)}>${roleOptions(me).map((r) => html`<option value=${r}>${ROLE_LABELS[r]}</option>`)}</select></label>
      ${!isManagerRole(role) && html`<p class="small muted">אזורים:</p><${ZonePicker} zones=${zones} value=${allowed} onChange=${setAllowed} />`}
      <button class="btn primary wide" disabled=${busy}>שמור הזמנה</button>
    </form>
  <//>`;
}

function ZonesAdmin() {
  const [edit, setEdit] = useState(null);
  const { loading, error, data, reload } = useLoad(() => q(sb.from("zones").select("*").order("category").order("sort_order")), []);
  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  return html`
    <button class="btn primary" onClick=${() => setEdit({ name: "", category: CATEGORIES[0], sort_order: 0 })}>+ אזור חדש</button>
    ${CATEGORIES.map((cat) => html`<h3>${cat}</h3>${data.filter((z) => z.category === cat).map((z) => html`<div class="list-item">
      <span class="muted small">${z.sort_order}</span><b class="grow">${z.name}</b>
      <button class="btn sm" onClick=${() => setEdit(z)}>עריכה</button>
    </div>`)}`)}
    ${edit && html`<${ZoneForm} zone=${edit} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); reload(); }} />`}`;
}

function ZoneForm({ zone, onClose, onSaved }) {
  const [f, setF] = useState(zone);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      const row = { name: f.name.trim(), category: f.category, sort_order: Number(f.sort_order) || 0 };
      if (zone.id) await q(sb.from("zones").update(row).eq("id", zone.id));
      else await q(sb.from("zones").insert(row));
      toast("נשמר ✓"); onSaved();
    } catch (e) { toast(e.message, "bad"); }
  };
  const del = async () => {
    if (!window.confirm(`למחוק את "${zone.name}" וכל המשימות שלו?`)) return;
    try { await q(sb.from("zones").delete().eq("id", zone.id)); toast("נמחק"); onSaved(); } catch (e) { toast(e.message, "bad"); }
  };
  return html`<${Modal} title=${zone.id ? "עריכת אזור" : "אזור חדש"} onClose=${onClose}>
    <label>שם<input value=${f.name} onInput=${set("name")} /></label>
    <label>רובריקה<select value=${f.category} onChange=${set("category")}>${CATEGORIES.map((c) => html`<option>${c}</option>`)}</select></label>
    <label>סדר תצוגה<input type="number" inputmode="numeric" value=${f.sort_order} onInput=${set("sort_order")} /></label>
    <button class="btn primary wide" onClick=${save}>שמור</button>
    ${zone.id && html`<button class="btn wide mt bad" onClick=${del}>מחק אזור</button>`}
  <//>`;
}

function TasksAdmin() {
  const [zoneId, setZoneId] = useState("");
  const [edit, setEdit] = useState(null);
  const { loading, error, data, reload } = useLoad(async () => {
    const [zones, tasks] = await Promise.all([
      q(sb.from("zones").select("*").order("category").order("sort_order")),
      q(sb.from("tasks").select("*").order("sort_order")),
    ]);
    return { zones, tasks };
  }, []);
  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const zid = zoneId || data.zones[0]?.id;
  const list = data.tasks.filter((t) => t.zone_id === zid);
  return html`
    <select value=${zid} onChange=${(e) => setZoneId(e.target.value)}>
      ${data.zones.map((z) => html`<option value=${z.id}>${z.category} — ${z.name}</option>`)}
    </select>
    <button class="btn primary" onClick=${() => setEdit({ zone_id: zid, title: "", description: "", points: 100, shift_phases: [PHASES[0]], requires_photo: false, sort_order: list.length })}>+ משימה חדשה</button>
    ${list.length === 0 && html`<div class="empty"><p>אין משימות באזור הזה</p></div>`}
    ${list.map((t) => html`<div class="list-item">
      <div class="grow"><b>${t.title}</b><p class="small muted">${t.shift_phases.join(" · ")} · ${t.points} נק׳ ${t.requires_photo ? "· 📷 חובה" : ""}</p></div>
      <button class="btn sm" onClick=${() => setEdit(t)}>עריכה</button>
    </div>`)}
    ${edit && html`<${TaskForm} task=${edit} zones=${data.zones} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); reload(); }} />`}`;
}

function TaskForm({ task, zones, onClose, onSaved }) {
  const [f, setF] = useState({ ...task, alt_done_label: task.extra?.alt_done_label || "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const togglePhase = (p) => setF({ ...f, shift_phases: f.shift_phases.includes(p) ? f.shift_phases.filter((x) => x !== p) : [...f.shift_phases, p] });
  const save = async () => {
    if (!f.title.trim()) return toast("חסר שם משימה", "bad");
    if (!f.shift_phases.length) return toast("בחרו לפחות שלב משמרת אחד", "bad");
    const row = {
      zone_id: f.zone_id, title: f.title.trim(), description: f.description || null,
      points: Number.isFinite(Number(f.points)) && f.points !== "" ? Math.max(0, Math.round(Number(f.points))) : 100,
      shift_phases: f.shift_phases, requires_photo: !!f.requires_photo, sort_order: Number(f.sort_order) || 0,
      extra: { ...(task.extra || {}), alt_done_label: (f.alt_done_label || "").trim() || undefined },
    };
    try {
      if (task.id) await q(sb.from("tasks").update(row).eq("id", task.id));
      else await q(sb.from("tasks").insert(row));
      toast("נשמר ✓"); onSaved();
    } catch (e) { toast(e.message, "bad"); }
  };
  const del = async () => {
    if (!window.confirm(`למחוק את "${task.title}"?`)) return;
    try { await q(sb.from("tasks").delete().eq("id", task.id)); toast("נמחק"); onSaved(); } catch (e) { toast(e.message, "bad"); }
  };
  return html`<${Modal} title=${task.id ? "עריכת משימה" : "משימה חדשה"} onClose=${onClose}>
    <label>אזור<select value=${f.zone_id} onChange=${set("zone_id")}>${zones.map((z) => html`<option value=${z.id}>${z.category} — ${z.name}</option>`)}</select></label>
    <label>שם המשימה<input value=${f.title} onInput=${set("title")} /></label>
    <label>תיאור<textarea rows="2" value=${f.description || ""} onInput=${set("description")}></textarea></label>
    <p class="small muted">שלבי משמרת:</p>
    <div class="chips">${PHASES.map((p) => html`<button class=${"chip " + (f.shift_phases.includes(p) ? "sel" : "")} onClick=${() => togglePhase(p)}>${p}</button>`)}</div>
    <div class="row gap mt">
      <label>נקודות<input type="number" inputmode="numeric" min="0" value=${f.points} onInput=${set("points")} /></label>
      <label>סדר<input type="number" inputmode="numeric" value=${f.sort_order} onInput=${set("sort_order")} /></label>
    </div>
    <label class="check"><input type="checkbox" checked=${f.requires_photo} onChange=${set("requires_photo")} /> חובה לצלם תמונה</label>
    <label>סימון חלופי — שווה חצי מהנקודות (לא חובה)<input value=${f.alt_done_label || ""} onInput=${set("alt_done_label")}
      placeholder="למשל: בדקתי — אין מלאי למלא" /></label>
    <p class="small muted">כפתור נוסף שמסמן את המשימה כבוצעה עם ההערה הזאת.</p>
    <button class="btn primary wide" onClick=${save}>שמור</button>
    ${task.id && html`<button class="btn wide mt bad" onClick=${del}>מחק משימה</button>`}
  <//>`;
}
