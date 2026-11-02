/**
 * ReelPro: a 9:16 reel driven by an AI "edit plan" (see web/src/playbooks/saas/reel_editor.md).
 * Everything here is CSS/React so it renders reliably in headless Chrome on the VPS (no WebGL).
 */
import React, { useMemo } from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/fonts";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { pushCut } from "@remotion/transitions";

// ---------------------------------------------------------------- fonts
const F = { poppins: "Poppins", manrope: "Manrope", playfair: "Playfair Display" } as const;
[500, 700, 800].forEach((w) => loadFont({ family: F.poppins, url: staticFile(`fonts/poppins-latin-${w}-normal.woff2`), weight: String(w) }));
[500, 700, 800].forEach((w) => loadFont({ family: F.manrope, url: staticFile(`fonts/manrope-latin-${w}-normal.woff2`), weight: String(w) }));
loadFont({ family: F.playfair, url: staticFile("fonts/playfair-display-latin-700-normal.woff2"), weight: "700" });

// ---------------------------------------------------------------- types
export const STYLES = ["warm", "expert", "playful", "premium"] as const;
export const MOTIONS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up"] as const;
export const TEXT_ANIMS = ["rise", "pop", "words", "slide", "type"] as const;
export const TRANSITIONS = ["fade", "slide_up", "slide_left", "wipe", "flip", "iris", "clock_wipe", "zoom_punch", "light_leak", "cut"] as const;
export const CAPTION_STYLES = ["highlight", "pop", "underline", "minimal"] as const;

export type EditPlan = {
  style: (typeof STYLES)[number];
  hook: string;
  scenes: Array<{ motion: (typeof MOTIONS)[number]; text_anim: (typeof TEXT_ANIMS)[number] }>;
  transitions: Array<(typeof TRANSITIONS)[number]>;
  caption_style: (typeof CAPTION_STYLES)[number];
  end_card: { cta: string; line: string };
};

export type ReelProProps = {
  audio: string;
  durationSec: number;
  captions: Caption[];
  scenes: Array<{ image: string; startSec: number; text: string }>;
  businessName: string;
  handle: string | null;
  logo: string | null;
  colors: { accent: string; second: string };
  plan: EditPlan;
};

export const END_SEC = 2.6;
const HOOK_SEC = 1.6;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------------------------------------------------------------- style system
type Look = {
  head: string; body: string; headWeight: number;
  overlay: string; vignette: boolean; progress: boolean; motionScale: number;
  endBg: (c: ReelProProps["colors"]) => string; endInk: string;
};
const LOOKS: Record<EditPlan["style"], Look> = {
  warm: {
    head: F.poppins, body: F.poppins, headWeight: 800,
    overlay: "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.62) 100%)",
    vignette: false, progress: false, motionScale: 1, endBg: (c) => c.accent, endInk: "#fff",
  },
  expert: {
    head: F.manrope, body: F.manrope, headWeight: 800,
    overlay: "linear-gradient(180deg, rgba(8,15,28,0.55) 0%, rgba(8,15,28,0.05) 35%, rgba(8,15,28,0.05) 55%, rgba(8,15,28,0.72) 100%)",
    vignette: false, progress: true, motionScale: 0.8, endBg: () => "#0E1726", endInk: "#fff",
  },
  playful: {
    head: F.poppins, body: F.poppins, headWeight: 800,
    overlay: "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)",
    vignette: false, progress: true, motionScale: 1.25, endBg: (c) => c.accent, endInk: "#fff",
  },
  premium: {
    head: F.playfair, body: F.manrope, headWeight: 700,
    overlay: "linear-gradient(180deg, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.05) 38%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.70) 100%)",
    vignette: true, progress: false, motionScale: 0.55, endBg: () => "#0B0B0C", endInk: "#F5F1E8",
  },
};

// ---------------------------------------------------------------- custom transitions
/** Fade with a warm flash of light across the cut (no WebGL). */
const LightLeakPresentation: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ children, presentationDirection, presentationProgress }) => {
  const entering = presentationDirection === "entering";
  const flash = Math.sin(presentationProgress * Math.PI);
  return (
    <AbsoluteFill style={{ opacity: entering ? presentationProgress : 1 }}>
      {children}
      {entering && (
        <AbsoluteFill style={{
          pointerEvents: "none", mixBlendMode: "screen", opacity: flash * 0.85,
          background: `radial-gradient(ellipse at ${20 + presentationProgress * 60}% 30%, rgba(255,190,110,0.95) 0%, rgba(255,120,60,0.55) 30%, rgba(255,80,40,0) 65%)`,
        }} />
      )}
    </AbsoluteFill>
  );
};
const lightLeak = (): TransitionPresentation<Record<string, never>> => ({ component: LightLeakPresentation, props: {} });

