import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  assertManifest,
  DEFAULT_IMAGE_MODEL,
  scaledVariantGeometry,
  scaledVariantFrameSize,
  scaledVariantSources,
  selectScaledVariant,
  type AiAssetDimensions,
  type AiAssetScaledVariant,
  type AiAssetScaledSource,
} from "@ai-game-assets/core";
import {
  readManifest,
  writeManifest,
  writeManifestModule,
  type AssetStoreOptions,
} from "./asset-store.js";
import { closestImageGenerationSize } from "./image-generation-sizes.js";

/** An image enlargement provider. AI editing may refine details and transparency. */
export type AiAssetUpscaleProvider = {
  upscale(input: {
    image: Uint8Array;
    width: number;
    height: number;
    signal?: AbortSignal;
  }): Promise<Uint8Array>;
};
export type ScaledVariantRequest = {
  assetId: string;
  versionName: string;
  sourceFile: string;
  id?: string;
  expectedFile?: string;
  action: "generate" | "touch-up" | "delete";
  width?: number;
  height?: number;
  method?: "nearest" | "resample" | "ai-upscale";
  dataUrl?: string;
};
export type ScaledVariantStoreOptions = AssetStoreOptions & {
  upscaleProvider?: AiAssetUpscaleProvider;
};

const transactions = new Map<string, Promise<unknown>>();
async function transaction<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = transactions.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(work);
  transactions.set(key, pending);
  try {
    return await pending;
  } finally {
    if (transactions.get(key) === pending) transactions.delete(key);
  }
}

function localFile(options: AssetStoreOptions, file: string): string {
  const prefix = (options.publicPathPrefix ?? "").replace(/^\/+|\/+$/g, "");
  const relative = file.replace(/^\/+/, "");
  if (
    /^[a-z][a-z\d+.-]*:/i.test(file) ||
    file.startsWith("//") ||
    (prefix && !relative.startsWith(prefix + "/"))
  )
    throw new Error("Scaled variant source must be a local asset file.");
  const root = path.resolve(options.assetsDir),
    resolved = path.resolve(
      root,
      prefix ? relative.slice(prefix.length + 1) : relative,
    );
  if (!resolved.startsWith(root + path.sep))
    throw new Error("Scaled variant source is outside the asset directory.");
  return resolved;
}

