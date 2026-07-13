// SHIPPING VERSION — uniform lake gray + black.
// Recolor in-game by swapping fg/bg per keyword.
const BG  = "#8899AA";  // lake gray
const RIM = "#6677AA";  // darker lake gray rim
const FG  = "#0A0A0A";  // near-black symbol

const ICONS = {
  flying:          { name: "Flying",         bg: BG, rim: RIM, fg: FG },
  reach:           { name: "Reach",          bg: BG, rim: RIM, fg: FG },
  lifelink:        { name: "Lifelink",       bg: BG, rim: RIM, fg: FG },
  menace:          { name: "Menace",         bg: BG, rim: RIM, fg: FG },
  vigilance:       { name: "Vigilance",      bg: BG, rim: RIM, fg: FG },
  haste:           { name: "Haste",          bg: BG, rim: RIM, fg: FG },
  trample:         { name: "Trample",        bg: BG, rim: RIM, fg: FG },
  deathtouch:      { name: "Deathtouch",     bg: BG, rim: RIM, fg: FG },
  defender:        { name: "Defender",       bg: BG, rim: RIM, fg: FG },
  indestructible:  { name: "Indestructible", bg: BG, rim: RIM, fg: FG },
  hexproof:        { name: "Hexproof",       bg: BG, rim: RIM, fg: FG },
  firststrike:     { name: "First Strike",   bg: BG, rim: RIM, fg: FG },
  flash:           { name: "Flash",          bg: BG, rim: RIM, fg: FG },
  innate:          { name: "Innate",         bg: BG, rim: RIM, fg: FG },
  tap:             { name: "Tap",            bg: BG, rim: RIM, fg: FG },
};

function FlyingSymbol({ fg }) {
  // Pointed wingtips: leading edge sweeps to outer tip, then L command creates
  // the sharp angle before trailing edge returns. Real bird silhouette.
  return (
    <g fill={fg} strokeLinecap="round">
      <path d="M19,17 C13,14 10,11 7,11 L8,14 C11,17 15,19 19,17 Z" />
      <path d="M21,17 C27,14 30,11 33,11 L32,14 C29,17 25,19 21,17 Z" />
      <ellipse cx="20" cy="17" rx="2.5" ry="4" />
      <circle cx="20" cy="13" r="2.5" />
      <path d="M21,12 L25,11 L21,14 Z" />
      <path d="M18,21 L14,31 L19,27 L20,31 L21,27 L26,31 L22,21 Z" />
    </g>
  );
}

function ReachSymbol({ fg }) {
  // Three overlapping circles create a fluffy cloud-like canopy.
  // Center circle tallest (cy=13,r=7), side circles lower (cy=17,r=6).
  // Combined width spans x=7-33 — broad and organic.
  return (
    <g fill={fg}>
      <circle cx="13" cy="17" r="6" />
      <circle cx="20" cy="13" r="7" />
      <circle cx="27" cy="17" r="6" />
      <rect x="18" y="17" width="4" height="19" rx="1" />
      {/* Root flare: tip overlaps trunk at y=33, wide base at y=35.5 */}
      <path d="M20,33 L16,36 L24,36 Z" />
    </g>
  );
}

function LifelinkSymbol({ fg }) {
  // Verbatim keyword-icons-v2.jsx. Wings are filled crescent shapes, not stroke arcs.
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <line x1="20" y1="9" x2="20" y2="34" stroke={fg} strokeWidth="2" fill="none" />
      {/* Snakes — bulges taper narrower toward bottom: ±8 → ±6 → ±4 */}
      <path d="M20,14 C12,16 12,18 20,20 C26,22 26,24 20,27 C16,29 16,31 20,33"
        stroke={fg} strokeWidth="1.8" fill="none" />
      <path d="M20,14 C28,16 28,18 20,20 C14,22 14,24 20,27 C24,29 24,31 20,33"
        stroke={fg} strokeWidth="1.8" fill="none" />
      {/* Wings — leading edge routes directly to tip (9,8) as highest point.
          No hump above tip means the eye reads (9,8) as the clear wing tip.
          L creates a hard ~76° angle there, then belly returns below. */}
      <path d="M20,11 C16,9 12,8 9,8 L10,12 C13,13 17,12 20,11 Z" fill={fg} />
      <path d="M20,11 C24,9 28,8 31,8 L30,12 C27,13 23,12 20,11 Z" fill={fg} />
      <circle cx="20" cy="9" r="2.5" fill={fg} />
    </g>
  );
}

function MenaceSymbol({ fg }) {
  // Fang bases raised to y=27 — 2.5-unit gap below eye bottoms (was 1.5).
  // Slightly wider bases for better small-size presence.
  return (
    <g fill={fg} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7,14 L14,19 L20,17 L26,19 L33,14" fill="none" stroke={fg} strokeWidth="2.5" />
      <ellipse cx="13" cy="22" rx="3.5" ry="2.5" />
      <ellipse cx="27" cy="22" rx="3.5" ry="2.5" />
      <path d="M10,27 L13,34 L17,27 Z" />
      <path d="M23,27 L27,34 L30,27 Z" />
    </g>
  );
}

