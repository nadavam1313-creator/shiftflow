// ShiftFlow — app shell: auth, layout, routing
import {
  html, render, useState, useEffect, sb, q, toast, onToast, Spinner, isManagerRole, ROLE_LABELS,
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
    const on = () => { setRoute(get()); window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

const NAV = [
  { path: "/", label: "בית", icon: "🏠" },
  { path: "/request", label: "הגשת משמרות", icon: "📝" },
  { path: "/schedule", label: "סידור", icon: "🗓️" },
  { path: "/leaderboard", label: "תחרות", icon: "🏆" },
  { path: "/history", label: "היסטוריה", icon: "🕘" },
  { path: "/shifts", label: "בקשות", icon: "📋", manager: true },
  { path: "/editor", label: "עריכת סידור", icon: "✏️", manager: true },
  { path: "/dashboard", label: 'אחמ"ש', icon: "📊", manager: true },
  { path: "/admin", label: "ניהול", icon: "⚙️", manager: true },
];

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
    const fromEmail = /[?&](code|token_hash|type)=/.test(location.search) || /error_description|access_token/.test(location.hash);
    if (fromEmail) {
      try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ }
      return { ok: true, text: "המייל אושר ✓ עכשיו אפשר להתחבר עם האימייל והסיסמה." };
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
        if (error) throw new Error(error.message.includes("Invalid") ? "אימייל או סיסמה שגויים" : error.message);
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
        ${mode === "signup" && html`<label>שם מלא<input required value=${fullName} onInput=${(e) => setFullName(e.target.value)} placeholder="למשל: דנה כהן" /></label>`}
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
    <button class="btn primary wide" onClick=${onRefresh}>בדוק שוב</button>
    <button class="btn wide" style="margin-top:8px" onClick=${() => sb.auth.signOut()}>יציאה</button>
  </div></div>`;
}

// ---------- shell ----------
function Shell({ profile, route }) {
  const mgr = isManagerRole(profile.role);
  const items = NAV.filter((n) => !n.manager || mgr);
  const active = (path) => (path === "/" ? ["/", ""].includes(route) || route.startsWith("/category") || route.startsWith("/zone") : route.startsWith(path));
  return html`
    <header class="top">
      <a href="#/" class="brand">🎳 ShiftFlow</a>
      <div class="who">
        <span>${profile.full_name || profile.email}</span>
        <span class="pill">${ROLE_LABELS[profile.role]}</span>
        <button class="link" onClick=${() => sb.auth.signOut()}>יציאה</button>
      </div>
    </header>
    <main class="main">
      ${route === "/reset" ? html`<${ResetPassword} />` : html`<${Page} route=${route} profile=${profile} />`}
    </main>
    <nav class="bottom">
      ${items.map((n) => html`<a href=${"#" + n.path} class=${active(n.path) ? "on" : ""}><span>${n.icon}</span>${n.label}</a>`)}
    </nav>`;
}

function App() {
  const route = useRoute();
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

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
    try {
      setProfileError(null);
      const p = await q(sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle());
      setProfile(p);
      if (p && p.role !== "pending") trackLogin(p);
    } catch (e) {
      setProfileError(e);
    }
  };

  useEffect(() => { setProfile(null); loadProfile(); }, [session?.user?.id]);

  let body;
  if (session === undefined) body = html`<${Spinner} />`;
  else if (!session) body = html`<${AuthScreen} />`;
  else if (profileError) body = html`<div class="empty"><p>שגיאה בטעינת הפרופיל</p><button class="btn" onClick=${loadProfile}>נסה שוב</button></div>`;
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
