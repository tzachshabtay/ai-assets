import type { AiAssetDimensions } from "@ai-game-assets/core";

export type ImageGenerationSize = AiAssetDimensions & {
  value: string;
};

export const OPENAI_IMAGE_GENERATION_SIZES: readonly ImageGenerationSize[] = [
  { value: "1024x1024", width: 1024, height: 1024 },
  { value: "1536x1024", width: 1536, height: 1024 },
  { value: "1024x1536", width: 1024, height: 1536 }
];

export function closestImageGenerationSize(dimensions: AiAssetDimensions): string {
  const targetRatio = dimensions.width / dimensions.height;

  return OPENAI_IMAGE_GENERATION_SIZES
    .map((size) => ({
      ...size,
      distance: Math.abs(Math.log(targetRatio / (size.width / size.height)))
    }))
    .sort((left, right) => left.distance - right.distance)[0]!.value;
}
