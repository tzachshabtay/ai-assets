import { DEFAULT_IMAGE_MODEL, type AiAssetDimensions } from "@ai-game-assets/core";

export type ImageGenerationSize = AiAssetDimensions & {
  value: string;
};

export type ImageGenerationGrid = {
  columns: number;
  rows: number;
};

export const GPT_IMAGE_2_SIZE_CONSTRAINTS = {
  multiple: 16,
  minimumPixels: 655_360,
  maximumPixels: 8_294_400,
  maximumEdge: 3_840,
  maximumAspectRatio: 3
} as const;

// Preserve the previous provider's baseline detail level for small assets. This
// is a quality/cost policy, not an API restriction.
const DEFAULT_IMAGE_GENERATION_MINIMUM_PIXELS = 1_048_576;

export function isGptImage2Model(model: string): boolean {
  return ["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].some(
    (family) => model === family || model.startsWith(`${family}-`)
  );
}

export function closestImageGenerationSize(
  dimensions: AiAssetDimensions,
  model = DEFAULT_IMAGE_MODEL,
  grid?: ImageGenerationGrid
): string {
  requirePositiveDimensions(dimensions);
  if (!isGptImage2Model(model)) return "auto";
  return closestImageGenerationDimensions(dimensions, model, grid).value;
}

export function closestImageGenerationDimensions(
  dimensions: AiAssetDimensions,
  model = DEFAULT_IMAGE_MODEL,
  grid?: ImageGenerationGrid
): ImageGenerationSize {
  requirePositiveDimensions(dimensions);

  if (!isGptImage2Model(model)) {
    throw new Error(
      `Custom image-generation dimensions are not available for model "${model}". ` +
      "Use the API's auto size or provide an explicit supported size."
    );
  }

  return closestGptImage2Dimensions(dimensions, grid) ??
    // A very large grid can be impossible to divide evenly within the API's
    // edge limit. In that unusual case, retain the requested aspect without
    // requiring exact grid divisibility.
    closestGptImage2Dimensions(dimensions)!;
}

export function isValidGptImage2GenerationDimensions(
  dimensions: AiAssetDimensions
): boolean {
  const {
    multiple,
    minimumPixels,
    maximumPixels,
    maximumEdge,
    maximumAspectRatio
  } = GPT_IMAGE_2_SIZE_CONSTRAINTS;
  const { width, height } = dimensions;
  const pixels = width * height;
  const aspectRatio = Math.max(width / height, height / width);

  return Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width % multiple === 0 &&
    height % multiple === 0 &&
    width <= maximumEdge &&
    height <= maximumEdge &&
    pixels >= minimumPixels &&
    pixels <= maximumPixels &&
    aspectRatio <= maximumAspectRatio;
}

function closestGptImage2Dimensions(
  dimensions: AiAssetDimensions,
  grid?: ImageGenerationGrid
): ImageGenerationSize | undefined {
  const {
    multiple,
    minimumPixels,
    maximumPixels,
    maximumEdge,
    maximumAspectRatio
  } = GPT_IMAGE_2_SIZE_CONSTRAINTS;
  const requestedRatio = dimensions.width / dimensions.height;
  const targetRatio = clamp(
    requestedRatio,
    1 / maximumAspectRatio,
    maximumAspectRatio
  );
  const targetPixels = clamp(
    dimensions.width * dimensions.height,
    Math.max(minimumPixels, DEFAULT_IMAGE_GENERATION_MINIMUM_PIXELS),
    maximumPixels
  );
  let idealWidth = Math.sqrt(targetPixels * targetRatio);
  let idealHeight = Math.sqrt(targetPixels / targetRatio);
  const edgeScale = Math.min(1, maximumEdge / Math.max(idealWidth, idealHeight));
  idealWidth *= edgeScale;
  idealHeight *= edgeScale;
  const idealPixels = idealWidth * idealHeight;

  const widthMultiple = grid
    ? leastCommonMultiple(multiple, positiveInteger(grid.columns))
    : multiple;
  const heightMultiple = grid
    ? leastCommonMultiple(multiple, positiveInteger(grid.rows))
    : multiple;
  let best: {
    size: ImageGenerationSize;
    score: number;
    aspectDelta: number;
    areaDelta: number;
  } | undefined;

  for (let width = widthMultiple; width <= maximumEdge; width += widthMultiple) {
    for (let height = heightMultiple; height <= maximumEdge; height += heightMultiple) {
      const candidate = { width, height };
      if (!isValidGptImage2GenerationDimensions(candidate)) continue;

      const aspectDelta = Math.abs(Math.log((width / height) / targetRatio));
      const areaDelta = Math.abs(Math.log((width * height) / idealPixels));
      const scaleDelta = areaDelta / 2;
      // Layout-sensitive game assets benefit most from preserving aspect ratio;
      // area remains a secondary signal so an exact-ratio canvas is not chosen
      // at a wildly different scale.
      const score = 4 * aspectDelta ** 2 + scaleDelta ** 2;
      const size = { width, height, value: `${width}x${height}` };
      const candidateResult = { size, score, aspectDelta, areaDelta };

      if (!best || isBetterCandidate(candidateResult, best)) {
        best = candidateResult;
      }
    }
  }

  return best?.size;
}

function isBetterCandidate(
  candidate: { score: number; aspectDelta: number; areaDelta: number; size: ImageGenerationSize },
  current: { score: number; aspectDelta: number; areaDelta: number; size: ImageGenerationSize }
): boolean {
  const epsilon = 1e-12;
  if (Math.abs(candidate.score - current.score) > epsilon) {
    return candidate.score < current.score;
  }
  if (Math.abs(candidate.aspectDelta - current.aspectDelta) > epsilon) {
    return candidate.aspectDelta < current.aspectDelta;
  }
  if (Math.abs(candidate.areaDelta - current.areaDelta) > epsilon) {
    return candidate.areaDelta < current.areaDelta;
  }
  return candidate.size.width * candidate.size.height <
    current.size.width * current.size.height;
}

function requirePositiveDimensions(dimensions: AiAssetDimensions): void {
  if (
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    throw new Error("Image generation dimensions must be positive numbers.");
  }
}

function positiveInteger(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function leastCommonMultiple(left: number, right: number): number {
  return Math.abs(left * right) / greatestCommonDivisor(left, right);
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
