const P = {
  white: { name: "White", concept: "Tipping Scales", bg: "#DEC96A", rim: "#8A6810", fg: "#140A02" },
  blue:  { name: "Blue",  concept: "Open Book",      bg: "#0C2E86", rim: "#3868CC", fg: "#BACCFF" },
  green: { name: "Green", concept: "Leaf",            bg: "#0C4418", rim: "#247030", fg: "#86D494" },
  red:   { name: "Red",   concept: "Fissure",         bg: "#7C0A0A", rim: "#C02424", fg: "#FFC8B0" },
  black: { name: "Black", concept: "Eclipse",         bg: "#080814", rim: "#20203C", fg: "#DCD09A" },
};

function WhiteSymbol({ fg }) {
  return (
    <g stroke={fg} fill={fg} strokeLinecap="round" strokeLinejoin="round">
      <line x1="20" y1="17" x2="20" y2="29" strokeWidth="2" />
      <polygon points="16.5,32 23.5,32 20,27.5" strokeWidth="0" />
      <line x1="10" y1="14" x2="30" y2="20" strokeWidth="2.5" />
      <circle cx="20" cy="17" r="2.2" strokeWidth="0" />
      <line x1="10" y1="14" x2="6"  y2="20" strokeWidth="1.5" />
      <line x1="10" y1="14" x2="14" y2="20" strokeWidth="1.5" />
      <line x1="6"  y1="20" x2="14" y2="20" strokeWidth="2.5" />
      <line x1="30" y1="20" x2="26" y2="30" strokeWidth="1.5" />
      <line x1="30" y1="20" x2="33" y2="30" strokeWidth="1.5" />
      <line x1="26" y1="30" x2="33" y2="30" strokeWidth="2.5" />
    </g>
  );
}

function BlueSymbol({ fg }) {
  return (
    <g stroke={fg} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20,13 L7,10 L7,27 L20,30 Z"  fill={fg} fillOpacity="0.15" strokeWidth="1.5" />
      <path d="M20,13 L33,10 L33,27 L20,30 Z" fill={fg} fillOpacity="0.15" strokeWidth="1.5" />
      <line x1="20" y1="13" x2="20" y2="30" stroke={fg} strokeWidth="2.5" strokeLinecap="butt" />
      {/* Round cap on bottom end only */}
      <circle cx="20" cy="30" r="1.25" fill={fg} stroke="none" />
      <line x1="18" y1="16.5" x2="9"  y2="14"   stroke={fg} strokeWidth="1.2" opacity="0.65" />
      <line x1="18" y1="21"   x2="9"  y2="18.5"  stroke={fg} strokeWidth="1.2" opacity="0.65" />
      <line x1="18" y1="25.5" x2="9"  y2="23"    stroke={fg} strokeWidth="1.2" opacity="0.65" />
      <line x1="22" y1="16.5" x2="31" y2="14"   stroke={fg} strokeWidth="1.2" opacity="0.65" />
      <line x1="22" y1="21"   x2="31" y2="18.5"  stroke={fg} strokeWidth="1.2" opacity="0.65" />
      <line x1="22" y1="25.5" x2="31" y2="23"    stroke={fg} strokeWidth="1.2" opacity="0.65" />
    </g>
  );
}