export async function saveScaledVariant(
  options: ScaledVariantStoreOptions,
  input: ScaledVariantRequest,
  signal?: AbortSignal,
) {
  const original = await readManifest(options.manifestPath);
  const asset = original.assets[input.assetId],
    version = asset?.versions[input.versionName];
  if (!asset || !version || version.file !== input.sourceFile)
    throw new Error(
      "The source version changed. Reopen Scaled variants and try again.",
    );
  if (!["image", "spritesheet", "animation", "tileset"].includes(asset.kind))
    throw new Error("Scaled variants require a graphical asset.");
  if (!["generate", "touch-up", "delete"].includes(input.action))
    throw new Error("Unknown scaled variant action.");
  const existing = input.id ? version.scaledVariants?.[input.id] : undefined;
  if (input.id && !existing)
    throw new Error("Scaled variant no longer exists.");
  if (existing && existing.file !== input.expectedFile)
    throw new Error("Scaled variant changed. Refresh before editing it.");
  if (input.action !== "generate" && !existing)
    throw new Error("Select a scaled variant first.");
  const base = scaledVariantSources(asset, version)[0]!;
  const geometryAsset = {
    ...asset,
    dimensions: base.dimensions,
    frameGrid: base.frameGrid,
    tileset: undefined,
  };
  let variant: AiAssetScaledVariant | undefined, image: Uint8Array | undefined;
  if (input.action !== "delete") {
    const geometry =
      input.action === "touch-up"
        ? { dimensions: existing!.dimensions, frameGrid: existing!.frameGrid }
        : scaledVariantGeometry(geometryAsset, {
            width: input.width!,
            height: input.height!,
          });
    if (input.action === "generate") {
      const duplicate = scaledVariantSources(geometryAsset, version).find(
        (candidate) =>
          (!input.id || candidate.id !== input.id) &&
          scaledVariantFrameSize(candidate).width === input.width &&
          scaledVariantFrameSize(candidate).height === input.height,
      );
      if (duplicate)
        throw new Error(
          "Scaled variant dimensions must be unique; that size already exists in this source version.",
        );
    }
    let method: AiAssetScaledVariant["method"] =
      input.action === "touch-up" ? "touch-up" : (input.method ?? "nearest");
    if (!["nearest", "resample", "ai-upscale", "touch-up"].includes(method))
      throw new Error("Unknown scaling method.");
    const source = selectScaledVariant(
      geometryAsset,
      { width: input.width ?? 1, height: input.height ?? 1 },
      { version, excludeId: input.id },
    )!;
    if (input.action === "touch-up") {
      if (!input.dataUrl?.startsWith("data:image/png;base64,"))
        throw new Error("Touch-up must supply a PNG image.");
      image = Buffer.from(
        input.dataUrl.slice("data:image/png;base64,".length),
        "base64",
      );
      const metadata = await sharp(image, {
        limitInputPixels: 33554432,
      }).metadata();
      if (
        metadata.width !== geometry.dimensions.width ||
        metadata.height !== geometry.dimensions.height
      )
        throw new Error("Touch-up dimensions must match the scaled variant.");
      image = await sharp(image).png().toBuffer();
    } else {
      const provider =
        options.upscaleProvider ??
        (process.env.OPENAI_API_KEY
          ? createOpenAiUpscaleProvider({
              apiKey: process.env.OPENAI_API_KEY,
            })
          : undefined);
      image = await resizeScaledSource(
        await readFile(localFile(options, source.file)),
        source,
        geometry,
        input.method ?? "nearest",
        provider,
        signal,
      );
      if (
        method === "ai-upscale" &&
        input.width! <=
          (source.frameGrid?.frameWidth ?? source.dimensions.width) &&
        input.height! <=
          (source.frameGrid?.frameHeight ?? source.dimensions.height)
      )
        method = "resample";
    }
    const id = input.id ?? randomUUID();
    const filename = `scaled-${id}-${randomUUID()}.png`;
    variant = {
      id,
      ...geometry,
      method,
      file: [options.publicPathPrefix?.replace(/\/$/, ""), filename]
        .filter(Boolean)
        .join("/"),
      sourceFile: input.action === "touch-up" ? existing!.file : source.file,
      createdAt: new Date().toISOString(),
    };
  }
  signal?.throwIfAborted();
  return transaction(path.resolve(options.manifestPath), async () => {
    const manifest = await readManifest(options.manifestPath),
      latest = manifest.assets[input.assetId]?.versions[input.versionName];
    if (
      !latest ||
      latest.file !== input.sourceFile ||
      JSON.stringify(manifest.assets[input.assetId]?.dimensions) !==
        JSON.stringify(asset.dimensions) ||
      JSON.stringify(latest.scaledVariants?.[input.id ?? ""]) !==
        JSON.stringify(existing)
    )
      throw new Error("Asset changed while processing. Refresh before saving.");
    const previous = structuredClone(manifest);
    latest.scaledVariantSource ??= {
      dimensions: base.dimensions,
      frameGrid: base.frameGrid,
    };
    latest.scaledVariants = { ...latest.scaledVariants };
    if (variant) latest.scaledVariants[variant.id] = variant;
    else delete latest.scaledVariants[input.id!];
    assertManifest(manifest);
    const filePath = variant ? localFile(options, variant.file) : undefined;
    let written = false;
    try {
      signal?.throwIfAborted();
      if (filePath && image) {
        await mkdir(options.assetsDir, { recursive: true });
        await writeFile(filePath, image, { flag: "wx" });
      }
      await writeManifest(options.manifestPath, manifest);
      written = true;
      if (options.manifestModulePath)
        await writeManifestModule(options.manifestModulePath, manifest);
    } catch (error) {
      if (written) await writeManifest(options.manifestPath, previous);
      if (filePath) await unlink(filePath).catch(() => {});
      throw error;
    }
    // Older files remain immutable: other target assets or variant provenance may refer to them.
    return { manifest, asset: manifest.assets[input.assetId]!, variant };
  });
}

