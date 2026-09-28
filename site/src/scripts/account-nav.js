import { currentAccount } from "./auth.js";
import { accountSlotHTML } from "./account-slot.js";

// The page's one answer to "who is signed in", taken from /me. Every header slot
// and every page script reads this, so no two parts of a page can disagree.
let pending = null;
export function accountSession() {
  if (!pending) pending = currentAccount();
  return pending;
}

function render(user) {
  const here = location.pathname + location.search;
  document.querySelectorAll("[data-account-slot]").forEach((slot) => {
    slot.innerHTML = accountSlotHTML(user, here);
    slot.removeAttribute("aria-busy");
  });
}

accountSession().then(render);

// A page restored from the back/forward cache kept the answer it had when it
// was left; the session may have changed on another page since.
addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  pending = null;
  accountSession().then(render);
});
