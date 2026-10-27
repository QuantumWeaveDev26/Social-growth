import React, { useMemo } from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/fonts";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";

const FONT = "Poppins";
[500, 700, 800].forEach((w) => loadFont({ family: FONT, url: staticFile(`fonts/poppins-latin-${w}-normal.woff2`), weight: String(w) }));

export type ReelBeat = { startSec: number; text: string; image: string };
export type ReelShortProps = {
  audio: string;
  durationSec: number;
  beats: ReelBeat[];
  captions: Caption[];
  businessName: string;
  cover: string;
  accent: string;
  logo: string | null;
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Scene: React.FC<{ beat: ReelBeat; accent: string; len: number }> = ({ beat, accent, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Img src={staticFile(beat.image)} style={{ width: "100%", height: "100%", objectFit: "cover", scale: interpolate(frame, [0, len], [1.03, 1.13], clamp) }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.6) 100%)" }} />
      {beat.text && (
        <div style={{ position: "absolute", top: 170, left: 80, right: 80, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              fontFamily: FONT, fontWeight: 800, fontSize: 70, lineHeight: 1.08, color: "white", textAlign: "center",
              backgroundColor: accent, padding: "22px 38px", borderRadius: 24,
              opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], clamp),
              translate: interpolate(frame, [0, 0.5 * fps], ["0px -36px", "0px 0px"], { ...clamp, easing: ease }),
            }}
          >
            {beat.text}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{ page: TikTokPage; accent: string }> = ({ page, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = page.startMs + (frame / fps) * 1000;
  return (
    <div style={{ position: "absolute", bottom: 330, left: 70, right: 70, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 64, lineHeight: 1.15, whiteSpace: "pre-wrap", textShadow: "0 4px 18px rgba(0,0,0,0.7)" }}>
      {page.tokens.map((tk) => (
        <span key={tk.fromMs} style={tk.fromMs <= t && tk.toMs > t ? { backgroundColor: accent, color: "white", borderRadius: 14, padding: "0 10px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", textShadow: "none" } : { color: "white" }}>{tk.text}</span>
      ))}
    </div>
  );
};

export const ReelShort: React.FC<ReelShortProps> = (p) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const { pages } = useMemo(() => createTikTokStyleCaptions({ captions: p.captions, combineTokensWithinMilliseconds: 1100 }), [p.captions]);
  const endStart = Math.round(p.durationSec * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1512" }}>
      <Audio src={staticFile(p.audio)} />
      {p.beats.map((b, i) => {
        const from = Math.round(b.startSec * fps);
        const to = i < p.beats.length - 1 ? Math.round(p.beats[i + 1].startSec * fps) : endStart;
        return (
          <Sequence key={i} from={from} durationInFrames={Math.max(1, to - from)}>
            <Scene beat={b} accent={p.accent} len={to - from} />
          </Sequence>
        );
      })}
      {pages.map((pg, i) => {
        const from = Math.round((pg.startMs / 1000) * fps);
        const next = pages[i + 1];
        const to = Math.min(endStart, next ? Math.round((next.startMs / 1000) * fps) : endStart);
        if (to <= from) return null;
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={to - from}>
            <CaptionPage page={pg} accent={p.accent} />
          </Sequence>
        );
      })}
      {p.logo && frame < endStart && (
        <Img src={staticFile(p.logo)} style={{ position: "absolute", right: 50, bottom: 60, width: 130, opacity: 0.92 }} />
      )}
      <Sequence from={endStart} durationInFrames={Math.max(1, durationInFrames - endStart)}>
        <AbsoluteFill style={{ backgroundColor: p.accent, justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 34, padding: 90 }}>
          {p.logo && <Img src={staticFile(p.logo)} style={{ width: 260 }} />}
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 84, color: "white", textAlign: "center", lineHeight: 1.05 }}>{p.businessName}</div>
          {p.cover && <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 46, color: "rgba(255,255,255,0.9)", textAlign: "center" }}>{p.cover}</div>}
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
