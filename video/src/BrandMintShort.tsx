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
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";

// Provisional BrandMint AI tokens: #0B0F19 is the site's theme colour; mint accent is a placeholder until the brand kit is supplied.
const INK = "#0B0F19";
const MINT = "#2FD69B";
const SOFT = "#EAF7F1";
const FONT = "Poppins"; // loaded in NaviShort.tsx (shared bundle)

export type BMScene = {
  startSec: number;
  title: string;
  kind: "image" | "cards" | "flow" | "chips" | "endcard";
  image?: string;
  items?: string[];
  itemTimes?: number[]; // absolute seconds when each item appears
};

export type BrandMintProps = {
  audio: string;
  durationSec: number;
  scenes: BMScene[];
  captions: Caption[];
  brandName: string;
  endLine: string;
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Title: React.FC<{ text: string; dark: boolean }> = ({ text, dark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: 150, left: 80, right: 80, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          backgroundColor: dark ? "rgba(255,255,255,0.96)" : INK,
          color: dark ? INK : "white",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 66,
          lineHeight: 1.1,
          textAlign: "center",
          padding: "22px 36px",
          borderRadius: 26,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], clamp),
          translate: interpolate(frame, [0, 0.45 * fps], ["0px -30px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        {text}
      </div>
    </div>
  );
};

const PhotoBg: React.FC<{ src: string; blur?: number; dim?: number }> = ({ src, blur = 0, dim = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: blur ? `blur(${blur}px)` : undefined,
          scale: interpolate(frame, [0, durationInFrames], [1.02, 1.12], clamp),
        }}
      />
      {dim > 0 && <AbsoluteFill style={{ backgroundColor: `rgba(11,15,25,${dim})` }} />}
    </AbsoluteFill>
  );
};

const Pop: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f0 = at * fps;
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(frame, [f0, f0 + 0.25 * fps], [0, 1], clamp),
        scale: interpolate(frame, [f0, f0 + 0.45 * fps], [0.85, 1], { ...clamp, easing: Easing.spring({ damping: 14 }), output: "perceptual-scale" }),
      }}
    >
      {children}
    </div>
  );
};

const Cards: React.FC<{ scene: BMScene; sceneStart: number }> = ({ scene, sceneStart }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 36, flexDirection: "column", paddingTop: 120 }}>
    {(scene.items || []).map((t, i) => {
      const [label, status] = t.split("|");
      return (
        <Pop key={i} at={(scene.itemTimes?.[i] ?? sceneStart + i) - sceneStart}>
          <div
            style={{
              width: 820,
              backgroundColor: "white",
              borderRadius: 28,
              padding: "30px 40px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
              fontFamily: FONT,
            }}
          >
            <span style={{ fontSize: 50, fontWeight: 700, color: INK }}>{label}</span>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#C2410C", backgroundColor: "#FFEDD5", padding: "8px 20px", borderRadius: 999 }}>{status}</span>
          </div>
        </Pop>
      );
    })}
  </AbsoluteFill>
);

const Flow: React.FC<{ scene: BMScene; sceneStart: number }> = ({ scene, sceneStart }) => {
  const items = scene.items || [];
  return (
    <AbsoluteFill style={{ backgroundColor: SOFT, justifyContent: "center", alignItems: "center", flexDirection: "column", paddingTop: 140 }}>
      {items.map((t, i) => (
        <Pop key={i} at={(scene.itemTimes?.[i] ?? sceneStart + i * 1.5) - sceneStart} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {i > 0 && <div style={{ width: 8, height: 46, backgroundColor: MINT, borderRadius: 4 }} />}
          <div
            style={{
              width: 720,
              textAlign: "center",
              backgroundColor: i === items.length - 1 ? INK : "white",
              color: i === items.length - 1 ? "white" : INK,
              border: `5px solid ${INK}`,
              borderRadius: 26,
              padding: "24px 30px",
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 48,
            }}
          >
            {t}
          </div>
        </Pop>
      ))}
    </AbsoluteFill>
  );
};

const Chips: React.FC<{ scene: BMScene; sceneStart: number }> = ({ scene, sceneStart }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30, paddingTop: 60 }}>
    {(scene.items || []).map((t, i) => (
      <Pop key={i} at={(scene.itemTimes?.[i] ?? sceneStart + i * 1.2) - sceneStart}>
        <div style={{ backgroundColor: i === 1 ? MINT : "white", color: INK, fontFamily: FONT, fontWeight: 800, fontSize: 64, padding: "22px 56px", borderRadius: 999, boxShadow: "0 14px 40px rgba(0,0,0,0.25)" }}>
          {`${i + 1}. ${t}`}
        </div>
      </Pop>
    ))}
  </AbsoluteFill>
);

