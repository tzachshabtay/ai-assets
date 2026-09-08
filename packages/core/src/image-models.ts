/** The raster image model used when an asset does not pin its own model. */
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";

/** Image models offered by the asset designer. Explicit custom models remain supported. */
export const IMAGE_MODELS = [
  {
    id: DEFAULT_IMAGE_MODEL,
    label: "GPT Image 2.5 Flare",
    description: "Fast everyday image generation"
  },
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    description: "Precise image generation and editing"
  }
] as const;