function GreenSymbol({ fg, uid }) {
  // Veins extended well past the leaf boundary so clipPath terminates them
  // exactly at the edge — no more stopping short of the margin.
  const clipId = `leaf-clip-${uid}`;
  const leafPath = "M20,7 C28,11 35,19 33,27 C31,31 26,33 20,33 C14,33 9,31 7,27 C5,19 12,11 20,7 Z";
  return (
    <g stroke={fg} fill={fg} strokeLinecap="round">
      <defs>
        <clipPath id={clipId}>
          <path d={leafPath} />
        </clipPath>
      </defs>
      <path d={leafPath} fillOpacity="0.20" strokeWidth="1.5" />
      <line x1="20" y1="33" x2="20" y2="37" strokeWidth="1.8" />
      <g clipPath={`url(#${clipId})`} fill="none">
        {/* Central vein */}
        <line x1="20" y1="7" x2="20" y2="33" stroke={fg} strokeWidth="1.8" />
        {/* Pair 1 — y=13, extended far past leaf edge */}
        <path d="M20,13 C17,11 12,8 4,6"   stroke={fg} strokeWidth="1.1" />
        <path d="M20,13 C23,11 28,8 36,6"  stroke={fg} strokeWidth="1.1" />
        {/* Pair 2 — y=18 */}
        <path d="M20,18 C17,15 12,12 3,10" stroke={fg} strokeWidth="1.1" />
        <path d="M20,18 C23,15 28,12 37,10" stroke={fg} strokeWidth="1.1" />
        {/* Pair 3 — y=23 */}
        <path d="M20,23 C16,20 11,17 2,16" stroke={fg} strokeWidth="1.1" />
        <path d="M20,23 C24,20 29,17 38,16" stroke={fg} strokeWidth="1.1" />
        {/* Pair 4 — y=28 */}
        <path d="M20,28 C16,25 11,22 2,21" stroke={fg} strokeWidth="1.1" />
        <path d="M20,28 C24,25 29,22 38,21" stroke={fg} strokeWidth="1.1" />
      </g>
    </g>
  );
}

function RedSymbol({ fg }) {
  const spears = [
    "M22,20 L18,20 L20,5 Z",
    "M21.3,21.5 L18.7,18.5 L34,8 Z",
    "M18.5,21.3 L21.5,18.7 L32,34 Z",
    "M18.5,18.7 L21.5,21.3 L8,34 Z",
  ];
  const jagged = [
    { d: "M20,20 L25,20 L30,18 L36,19", sw: "2.2" },
    { d: "M20,20 L19,25 L21,30 L20,36", sw: "1.5" },
    { d: "M20,20 L15,21 L10,20 L4,21",  sw: "2.2" },
    { d: "M20,20 L16,16 L12,13 L8,8",   sw: "1.5" },
  ];
  return (
    <g>
      {spears.map((d, i) => <path key={`s${i}`} d={d} fill={fg} stroke="none" />)}
      {jagged.map(({ d, sw }, i) => (
        <path key={`j${i}`} d={d} fill="none" stroke={fg}
          strokeWidth={sw} strokeLinecap="butt" strokeLinejoin="miter" />
      ))}
      <circle cx="20" cy="20" r="2.5" fill={fg} stroke="none" />
    </g>
  );
}

function BlackSymbol({ fg, bg }) {
  const sunCx = 25, sunCy = 15, sunR = 6.5;
  const moonCx = 16, moonCy = 24, moonR = 9;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const innerR = sunR + 2, outerR = sunR + 7.5, halfW = 1.1;
    const perp = angle + Math.PI / 2;
    const [ca, sa] = [Math.cos(angle), Math.sin(angle)];
    const [cp, sp] = [Math.cos(perp), Math.sin(perp)];
    return `M${(sunCx+ca*innerR+cp*halfW).toFixed(1)},${(sunCy+sa*innerR+sp*halfW).toFixed(1)} L${(sunCx+ca*innerR-cp*halfW).toFixed(1)},${(sunCy+sa*innerR-sp*halfW).toFixed(1)} L${(sunCx+ca*outerR).toFixed(1)},${(sunCy+sa*outerR).toFixed(1)} Z`;
  });
  return (
    <g>
      {rays.map((d, i) => <path key={i} d={d} fill={fg} stroke="none" />)}
      <circle cx={sunCx} cy={sunCy} r={sunR} fill={fg} />
      <circle cx={moonCx} cy={moonCy} r={moonR} fill={bg} stroke={fg} strokeWidth="1.5" />
    </g>
  );
}

function ManaIcon({ colorKey, size }) {
  const c = P[colorKey];
  const uid = `${colorKey}-${size}`;
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
        {colorKey === "white" && <WhiteSymbol fg={c.fg} />}
        {colorKey === "blue"  && <BlueSymbol  fg={c.fg} />}
        {colorKey === "green" && <GreenSymbol fg={c.fg} uid={uid} />}
        {colorKey === "red"   && <RedSymbol   fg={c.fg} />}
        {colorKey === "black" && <BlackSymbol fg={c.fg} bg={c.bg} />}
      </g>
      <circle cx="20" cy="20" r="17" fill="none" stroke={c.rim} strokeWidth="2" />
      <circle cx="20" cy="20" r="19" fill="none" stroke="#C8B040" strokeWidth="1.8" />
    </svg>
  );
}

