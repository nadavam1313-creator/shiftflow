// "Add to home screen": Android/Chrome gets the real install prompt; iPhone gets short Safari instructions.
import { html, useState, useEffect, Modal } from "./lib.js";

let deferred = null;
const listeners = new Set();
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
addEventListener("appinstalled", () => { deferred = null; listeners.forEach((f) => f()); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const inAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(navigator.userAgent);

export function InstallCard() {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("sf-install-hide") === "1"; } catch { return false; } });
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  if (standalone() || hidden) return null;

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null; force((n) => n + 1);
    } else setHelp(true);
  };
  const hide = () => { setHidden(true); try { localStorage.setItem("sf-install-hide", "1"); } catch {} };

  return html`<div class="install-card">
    <img src="icon-192.png" alt="" />
    <div class="grow"><b>התקנת האפליקציה</b><p class="small muted">אייקון במסך הבית — נפתח כמו אפליקציה רגילה</p></div>
    <button class="btn sm primary" onClick=${install}>📲 התקן</button>
    <button class="icon-btn" title="הסתר" onClick=${hide}>✕</button>
    ${help && html`<${Modal} title="הוספה למסך הבית" onClose=${() => setHelp(false)}>
      ${inAppBrowser() && html`<p class="note warn">פתחתם את הקישור מתוך וואטסאפ. קודם לחצו על ⋮ או על סמל השיתוף ובחרו "פתיחה בדפדפן" (${isIOS() ? "Safari" : "Chrome"}).</p>`}
      ${isIOS()
        ? html`<ol class="steps">
            <li>פותחים את הקישור בדפדפן <b>Safari</b></li>
            <li>לוחצים על כפתור השיתוף <b>⬆️</b> (ריבוע עם חץ, בתחתית המסך)</li>
            <li>גוללים ובוחרים <b>"הוספה למסך הבית"</b></li>
            <li>לוחצים <b>"הוסף"</b> — האייקון של ShiftFlow יופיע במסך הבית</li>
          </ol>`
        : html`<ol class="steps">
            <li>פותחים את הקישור בדפדפן <b>Chrome</b></li>
            <li>לוחצים על <b>⋮</b> (שלוש הנקודות למעלה)</li>
            <li>בוחרים <b>"התקנת אפליקציה"</b> או <b>"הוספה למסך הבית"</b></li>
            <li>מאשרים — האייקון של ShiftFlow יופיע במסך הבית</li>
          </ol>`}
      <button class="btn primary wide mt" onClick=${() => setHelp(false)}>הבנתי</button>
    <//>`}
  </div>`;
}
