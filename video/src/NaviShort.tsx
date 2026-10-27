import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/fonts";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";

// Brand tokens (brand/brand-profile.md -> design-and-templates)
export const NAVY = "#14213D";
export const COBALT = "#315BFF";
export const ORANGE = "#FF8A3D";
const FONT = "Poppins";

for (const w of ["500", "700", "800"]) {
  loadFont({ family: FONT, url: staticFile(`fonts/poppins-latin-${w}-normal.woff2`), weight: w });
}

export type Beat = { startSec: number; text: string };

export type NaviShortProps = {
  postId: string;
  sceneImage: string; // path inside public/
  audio: string; // path inside public/
  durationSec: number;
  headline: string;
  cta: string;
  beats: Beat[];
  captions: Caption[];
  producer: string;
  seriesLabel: string;
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        height: 10,
        backgroundColor: COBALT,
        width: `${interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: "clamp" })}%`,
      }}
    />
  );
};

const Header: React.FC<{ seriesLabel: string; producer: string }> = ({ seriesLabel, producer }) => (
  <div
    style={{
      position: "absolute",
      top: 70,
      left: 80,
      right: 80,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}
  >
    <div
      style={{
        backgroundColor: COBALT,
        color: "white",
        fontWeight: 700,
        fontSize: 36,
        padding: "10px 26px",
        borderRadius: 999,
        letterSpacing: 1,
      }}
    >
      {seriesLabel}
    </div>
    <div style={{ color: NAVY, fontWeight: 700, fontSize: 30, opacity: 0.85 }}>{producer}</div>
  </div>
);

const BeatText: React.FC<{ text: string; isHook: boolean }> = ({ text, isHook }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        left: 80,
        right: 80,
        textAlign: "center",
        color: NAVY,
        fontWeight: 800,
        fontSize: isHook ? 92 : 84,
        lineHeight: 1.08,
        textTransform: isHook ? "uppercase" : "none",
        opacity: interpolate(frame, [0, 0.35 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        translate: interpolate(frame, [0, 0.45 * fps], ["0px 40px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        }),
      }}
    >
      {text}
      <div
        style={{
          margin: "22px auto 0",
          height: 10,
          borderRadius: 6,
          backgroundColor: ORANGE,
          width: interpolate(frame, [0.2 * fps, 0.8 * fps], [0, 180], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
        }}
      />
    </div>
  );
};

const Scene: React.FC<{ src: string; beats: Beat[] }> = ({ src, beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  // visual change every beat: alternate gentle push-in focal points
  const idx = Math.max(0, beats.findIndex((b, i) => t >= b.startSec && (i === beats.length - 1 || t < beats[i + 1].startSec)));
  const origins = ["50% 52%", "42% 50%", "58% 50%", "50% 45%", "46% 56%", "54% 48%", "50% 50%"];
  return (
    <AbsoluteFill>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transformOrigin: origins[idx % origins.length],
          scale: interpolate(frame, [0, durationInFrames], [1.0, 1.12], { extrapolateRight: "clamp" }),
        }}
      />
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 300,
        left: 80,
        right: 80,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.94)",
          borderRadius: 28,
          padding: "18px 32px",
          boxShadow: "0 8px 30px rgba(20,33,61,0.12)",
          textAlign: "center",
          fontSize: 60,
          fontWeight: 800,
          lineHeight: 1.2,
          color: NAVY,
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((tok) => {
          const active = tok.fromMs <= nowMs && tok.toMs > nowMs;
          return (
            <span key={tok.fromMs} style={{ color: active ? ORANGE : NAVY }}>
              {tok.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Captions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const { fps } = useVideoConfig();
  const SWITCH_MS = 1300;
  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: SWITCH_MS }),
    [captions],
  );
  return (
    <AbsoluteFill>
      {pages.map((page, i) => {
        const next = pages[i + 1] ?? null;
        const from = Math.round((page.startMs / 1000) * fps);
        const end = Math.round(Math.min(next ? (next.startMs / 1000) * fps : Infinity, from + (SWITCH_MS / 1000) * fps + fps));
        if (end - from <= 0) return null;
        return (
          <Sequence key={i} from={from} durationInFrames={end - from} layout="none">
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CtaCard: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "absolute", bottom: 470, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          backgroundColor: ORANGE,
          color: "white",
          fontWeight: 800,
          fontSize: 58,
          padding: "20px 48px",
          borderRadius: 999,
          scale: interpolate(frame, [0, 0.4 * fps], [0.6, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 12 }),
            output: "perceptual-scale",
          }),
        }}
      >
        {cta}
      </div>
    </div>
  );
};

export const NaviShort: React.FC<NaviShortProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const beats = props.beats;
  const ctaFrom = Math.max(0, durationInFrames - Math.round(3.2 * fps));
  return (
    <AbsoluteFill style={{ backgroundColor: "white", fontFamily: FONT }}>
      <Scene src={props.sceneImage} beats={beats} />
      {beats.map((b, i) => {
        const from = Math.round(b.startSec * fps);
        const to = i < beats.length - 1 ? Math.round(beats[i + 1].startSec * fps) : durationInFrames;
        if (to - from <= 0) return null;
        return (
          <Sequence key={i} from={from} durationInFrames={to - from} layout="none">
            <BeatText text={i === 0 ? props.headline : b.text} isHook={i === 0} />
          </Sequence>
        );
      })}
      <Captions captions={props.captions} />
      <Sequence from={ctaFrom} layout="none">
        <CtaCard cta={props.cta} />
      </Sequence>
      <Header seriesLabel={props.seriesLabel} producer={props.producer} />
      <ProgressBar />
      <Audio src={staticFile(props.audio)} />
    </AbsoluteFill>
  );
};
