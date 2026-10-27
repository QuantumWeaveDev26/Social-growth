import { CalculateMetadataFunction, Composition } from "remotion";
import { NaviShort, NaviShortProps } from "./NaviShort";
import { BrandMintShort, BrandMintProps } from "./BrandMintShort";
import { ReelShort, ReelShortProps } from "./ReelShort";

const FPS = 30;

const calculateMetadata: CalculateMetadataFunction<NaviShortProps> = ({ props }) => {
  return { durationInFrames: Math.ceil((props.durationSec + 0.8) * FPS) };
};

const defaultProps: NaviShortProps = {
  postId: "E000",
  sceneImage: "posts/E000/scene_9x16.png",
  audio: "posts/E000/voice.mp3",
  durationSec: 10,
  headline: "AI. NOW WHAT?",
  cta: "Try one task",
  beats: [{ startSec: 0, text: "AI. NOW WHAT?" }],
  captions: [],
  producer: "Quantum Weave",
  seriesLabel: "AI. NOW WHAT?",
};

const bmMetadata: CalculateMetadataFunction<BrandMintProps> = ({ props }) => {
  return { durationInFrames: Math.ceil((props.durationSec + 1.8) * FPS) };
};

const reelMetadata: CalculateMetadataFunction<ReelShortProps> = ({ props }) => ({ durationInFrames: Math.ceil((props.durationSec + 2) * FPS) });

export const MyComposition = () => {
  return (
    <>
    <Composition
      id="ReelShort"
      component={ReelShort}
      durationInFrames={900}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ audio: "job/voice.mp3", durationSec: 10, beats: [], captions: [], businessName: "Business", cover: "", accent: "#1F8A65", logo: null } as ReelShortProps}
      calculateMetadata={reelMetadata}
    />
    <Composition
      id="BrandMintShort"
      component={BrandMintShort}
      durationInFrames={1800}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ audio: "x.mp3", durationSec: 10, scenes: [{ startSec: 0, title: "MORE AI TOOLS?", kind: "endcard" }], captions: [], brandName: "BrandMint AI", endLine: "Better systems. Better growth." } as BrandMintProps}
      calculateMetadata={bmMetadata}
    />
    <Composition
      id="NaviShort"
      component={NaviShort}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
    </>
  );
};
