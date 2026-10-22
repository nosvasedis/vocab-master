/* Vocab Master — UI primitives: DOM helpers, icons, toasts, dialogs, segmented controls. */
import { play, claimed } from "../arcade/audio.js";

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function icon(name, cls = "") {
  return `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function debounce(fn, ms = 200) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

export function uid(prefix = "w") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Parse an HTML string into a single element. */
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function timeAgo(dateish) {
  const d = new Date(dateish);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* ── Toasts ───────────────────────────────────────────────────────── */
const TOAST_ICON = { ok: "check", error: "x", warn: "alert", info: "info" };
const TOAST_SOUND = { ok: "success", error: "error", warn: "warn", info: "notify" };

export function toast(message, type = "info", { ms = 4200, actions = [] } = {}) {
  const region = $("toastRegion");
  if (!region) return () => {};
  const node = el(`<div class="toast ${type}" role="${type === "error" ? "alert" : "status"}">
    <span class="toast-icon">${icon(TOAST_ICON[type] || "info")}</span>
    <div class="toast-body"><div class="toast-msg"></div></div>
    <button type="button" class="toast-close" aria-label="Dismiss">${icon("x", "i-xs")}</button>
  </div>`);
  node.querySelector(".toast-msg").textContent = message;
  if (actions.length) {
    const row = el(`<div class="toast-actions"></div>`);
    actions.forEach(({ label, run }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => { dismiss(); run(); });
      row.appendChild(b);
    });
    node.querySelector(".toast-body").appendChild(row);
  }
  region.appendChild(node);
  // The moment that caused the toast (AI done, a delete…) may already have its own sound.
  if (!claimed(350)) play(TOAST_SOUND[type] || "notify");
  while (region.children.length > 4) region.firstElementChild.remove();
  let timer;
  let gone = false;
  function dismiss() {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    node.classList.add("out");
    setTimeout(() => node.remove(), 280);
  }
  const life = type === "error" ? Math.max(ms, 8000) : actions.length ? Math.max(ms, 7000) : ms;
  const arm = () => { timer = setTimeout(dismiss, life); };
  node.addEventListener("mouseenter", () => clearTimeout(timer));
  node.addEventListener("mouseleave", arm);
  node.querySelector(".toast-close").addEventListener("click", dismiss);
  arm();
  return dismiss;
}

/* ── Dialogs ──────────────────────────────────────────────────────── */
const openDialogs = [];

/**
 * Open a dialog. `body` is an HTML string; `onMount(root, close)` wires it up.
 * Returns { root, close }. Escape and backdrop clicks close the top-most dialog.
 */
export function openDialog({ title = "", subtitle = "", iconName = "", tone = "", size = "", sheet = false, body = "", foot = "", onMount, onClose, dismissible = true } = {}) {
  const backdrop = el(`<div class="dialog-backdrop${sheet ? " sheet-backdrop" : ""}">
    <div class="dialog ${size}" role="dialog" aria-modal="true">
      ${title ? `<div class="dialog-head">
        ${iconName ? `<div class="dialog-icon ${tone}">${icon(iconName)}</div>` : ""}
        <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
        ${dismissible ? `<button type="button" class="icon-btn" data-close aria-label="Close">${icon("x")}</button>` : ""}
      </div>` : ""}
      <div class="dialog-body">${body}</div>
      ${foot ? `<div class="dialog-foot">${foot}</div>` : ""}
    </div>
  </div>`);
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    const i = openDialogs.indexOf(entry);
    if (i >= 0) openDialogs.splice(i, 1);
    backdrop.classList.add("closing");
    if (!claimed(40)) play("close");
    setTimeout(() => backdrop.remove(), 200);
    try { prevFocus?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
    onClose?.(result);
  };
  const entry = { backdrop, close, dismissible };
  openDialogs.push(entry);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop && dismissible) close();
  });
  backdrop.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => close()));
  document.body.appendChild(backdrop);
  play("open");
  onMount?.(backdrop, close);
  requestAnimationFrame(() => {
    const auto = backdrop.querySelector("[autofocus]") || backdrop.querySelector("input, textarea, select, .dialog-foot .btn-primary");
    auto?.focus?.();
  });
  return { root: backdrop, close };
}

export function hasOpenDialog() {
  return openDialogs.length > 0;
}

export function closeTopDialog() {
  const top = openDialogs[openDialogs.length - 1];
  if (top && top.dismissible) { top.close(); return true; }
  return false;
}

export function confirmDialog({ title = "Are you sure?", body = "", okLabel = "Delete", cancelLabel = "Cancel", tone = "danger", iconName = "trash" } = {}) {
  return new Promise((resolve) => {
    let result = false;
    openDialog({
      title,
      iconName,
      tone,
      size: "sm",
      body: body ? `<p class="confirm-body">${esc(body)}</p>` : "",
      foot: `<span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-close>${esc(cancelLabel)}</button>
        <button type="button" class="btn ${tone === "danger" ? "btn-danger" : "btn-primary"}" data-ok>${esc(okLabel)}</button>`,
      onMount(root, close) {
        root.querySelector("[data-ok]").addEventListener("click", () => { result = true; play(tone === "danger" ? "remove" : "press"); close(); });
        root.querySelector("[data-ok]").focus();
      },
      onClose: () => resolve(result),
    });
  });
}

/* ── Segmented controls (sliding thumb) ───────────────────────────── */
export function segmented(root, { value, onChange } = {}) {
  const thumb = root.querySelector(".seg-thumb");
  const buttons = [...root.querySelectorAll("button[data-value]")];
  let current = value ?? buttons[0]?.dataset.value;
  const place = (animate = true) => {
    const active = buttons.find((b) => b.dataset.value === current);
    buttons.forEach((b) => {
      b.classList.toggle("active", b === active);
      b.setAttribute("aria-pressed", b === active ? "true" : "false");
    });
    if (!thumb || !active) return;
    if (!animate) thumb.style.transition = "none";
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    if (!animate) requestAnimationFrame(() => { thumb.style.transition = ""; });
  };
  buttons.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.value === current) return;
    current = b.dataset.value;
    place();
    onChange?.(current);
  }));
  // Width is 0 while hidden — re-measure when it becomes visible or resizes.
  const ro = new ResizeObserver(() => place(false));
  ro.observe(root);
  place(false);
  return {
    get value() { return current; },
    set(v, { silent = true } = {}) {
      if (v == null || v === current) { place(false); return; }
      current = v;
      place();
      if (!silent) onChange?.(current);
    },
    refresh: () => place(false),
  };
}

/* ── Button busy state ───────────────────────────────────────────── */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  btn.classList.add("is-loading");
  btn.disabled = true;
  try {
    return await fn();
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
}

/* Floating tips (data-ftip): like data-tip, but drawn on the page itself, so a scrolling list or a narrow
 * column never cuts them off; placed above the element (below when there's no room), kept inside the window. */
(function floatTips() {
  if (typeof document === "undefined") return;
  let tip = null;
  let owner = null;
  let timer = 0;
  const hide = () => { clearTimeout(timer); owner = null; tip?.classList.remove("show"); };
  const show = (el) => {
    tip ||= document.body.appendChild(Object.assign(document.createElement("div"), { className: "float-tip", role: "tooltip" }));
    tip.textContent = el.dataset.ftip;
    tip.style.left = "0px"; tip.style.top = "0px";
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const m = 8;
    const left = Math.max(m, Math.min(window.innerWidth - t.width - m, r.left + r.width / 2 - t.width / 2));
    const above = r.top - t.height - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${above >= m ? above : Math.min(window.innerHeight - t.height - m, r.bottom + 8)}px`;
    tip.classList.add("show");
  };
  const enter = (e) => {
    const el = e.target.closest?.("[data-ftip]");
    if (!el || el === owner) return;
    hide();
    owner = el;
    timer = setTimeout(() => { if (owner === el && el.isConnected) show(el); }, e.type === "focusin" ? 0 : 350);
  };
  const leave = (e) => { if (owner && !owner.contains(e.relatedTarget)) hide(); };
  document.addEventListener("mouseover", enter);
  document.addEventListener("focusin", enter);
  document.addEventListener("mouseout", leave);
  document.addEventListener("focusout", leave);
  document.addEventListener("click", hide, true);
  document.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
})();
