/* Lingo Arcade — visual effects: canvas confetti and floating score popups. */

const COLORS = ["#7b6bff", "#c056f0", "#ff8a4c", "#ffd23f", "#34d399", "#38bdf8", "#ff5e7a"];

export function confetti(host, { count = 140, originX = 0.5, originY = 0.35, spread = 1 } = {}) {
  if (!host || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = "arc-confetti";
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  host.appendChild(canvas);
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread;
    const speed = 7 + Math.random() * 11;
    return {
      x: rect.width * originX, y: rect.height * originY,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 7, h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: Math.random() < 0.3 ? "circle" : "rect",
      life: 0,
    };
  });
  let frame;
  const step = () => {
    if (!canvas.isConnected) return;
    c.clearRect(0, 0, rect.width, rect.height);
    let alive = 0;
    for (const p of parts) {
      p.life++;
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > rect.height + 30) continue;
      alive++;
      c.save();
      c.globalAlpha = Math.max(0, Math.min(1, 1.6 - p.life / 110));
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.color;
      if (p.shape === "circle") { c.beginPath(); c.arc(0, 0, p.w / 2, 0, Math.PI * 2); c.fill(); }
      else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      c.restore();
    }
    if (alive && parts[0].life < 260) frame = requestAnimationFrame(step);
    else canvas.remove();
  };
  frame = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(frame); canvas.remove(); };
}

/** Float a "+10" style label from an element. */
export function floatText(fromEl, text, { color = "#34d399" } = {}) {
  if (!fromEl) return;
  const r = fromEl.getBoundingClientRect();
  const n = document.createElement("div");
  n.className = "arc-float";
  n.textContent = text;
  n.style.left = `${r.left + r.width / 2}px`;
  n.style.top = `${r.top}px`;
  n.style.color = color;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1200);
}
