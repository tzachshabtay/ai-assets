import type {
  AiAssetDefinition,
  AiAssetDimensions
} from "@ai-game-assets/core";
import sharp from "sharp";

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
  logical: TilesetSheetRect;
};

export type TilesetSheetOuterPadding = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type TilesetSheetGenerationGeometry = {
  canvas: AiAssetDimensions;
  logical: AiAssetDimensions;
  sheet: TilesetSheetRect;
  cells: TilesetSheetCell[];
  scale: number;
  gutter: number;
  outerPadding: TilesetSheetOuterPadding;
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
  const tileset = asset.tileset;
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const capacity = tileset.columns * tileset.rows;
  const tileCount = Math.min(tileset.tileCount ?? capacity, capacity);
  // Give the model a substantial visual separation between adjacent tile slots.
  // These gutters exist only while generating; the final sheet is reconstructed
  // from the isolated cells, so spending a quarter tile on separation cannot
  // change the logical asset geometry.
  const gutterUnit = Math.max(
    1,
    Math.ceil(Math.min(tileset.tileWidth, tileset.tileHeight) / 4)
  );
  const paddedLayoutWidth =
    tileset.columns * tileset.tileWidth + (tileset.columns + 1) * gutterUnit;
  const paddedLayoutHeight =
    tileset.rows * tileset.tileHeight + (tileset.rows + 1) * gutterUnit;
  const maximumScale = Math.min(
    canvas.width / paddedLayoutWidth,
    canvas.height / paddedLayoutHeight
  );
  if (!Number.isFinite(maximumScale) || maximumScale <= 0) {
    throw new Error(`Tileset "${asset.id}" cannot fit on a ${requestedSize} generation canvas.`);
  }

  const scale = maximumScale >= 1 ? Math.floor(maximumScale) : maximumScale;
  const cellWidth = Math.max(1, Math.floor(tileset.tileWidth * scale));
  const cellHeight = Math.max(1, Math.floor(tileset.tileHeight * scale));
  const gutter = Math.max(1, Math.floor(gutterUnit * scale));
  const layoutWidth = tileset.columns * cellWidth + (tileset.columns - 1) * gutter;
  const layoutHeight = tileset.rows * cellHeight + (tileset.rows - 1) * gutter;

  if (layoutWidth > canvas.width || layoutHeight > canvas.height) {
    throw new Error(
      `Tileset "${asset.id}" has too many cells to isolate on a ${requestedSize} generation canvas.`
    );
  }

  const sheet = {
    x: Math.floor((canvas.width - layoutWidth) / 2),
    y: Math.floor((canvas.height - layoutHeight) / 2),
    width: layoutWidth,
    height: layoutHeight
  };
  const cells = Array.from({ length: capacity }, (_, index) => {
    const column = index % tileset.columns;
    const row = Math.floor(index / tileset.columns);
    const logicalX = margin + column * (tileset.tileWidth + spacing);
    const logicalY = margin + row * (tileset.tileHeight + spacing);
    const logicalRect = {
      x: logicalX,
      y: logicalY,
      width: tileset.tileWidth,
      height: tileset.tileHeight
    };

    if (
      logicalRect.x < 0 ||
      logicalRect.y < 0 ||
      logicalRect.x + logicalRect.width > logical.width ||
      logicalRect.y + logicalRect.height > logical.height
    ) {
      throw new Error(
        `Tileset "${asset.id}" cell ${index + 1} falls outside its logical canvas.`
      );
    }

    return {
      index,
      usable: index < tileCount,
      x: sheet.x + column * (cellWidth + gutter),
      y: sheet.y + row * (cellHeight + gutter),
      width: cellWidth,
      height: cellHeight,
      logical: logicalRect
    };
  });

  return {
    canvas,
    logical,
    sheet,
    cells,
    scale,
    gutter,
    outerPadding: {
      left: sheet.x,
      top: sheet.y,
      right: canvas.width - sheet.x - sheet.width,
      bottom: canvas.height - sheet.y - sheet.height
    },
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
  const normalizedReference = await sharp(Buffer.from(reference.image), { failOn: "error" })
    .resize(geometry.logical.width, geometry.logical.height, {
      fit: "fill",
      kernel: sharp.kernel.nearest
    })
    .png()
    .toBuffer();
  const cellOverlays = await Promise.all(
    geometry.cells.filter((cell) => cell.usable).map(async (cell) => ({
      input: await sharp(normalizedReference, { failOn: "error" })
        .extract({
          left: cell.logical.x,
          top: cell.logical.y,
          width: cell.logical.width,
          height: cell.logical.height
        })
        .resize(cell.width, cell.height, {
          fit: "fill",
          kernel: sharp.kernel.nearest
        })
        .flatten({ background })
        .png()
        .toBuffer(),
      left: cell.x,
      top: cell.y,
      blend: "over" as const
    }))
  );
  const image = await sharp({
    create: {
      width: geometry.canvas.width,
      height: geometry.canvas.height,
      channels: 4,
      background
    }
  })
    .composite(cellOverlays)
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
  const sourceImage = Buffer.from(image);
  const source = sharp(sourceImage, { failOn: "error" });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read generated tileset image dimensions.");
  }

  const outputBackground = padding
    ? {
        r: padding.color.red,
        g: padding.color.green,
        b: padding.color.blue,
        alpha: padding.transparent ? 0 : 1
      }
    : { r: 0, g: 0, b: 0, alpha: 0 };
  const actualCanvas = { width: metadata.width, height: metadata.height };
  const cellOverlays = await Promise.all(
    geometry.cells.filter((cell) => cell.usable).map(async (cell) => {
      const crop = scaleGenerationRect(cell, geometry.canvas, actualCanvas);
      return {
        input: await sharp(sourceImage, { failOn: "error" })
          .extract({
            left: crop.x,
            top: crop.y,
            width: crop.width,
            height: crop.height
          })
          .resize(cell.logical.width, cell.logical.height, {
            fit: "fill",
            kernel: sharp.kernel.nearest
          })
          .png()
          .toBuffer(),
        left: cell.logical.x,
        top: cell.logical.y,
        blend: "over" as const
      };
    })
  );
  const processed = sharp({
    create: {
      width: geometry.logical.width,
      height: geometry.logical.height,
      channels: 4,
      background: outputBackground
    }
  }).composite(cellOverlays);

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
