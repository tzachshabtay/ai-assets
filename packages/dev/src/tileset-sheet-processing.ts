import type {
  AiAssetDefinition,
  AiAssetDimensions
} from "@ai-game-assets/core";
import sharp, { type Sharp } from "sharp";

import type { GenerateAssetReference } from "./provider.js";
import type { RgbColor } from "./provider-image-processing.js";

export type TilesetSheetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TilesetSheetCell = TilesetSheetRect & {
  index: number;
  usable: boolean;
};

export type TilesetSheetGenerationGeometry = {
  canvas: AiAssetDimensions;
  logical: AiAssetDimensions;
  sheet: TilesetSheetRect;
  cells: TilesetSheetCell[];
  scale: number;
  size: string;
};

export type TilesetSheetOutputPadding = {
  color: RgbColor;
  transparent: boolean;
};

export function parseImageGenerationSize(size: string): AiAssetDimensions | undefined {
  const match = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    return undefined;
  }

  return { width, height };
}

export function tilesetSheetGenerationGeometry(
  asset: AiAssetDefinition,
  requestedSize: string
): TilesetSheetGenerationGeometry {
  if (asset.kind !== "tileset" || !asset.tileset || !asset.dimensions) {
    throw new Error(`AI asset "${asset.id}" is not a dimensioned tileset.`);
  }

  const canvas = parseImageGenerationSize(requestedSize);
  if (!canvas) {
    throw new Error(`Tileset generation size "${requestedSize}" must use WIDTHxHEIGHT pixels.`);
  }

  const logical = asset.dimensions;
  const maximumScale = Math.min(
    canvas.width / logical.width,
    canvas.height / logical.height
  );
  const scale = maximumScale >= 1 ? Math.floor(maximumScale) : maximumScale;
  const sheet = {
    x: 0,
    y: 0,
    width: Math.max(1, Math.min(canvas.width, Math.round(logical.width * scale))),
    height: Math.max(1, Math.min(canvas.height, Math.round(logical.height * scale)))
  };
  sheet.x = Math.floor((canvas.width - sheet.width) / 2);
  sheet.y = Math.floor((canvas.height - sheet.height) / 2);

  const tileset = asset.tileset;
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const capacity = tileset.columns * tileset.rows;
  const tileCount = Math.min(tileset.tileCount ?? capacity, capacity);
  const cells = Array.from({ length: capacity }, (_, index) => {
    const column = index % tileset.columns;
    const row = Math.floor(index / tileset.columns);
    const logicalX = margin + column * (tileset.tileWidth + spacing);
    const logicalY = margin + row * (tileset.tileHeight + spacing);
    const left = scaleLogicalCoordinate(logicalX, logical.width, sheet.x, sheet.width);
    const top = scaleLogicalCoordinate(logicalY, logical.height, sheet.y, sheet.height);
    const right = scaleLogicalCoordinate(
      logicalX + tileset.tileWidth,
      logical.width,
      sheet.x,
      sheet.width
    );
    const bottom = scaleLogicalCoordinate(
      logicalY + tileset.tileHeight,
      logical.height,
      sheet.y,
      sheet.height
    );

    return {
      index,
      usable: index < tileCount,
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  });

  return {
    canvas,
    logical,
    sheet,
    cells,
    scale,
    size: `${canvas.width}x${canvas.height}`
  };
}

export async function stageTilesetSheetReference(
  reference: GenerateAssetReference,
  geometry: TilesetSheetGenerationGeometry,
  chromaKey: RgbColor
): Promise<GenerateAssetReference> {
  const background = {
    r: chromaKey.red,
    g: chromaKey.green,
    b: chromaKey.blue,
    alpha: 1
  };
  const sheet = await sharp(Buffer.from(reference.image), { failOn: "error" })
    .resize(geometry.sheet.width, geometry.sheet.height, {
      fit: "fill",
      kernel: sharp.kernel.nearest
    })
    .flatten({ background })
    .png()
    .toBuffer();
  const image = await sharp({
    create: {
      width: geometry.canvas.width,
      height: geometry.canvas.height,
      channels: 4,
      background
    }
  })
    .composite([{
      input: sheet,
      left: geometry.sheet.x,
      top: geometry.sheet.y,
      blend: "over"
    }])
    .png()
    .toBuffer();

  return {
    image,
    mimeType: "image/png",
    fileName: `${reference.fileName.replace(/\.[^.]+$/, "") || "tileset-reference"}.staged.png`
  };
}

export async function cropTilesetSheetFromGeneration(
  image: Uint8Array,
  geometry: TilesetSheetGenerationGeometry,
  outputFormat: "png" | "webp" | "jpeg",
  padding?: TilesetSheetOutputPadding
): Promise<Buffer> {
  const source = sharp(Buffer.from(image), { failOn: "error" });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read generated tileset image dimensions.");
  }

  const crop = scaleGenerationRect(
    geometry.sheet,
    geometry.canvas,
    { width: metadata.width, height: metadata.height }
  );
  const resized = source
    .extract({
      left: crop.x,
      top: crop.y,
      width: crop.width,
      height: crop.height
    })
    .resize(geometry.logical.width, geometry.logical.height, {
      fit: "fill",
      kernel: sharp.kernel.nearest
    });
  const processed = padding
    ? await enforceLogicalTilesetPadding(resized, geometry, padding)
    : resized;

  if (outputFormat === "webp") {
    return processed.webp({ quality: 100 }).toBuffer();
  }
  if (outputFormat === "jpeg") {
    return processed.jpeg({ quality: 95 }).toBuffer();
  }
  return processed.png().toBuffer();
}

