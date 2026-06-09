// Magiclike — Unblockable keyword icon: key
// Bow (ring) at top, shaft, two teeth.

const C = { bg: "#16100A", rim: "#604818", fg: "#D8A830" };

function KeySymbol({ fg, bg }) {
  return (
    <g>
      {/* Bow — outer ring with hole */}
      <circle cx="20" cy="11" r="7"   fill={fg} />
      <circle cx="20" cy="11" r="3.5" fill={bg} />
      {/* Shaft */}
      <rect x="18.5" y="17" width="3.5" height="16" rx="1" fill={fg} />
      {/* Teeth */}
      <rect x="22" y="25"   width="5"   height="2.5" rx="0.5" fill={fg} />
      <rect x="22" y="29.5" width="3.5" height="2.5" rx="0.5" fill={fg} />
    </g>
  );
}

function UnblockableIcon({ size }) {
  const uid = `unblockable-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }}>
      <defs>
        <clipPath id={`clip-${uid}`}><circle cx="20" cy="20" r="16.5" /></clipPath>
        <radialGradient id={`shine-${uid}`} cx="36%" cy="28%" r="55%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill={C.bg} />
      <circle cx="20" cy="20" r="17" fill={`url(#shine-${uid})`} />
      <g clipPath={`url(#clip-${uid})`}>
        <KeySymbol fg={C.fg} bg={C.bg} />
      </g>
      <circle cx="20" cy="20" r="17" fill="none" stroke={C.rim} strokeWidth="2" />
      <circle cx="20" cy="20" r="19" fill="none" stroke="#C8B040" strokeWidth="1.8" />
    </svg>
  );
}

export default function App() {
  return (
    <div style={{
      background: "#060610", minHeight: "100vh",
      padding: "48px 24px 64px",
      fontFamily: "'Courier New', Courier, monospace",
    }}>
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ color: "#2A2A4A", fontSize: 8, letterSpacing: "0.35em", marginBottom: 6 }}>MAGICLIKE — KEYWORD ICON</div>
          <div style={{ color: "#7A7A9A", fontSize: 13, letterSpacing: "0.2em", fontWeight: 700 }}>UNBLOCKABLE</div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-end", marginBottom: 48 }}>
          {[48, 22, 16].map(s => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <UnblockableIcon size={s} />
              <div style={{ fontSize: 8, color: "#444460" }}>{s}px</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ color: "#4A4A6A", fontSize: 8, letterSpacing: "0.2em", marginBottom: 10 }}>ON DARK CARD — 22px</div>
          <div style={{ background: "#1A1230", borderRadius: 6, padding: 14, display: "flex", gap: 8 }}>
            <UnblockableIcon size={22} />
            <UnblockableIcon size={22} />
            <UnblockableIcon size={22} />
          </div>
        </div>
      </div>
    </div>
  );
}
