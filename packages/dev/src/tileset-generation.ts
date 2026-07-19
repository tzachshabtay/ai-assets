import { randomUUID } from "node:crypto";
import type {
  AiAssetDefinition,
  AiAssetFormat,
  AiAssetTileset
} from "@ai-game-assets/core";
import { PNG } from "pngjs";
import sharp from "sharp";

import type {
  AiImageProvider,
  GenerateAssetReference,
  GenerateAssetRequest,
  GeneratedAssetOption,
  GeneratedAssetOptionCallback
} from "./provider.js";

type TilesetLayout = {
  tileset: AiAssetTileset;
  tileCount: number;
  capacity: number;
};

export async function generateAssetWithIsolatedTilesetCells(
  provider: AiImageProvider,
  request: GenerateAssetRequest,
  onOption?: GeneratedAssetOptionCallback
): Promise<GeneratedAssetOption[]> {
  const layout = request.purpose === "tileset-animation"
    ? undefined
    : isolatedTilesetLayout(
        request.asset,
        request.settings?.format ?? request.asset.settings?.format
      );

  if (!layout) {
    return provider.generate(request, onOption);
  }

  const requestedCount = request.count ?? 1;
  if (!Number.isInteger(requestedCount) || requestedCount <= 0) {
    throw new Error("Tileset candidate count must be a positive integer.");
  }

  request.signal?.throwIfAborted();
  // Non-style references on a tileset request are defined by the provider as
  // base-sheet references. Crop the matching logical cell before handing a
  // one-cell asset to the provider; unrelated visual guidance belongs in
  // styleReferences and remains uncropped.
  const cellReferences = await Promise.all(
    Array.from({ length: layout.tileCount }, (_, tile) => Promise.all(
      (request.references ?? []).map((reference) => (
        extractTilesetCellReference(request.asset, reference, tile)
      ))
    ))
  );

  return Promise.all(Array.from({ length: requestedCount }, async (_, branchIndex) => {
    const branchSeed = `tileset-option-${branchIndex + 1}-${randomUUID()}`;
    const cells: GeneratedAssetOption[] = [];
    let styleAnchor: GenerateAssetReference | undefined;

    for (let tile = 0; tile < layout.tileCount; tile += 1) {
      request.signal?.throwIfAborted();
      const generated = await provider.generate({
        ...request,
        asset: tilesetCellAsset(request.asset, tile),
        prompt: isolatedTilePrompt(request.prompt, {
          tile,
          tileCount: layout.tileCount,
          branchIndex,
          branchCount: requestedCount,
          branchSeed
        }),
        count: 1,
        settings: internalCellGenerationSettings(request),
        references: cellReferences[tile],
        styleReferences: [
          ...(request.styleReferences ?? []),
          ...(styleAnchor ? [styleAnchor] : [])
        ]
      });
      const cell = generated[0];

      if (!cell) {
        throw new Error(
          `Tileset option ${branchIndex + 1} tile ${tile + 1} did not produce an image.`
        );
      }

      cells.push(cell);
      styleAnchor ??= {
        image: cell.image,
        mimeType: cell.mimeType,
        fileName: `style-anchor-${request.asset.id}-${branchIndex + 1}.${extensionFromMimeType(cell.mimeType)}`
      };
    }

    request.signal?.throwIfAborted();
    const option = await composeTilesetGeneratedOption(request.asset, cells, {
      prompt: request.prompt ?? request.asset.prompt,
      settings: request.settings
    });
    request.signal?.throwIfAborted();
    await onOption?.(option, branchIndex);
    return option;
  }));
}

export function tilesetCellAsset(
  asset: AiAssetDefinition,
  tile: number
): AiAssetDefinition {
  const layout = requireTilesetLayout(asset);
  const definition = layout.tileset.tiles?.[tile];

  if (!definition || tile < 0 || tile >= layout.tileCount) {
    throw new Error(`${asset.id} tile ${tile + 1} requires a prompt before it can be generated.`);
  }

  const { size: _size, ...assetSettings } = asset.settings ?? {};
  return {
    ...asset,
    dimensions: {
      width: layout.tileset.tileWidth,
      height: layout.tileset.tileHeight
    },
    tileset: {
      ...layout.tileset,
      columns: 1,
      rows: 1,
      tileCount: 1,
      margin: 0,
      spacing: 0,
      tiles: [definition],
      animations: undefined
    },
    settings: asset.settings ? assetSettings : undefined
  };
}