function VigilanceSymbol({ fg }) {
  // Shield shifted up 2 units: spans y=7 to y=33, centered at y=20 (coin center).
  // Previously bottom was y=35, off-center by 2 units.
  return (
    <g>
      <path d="M20,7 L31,12 L31,22 Q31,28 20,33 Q9,28 9,22 L9,12 Z" fill={fg} />
      <path d="M20,11 L28,15 L28,22 Q28,27 20,31 Q12,27 12,22 L12,15 Z"
        fill="none" stroke="black" strokeWidth="1.3" opacity="0.28" />
    </g>
  );
}

function HasteSymbol({ fg }) {
  // Center: y=6 to y=34 — 2.5-unit margin from clip edge on both sides. Equalized.
  // Sides: y=12 to y=34. More vertical stretch overall.
  return (
    <g fill={fg}>
      <path d="M12,34 C9,27 9,21 12,12 C14,21 14,27 12,34 Z" />
      <path d="M28,34 C31,27 31,21 28,12 C26,21 26,27 28,34 Z" />
      <path d="M20,36.5 C17,28 16,19 20,6 C24,19 23,28 20,36.5 Z" />
    </g>
  );
}

function TrampleSymbol({ fg }) {
  // 🤘 silhouette: upright pointed horns emerge from a large rounded head.
  // Horns angle slightly outward, tips sharp via L command.
  return (
    <g fill={fg}>
      {/* Left horn — tapers to sharp point, concave inner */}
      <path d="M12,26 C8,20 10,12 14,7 L15,8 C13,14 13,21 14,25 Z" />
      {/* Right horn — mirror */}
      <path d="M28,26 C32,20 30,12 26,7 L25,8 C27,14 27,21 26,25 Z" />
      {/* Large rounded head — horns emerge from sides */}
      <ellipse cx="20" cy="27" rx="9" ry="7" />
    </g>
  );
}

function DeathtouchSymbol({ fg }) {
  // Dagger: vertical in local coords, rotated -40° (CCW) so tip points upper-right.
  // Tapered blade, prominent crossguard, handle, pommel. Clean and readable.
  return (
    <g fill={fg} transform="rotate(-40, 20, 20)">
      <path d="M20,5 L22,9 L21,26 L19,26 L18,9 Z" />
      <rect x="14" y="21" width="12" height="3" rx="0.5" />
      <rect x="18.5" y="24" width="3" height="9" />
      <circle cx="20" cy="33" r="2.5" />
    </g>
  );
}

function DefenderSymbol({ fg }) {
  // Centered vertically: merlon tops at y=11, wall bottom at y=30 → center y=20.5.
  // Wall body taller than merlons as Joe intended.
  return (
    <g fill={fg}>
      <rect x="9"    y="19" width="22" height="11" rx="1" />
      <rect x="10"   y="11" width="5"  height="9"  rx="1" />
      <rect x="17.5" y="11" width="5"  height="9"  rx="1" />
      <rect x="25"   y="11" width="5"  height="9"  rx="1" />
    </g>
  );
}

function IndestructibleSymbol({ fg }) {
  // r=8 (was 7), centers pushed out to cx=14/cx=26 for more width.
  // Rings now span x=6 to x=34 — fills the coin with bold presence.
  return (
    <g stroke={fg} fill="none">
      <circle cx="14" cy="20" r="8" strokeWidth="3" />
      <circle cx="26" cy="20" r="8" strokeWidth="3" />
    </g>
  );
}

function HexproofSymbol({ fg }) {
  // Center dot anchors the rings. Structured so fill="none" doesn't contaminate the dot.
  return (
    <g>
      <circle cx="20" cy="20" r="2"  fill={fg} />
      <circle cx="20" cy="20" r="6"  fill="none" stroke={fg} strokeWidth="2" />
      <circle cx="20" cy="20" r="11" fill="none" stroke={fg} strokeWidth="1.8" />
    </g>
  );
}

function FirstStrikeSymbol({ fg }) {
  // Tip at y=4 maps to exactly r=16.5 from coin center after 45° rotation.
  // Butt at y=37 maps to the opposite clip edge. Spear spans the full coin diameter.
  return (
    <g fill={fg} transform="rotate(45, 20, 21)">
      <path d="M20,4 L27,14 L20,12 L13,14 Z" />
      <rect x="18.5" y="11" width="3" height="26" />
      <rect x="12" y="20" width="16" height="3" rx="0.5" />
    </g>
  );
}

function FlashSymbol({ fg }) {
  return (
    <g fill={fg}>
      <path d="M25,8 L13,23 L20,23 L15,34 L27,19 L20,19 Z" />
    </g>
  );
}

function InnateSymbol({ fg }) {
  return (
    <g stroke={fg} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="11" r="3.5" strokeWidth="2" />
      <line x1="20" y1="14.5" x2="20" y2="32" strokeWidth="2" />
      <line x1="11" y1="20" x2="29" y2="20" strokeWidth="2" />
      <path d="M20,32 C15,32 11,28 11,24" strokeWidth="2" />
      <path d="M20,32 C25,32 29,28 29,24" strokeWidth="2" />
      <line x1="11" y1="24" x2="8"  y2="26" strokeWidth="1.8" />
      <line x1="29" y1="24" x2="32" y2="26" strokeWidth="1.8" />
    </g>
  );
}

