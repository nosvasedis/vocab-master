/* Lingo the owl — the drawing. Hand-built SVG in the soft flat-vector style of the picture set
   (rounded shapes, gentle gradients, thin indigo outline). No GSAP here, so any screen can show him.
   Every moving part is its own group; mascot.js animates them with transforms only:
     .lg-root (hops) > .lg-breath > feet, body, wings (.lg-wing-l/r > .lg-wing-*-in), .lg-head-idle > .lg-head
     .lg-head > tufts, face, eyes (.lg-look > .lg-iris, lids), brows, cheeks, beak/mouth, cap (.lg-tassel)
   Ids get a per-drawing suffix so several Lingos can share a page. */

let seq = 0;

const C = {
  ink: "#2e1c6b",
  head0: "#a48bff", head1: "#7457f5", head2: "#5236d6",
  wing0: "#6a4cf0", wing1: "#4329c4",
  disc: "#f1eaff", disc2: "#ddd0ff",
  belly0: "#fff7e6", belly1: "#ffe2b3", scallop: "#e9bd84",
  lid: "#8a70ff", lash: "#3a2490",
  iris0: "#ffd66b", iris1: "#f39a1e", pupil: "#22143f",
  beak0: "#ffc24a", beak1: "#f08a12", beakInk: "#a14f08",
  mouth: "#5c1838", tongue: "#ff7d9c",
  cheek: "#ff8fb8", cap: "#1f1a4d", cap2: "#3a3380", gold: "#ffd23f", gold2: "#e8a911",
};

/** One eye: white, iris that can look around, a pose lid, a blink lid and a lower (smile) lid. */
function eye(cx, cy, u, side) {
  const r = 30;
  const clip = `lgEye${side}${u}`;
  const top = cy - r - 2;
  return `
  <g class="lg-eye lg-eye-${side}">
    <clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <g class="lg-eye-open">
    <circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="${C.disc2}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${C.ink}" stroke-width="2.5"/>
    <g clip-path="url(#${clip})">
      <g class="lg-look"><g class="lg-iris" data-cx="${cx}" data-cy="${cy}">
        <circle cx="${cx}" cy="${cy + 2}" r="18" fill="url(#lgIris${u})"/>
        <circle cx="${cx}" cy="${cy + 2}" r="11.5" fill="${C.pupil}"/>
        <circle cx="${cx - 6}" cy="${cy - 5}" r="5.5" fill="#fff"/>
        <circle cx="${cx + 5}" cy="${cy + 7}" r="2.4" fill="#fff" opacity=".9"/>
      </g></g>
      <g class="lg-lid-low" data-ox="${cx}" data-oy="${cy + r + 2}">
        <path d="M${cx - 34} ${cy + r + 4} V${cy + 2} Q${cx} ${cy - 34} ${cx + 34} ${cy + 2} V${cy + r + 4}Z" fill="${C.disc2}"/>
      </g>
      <g class="lg-lid" data-ox="${cx}" data-oy="${top}">
        <path d="M${cx - 34} ${top} H${cx + 34} V${cy + r - 2} Q${cx} ${cy + r + 10} ${cx - 34} ${cy + r - 2}Z" fill="${C.lid}"/>
        <path d="M${cx - 31} ${cy + r - 1} Q${cx} ${cy + r + 8} ${cx + 31} ${cy + r - 1}" stroke="${C.lash}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <g class="lg-blink" data-ox="${cx}" data-oy="${top}">
        <path d="M${cx - 34} ${top} H${cx + 34} V${cy + r - 2} Q${cx} ${cy + r + 10} ${cx - 34} ${cy + r - 2}Z" fill="${C.lid}"/>
        <path d="M${cx - 31} ${cy + r - 1} Q${cx} ${cy + r + 8} ${cx + 31} ${cy + r - 1}" stroke="${C.lash}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </g>
    </g>
    <path class="lg-eye-happy" d="M${cx - 21} ${cy + 8} Q${cx} ${cy - 22} ${cx + 21} ${cy + 8}" stroke="${C.ink}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0"/>
  </g>`;
}

/** Left wing, drawn hanging from the shoulder; the right one is its mirror image. */
const WING = `
  <path d="M66 156 C40 164 27 194 31 226 C33 242 41 252 50 256 C52 248 56 245 61 247 C61 240 64 237 69 237
           C72 222 76 200 76 180 C76 167 72 159 66 156Z" fill="url(#lgWing@)" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M60 176 C50 192 46 212 49 234 M68 184 C62 200 60 216 62 232" stroke="#8f78ff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`;