export async function extractTilesetCellReference(
  asset: AiAssetDefinition,
  reference: GenerateAssetReference,
  tile: number
): Promise<GenerateAssetReference> {
  return {
    image: await extractTilesetCellImage(asset, reference.image, tile),
    mimeType: "image/png",
    fileName: `${withoutExtension(reference.fileName)}.tile-${tile + 1}.png`
  };
}

export async function extractTilesetCellImage(
  asset: AiAssetDefinition,
  image: Uint8Array,
  tile: number
): Promise<Buffer> {
  const layout = requireTilesetLayout(asset);
  const bounds = tilesetCellBounds(asset, tile);
  const source = sharp(Buffer.from(image), { failOn: "error" });
  const metadata = await source.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read tileset reference dimensions for ${asset.id}.`);
  }

  const scaledLeft = Math.round((bounds.x / asset.dimensions!.width) * metadata.width);
  const scaledTop = Math.round((bounds.y / asset.dimensions!.height) * metadata.height);
  const left = Math.max(0, Math.min(metadata.width - 1, scaledLeft));
  const top = Math.max(0, Math.min(metadata.height - 1, scaledTop));
  const scaledRight = Math.round(
    ((bounds.x + bounds.width) / asset.dimensions!.width) * metadata.width
  );
  const scaledBottom = Math.round(
    ((bounds.y + bounds.height) / asset.dimensions!.height) * metadata.height
  );
  const right = Math.max(left + 1, Math.min(metadata.width, scaledRight));
  const bottom = Math.max(top + 1, Math.min(metadata.height, scaledBottom));
  const width = right - left;
  const height = bottom - top;

  return source
    .extract({ left, top, width, height })
    .resize(layout.tileset.tileWidth, layout.tileset.tileHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest
    })
    .png()
    .toBuffer();
}

export async function composeTilesetGeneratedOption(
  asset: AiAssetDefinition,
  cells: GeneratedAssetOption[],
  options: {
    prompt?: string;
    settings?: GenerateAssetRequest["settings"];
    baseImage?: Uint8Array;
  } = {}
): Promise<GeneratedAssetOption> {
  const layout = requireTilesetLayout(asset);

  if (cells.length !== layout.tileCount) {
    throw new Error(
      `${asset.id} requires exactly ${layout.tileCount} generated tile cells, received ${cells.length}.`
    );
  }

  const sheet = options.baseImage
    ? PNG.sync.read(await sharp(Buffer.from(options.baseImage), {
        failOn: "error"
      }).resize(asset.dimensions!.width, asset.dimensions!.height, {
        fit: "fill",
        kernel: sharp.kernel.nearest
      }).png().toBuffer())
    : new PNG({
        width: asset.dimensions!.width,
        height: asset.dimensions!.height
      });

  for (let tile = 0; tile < cells.length; tile += 1) {
    const normalizedCell = PNG.sync.read(await sharp(Buffer.from(cells[tile]!.image), {
      failOn: "error"
    }).resize(layout.tileset.tileWidth, layout.tileset.tileHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest
    }).png().toBuffer());
    const bounds = tilesetCellBounds(asset, tile);

    PNG.bitblt(
      normalizedCell,
      sheet,
      0,
      0,
      bounds.width,
      bounds.height,
      bounds.x,
      bounds.y
    );
  }

  const png = PNG.sync.write(sheet);
  const format = requestedRasterFormat(options.settings?.format ?? asset.settings?.format);
  const encoded = await encodeTilesetSheet(png, format);
  const template = cells[0]!;

  return {
    ...template,
    image: encoded.image,
    mimeType: encoded.mimeType,
    prompt: options.prompt ?? asset.prompt,
    revisedPrompt: undefined,
    dimensions: asset.dimensions,
    frameGrid: undefined,
    tileset: layout.tileset,
    animations: undefined,
    settings: {
      ...asset.settings,
      ...template.settings,
      ...options.settings,
      format
    }
  };
}

export function tilesetCellBounds(
  asset: AiAssetDefinition,
  tile: number
): { x: number; y: number; width: number; height: number } {
  const layout = requireTilesetLayout(asset);

  if (tile < 0 || tile >= layout.capacity) {
    throw new Error(`${asset.id} tile ${tile + 1} is outside its declared tileset grid.`);
  }

  const margin = layout.tileset.margin ?? 0;
  const spacing = layout.tileset.spacing ?? 0;
  const column = tile % layout.tileset.columns;
  const row = Math.floor(tile / layout.tileset.columns);

  return {
    x: margin + column * (layout.tileset.tileWidth + spacing),
    y: margin + row * (layout.tileset.tileHeight + spacing),
    width: layout.tileset.tileWidth,
    height: layout.tileset.tileHeight
  };
}

function isolatedTilesetLayout(
  asset: AiAssetDefinition,
  requestedFormat: AiAssetFormat | undefined
): TilesetLayout | undefined {
  if (asset.kind !== "tileset" || !asset.tileset || requestedFormat === "svg") {
    return undefined;
  }

  const layout = requireTilesetLayout(asset);
  if (layout.capacity <= 1 || layout.tileset.tiles?.length !== layout.tileCount) {
    return undefined;
  }

  return layout;
}

function requireTilesetLayout(asset: AiAssetDefinition): TilesetLayout {
  if (asset.kind !== "tileset" || !asset.tileset || !asset.dimensions) {
    throw new Error(`AI asset "${asset.id}" is not a dimensioned tileset.`);
  }

  const capacity = asset.tileset.columns * asset.tileset.rows;
  const tileCount = asset.tileset.tileCount ?? capacity;

  return { tileset: asset.tileset, tileCount, capacity };
}

function isolatedTilePrompt(
  originalPrompt: string | undefined,
  context: {
    tile: number;
    tileCount: number;
    branchIndex: number;
    branchCount: number;
    branchSeed: string;
  }
): string {
  return [
    originalPrompt?.trim(),
    `Generate only tile ${context.tile + 1} of ${context.tileCount} for candidate option ${context.branchIndex + 1} of ${context.branchCount}.`,
    `Shared visual-direction seed for every separately generated tile in this candidate: ${context.branchSeed}.`,
    baseTilesetBranchDirection(context.branchIndex),
    "The server will compose this one tile into the final sheet at its exact declared cell. Do not draw neighboring tiles, a sheet, a grid, gutters, labels, or alternate options."
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function baseTilesetBranchDirection(index: number): string {
  const directions = [
    "Candidate direction: use a cohesive palette nuance and material treatment shared by every tile in this option.",
    "Candidate direction: use a cohesive shape language and detail distribution shared by every tile in this option.",
    "Candidate direction: use a cohesive lighting, shading, and texture treatment shared by every tile in this option.",
    "Candidate direction: use a cohesive pixel treatment and silhouette character shared by every tile in this option."
  ];

  return directions[index % directions.length] as string;
}

function internalCellGenerationSettings(
  request: GenerateAssetRequest
): GenerateAssetRequest["settings"] {
  const { size: _requestSize, ...requestSettings } = request.settings ?? {};

  return {
    ...requestSettings,
    format: "png"
  };
}

function requestedRasterFormat(format: AiAssetFormat | undefined): "png" | "webp" | "jpg" {
  if (format === "webp" || format === "jpg") return format;

  return "png";
}

async function encodeTilesetSheet(
  png: Buffer,
  format: "png" | "webp" | "jpg"
): Promise<{ image: Buffer; mimeType: string }> {
  if (format === "webp") {
    return {
      image: await sharp(png).webp({ quality: 100 }).toBuffer(),
      mimeType: "image/webp"
    };
  }
  if (format === "jpg") {
    return {
      image: await sharp(png).flatten({ background: "#000000" }).jpeg({ quality: 95 }).toBuffer(),
      mimeType: "image/jpeg"
    };
  }

  return { image: png, mimeType: "image/png" };
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

function withoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "tileset-reference";
}