const SIZES = [80, 48, 32, 16];
const ORDER = ["white", "blue", "green", "red", "black"];
const LORE  = {
  white: "Justice · Order · Hierarchy",
  blue:  "Knowledge · Control · Pattern",
  green: "Growth · Nature · Life",
  red:   "Chaos · Passion · Pressure",
  black: "Ambition · Sacrifice · Will",
};
const CARD_TONES = {
  white: "#2E2410", blue: "#0E1630", green: "#0A200E",
  red:   "#300808", black: "#1A1230",
};

export default function App() {
  return (
    <div style={{
      background: "#060610", minHeight: "100vh",
      padding: "48px 24px 72px",
      fontFamily: "'Courier New', Courier, monospace",
    }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        <div style={{ marginBottom: 44 }}>
          <div style={{ color: "#16162A", fontSize: 8, letterSpacing: "0.35em", marginBottom: 8 }}>MAGICLIKE — ASSET DESIGN</div>
          <div style={{ color: "#7A7A9A", fontSize: 13, letterSpacing: "0.2em", fontWeight: 700, marginBottom: 6 }}>MANA SYMBOLS v13</div>
          <div style={{ color: "#14142A", fontSize: 9, letterSpacing: "0.1em", lineHeight: 2 }}>
            VEINS EXTENDED TO LEAF EDGE
          </div>
        </div>

        <div style={{ display: "flex", paddingLeft: 172, marginBottom: 10 }}>
          {SIZES.map(s => (
            <div key={s} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "#1A1A38", letterSpacing: "0.12em" }}>{s}px</div>
          ))}
        </div>

        {ORDER.map((key, idx) => {
          const c = P[key];
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", padding: "18px 0",
              borderTop: idx === 0 ? "1px solid #0E0E22" : "none",
              borderBottom: "1px solid #0E0E22",
            }}>
              <div style={{ width: 172, flexShrink: 0 }}>
                <div style={{ color: c.rim === "#20203C" ? "#5858A8" : c.rim, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>{c.name}</div>
                <div style={{ color: "#28284A", fontSize: 9, fontStyle: "italic", marginBottom: 3 }}>{c.concept}</div>
                <div style={{ color: "#161630", fontSize: 8 }}>{LORE[key]}</div>
              </div>
              <div style={{ display: "flex", flex: 1 }}>
                {SIZES.map(s => (
                  <div key={s} style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <ManaIcon colorKey={key} size={s} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 52 }}>
          <div style={{ color: "#14142C", fontSize: 8, letterSpacing: "0.2em", marginBottom: 20 }}>ON CARD BACKGROUNDS (28px)</div>
          <div style={{ display: "flex", gap: 6 }}>
            {ORDER.map(key => (
              <div key={key} style={{
                flex: 1, background: CARD_TONES[key], borderRadius: 4,
                padding: "14px 6px", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 8,
              }}>
                <ManaIcon colorKey={key} size={28} />
                <div style={{ fontSize: 7, color: "#444" }}>{P[key].name}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 44 }}>
          <div style={{ color: "#14142C", fontSize: 8, letterSpacing: "0.2em", marginBottom: 16 }}>CARD COSTS (22px)</div>
          {[
            { name: "Lightning Strike", cost: ["red","red"],              bg: "#280808" },
            { name: "Counterspell",     cost: ["blue","blue"],            bg: "#080E28" },
            { name: "Giant Growth",     cost: ["green"],                  bg: "#081408" },
            { name: "Dark Ritual",      cost: ["black","black","black"],  bg: "#08080E" },
            { name: "Plains Walker",    cost: ["white","white","blue"],   bg: "#221C08" },
          ].map(card => (
            <div key={card.name} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 14px", marginBottom: 2,
              background: card.bg, borderRadius: 3,
            }}>
              <div style={{ color: "#30304A", fontSize: 10, flex: 1 }}>{card.name}</div>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {card.cost.map((c, i) => <ManaIcon key={i} colorKey={c} size={22} />)}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
