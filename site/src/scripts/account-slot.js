import { safeNext } from "./safe-next.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
));

// Markup for a header account slot. `user` is what /me answered, null when it
// did not; `here` is the path a sign-in should return to.
export function accountSlotHTML(user, here) {
  if (!user) {
    return `<a class="btn btn-ghost" href="/login/?next=${encodeURIComponent(here || "/")}"><span class="l-en">Sign in</span><span class="l-zh">登录</span></a>`;
  }
  const warn = user.emailVerified ? "" : `<a class="acct-warn" href="/account/"><span class="l-en">unverified</span><span class="l-zh">未验证</span></a>`;
  return `<span class="acct">${warn}<a class="acct-name" href="/account/" title="@${esc(user.handle)}">@${esc(user.handle)}</a></span>`;
}

// Where the sign-in or register page sends a visitor who already has a session;
// null when there is none and the form is what they came for.
export function signedInDestination(user, rawNext, origin, fallback) {
  if (!user) return null;
  return safeNext(rawNext, origin) || new URL(fallback, origin).href;
}