const EndCard: React.FC<{ brand: string; line: string }> = ({ brand, line }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: INK, justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 40, fontFamily: FONT }}>
      <div style={{ color: "white", fontWeight: 800, fontSize: 110, letterSpacing: 1, opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], clamp) }}>
        {brand.replace(" AI", "")}
        <span style={{ color: MINT }}> AI</span>
      </div>
      <div style={{ width: interpolate(frame, [0.2 * fps, 0.9 * fps], [0, 260], { ...clamp, easing: ease }), height: 10, backgroundColor: MINT, borderRadius: 6 }} />
      <div style={{ color: "white", fontWeight: 600, fontSize: 52, textAlign: "center", padding: "0 100px", opacity: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 1], clamp) }}>{line}</div>
      <div style={{ position: "absolute", bottom: 90, color: "rgba(255,255,255,0.45)", fontSize: 26, fontWeight: 500 }}>Logo placeholder · replace with official BrandMint AI asset</div>
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{ page: TikTokPage; light: boolean }> = ({ page, light }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  return (
    <div style={{ position: "absolute", bottom: 320, left: 80, right: 80, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          backgroundColor: light ? "rgba(255,255,255,0.95)" : "rgba(11,15,25,0.85)",
          borderRadius: 26,
          padding: "16px 30px",
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 56,
          fontWeight: 800,
          lineHeight: 1.2,
          color: light ? INK : "white",
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((tok) => (
          <span key={tok.fromMs} style={{ color: tok.fromMs <= nowMs && tok.toMs > nowMs ? MINT : undefined }}>
            {tok.text}
          </span>
        ))}
      </div>
    </div>
  );
};

export const BrandMintShort: React.FC<BrandMintProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const SWITCH_MS = 1300;
  const { pages } = useMemo(() => createTikTokStyleCaptions({ captions: props.captions, combineTokensWithinMilliseconds: SWITCH_MS }), [props.captions]);
  const sceneAt = (sec: number) => {
    let s = props.scenes[0];
    for (const sc of props.scenes) if (sec >= sc.startSec) s = sc;
    return s;
  };
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {props.scenes.map((sc, i) => {
        const from = Math.round(sc.startSec * fps);
        const to = i < props.scenes.length - 1 ? Math.round(props.scenes[i + 1].startSec * fps) : durationInFrames;
        if (to - from <= 0) return null;
        return (
          <Sequence key={i} from={from} durationInFrames={to - from} layout="none">
            <AbsoluteFill>
              {sc.kind === "image" && sc.image && <PhotoBg src={sc.image} />}
              {sc.kind === "cards" && sc.image && <PhotoBg src={sc.image} blur={14} dim={0.55} />}
              {sc.kind === "cards" && <Cards scene={sc} sceneStart={sc.startSec} />}
              {sc.kind === "flow" && <Flow scene={sc} sceneStart={sc.startSec} />}
              {sc.kind === "chips" && sc.image && <PhotoBg src={sc.image} blur={6} dim={0.35} />}
              {sc.kind === "chips" && <Chips scene={sc} sceneStart={sc.startSec} />}
              {sc.kind === "endcard" && <EndCard brand={props.brandName} line={props.endLine} />}
              {sc.kind !== "endcard" && <Title text={sc.title} dark={sc.kind !== "flow"} />}
            </AbsoluteFill>
          </Sequence>
        );
      })}
      {pages.map((page, i) => {
        const next = pages[i + 1] ?? null;
        const from = Math.round((page.startMs / 1000) * fps);
        const end = Math.round(Math.min(next ? (next.startMs / 1000) * fps : Infinity, from + (SWITCH_MS / 1000) * fps + fps));
        if (end - from <= 0) return null;
        const sc = sceneAt(page.startMs / 1000);
        if (sc.kind === "endcard") return null;
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={end - from} layout="none">
            <CaptionPage page={page} light={sc.kind === "flow"} />
          </Sequence>
        );
      })}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 10,
          backgroundColor: MINT,
          width: `${(100 * frame) / durationInFrames}%`,
        }}
      />
      <Audio src={staticFile(props.audio)} />
    </AbsoluteFill>
  );
};