function presentation(name: EditPlan["transitions"][number], w: number, h: number, accent: string): TransitionPresentation<Record<string, unknown>> {
  const any = (p: unknown) => p as TransitionPresentation<Record<string, unknown>>;
  switch (name) {
    case "slide_up": return any(slide({ direction: "from-bottom" }));
    case "slide_left": return any(slide({ direction: "from-right" }));
    case "wipe": return any(wipe({ direction: "from-left" }));
    case "flip": return any(flip({ direction: "from-right" }));
    case "iris": return any(iris({ width: w, height: h }));
    case "clock_wipe": return any(clockWipe({ width: w, height: h }));
    case "zoom_punch": return any(pushCut({ flashColor: accent, flashOpacity: 0.35 }));
    case "light_leak": return any(lightLeak());
    default: return any(fade());
  }
}

// ---------------------------------------------------------------- scene pieces
function motionStyle(motion: EditPlan["scenes"][number]["motion"], frame: number, len: number, k: number): React.CSSProperties {
  const t = interpolate(frame, [0, len], [0, 1], clamp);
  const z = (a: number, b: number) => 1 + (a + (b - a) * t) * k;
  switch (motion) {
    case "zoom_out": return { scale: String(z(0.16, 0.04)) };
    case "pan_left": return { scale: String(1 + 0.14 * k), translate: `${(3 - 6 * t) * k}% 0` };
    case "pan_right": return { scale: String(1 + 0.14 * k), translate: `${(-3 + 6 * t) * k}% 0` };
    case "pan_up": return { scale: String(1 + 0.14 * k), translate: `0 ${(3 - 6 * t) * k}%` };
    default: return { scale: String(z(0.03, 0.15)) };
  }
}

const AnimatedText: React.FC<{ text: string; anim: EditPlan["scenes"][number]["text_anim"]; delay: number; style: React.CSSProperties }> = ({ text, anim, delay, style }) => {
  const frame = useCurrentFrame() - delay;
  const { fps } = useVideoConfig();
  if (frame < 0) return null;
  if (anim === "words" || anim === "type") {
    const units = anim === "words" ? text.split(" ") : Array.from(text);
    const step = anim === "words" ? 0.12 * fps : 0.035 * fps;
    return (
      <div style={style}>
        {units.map((u, i) => {
          const f = frame - i * step;
          const o = interpolate(f, [0, anim === "words" ? 0.25 * fps : 1], [0, 1], clamp);
          return <span key={i} style={{ opacity: o, display: "inline-block", translate: anim === "words" ? `0 ${interpolate(f, [0, 0.35 * fps], [24, 0], { ...clamp, easing: ease })}px` : undefined, whiteSpace: "pre" }}>{u}{anim === "words" && i < units.length - 1 ? " " : ""}</span>;
        })}
      </div>
    );
  }
  if (anim === "pop") {
    const s = spring({ frame, fps, config: { damping: 9, stiffness: 160 } });
    return <div style={{ ...style, scale: String(0.6 + 0.4 * s), opacity: Math.min(1, s * 1.4) }}>{text}</div>;
  }
  if (anim === "slide") {
    const p = interpolate(frame, [0, 0.5 * fps], [0, 1], { ...clamp, easing: ease });
    return <div style={{ ...style, clipPath: `inset(0 ${100 - p * 100}% 0 0 round 24px)`, translate: `${(1 - p) * -40}px 0` }}>{text}</div>;
  }
  // rise
  return (
    <div style={{ ...style, opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], clamp), translate: `0 ${interpolate(frame, [0, 0.5 * fps], [40, 0], { ...clamp, easing: ease })}px` }}>{text}</div>
  );
};

function headlineStyle(style: EditPlan["style"], look: Look, c: ReelProProps["colors"]): { wrap: React.CSSProperties; text: React.CSSProperties } {
  const base: React.CSSProperties = { fontFamily: look.head, fontWeight: look.headWeight, lineHeight: 1.08, color: "#fff" };
  switch (style) {
    case "expert":
      return {
        wrap: { position: "absolute", top: 150, left: 70, right: 70, display: "flex", justifyContent: "flex-start" },
        text: { ...base, fontSize: 68, textAlign: "left", padding: "24px 30px 24px 36px", background: "rgba(10,18,32,0.78)", borderLeft: `12px solid ${c.accent}`, borderRadius: 10, letterSpacing: -0.5 },
      };
    case "playful":
      return {
        wrap: { position: "absolute", top: 165, left: 70, right: 70, display: "flex", justifyContent: "center" },
        text: { ...base, fontSize: 76, textAlign: "center", padding: "22px 40px", background: c.accent, borderRadius: 30, rotate: "-2.5deg", boxShadow: "10px 12px 0 #111", border: "5px solid #111" },
      };
    case "premium":
      return {
        wrap: { position: "absolute", top: 190, left: 90, right: 90, display: "flex", justifyContent: "center" },
        text: { ...base, fontSize: 78, textAlign: "center", letterSpacing: 0.5, textShadow: "0 6px 30px rgba(0,0,0,0.55)", paddingBottom: 22, borderBottom: `3px solid ${c.second}` },
      };
    default:
      return {
        wrap: { position: "absolute", top: 165, left: 80, right: 80, display: "flex", justifyContent: "center" },
        text: { ...base, fontSize: 70, textAlign: "center", padding: "22px 38px", background: c.accent, borderRadius: 26 },
      };
  }
}