function belly() {
  const rows = [[198, [100, 120, 140]], [216, [90, 110, 130, 150]], [234, [100, 120, 140]]];
  const v = rows.flatMap(([y, xs]) => xs.map((x) => `M${x - 7} ${y} q7 7 14 0`)).join(" ");
  return `<ellipse cx="120" cy="214" rx="48" ry="44" fill="url(#lgBelly@)"/>
    <path d="${v}" stroke="${C.scallop}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
}

function foot(x) {
  return `<g fill="url(#lgBeak@)" stroke="${C.beakInk}" stroke-width="2.2">
    <ellipse cx="${x - 9}" cy="262" rx="6" ry="7.5"/><ellipse cx="${x + 9}" cy="262" rx="6" ry="7.5"/><ellipse cx="${x}" cy="264" rx="6.5" ry="8"/></g>`;
}

export function lingoSVG({ className = "lingo-svg", viewBox = "0 0 240 280", label = "" } = {}) {
  const u = `${++seq}`;
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  const svg = `
<svg class="${className}" viewBox="${viewBox}" ${a11y} xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="lgHead@" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${C.head0}"/><stop offset=".55" stop-color="${C.head1}"/><stop offset="1" stop-color="${C.head2}"/></radialGradient>
    <radialGradient id="lgBody@" cx=".4" cy=".25" r=".9"><stop offset="0" stop-color="${C.head0}"/><stop offset=".5" stop-color="${C.head1}"/><stop offset="1" stop-color="${C.head2}"/></radialGradient>
    <linearGradient id="lgWing@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.wing0}"/><stop offset="1" stop-color="${C.wing1}"/></linearGradient>
    <linearGradient id="lgBelly@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.belly0}"/><stop offset="1" stop-color="${C.belly1}"/></linearGradient>
    <linearGradient id="lgBeak@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.beak0}"/><stop offset="1" stop-color="${C.beak1}"/></linearGradient>
    <radialGradient id="lgIris@" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="${C.iris0}"/><stop offset="1" stop-color="${C.iris1}"/></radialGradient>
  </defs>
  <ellipse class="lg-shadow" cx="120" cy="270" rx="64" ry="8" fill="#1d1640" opacity=".14"/>
  <g class="lg-root"><g class="lg-breath">
    ${foot(100)}${foot(140)}
    <path d="M120 128 C170 128 194 168 192 206 C190 244 160 266 120 266 C80 266 50 244 48 206 C46 168 70 128 120 128Z" fill="url(#lgBody@)" stroke="${C.ink}" stroke-width="3"/>
    <ellipse cx="120" cy="170" rx="66" ry="18" fill="${C.head2}" opacity=".55"/>
    ${belly()}
    <g class="lg-wing lg-wing-l"><g class="lg-wing-in lg-wing-l-in">${WING}</g></g>
    <g class="lg-wing lg-wing-r"><g class="lg-wing-in lg-wing-r-in"><g transform="matrix(-1 0 0 1 240 0)">${WING}</g></g></g>
    <g class="lg-head-idle"><g class="lg-head-talk"><g class="lg-head">
      <g class="lg-tuft lg-tuft-l"><path d="M54 62 C44 46 40 30 42 16 C56 26 70 38 82 50Z" fill="${C.head2}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/></g>
      <g class="lg-tuft lg-tuft-r"><path d="M186 62 C196 46 200 30 198 16 C184 26 170 38 158 50Z" fill="${C.head2}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/></g>
      <path d="M120 26 C176 26 212 58 212 104 C212 150 172 180 120 180 C68 180 28 150 28 104 C28 58 64 26 120 26Z" fill="url(#lgHead@)" stroke="${C.ink}" stroke-width="3"/>
      <ellipse cx="88" cy="50" rx="28" ry="12" fill="#fff" opacity=".16" transform="rotate(-18 88 50)"/>
      <path d="M38 118 q6 4 10 0 M40 132 q6 4 10 0 M202 118 q-6 4 -10 0 M200 132 q-6 4 -10 0" stroke="${C.head2}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M120 74 C104 62 72 62 56 76 C38 92 40 128 58 144 C74 158 100 156 112 160 Q120 166 128 160 C140 156 166 158 182 144 C200 128 202 92 184 76 C168 62 136 62 120 74Z" fill="${C.disc}"/>
      ${eye(86, 110, u, "l")}${eye(154, 110, u, "r")}
      <g class="lg-brow lg-brow-l"><path d="M64 76 Q84 66 104 74" stroke="${C.lash}" stroke-width="7" fill="none" stroke-linecap="round"/></g>
      <g class="lg-brow lg-brow-r"><path d="M136 74 Q156 66 176 76" stroke="${C.lash}" stroke-width="7" fill="none" stroke-linecap="round"/></g>
      <g class="lg-cheeks"><ellipse cx="58" cy="146" rx="13" ry="8" fill="${C.cheek}" opacity=".6"/><ellipse cx="182" cy="146" rx="13" ry="8" fill="${C.cheek}" opacity=".6"/></g>
      <g class="lg-mouth"><path d="M104 146 Q120 142 136 146 Q136 172 120 174 Q104 172 104 146Z" fill="${C.mouth}" stroke="${C.ink}" stroke-width="2"/><ellipse cx="120" cy="167" rx="9" ry="5" fill="${C.tongue}"/></g>
      <g class="lg-beak-low"><path d="M109 148 Q120 166 131 148 Q120 154 109 148Z" fill="${C.beak1}" stroke="${C.beakInk}" stroke-width="2.2" stroke-linejoin="round"/></g>
      <path class="lg-beak-top" d="M105 134 Q120 126 135 134 Q132 148 120 158 Q108 148 105 134Z" fill="url(#lgBeak@)" stroke="${C.beakInk}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M111 135 Q120 131 129 135" stroke="#fff3c4" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/>
      <g class="lg-cap" transform="rotate(-7 120 36)">
        <path d="M94 38 Q120 48 146 38 V52 Q120 62 94 52Z" fill="${C.cap}" stroke="${C.ink}" stroke-width="2.4"/>
        <path d="M62 34 L120 12 L178 34 L120 56Z" fill="${C.cap}" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M76 34 L120 17 L164 34" stroke="${C.cap2}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g class="lg-tassel">
          <path d="M120 33 Q150 32 172 36 L173 60" stroke="${C.gold}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <path d="M167 58 L179 58 L182 78 L164 78Z" fill="${C.gold}" stroke="${C.gold2}" stroke-width="2" stroke-linejoin="round"/>
        </g>
        <circle cx="120" cy="33" r="5" fill="${C.gold}" stroke="${C.gold2}" stroke-width="2"/>
      </g>
    </g></g></g>
  </g></g>
</svg>`;
  return svg.replace(/@/g, u);
}

/** Lingo's head for small spots (the lesson top bar, the lessons page). Static, no animation. */
export function lingoBadge(className = "lingo-badge") {
  return lingoSVG({ className, viewBox: "24 8 192 180" });
}
