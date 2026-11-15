// ShiftFlow — app shell: auth, layout, routing
import {
  html, render, useState, useEffect, sb, q, toast, onToast, Spinner, isManagerRole, ROLE_LABELS, isPaused, LAUNCH_LABEL,
  todayIL, shiftPhaseNow,
} from "./lib.js";
import { Home, Category, ZoneTasks, History } from "./pages-tasks.js";
import { ShiftRequest, PublishedSchedule, ShiftManager, ScheduleEditor } from "./pages-shifts.js";
import { Leaderboard, ManagerDashboard, Admin } from "./pages-admin.js";

// ---------- routing ----------
function useRoute() {
  const get = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const [route, setRoute] = useState(get());
  useEffect(() => {
    let last = location.hash;
    const on = () => {
      // unsaved schedule edits: ask before leaving the page
      if (window.__sfDirty && !window.confirm("יש שינויים שלא נשמרו. לצאת בלי לשמור?")) {
        history.replaceState(null, "", last);
        return;
      }
      window.__sfDirty = false;
      last = location.hash;
      setRoute(get()); window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

const NAV = [
  { path: "/", label: "בית", icon: "🏠" },
  { path: "/request", label: "הגשה", icon: "📝" },
  { path: "/schedule", label: "סידור", icon: "🗓️" },
  { path: "/leaderboard", label: "תחרות", icon: "🏆" },
  { path: "/history", label: "היסטוריה", icon: "🕘", employeeOnly: true },
  { path: "/manage", label: "ניהול", icon: "⚙️", manager: true, also: ["/shifts", "/editor", "/dashboard", "/admin", "/history"] },
];

const HUB = [
  { path: "/shifts", label: "בקשות משמרות", icon: "📋" },
  { path: "/editor", label: "עריכת סידור", icon: "✏️" },
  { path: "/dashboard", label: 'לוח אחמ"ש', icon: "📊" },
  { path: "/history", label: "היסטוריית משימות", icon: "🕘" },
  { path: "/admin/users", label: "עובדים והרשאות", icon: "👥" },
  { path: "/admin/zones", label: "אזורים", icon: "📍" },
  { path: "/admin/tasks", label: "משימות", icon: "✅" },
];

function ManageHub({ profile }) {
  if (!isManagerRole(profile.role)) return html`<div class="empty"><p>אין הרשאה</p></div>`;
  return html`<div class="stack"><h2>ניהול</h2>
    <div class="hub">${HUB.map((h) => html`<a href=${"#" + h.path}><span>${h.icon}</span>${h.label}</a>`)}</div></div>`;
}

function Page({ route, profile }) {
  const parts = route.split("/").filter(Boolean);
  const p = { profile };
  switch (parts[0]) {
    case undefined: return html`<${Home} ...${p} />`;
    case "category": return html`<${Category} ...${p} name=${decodeURIComponent(parts[1] || "")} />`;
    case "zone": return html`<${ZoneTasks} ...${p} zoneId=${parts[1]} />`;
    case "history": return html`<${History} ...${p} />`;
    case "request": return html`<${ShiftRequest} ...${p} />`;
    case "schedule": return html`<${PublishedSchedule} ...${p} />`;
    case "shifts": return html`<${ShiftManager} ...${p} />`;
    case "editor": return html`<${ScheduleEditor} ...${p} />`;
    case "leaderboard": return html`<${Leaderboard} ...${p} />`;
    case "dashboard": return html`<${ManagerDashboard} ...${p} />`;
    case "admin": return html`<${Admin} ...${p} tab=${parts[1]} />`;
    case "manage": return html`<${ManageHub} ...${p} />`;
    default: return html`<div class="empty"><p>הדף לא נמצא</p><a class="btn" href="#/">לדף הבית</a></div>`;
  }
}

// ---------- toasts ----------
function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => onToast((t) => {
    setItems((x) => [...x, t]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3200);
  }), []);
  return html`<div class="toasts">${items.map((t) => html`<div class=${"toast " + t.kind} key=${t.id}>${t.text}</div>`)}</div>`;
}

// ---------- auth screens ----------
function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => {
    // came back from the confirmation email (possibly opened on another device)
    const failed = /error_description|error=/.test(location.search + location.hash);
    const fromEmail = failed || /[?&](code|token_hash|type)=/.test(location.search);
    if (fromEmail) {
      try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ }
      return failed
        ? { ok: false, text: "הקישור מהמייל כבר לא בתוקף. נסו להתחבר, ואם לא הצלחתם — בקשו קישור חדש." }
        : { ok: true, text: "אם לחצתם על קישור האישור — המייל אושר ✓ עכשיו אפשר להתחבר." };
    }
    return null;
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          const m = error.message || "";
          throw new Error(
            /not confirmed/i.test(m) ? "עוד לא אישרת את המייל. חפש/י מייל מ-Supabase (גם בספאם) ולחץ/י על הקישור."
            : /invalid/i.test(m) ? "אימייל או סיסמה שגויים. פעם ראשונה כאן? צריך קודם להירשם — לחצו \"עובד חדש? הרשמה\" למטה. (הסיסמה מ-Base44 לא עוברת)"
            : m
          );
        }
      } else if (mode === "signup") {
        if (password.length < 6) throw new Error("הסיסמה צריכה להיות לפחות 6 תווים");
        const { data, error } = await sb.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw new Error(error.message.includes("registered") ? "האימייל הזה כבר רשום — נסה להתחבר" : error.message);
        if (!data.session) setMsg({ ok: true, text: "נרשמת! בדוק את המייל כדי לאשר את החשבון, ואז התחבר." });
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: location.origin + location.pathname,
        });
        if (error) throw error;
        setMsg({ ok: true, text: "שלחנו לך מייל עם קישור לבחירת סיסמה חדשה." });
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return html`<div class="auth">
    <div class="auth-card">
      <div class="logo">🎳</div>
      <h1>ShiftFlow</h1>
      <p class="muted">באולינג פארק — ניהול משמרות</p>
      <form onSubmit=${submit}>
        ${mode === "signup" && html`<label>שם מלא<input required autocomplete="name" value=${fullName} onInput=${(e) => setFullName(e.target.value)} placeholder="למשל: דנה כהן" /></label>`}
        <label>אימייל<input type="email" required dir="ltr" value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="email" /></label>
        ${mode !== "forgot" && html`<label>סיסמה<input type="password" required dir="ltr" value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete=${mode === "login" ? "current-password" : "new-password"} /></label>`}
        ${msg && html`<div class=${"note " + (msg.ok ? "ok" : "bad")}>${msg.text}</div>`}
        <button class="btn primary wide" disabled=${busy}>
          ${busy ? "רגע…" : mode === "login" ? "כניסה" : mode === "signup" ? "הרשמה" : "שלח קישור"}
        </button>
      </form>
      <div class="auth-links">
        ${mode !== "login" && html`<a onClick=${() => { setMode("login"); setMsg(null); }}>יש לי חשבון — כניסה</a>`}
        ${mode !== "signup" && html`<a onClick=${() => { setMode("signup"); setMsg(null); }}>עובד חדש? הרשמה</a>`}
        ${mode !== "forgot" && html`<a onClick=${() => { setMode("forgot"); setMsg(null); }}>שכחתי סיסמה</a>`}
      </div>
    </div>
  </div>`;
}

