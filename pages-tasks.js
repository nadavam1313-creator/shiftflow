// ShiftFlow — zones, tasks, history
import {
  html, useState, useMemo, sb, q, toast, Spinner, ErrorBox, useLoad, isManagerRole, CATEGORIES,
  todayIL, formatTime, PHASES, Modal,
} from "./lib.js";

const MIN_MINUTES_BETWEEN_COMPLETIONS = 30;
const CATEGORY_STYLE = {
  "באולינג": { icon: "🎳", cls: "c-blue" },
  "ג'ימבורי": { icon: "🎪", cls: "c-green" },
  "פייב": { icon: "🎉", cls: "c-orange" },
};

function visibleZones(zones, profile) {
  if (isManagerRole(profile.role)) return zones;
  const allowed = profile.allowed_zones || [];
  return zones.filter((z) => allowed.includes(z.id));
}

export function Home({ profile }) {
  const { loading, error, data, reload } = useLoad(() => q(sb.from("zones").select("id,category")), []);
  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const zones = visibleZones(data, profile);
  const cats = CATEGORIES.filter((c) => zones.some((z) => z.category === c));
  return html`<div class="stack">
    <div><h2>בחר רובריקה</h2><p class="muted">בחר את האזור שברצונך לנהל</p></div>
    ${cats.length === 0
      ? html`<div class="empty"><p class="big">אין אזורים מורשים</p><p class="muted">פנה למנהל כדי לקבל גישה לאזורים</p></div>`
      : cats.map((c) => {
          const st = CATEGORY_STYLE[c] || { icon: "📍", cls: "c-blue" };
          return html`<a class=${"cat-card " + st.cls} href=${"#/category/" + encodeURIComponent(c)}>
            <span class="cat-icon">${st.icon}</span>
            <div><b>${c}</b><small>${zones.filter((z) => z.category === c).length} אזורים</small></div>
            <span class="chev">‹</span>
          </a>`;
        })}
  </div>`;
}

export function Category({ profile, name }) {
  const today = todayIL();
  const { loading, error, data, reload } = useLoad(async () => {
    const [zones, tasks, comps] = await Promise.all([
      q(sb.from("zones").select("*").eq("category", name).order("sort_order")),
      q(sb.from("tasks").select("id,zone_id")),
      q(sb.from("task_completions").select("zone_id,task_id,status").eq("shift_date", today)),
    ]);
    return { zones, tasks, comps };
  }, [name]);
  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const zones = visibleZones(data.zones, profile);
  return html`<div class="stack">
    <div class="row gap"><a class="back" href="#/">→</a><div><h2>${name}</h2><p class="muted">${zones.length} אזורים</p></div></div>
    ${zones.length === 0 && html`<div class="empty"><p>אין אזורים עדיין</p></div>`}
    ${zones.map((z) => {
      const total = data.tasks.filter((t) => t.zone_id === z.id).length;
      const done = new Set(data.comps.filter((c) => c.zone_id === z.id && c.status === "done").map((c) => c.task_id)).size;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return html`<a class="zone-card" href=${"#/zone/" + z.id}>
        <div class="row between"><b>${z.name}</b><span class=${"pill " + (total && done === total ? "ok" : "")}>${done}/${total}</span></div>
        <div class="bar"><div style=${`width:${pct}%`} class=${pct === 100 ? "full" : ""}></div></div>
      </a>`;
    })}
  </div>`;
}