export function tilesetSheetRectLabel(rect: TilesetSheetRect): string {
  return `x=${rect.x}-${rect.x + rect.width - 1}, y=${rect.y}-${rect.y + rect.height - 1}`;
}

function scaleLogicalCoordinate(
  value: number,
  logicalSize: number,
  sheetOrigin: number,
  sheetSize: number
): number {
  return sheetOrigin + Math.round((value / logicalSize) * sheetSize);
}

function scaleGenerationRect(
  rect: TilesetSheetRect,
  declaredCanvas: AiAssetDimensions,
  actualCanvas: AiAssetDimensions
): TilesetSheetRect {
  const left = clamp(
    Math.round((rect.x / declaredCanvas.width) * actualCanvas.width),
    0,
    actualCanvas.width - 1
  );
  const top = clamp(
    Math.round((rect.y / declaredCanvas.height) * actualCanvas.height),
    0,
    actualCanvas.height - 1
  );
  const right = clamp(
    Math.round(((rect.x + rect.width) / declaredCanvas.width) * actualCanvas.width),
    left + 1,
    actualCanvas.width
  );
  const bottom = clamp(
    Math.round(((rect.y + rect.height) / declaredCanvas.height) * actualCanvas.height),
    top + 1,
    actualCanvas.height
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

async function enforceLogicalTilesetPadding(
  image: Sharp,
  geometry: TilesetSheetGenerationGeometry,
  padding: TilesetSheetOutputPadding
): Promise<Sharp> {
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const usablePixels = new Uint8Array(info.width * info.height);

  for (const cell of geometry.cells) {
    if (!cell.usable) continue;

    const logicalRect = scaleGenerationRect(
      {
        x: cell.x - geometry.sheet.x,
        y: cell.y - geometry.sheet.y,
        width: cell.width,
        height: cell.height
      },
      { width: geometry.sheet.width, height: geometry.sheet.height },
      geometry.logical
    );
    for (let y = logicalRect.y; y < logicalRect.y + logicalRect.height; y += 1) {
      usablePixels.fill(
        1,
        y * info.width + logicalRect.x,
        y * info.width + logicalRect.x + logicalRect.width
      );
    }
  }

  for (let index = 0; index < usablePixels.length; index += 1) {
    if (usablePixels[index]) continue;
    const offset = index * 4;
    data[offset] = padding.color.red;
    data[offset + 1] = padding.color.green;
    data[offset + 2] = padding.color.blue;
    data[offset + 3] = padding.transparent ? 0 : 255;
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