export async function resizeScaledSource(
  image: Uint8Array,
  source: AiAssetScaledSource,
  target: {
    dimensions: AiAssetDimensions;
    frameGrid?: AiAssetScaledSource["frameGrid"];
  },
  method: "nearest" | "resample" | "ai-upscale",
  provider?: AiAssetUpscaleProvider,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const metadata = await sharp(image, {
    limitInputPixels: 33554432,
  }).metadata();
  if (
    metadata.width !== source.dimensions.width ||
    metadata.height !== source.dimensions.height
  )
    throw new Error("Source image dimensions do not match its manifest.");
  const sourceGrid = source.frameGrid,
    targetGrid = target.frameGrid;
  const width = targetGrid?.frameWidth ?? target.dimensions.width,
    height = targetGrid?.frameHeight ?? target.dimensions.height;
  const sourceWidth = sourceGrid?.frameWidth ?? source.dimensions.width,
    sourceHeight = sourceGrid?.frameHeight ?? source.dimensions.height;
  const upscale =
    method === "ai-upscale" && (width > sourceWidth || height > sourceHeight);
  if (upscale && !provider)
    throw new Error(
      "AI upscaling requires an upscaleProvider or OPENAI_API_KEY. Strict resizing works without an API key.",
    );
  const output = Buffer.alloc(
    target.dimensions.width * target.dimensions.height * 4,
  );
  const rows = sourceGrid?.rows ?? 1,
    columns = sourceGrid?.columns ?? 1;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      signal?.throwIfAborted();
      const frame = await sharp(image)
        .extract({
          left:
            (sourceGrid?.margin ?? 0) +
            column * (sourceWidth + (sourceGrid?.spacing ?? 0)),
          top:
            (sourceGrid?.margin ?? 0) +
            row * (sourceHeight + (sourceGrid?.spacing ?? 0)),
          width: sourceWidth,
          height: sourceHeight,
        })
        .ensureAlpha()
        .png()
        .toBuffer();
      const original = await sharp(frame).ensureAlpha().raw().toBuffer();
      let pixels: Buffer;
      if (
        upscale &&
        original.some((_byte, index) => index % 4 === 3 && original[index]! > 0)
      ) {
        const enhanced = await provider!.upscale({
          image: frame,
          width,
          height,
          signal,
        });
        pixels = await sharp(enhanced, { limitInputPixels: 33554432 })
          .resize(width, height, { fit: "fill", kernel: "nearest" })
          .ensureAlpha()
          .raw()
          .toBuffer();
        // Keep the returned alpha: imposing the low-resolution source mask can
        // clip refined edges and misalign transparency with the edited sprite.
      } else if (method === "nearest" || upscale) {
        pixels = Buffer.alloc(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const from =
              (Math.floor((y * sourceHeight) / height) * sourceWidth +
                Math.floor((x * sourceWidth) / width)) *
              4;
            original.copy(pixels, (y * width + x) * 4, from, from + 4);
          }
      } else
        pixels = await sharp(frame)
          .resize(width, height, { fit: "fill", kernel: "lanczos3" })
          .ensureAlpha()
          .raw()
          .toBuffer();
      // Copy cells without compositing: this also preserves semi-transparent RGB values exactly.
      for (let y = 0; y < height; y++)
        pixels.copy(
          output,
          ((row * height + y) * target.dimensions.width + column * width) * 4,
          y * width * 4,
          (y + 1) * width * 4,
        );
    }
  return sharp(output, { raw: { ...target.dimensions, channels: 4 } })
    .png()
    .toBuffer();
}

/** Uses the OpenAI Images edit endpoint with a fixed preservation prompt. */
export function createOpenAiUpscaleProvider(options: {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
} = {}): AiAssetUpscaleProvider {
  const request = options.fetch ?? fetch;
  return {
    async upscale({ image, width, height, signal }) {
      signal?.throwIfAborted();
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is required for AI scaled variants.");
      const model = options.model ?? DEFAULT_IMAGE_MODEL;
      const size = closestImageGenerationSize({ width, height }, model);
      const { data, info } = await sharp(image, { limitInputPixels: 33554432 })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const transparent = data.some((alpha, index) => index % 4 === 3 && alpha < 255);
      const form = new FormData();
      form.append("model", model);
      form.append("size", size);
      form.append("quality", "high");
      form.append("background", transparent ? "transparent" : "opaque");
      form.append("output_format", "png");
      form.append("n", "1");
      form.append("prompt", [
        `Upscale the attached ${info.width} by ${info.height} image for a game asset.`,
        `The final asset must be ${width} by ${height} pixels. Generate on the ${size} canvas; the result will be resized to the final dimensions afterward.`,
        "This is an image-preservation task, not a redesign. Only enlarge the existing image.",
        "Keep the original full-canvas composition, pose, silhouette, proportions, facial features, clothing, equipment, colors, highlights, shadows and art style.",
        "Preserve pixel-art structure when present. Do not smooth, sharpen, invent details, add or remove objects, move, crop, reframe or change lighting.",
        transparent
          ? "Preserve transparency and semi-transparent edges. Keep the background transparent; do not draw a checkerboard or a new background."
          : "Preserve the existing opaque background exactly.",
        "No text or watermark."
      ].join(" "));
      form.append("image", new Blob([Uint8Array.from(image)], { type: "image/png" }), "source.png");
      const deadline = AbortSignal.timeout(180000);
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      const response = await request("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: combined,
      });
      combined.throwIfAborted();
      if (!response.ok)
        throw new Error(`OpenAI scaled variant request failed (${response.status}).`);
      const result = await response.json() as { data?: { b64_json?: string }[] };
      combined.throwIfAborted();
      const encoded = result.data?.[0]?.b64_json;
      if (!encoded) throw new Error("OpenAI returned no image for the scaled variant.");
      return Buffer.from(encoded, "base64");
    },
  };
}