function ResetPassword() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return toast("לפחות 6 תווים", "bad");
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(error.message, "bad");
    toast("הסיסמה עודכנה ✓");
    location.hash = "#/";
  };
  return html`<div class="card narrow"><h2>בחירת סיסמה חדשה</h2>
    <form onSubmit=${save}><label>סיסמה חדשה<input type="password" dir="ltr" value=${pw} onInput=${(e) => setPw(e.target.value)} /></label>
    <button class="btn primary wide" disabled=${busy}>שמור</button></form></div>`;
}

function Pending({ profile, onRefresh }) {
  return html`<div class="auth"><div class="auth-card">
    <div class="logo">⏳</div>
    <h2>החשבון ממתין לאישור</h2>
    <p class="muted">שלום ${profile.full_name || profile.email}! המנהל צריך לאשר אותך לפני שתוכל להשתמש באפליקציה.</p>
    <p class="small muted">השימוש באפליקציה מתחיל ב${LAUNCH_LABEL}.</p>
    <button class="btn primary wide" onClick=${onRefresh}>בדוק שוב</button>
    <button class="btn wide" style="margin-top:8px" onClick=${() => sb.auth.signOut()}>יציאה</button>
  </div></div>`;
}

// ---------- shell ----------
function Shell({ profile, route }) {
  const mgr = isManagerRole(profile.role);
  // phones: 5 buttons ("ניהול" opens a hub); wide screens: every page has its own button
  const [wide, setWide] = useState(() => matchMedia("(min-width: 900px)").matches);
  useEffect(() => {
    const mq = matchMedia("(min-width: 900px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const items = wide && mgr
    ? [...NAV.filter((n) => !n.manager && !n.employeeOnly), { path: "/history", label: "היסטוריה", icon: "🕘" },
       ...HUB.filter((h) => h.path !== "/history").map((h) => ({ ...h, path: h.path }))]
    : NAV.filter((n) => (n.manager ? mgr : n.employeeOnly ? !mgr : true));
  // shift lead of a category (e.g. Gymboree): gets the task board for that category
  if (!mgr && (profile.supervise_categories || []).length) items.splice(4, 0, { path: "/dashboard", label: 'אחמ"ש', icon: "📊" });
  const active = (n) => n.path === "/"
    ? ["/", ""].includes(route) || route.startsWith("/category") || route.startsWith("/zone")
    : route.startsWith(n.path) || (n.also || []).some((a) => route.startsWith(a));
  const logout = () => { if (window.confirm("לצאת מהחשבון?")) sb.auth.signOut(); };
  return html`
    <header class="top">
      <a href="#/" class="brand">🎳 ShiftFlow</a>
      <div class="who">
        <span>${profile.full_name || profile.email}</span>
        <span class="pill">${ROLE_LABELS[profile.role]}</span>
        <button class="link" onClick=${logout}>יציאה</button>
      </div>
    </header>
    <main class="main">
      ${isPaused(profile) && html`<div class="note gold launch">🚀 ShiftFlow מתחיל לפעול ב<b>${LAUNCH_LABEL}</b>. היום רק נרשמים ומתחברים. מחר נפתח סימון המשימות, והגשת משמרות פתוחה כל שבוע משלישי עד חמישי.</div>`}
      ${route === "/reset" ? html`<${ResetPassword} />` : html`<${Page} route=${route} profile=${profile} />`}
    </main>
    <nav class="bottom">
      ${items.map((n) => html`<a href=${"#" + n.path} class=${active(n) ? "on" : ""}><span>${n.icon}</span>${n.label}</a>`)}
    </nav>`;
}

function App() {
  const route = useRoute();
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") location.hash = "#/reset";
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = async () => {
    if (!session) return;
    setProfileLoading(true);
    try {
      setProfileError(null);
      const p = await q(sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle());
      setProfile(p);
      if (p && p.role !== "pending") trackLogin(p);
    } catch (e) {
      setProfileError(e);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => { setProfile(null); setProfileLoading(true); loadProfile(); }, [session?.user?.id]);

  let body;
  if (session === undefined) body = html`<${Spinner} />`;
  else if (!session) body = html`<${AuthScreen} />`;
  else if (profileError) body = html`<div class="empty"><p>שגיאה בטעינת הפרופיל</p><button class="btn" onClick=${loadProfile}>נסה שוב</button></div>`;
  else if (profile === null && !profileLoading) body = html`<div class="auth"><div class="auth-card">
      <div class="logo">🚫</div><h2>החשבון לא פעיל</h2>
      <p class="muted">החשבון הזה לא מחובר לצוות. פנו למנהל.</p>
      <button class="btn wide" style="margin-top:12px" onClick=${() => sb.auth.signOut()}>יציאה</button>
    </div></div>`;
  else if (!profile) body = html`<${Spinner} />`;
  else if (profile.role === "pending") body = html`<${Pending} profile=${profile} onRefresh=${loadProfile} />`;
  else body = html`<${Shell} profile=${profile} route=${route} />`;

  return html`${body}<${Toasts} />`;
}

// log one login per browser session
async function trackLogin(p) {
  const key = "sf-logged-" + p.id;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
  const now = new Date().toISOString();
  sb.from("activity_log").insert({
    employee_email: p.email, employee_name: p.full_name || p.email,
    login_time: now, shift_date: todayIL(), shift_phase: shiftPhaseNow(),
  }).then(() => {});
  sb.from("profiles").update({ last_seen: now, login_count: (p.login_count || 0) + 1 }).eq("id", p.id).then(() => {});
}

render(html`<${App} />`, document.getElementById("app"));