function TapSymbol({ fg }) {
  return (
    <g fill={fg}>
      <rect x="9" y="8"  width="22" height="3" rx="1" />
      <rect x="9" y="31" width="22" height="3" rx="1" />
      {/* Apexes cross more deeply — y=25 and y=17 create an 8-unit overlap zone.
          At 22px the diamond waist is ~3px wide, clearly readable as an overlap. */}
      <path d="M10,11 L30,11 L20,25 Z" />
      <path d="M10,31 L30,31 L20,17 Z" />
    </g>
  );
}

// ── Coin wrapper ───────────────────────────────────────────────

function KeywordIcon({ iconKey, size }) {
  const c = ICONS[iconKey];
  const uid = `kwship-${iconKey}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }}>
      <defs>
        <clipPath id={`clip-${uid}`}>
          <circle cx="20" cy="20" r="16.5" />
        </clipPath>
        <radialGradient id={`shine-${uid}`} cx="36%" cy="28%" r="55%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill={c.bg} />
      <circle cx="20" cy="20" r="17" fill={`url(#shine-${uid})`} />
      <g clipPath={`url(#clip-${uid})`}>
        {iconKey === "flying"         && <FlyingSymbol        fg={c.fg} />}
        {iconKey === "reach"          && <ReachSymbol         fg={c.fg} />}
        {iconKey === "lifelink"       && <LifelinkSymbol      fg={c.fg} />}
        {iconKey === "menace"         && <MenaceSymbol        fg={c.fg} />}
        {iconKey === "vigilance"      && <VigilanceSymbol     fg={c.fg} />}
        {iconKey === "haste"          && <HasteSymbol         fg={c.fg} />}
        {iconKey === "trample"        && <TrampleSymbol       fg={c.fg} />}
        {iconKey === "deathtouch"     && <DeathtouchSymbol    fg={c.fg} />}
        {iconKey === "defender"       && <DefenderSymbol      fg={c.fg} />}
        {iconKey === "indestructible" && <IndestructibleSymbol fg={c.fg} />}
        {iconKey === "hexproof"       && <HexproofSymbol      fg={c.fg} />}
        {iconKey === "firststrike"    && <FirstStrikeSymbol   fg={c.fg} />}
        {iconKey === "flash"          && <FlashSymbol         fg={c.fg} />}
        {iconKey === "innate"         && <InnateSymbol        fg={c.fg} />}
        {iconKey === "tap"            && <TapSymbol           fg={c.fg} />}
      </g>
      <circle cx="20" cy="20" r="17" fill="none" stroke={c.rim} strokeWidth="2" />
      <circle cx="20" cy="20" r="19" fill="none" stroke="#C8B040" strokeWidth="1.8" />
    </svg>
  );
}

const ORDER = [
  "flying", "reach", "lifelink", "menace",
  "vigilance", "haste", "trample", "deathtouch",
  "defender", "indestructible", "hexproof", "firststrike",
  "flash", "innate", "tap",
];

export default function App() {
  return (
    <div style={{
      background: "#060610", minHeight: "100vh",
      padding: "40px 20px 64px",
      fontFamily: "'Courier New', Courier, monospace",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        <div style={{ marginBottom: 40 }}>
          <div style={{ color: "#2A2A4A", fontSize: 8, letterSpacing: "0.35em", marginBottom: 8 }}>MAGICLIKE — KEYWORD ICONS — SHIP</div>
          <div style={{ color: "#7A7A9A", fontSize: 13, letterSpacing: "0.2em", fontWeight: 700, marginBottom: 4 }}>ALL 15 KEYWORDS</div>
          <div style={{ color: "#3A3A5A", fontSize: 9 }}>48px · 22px · 16px · on-card</div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 44 }}>
          {ORDER.map(key => (
            <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, width: 58 }}>
              <KeywordIcon iconKey={key} size={48} />
              <div style={{ fontSize: 7, color: "#8888AA", textAlign: "center", letterSpacing: "0.05em", lineHeight: 1.4 }}>
                {ICONS[key].name}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ color: "#4A4A6A", fontSize: 8, letterSpacing: "0.2em", marginBottom: 12 }}>GAME SCALE — 22px</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ORDER.map(key => <KeywordIcon key={key} iconKey={key} size={22} />)}
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ color: "#4A4A6A", fontSize: 8, letterSpacing: "0.2em", marginBottom: 12 }}>MINIMUM — 16px</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ORDER.map(key => <KeywordIcon key={key} iconKey={key} size={16} />)}
          </div>
        </div>

        <div>
          <div style={{ color: "#4A4A6A", fontSize: 8, letterSpacing: "0.2em", marginBottom: 12 }}>ON DARK CARD — 22px</div>
          <div style={{ background: "#1A1230", borderRadius: 6, padding: "14px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ORDER.map(key => <KeywordIcon key={key} iconKey={key} size={22} />)}
          </div>
        </div>

      </div>
    </div>
  );
}
