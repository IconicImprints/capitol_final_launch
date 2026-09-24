// ── Theme palettes, shared colors, fonts, and CSS keyframes ───────────────────
// Moved verbatim from App.jsx — no value changes.

export const THEMES = {
  default: {
    bg: "#f9f9f8", surface: "#ffffff", surfaceAlt: "#f4f4f2",
    border: "#e8e8e4", borderStrong: "#d0d0c8",
    text: "#111111", textMuted: "#6b7280", textFaint: "#9ca3af",
    headerBg: "#ffffff", navActiveBg: "#f4f4f2",
    inputBg: "#f4f4f2", inputFocus: "#ffffff", inputText: "#111111",
    successBg: "#f0fdf4", successBorder: "#bbf7d0", successText: "#15803d",
    errorBg: "#fef2f2", errorBorder: "#fecaca", errorText: "#dc2626",
    warnBg: "#fff7ed", warnBorder: "#fed7aa", warnText: "#c2410c",
    infoBg: "#fefce8", infoBorder: "#fde047", infoText: "#854d0e",
    hoverBg: "rgba(0,0,0,0.04)", activeBg: "rgba(0,0,0,0.07)",
    isDark: false,
  },
  dark: {
    bg: "#09090b", surface: "#141417", surfaceAlt: "#1c1c20",
    border: "#27272b", borderStrong: "#38383e",
    text: "#f2f2f4", textMuted: "#8a8a96", textFaint: "#52525a",
    headerBg: "#111114", navActiveBg: "#1c1c22",
    inputBg: "#1c1c20", inputFocus: "#24242a", inputText: "#f2f2f4",
    successBg: "#0a2218", successBorder: "#145229", successText: "#4ade80",
    errorBg: "#220d0d", errorBorder: "#6b1717", errorText: "#f87171",
    warnBg: "#1a0e00", warnBorder: "#6a2e00", warnText: "#fb923c",
    infoBg: "#161100", infoBorder: "#5c3500", infoText: "#fbbf24",
    hoverBg: "rgba(255,255,255,0.04)", activeBg: "rgba(255,255,255,0.08)",
    isDark: true,
  },
};

export const SHARED = {
  yellow: "#F5C800", yellowLight: "#fefce8", yellowBorder: "#fde047",
  green: "#16a34a", greenLight: "#f0fdf4",
  red: "#dc2626", redLight: "#fef2f2",
  orange: "#ea580c", orangeLight: "#fff7ed",
};

// ── Sequential animation queue wave colors ────────────────────────────────────
export const WAVE_COLORS = {
  success: "#10b981",
  create:  "#F5C800",
  join:    "#3b82f6",
  warn:    "#f97316",
  danger:  "#ef4444",
  info:    "#7c3aed",
};

// ── Shared font stack for standalone top-level screens ────────────────────────
export const APP_FONT = "'Plus Jakarta Sans',-apple-system,sans-serif";

// ── Shared CSS keyframes (injected once into <head>) ──────────────────────────
export const KD_ANIM_CSS = `
@keyframes kd-flame-flicker{0%,100%{transform:scaleY(1) scaleX(1)}30%{transform:scaleY(1.08) scaleX(0.95)}60%{transform:scaleY(0.94) scaleX(1.06)}}
@keyframes kd-xp-rise{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-40px);opacity:0}}
@keyframes kd-progress-fill{from{stroke-dashoffset:100}to{stroke-dashoffset:var(--kd-dash)}}
@keyframes kd-premium-card-in{0%{opacity:0;transform:translateY(60px) scale(0.85)}60%{transform:translateY(-8px) scale(1.02)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes kd-premium-glow{0%,100%{box-shadow:0 0 20px var(--glow-color, rgba(245,200,0,0.3))}50%{box-shadow:0 0 40px var(--glow-color, rgba(245,200,0,0.6))}}
@keyframes kd-premium-text-in{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}
@keyframes kd-premium-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes kd-premium-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes kd-premium-particle{0%{opacity:0;transform:translate(0,0) scale(0)}20%{opacity:1}80%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(var(--ds))}}
@keyframes kd-premium-confetti{0%{opacity:0;transform:translateY(0) rotate(0deg) scale(0)}15%{opacity:1}100%{opacity:0;transform:translateY(300px) rotate(720deg) scale(1)}}
@keyframes kd-premium-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes kd-premium-flame-ignite{0%{transform:scale(0) rotate(-10deg);opacity:0}30%{transform:scale(1.4) rotate(5deg);opacity:1}60%{transform:scale(0.9) rotate(-2deg)}100%{transform:scale(1) rotate(0deg);opacity:1}}
@keyframes kd-premium-crown-drop{0%{transform:translateY(-60px) rotate(-15deg);opacity:0}40%{transform:translateY(6px) rotate(3deg);opacity:1}70%{transform:translateY(-2px) rotate(-1deg)}100%{transform:translateY(0) rotate(0deg);opacity:1}}
@keyframes kd-premium-podium-rise{0%{transform:translateY(100px) scale(0.8);opacity:0}50%{transform:translateY(-6px) scale(1.02)}100%{transform:translateY(0) scale(1);opacity:1}}
@keyframes kd-premium-flip-in{0%{transform:perspective(600px) rotateY(90deg);opacity:0}50%{transform:perspective(600px) rotateY(-10deg)}100%{transform:perspective(600px) rotateY(0deg);opacity:1}}
@keyframes kd-premium-fly-in{0%{transform:translate(-40px,20px) scale(0);opacity:0}50%{transform:translate(4px,-2px) scale(1.15)}100%{transform:translate(0,0) scale(1);opacity:1}}
@keyframes kd-premium-verify-ring{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(34,197,94,0.6)}50%{transform:scale(1.12);box-shadow:0 0 0 12px rgba(34,197,94,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(34,197,94,0)}}
@keyframes kd-premium-spotlight{0%{opacity:0;transform:scale(0.8)}30%{opacity:1;transform:scale(1)}100%{opacity:1;transform:scale(1)}}
@keyframes kd-premium-rare-glow{0%,100%{filter:drop-shadow(0 0 6px var(--glow))}50%{filter:drop-shadow(0 0 18px var(--glow))}}
`;