export function ZoneTasks({ profile, zoneId }) {
  const today = todayIL();
  const [phase, setPhase] = useState(null);
  const { loading, error, data, reload, setData } = useLoad(async () => {
    const [zone, tasks, comps] = await Promise.all([
      q(sb.from("zones").select("*").eq("id", zoneId).maybeSingle()),
      q(sb.from("tasks").select("*").eq("zone_id", zoneId).order("sort_order")),
      q(sb.from("task_completions").select("*").eq("zone_id", zoneId).eq("shift_date", today)),
    ]);
    return { zone, tasks, comps };
  }, [zoneId]);

  if (loading) return html`<${Spinner} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  if (!data.zone) return html`<div class="empty"><p>אזור לא נמצא</p></div>`;

  const { zone, tasks, comps } = data;
  const compFor = (taskId) => comps.find((c) => c.task_id === taskId);
  const doneCount = tasks.filter((t) => compFor(t.id)?.status === "done").length;
  const activePhase = phase || PHASES.find((p) => tasks.some((t) => t.shift_phases.includes(p))) || PHASES[0];
  const phaseTasks = tasks.filter((t) => t.shift_phases.includes(activePhase));

  const update = async (task, updates) => {
    const existing = compFor(task.id);
    if (updates.status === "done" && existing?.status === "done") {
      const mins = (Date.now() - new Date(existing.updated_at).getTime()) / 60000;
      if (mins < MIN_MINUTES_BETWEEN_COMPLETIONS) {
        toast(`לא ניתן לסמן שוב — יש להמתין עוד ${Math.ceil(MIN_MINUTES_BETWEEN_COMPLETIONS - mins)} דקות`, "bad");
        return false;
      }
    }
    const row = { ...updates, completed_by: profile.email, updated_at: new Date().toISOString() };
    try {
      let saved;
      if (existing) {
        saved = await q(sb.from("task_completions").update(row).eq("id", existing.id).select().single());
      } else {
        saved = await q(sb.from("task_completions").insert({
          task_id: task.id, zone_id: zone.id, shift_date: today,
          shift_phase: task.shift_phases[0] || activePhase, ...row,
        }).select().single());
      }
      setData((d) => ({ ...d, comps: [...d.comps.filter((c) => c.id !== saved.id), saved] }));
      return true;
    } catch (e) {
      toast("השמירה נכשלה: " + e.message, "bad");
      return false;
    }
  };

  return html`<div class="stack">
    <div class="row gap">
      <a class="back" href=${"#/category/" + encodeURIComponent(zone.category)}>→</a>
      <div class="grow"><h2>${zone.name}</h2><p class="muted">${doneCount}/${tasks.length} משימות הושלמו היום</p></div>
    </div>
    ${tasks.length > 0 && html`<div class="bar"><div style=${`width:${(doneCount / tasks.length) * 100}%`} class=${doneCount === tasks.length ? "full" : ""}></div></div>`}
    <div class="tabs">${PHASES.map((p) => html`<button class=${p === activePhase ? "on" : ""} onClick=${() => setPhase(p)}>${p}</button>`)}</div>
    ${phaseTasks.length === 0
      ? html`<div class="empty"><p>אין משימות לשלב זה</p></div>`
      : phaseTasks.map((t) => html`<${TaskItem} key=${t.id} task=${t} completion=${compFor(t.id)} onUpdate=${(u) => update(t, u)} />`)}
  </div>`;
}

function TaskItem({ task, completion, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const status = completion?.status;

  const mark = async (newStatus, extra = {}) => {
    setBusy(true);
    await onUpdate({ status: newStatus, ...extra });
    setBusy(false);
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${todayIL()}/${task.id}-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("task-photos").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const url = sb.storage.from("task-photos").getPublicUrl(path).data.publicUrl;
      await onUpdate({ status: "done", photo_url: url });
      toast("התמונה נשמרה ✓");
    } catch (e) {
      toast("העלאת התמונה נכשלה: " + e.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return html`<div class=${"task " + (status === "done" ? "done" : status === "not_done" ? "notdone" : "")}>
    <div class="row between gap">
      <div class="grow">
        <b>${task.title}</b>
        ${task.description && html`<p class="muted small">${task.description}</p>`}
        ${completion && html`<p class="small muted">${status === "done" ? "✓ בוצע" : "✗ לא בוצע"} · ${completion.completed_by} · ${formatTime(completion.updated_at)}</p>`}
      </div>
      <span class="pill">${task.points} נק׳</span>
    </div>
    <div class="row gap wrap" style="margin-top:8px">
      <button class="btn sm ok" disabled=${busy} onClick=${() => (task.requires_photo && !completion?.photo_url ? setShowPhoto(true) : mark("done"))}>✓ בוצע</button>
      <button class="btn sm" disabled=${busy} onClick=${() => mark("not_done")}>✗ לא בוצע</button>
      <label class="btn sm">📷 תמונה<input type="file" accept="image/*" capture="environment" hidden onChange=${(e) => uploadPhoto(e.target.files[0])} /></label>
      ${completion?.photo_url && html`<a href=${completion.photo_url} target="_blank"><img class="thumb" src=${completion.photo_url} /></a>`}
    </div>
    ${showPhoto && html`<${Modal} title="נדרשת תמונה" onClose=${() => setShowPhoto(false)}>
      <p>במשימה הזאת צריך לצלם תמונה כדי לסמן שבוצעה.</p>
      <label class="btn primary wide">📷 צלם / בחר תמונה<input type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { setShowPhoto(false); uploadPhoto(e.target.files[0]); }} /></label>
    <//>`}
  </div>`;
}

export function History({ profile }) {
  const [date, setDate] = useState(todayIL());
  const [lightbox, setLightbox] = useState(null);
  const { loading, error, data, reload } = useLoad(async () => {
    const [comps, zones, tasks] = await Promise.all([
      q(sb.from("task_completions").select("*").eq("shift_date", date).order("updated_at", { ascending: false }).limit(300)),
      q(sb.from("zones").select("id,name")),
      q(sb.from("tasks").select("id,title")),
    ]);
    return { comps, zones, tasks };
  }, [date]);

  const names = useMemo(() => {
    if (!data) return { z: {}, t: {} };
    return {
      z: Object.fromEntries(data.zones.map((z) => [z.id, z.name])),
      t: Object.fromEntries(data.tasks.map((t) => [t.id, t.title])),
    };
  }, [data]);

  return html`<div class="stack">
    <div><h2>היסטוריית משימות</h2><p class="muted">צפה במשימות שבוצעו</p></div>
    <input type="date" class="date-in" value=${date} onInput=${(e) => e.target.value && setDate(e.target.value)} />
    ${loading ? html`<${Spinner} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />`
      : data.comps.length === 0 ? html`<div class="empty"><p>אין משימות לתאריך זה</p></div>`
      : data.comps.map((c) => html`<div class="list-item">
          <span>${c.status === "done" ? "✅" : "❌"}</span>
          <div class="grow">
            <b class="small">${names.t[c.task_id] || "משימה שנמחקה"}</b>
            <p class="small muted">${names.z[c.zone_id] || ""} • ${c.shift_phase || ""} • ${c.completed_by || ""} • ${formatTime(c.updated_at)}</p>
          </div>
          ${c.photo_url && html`<img class="thumb" src=${c.photo_url} onClick=${() => setLightbox(c.photo_url)} />`}
        </div>`)}
    ${lightbox && html`<div class="lightbox" onClick=${() => setLightbox(null)}><img src=${lightbox} /></div>`}
  </div>`;
}
