import type {
  AiAssetDefinition,
  AiAssetDimensions,
  AiAssetFrameGrid,
  AiAssetScaledVariant,
  AiAssetVersion,
} from "./types.js";

export function scaledVariantFrameSize(
  asset: Pick<AiAssetDefinition, "dimensions" | "frameGrid" | "tileset">,
): AiAssetDimensions {
  return asset.frameGrid
    ? { width: asset.frameGrid.frameWidth, height: asset.frameGrid.frameHeight }
    : asset.tileset
      ? { width: asset.tileset.tileWidth, height: asset.tileset.tileHeight }
      : (asset.dimensions ?? { width: 1, height: 1 });
}

/** Width/height are per frame (or tile), and whole-image dimensions for plain images. */
export function scaledVariantGeometry(
  asset: AiAssetDefinition,
  size: AiAssetDimensions,
): { dimensions: AiAssetDimensions; frameGrid?: AiAssetFrameGrid } {
  assertScaledSize(size);
  const grid =
    asset.frameGrid ??
    (asset.tileset
      ? {
          frameWidth: asset.tileset.tileWidth,
          frameHeight: asset.tileset.tileHeight,
          columns: asset.tileset.columns,
          rows: asset.tileset.rows,
          frameCount: asset.tileset.tileCount,
          margin: asset.tileset.margin,
          spacing: asset.tileset.spacing,
        }
      : undefined);
  if (!grid) return { dimensions: { ...size } };
  // Cells are resampled independently. Packing padding has no gameplay meaning.
  const frameGrid = {
    ...grid,
    frameWidth: size.width,
    frameHeight: size.height,
    margin: 0,
    spacing: 0,
  };
  const dimensions = {
    width: size.width * grid.columns,
    height: size.height * grid.rows,
  };
  assertScaledSize(dimensions);
  return { dimensions, frameGrid };
}

export function assertScaledSize(size: AiAssetDimensions): void {
  if (
    !size ||
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width < 1 ||
    size.height < 1 ||
    size.width > 8192 ||
    size.height > 8192 ||
    size.width * size.height > 33554432
  ) {
    throw new Error(
      "Scaled variants require positive integer dimensions up to 8192 per axis and 32 megapixels.",
    );
  }
}

/** Compare scale ratios, rather than absolute pixel differences; prefer the larger source on ties. */
export function scaledVariantDistance(
  source: AiAssetDimensions,
  target: AiAssetDimensions,
): number {
  return Math.max(
    Math.abs(Math.log2(source.width / target.width)),
    Math.abs(Math.log2(source.height / target.height)),
  );
}

export type AiAssetScaledSource = {
  id?: string;
  file: string;
  dimensions: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
};
export function scaledVariantSources(
  asset: AiAssetDefinition,
  version: AiAssetVersion = asset.versions[asset.activeVersion]!,
): AiAssetScaledSource[] {
  if (!version) return [];
  asset = version.scaledVariantSource
    ? { ...asset, ...version.scaledVariantSource, tileset: undefined }
    : asset;
  const frameGrid =
    asset.frameGrid ??
    (asset.tileset
      ? {
          frameWidth: asset.tileset.tileWidth,
          frameHeight: asset.tileset.tileHeight,
          columns: asset.tileset.columns,
          rows: asset.tileset.rows,
          frameCount: asset.tileset.tileCount,
          margin: asset.tileset.margin,
          spacing: asset.tileset.spacing,
        }
      : undefined);
  return [
    {
      file: version.file,
      dimensions: asset.dimensions ?? scaledVariantFrameSize(asset),
      frameGrid,
    },
    ...Object.values(version.scaledVariants ?? {}),
  ];
}

export function selectScaledVariant(
  asset: AiAssetDefinition,
  target: AiAssetDimensions,
  options: {
    version?: AiAssetVersion;
    excludeId?: string;
    available?: (source: AiAssetScaledSource) => boolean;
  } = {},
): AiAssetScaledSource | undefined {
  if (
    !Number.isFinite(target.width) ||
    !Number.isFinite(target.height) ||
    target.width <= 0 ||
    target.height <= 0
  )
    throw new Error("Display dimensions must be positive and finite.");
  return scaledVariantSources(asset, options.version)
    .filter(
      (source) =>
        (!options.excludeId || source.id !== options.excludeId) &&
        (options.available?.(source) ?? true),
    )
    .sort((a, b) => {
      const sa = scaledVariantFrameSize(a),
        sb = scaledVariantFrameSize(b);
      return (
        scaledVariantDistance(sa, target) - scaledVariantDistance(sb, target) ||
        sb.width * sb.height - sa.width * sa.height
      );
    })[0];
}

export function assertScaledVariants(
  asset: AiAssetDefinition,
  version: AiAssetVersion,
): void {
  const variants = version.scaledVariants;
  if (variants === undefined) return;
  if (
    !variants ||
    typeof variants !== "object" ||
    Array.isArray(variants) ||
    !["image", "spritesheet", "animation", "tileset"].includes(asset.kind)
  )
    throw new Error(
      "Scaled variants require a graphical asset and a variant map.",
    );
  if (version.scaledVariantSource)
    asset = { ...asset, ...version.scaledVariantSource, tileset: undefined };
  const sizes = new Set<string>();
  for (const [id, variant] of Object.entries(variants) as Array<
    [string, AiAssetScaledVariant]
  >) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) || variant?.id !== id)
      throw new Error("Invalid scaled variant ID.");
    assertScaledSize(variant.dimensions);
    if (
      [variant.file, variant.sourceFile, variant.createdAt].some(
        (value) => typeof value !== "string" || !value,
      ) ||
      !["nearest", "resample", "ai-upscale", "touch-up"].includes(
        variant.method,
      )
    )
      throw new Error("Invalid scaled variant metadata.");
    const size = scaledVariantFrameSize(variant),
      expected = scaledVariantGeometry(asset, size);
    if (
      expected.dimensions.width !== variant.dimensions.width ||
      expected.dimensions.height !== variant.dimensions.height ||
      Boolean(expected.frameGrid) !== Boolean(variant.frameGrid)
    )
      throw new Error(
        "Scaled variant geometry must preserve its source frame grid.",
      );
    if (
      variant.frameGrid &&
      expected.frameGrid &&
      ["columns", "rows", "frameCount", "margin", "spacing"].some(
        (key) =>
          (variant.frameGrid as any)[key] !== (expected.frameGrid as any)[key],
      )
    )
      throw new Error("Scaled variant frame layout differs from its source.");
    const key = `${size.width}x${size.height}`;
    if (sizes.has(key))
      throw new Error(
        "Scaled variant dimensions must be unique within a source version.",
      );
    sizes.add(key);
  }
}