const Scene: React.FC<{ s: ReelProProps["scenes"][number]; plan: EditPlan["scenes"][number]; len: number; textDelay: number; look: Look; style: EditPlan["style"]; colors: ReelProProps["colors"] }> = ({ s, plan, len, textDelay, look, style, colors }) => {
  const frame = useCurrentFrame();
  const h = headlineStyle(style, look, colors);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <Img src={staticFile(s.image)} style={{ width: "100%", height: "100%", objectFit: "cover", ...motionStyle(plan.motion, frame, len, look.motionScale) }} />
      <AbsoluteFill style={{ background: look.overlay }} />
      {look.vignette && <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />}
      {s.text && <div style={h.wrap}><AnimatedText text={s.text} anim={plan.text_anim} delay={textDelay} style={h.text} /></div>}
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ text: string; look: Look; style: EditPlan["style"]; colors: ReelProProps["colors"] }> = ({ text, look, style, colors }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame, fps, config: { damping: style === "premium" ? 30 : 12 } });
  const out = interpolate(frame, [HOOK_SEC * fps - 0.25 * fps, HOOK_SEC * fps], [1, 0], clamp);
  const box: React.CSSProperties =
    style === "playful" ? { background: "#fff", color: "#111", border: "6px solid #111", boxShadow: `12px 14px 0 ${colors.accent}`, rotate: "-3deg", borderRadius: 26 }
    : style === "expert" ? { background: colors.accent, color: "#fff", borderRadius: 12 }
    : style === "premium" ? { color: "#fff", textShadow: "0 8px 40px rgba(0,0,0,0.6)" }
    : { background: "#fff", color: "#111", borderRadius: 28 };
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80, background: `rgba(0,0,0,${0.35 * out})`, opacity: out }}>
      <div style={{ fontFamily: look.head, fontWeight: look.headWeight, fontSize: style === "premium" ? 96 : 88, lineHeight: 1.05, textAlign: "center", padding: "30px 44px", scale: String(0.7 + 0.3 * inP), ...box }}>{text}</div>
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{ page: TikTokPage; mode: EditPlan["caption_style"]; look: Look; accent: string }> = ({ page, mode, look, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = page.startMs + (frame / fps) * 1000;
  const minimal = mode === "minimal";
  return (
    <div style={{ position: "absolute", bottom: minimal ? 300 : 320, left: 70, right: 70, textAlign: "center", fontFamily: look.body, fontWeight: minimal ? 700 : 800, fontSize: minimal ? 50 : 62, lineHeight: 1.18, whiteSpace: "pre-wrap", color: "#fff", textShadow: "0 4px 18px rgba(0,0,0,0.75)" }}>
      {page.tokens.map((tk) => {
        const on = tk.fromMs <= t && tk.toMs > t;
        if (!on || minimal) return <span key={tk.fromMs} style={{ opacity: minimal && !on ? 0.85 : 1 }}>{tk.text}</span>;
        if (mode === "underline") return <span key={tk.fromMs} style={{ textDecoration: `underline ${accent} 8px`, textUnderlineOffset: 10 }}>{tk.text}</span>;
        if (mode === "pop") return <span key={tk.fromMs} style={{ color: accent, display: "inline-block", scale: "1.12", WebkitTextStroke: "2px #111" }}>{tk.text}</span>;
        return <span key={tk.fromMs} style={{ backgroundColor: accent, borderRadius: 14, padding: "0 10px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", textShadow: "none" }}>{tk.text}</span>;
      })}
    </div>
  );
};

const EndCard: React.FC<{ p: ReelProProps; look: Look }> = ({ p, look }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = (d: number, damping = 12) => spring({ frame: frame - d * fps, fps, config: { damping } });
  const ink = look.endInk;
  const premium = p.plan.style === "premium";
  const ctaBg = premium ? "transparent" : p.plan.style === "expert" ? p.colors.accent : "#fff";
  const ctaInk = premium ? ink : p.plan.style === "expert" ? "#fff" : p.colors.accent;
  return (
    <AbsoluteFill style={{ background: look.endBg(p.colors), justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 36, padding: 90 }}>
      {p.logo && <Img src={staticFile(p.logo)} style={{ width: 240, maxHeight: 240, objectFit: "contain", scale: String(s(0, 10)), background: premium ? "transparent" : "rgba(255,255,255,0.95)", borderRadius: 28, padding: premium ? 0 : 18 }} />}
      <div style={{ fontFamily: look.head, fontWeight: look.headWeight, fontSize: 82, color: ink, textAlign: "center", lineHeight: 1.05, opacity: s(0.15, 20), translate: `0 ${(1 - s(0.15, 20)) * 30}px` }}>{p.businessName}</div>
      {p.plan.end_card.line && <div style={{ fontFamily: look.body, fontWeight: 500, fontSize: 44, color: ink, opacity: 0.88 * s(0.3, 20), textAlign: "center" }}>{p.plan.end_card.line}</div>}
      {p.plan.end_card.cta && (
        <div style={{ fontFamily: look.body, fontWeight: 800, fontSize: 50, color: ctaInk, background: ctaBg, border: premium ? `2px solid ${p.colors.second}` : "none", borderRadius: 999, padding: "22px 54px", scale: String(s(0.45, 9)), marginTop: 10 }}>{p.plan.end_card.cta}</div>
      )}
      {p.handle && <div style={{ fontFamily: look.body, fontWeight: 700, fontSize: 40, color: ink, opacity: 0.8 * s(0.6, 20) }}>@{p.handle}</div>}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- composition
export const ReelPro: React.FC<ReelProProps> = (p) => {
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const look = LOOKS[p.plan.style] ?? LOOKS.warm;
  const endStart = Math.round(p.durationSec * fps);
  const { pages } = useMemo(() => createTikTokStyleCaptions({ captions: p.captions, combineTokensWithinMilliseconds: 1100 }), [p.captions]);

  // scene lengths from voice timing; transitions overlap forward so each scene still starts on its line
  const starts = p.scenes.map((s) => Math.round(s.startSec * fps));
  const lens = starts.map((st, i) => Math.max(1, (i < starts.length - 1 ? starts[i + 1] : endStart) - st));
  const T = Math.max(1, Math.min(Math.round(0.5 * fps), ...lens.map((l) => Math.floor(l / 2))));
  const hookFrames = p.plan.hook ? Math.round(HOOK_SEC * fps) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Audio src={staticFile(p.audio)} />
      <Sequence durationInFrames={endStart}>
        <TransitionSeries>
          {p.scenes.map((s, i) => {
            const last = i === p.scenes.length - 1;
            const tName = p.plan.transitions[i] ?? "fade";
            return (
              <React.Fragment key={i}>
                <TransitionSeries.Sequence durationInFrames={lens[i] + (last ? 0 : T)}>
                  <Scene s={s} plan={p.plan.scenes[i] ?? { motion: "zoom_in", text_anim: "rise" }} len={lens[i] + (last ? 0 : T)} textDelay={i === 0 ? hookFrames : T + Math.round(0.1 * fps)} look={look} style={p.plan.style} colors={p.colors} />
                </TransitionSeries.Sequence>
                {!last && tName !== "cut" && (
                  <TransitionSeries.Transition presentation={presentation(tName, width, height, p.colors.accent)} timing={linearTiming({ durationInFrames: T })} />
                )}
                {!last && tName === "cut" && <TransitionSeries.Transition presentation={presentation("fade", width, height, p.colors.accent)} timing={linearTiming({ durationInFrames: 1 })} />}
              </React.Fragment>
            );
          })}
        </TransitionSeries>
      </Sequence>

      {hookFrames > 0 && <Sequence durationInFrames={hookFrames}><Hook text={p.plan.hook} look={look} style={p.plan.style} colors={p.colors} /></Sequence>}

      {pages.map((pg, i) => {
        const from = Math.round((pg.startMs / 1000) * fps);
        const next = pages[i + 1];
        const to = Math.min(endStart, next ? Math.round((next.startMs / 1000) * fps) : endStart);
        if (to <= from) return null;
        return <Sequence key={`c${i}`} from={from} durationInFrames={to - from}><CaptionPage page={pg} mode={p.plan.caption_style} look={look} accent={p.colors.accent} /></Sequence>;
      })}

      {look.progress && frame < endStart && (
        <div style={{ position: "absolute", top: 0, left: 0, height: 10, width: `${(frame / endStart) * 100}%`, background: p.colors.accent }} />
      )}
      {p.logo && frame < endStart && frame > hookFrames && (
        <Img src={staticFile(p.logo)} style={{ position: "absolute", right: 46, bottom: 56, width: 120, maxHeight: 120, objectFit: "contain", opacity: 0.92, background: "rgba(255,255,255,0.9)", borderRadius: 18, padding: 10 }} />
      )}

      <Sequence from={endStart} durationInFrames={Math.round(END_SEC * fps)}>
        <EndCard p={p} look={look} />
      </Sequence>
    </AbsoluteFill>
  );
};
