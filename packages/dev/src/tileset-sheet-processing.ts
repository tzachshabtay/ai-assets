import type {
  AiAssetDefinition,
  AiAssetDimensions
} from "@ai-game-assets/core";
import sharp from "sharp";

import { OPENAI_IMAGE_GENERATION_SIZES } from "./image-generation-sizes.js";
import type { GenerateAssetReference } from "./provider.js";
import type { RgbColor } from "./provider-image-processing.js";

// Every tile owns one region of the model canvas. Keeping a small, symmetric
// guard band inside each region makes the ownership boundary unambiguous while
// leaving most of the available pixels for the tile itself.
const TILESET_GENERATION_REGION_EDGE_GUARD = 1 / 16;

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

export type TilesetSheetUnusedSlot = TilesetSheetRect & {
  index: number;
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
  placementRegions: TilesetSheetUnusedSlot[];
  cells: TilesetSheetCell[];
  unusedSlots: TilesetSheetUnusedSlot[];
  generationColumns: number;
  generationRows: number;
  scale: number;
  /** Smallest blank band between a tile rectangle and a neighbor or canvas edge. */
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
  const canvas = parseImageGenerationSize(requestedSize);
  if (!canvas) {
    throw new Error(`Tileset generation size "${requestedSize}" must use WIDTHxHEIGHT pixels.`);
  }
  return selectTilesetGenerationPlan(asset, [canvas]);
}

export function planTilesetSheetGeneration(
  asset: AiAssetDefinition,
  requestedSize?: string
): TilesetSheetGenerationGeometry {
  if (requestedSize && requestedSize !== "auto") {
    return tilesetSheetGenerationGeometry(asset, requestedSize);
  }

  return selectTilesetGenerationPlan(asset, OPENAI_IMAGE_GENERATION_SIZES);
}

function selectTilesetGenerationPlan(
  asset: AiAssetDefinition,
  canvases: readonly AiAssetDimensions[]
): TilesetSheetGenerationGeometry {
  const { tileCount, tileset } = requireTilesetGenerationAsset(asset);
  let best: TilesetGenerationCandidate | undefined;

  for (const canvas of canvases) {
    for (let columns = 1; columns <= tileCount; columns += 1) {
      const rows = Math.ceil(tileCount / columns);
      if (columns > canvas.width || rows > canvas.height) continue;
      const geometry = buildTilesetSheetGenerationGeometry(asset, canvas, {
        columns,
        rows
      });
      const cell = geometry.cells[0]!;
      const unused = columns * rows - tileCount;
      const packedAspect =
        (columns * tileset.tileWidth) /
        (rows * tileset.tileHeight);
      const candidate: TilesetGenerationCandidate = {
        geometry,
        // Useful coverage is the fraction of model pixels owned by actual tiles.
        // It rewards a canvas whose aspect matches the temporary grid and
        // naturally penalizes empty packing slots and wasted canvas space.
        coverage:
          (tileCount * cell.width * cell.height) /
          (canvas.width * canvas.height),
        aspectDelta: Math.abs(
          Math.log(packedAspect / (canvas.width / canvas.height))
        ),
        unused,
        logicalColumnDelta: Math.abs(columns - tileset.columns)
      };

      if (!best || isBetterTilesetGenerationCandidate(candidate, best)) {
        best = candidate;
      }
    }
  }

  if (!best) {
    throw new Error(`Tileset "${asset.id}" cannot fit on an image generation canvas.`);
  }
  return best.geometry;
}

type TilesetGenerationCandidate = {
  geometry: TilesetSheetGenerationGeometry;
  coverage: number;
  aspectDelta: number;
  unused: number;
  logicalColumnDelta: number;
};

function isBetterTilesetGenerationCandidate(
  candidate: TilesetGenerationCandidate,
  current: TilesetGenerationCandidate
): boolean {
  const epsilon = 1e-12;
  if (Math.abs(candidate.coverage - current.coverage) > epsilon) {
    return candidate.coverage > current.coverage;
  }
  if (Math.abs(candidate.aspectDelta - current.aspectDelta) > epsilon) {
    return candidate.aspectDelta < current.aspectDelta;
  }
  if (candidate.unused !== current.unused) return candidate.unused < current.unused;
  if (candidate.geometry.scale !== current.geometry.scale) {
    return candidate.geometry.scale > current.geometry.scale;
  }
  if (candidate.logicalColumnDelta !== current.logicalColumnDelta) {
    return candidate.logicalColumnDelta < current.logicalColumnDelta;
  }
  const candidateArea = candidate.geometry.canvas.width * candidate.geometry.canvas.height;
  const currentArea = current.geometry.canvas.width * current.geometry.canvas.height;
  if (candidateArea !== currentArea) return candidateArea < currentArea;
  return candidate.geometry.generationColumns < current.geometry.generationColumns;
}

function buildTilesetSheetGenerationGeometry(
  asset: AiAssetDefinition,
  canvas: AiAssetDimensions,
  packing: { columns: number; rows: number }
): TilesetSheetGenerationGeometry {
  const { logical, tileset, capacity, tileCount } =
    requireTilesetGenerationAsset(asset);

  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  // The generation grid is intentionally independent of the final sheet grid.
  // Canvas, packing, ownership regions, and crop rectangles are planned as one
  // coordinate system. The final logical order is restored during composition.
  const minimumRegionWidth = Math.floor(canvas.width / packing.columns);
  const minimumRegionHeight = Math.floor(canvas.height / packing.rows);
  const usableRegionWidth = Math.max(
    1,
    Math.floor(minimumRegionWidth * (1 - 2 * TILESET_GENERATION_REGION_EDGE_GUARD))
  );
  const usableRegionHeight = Math.max(
    1,
    Math.floor(minimumRegionHeight * (1 - 2 * TILESET_GENERATION_REGION_EDGE_GUARD))
  );
  const maximumScale = Math.min(
    usableRegionWidth / tileset.tileWidth,
    usableRegionHeight / tileset.tileHeight
  );
  if (!Number.isFinite(maximumScale) || maximumScale <= 0) {
    throw new Error(
      `Tileset "${asset.id}" cannot fit in a ${packing.columns}x${packing.rows} ` +
      `grid on a ${canvas.width}x${canvas.height} generation canvas.`
    );
  }

  const scale = maximumScale >= 1 ? Math.floor(maximumScale) : maximumScale;
  const cellWidth = Math.max(1, Math.floor(tileset.tileWidth * scale));
  const cellHeight = Math.max(1, Math.floor(tileset.tileHeight * scale));
  const logicalCells = Array.from({ length: capacity }, (_, index) => {
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

    return logicalRect;
  });
  const placementRegions = Array.from(
    { length: packing.columns * packing.rows },
    (_, index) => {
      const column = index % packing.columns;
      const row = Math.floor(index / packing.columns);
      return {
        index,
        ...tilesetGenerationRegion(canvas, packing, column, row)
      };
    }
  );
  const slots = placementRegions.map((region) => {
    return {
      index: region.index,
      x: region.x + Math.floor((region.width - cellWidth) / 2),
      y: region.y + Math.floor((region.height - cellHeight) / 2),
      width: cellWidth,
      height: cellHeight
    };
  });
  const sheetLeft = Math.min(...slots.map((slot) => slot.x));
  const sheetTop = Math.min(...slots.map((slot) => slot.y));
  const sheetRight = Math.max(...slots.map((slot) => slot.x + slot.width));
  const sheetBottom = Math.max(...slots.map((slot) => slot.y + slot.height));
  const sheet = {
    x: sheetLeft,
    y: sheetTop,
    width: sheetRight - sheetLeft,
    height: sheetBottom - sheetTop
  };
  const gutter = tilesetGenerationMinimumGutter(
    slots,
    packing.columns,
    packing.rows,
    canvas
  );
  const cells = slots.slice(0, tileCount).map((slot, index) => ({
    ...slot,
    usable: true,
    logical: logicalCells[index]!
  }));
  const unusedSlots = slots.slice(tileCount);

  return {
    canvas,
    logical,
    sheet,
    placementRegions,
    cells,
    unusedSlots,
    generationColumns: packing.columns,
    generationRows: packing.rows,
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

function requireTilesetGenerationAsset(asset: AiAssetDefinition): {
  logical: AiAssetDimensions;
  tileset: NonNullable<AiAssetDefinition["tileset"]>;
  capacity: number;
  tileCount: number;
} {
  if (asset.kind !== "tileset" || !asset.tileset || !asset.dimensions) {
    throw new Error(`AI asset "${asset.id}" is not a dimensioned tileset.`);
  }
  const capacity = asset.tileset.columns * asset.tileset.rows;
  const tileCount = Math.min(asset.tileset.tileCount ?? capacity, capacity);
  if (tileCount <= 0) {
    throw new Error("A tileset generation layout requires at least one usable tile.");
  }
  return {
    logical: asset.dimensions,
    tileset: asset.tileset,
    capacity,
    tileCount
  };
}

function tilesetGenerationRegion(
  canvas: AiAssetDimensions,
  packing: { columns: number; rows: number },
  column: number,
  row: number
): TilesetSheetRect {
  const left = Math.floor((column / packing.columns) * canvas.width);
  const top = Math.floor((row / packing.rows) * canvas.height);
  const right = Math.floor(((column + 1) / packing.columns) * canvas.width);
  const bottom = Math.floor(((row + 1) / packing.rows) * canvas.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function tilesetGenerationMinimumGutter(
  slots: TilesetSheetUnusedSlot[],
  columns: number,
  rows: number,
  canvas: AiAssetDimensions
): number {
  const gaps = [
    ...slots.map((slot) => slot.x),
    ...slots.map((slot) => canvas.width - slot.x - slot.width),
    ...slots.map((slot) => slot.y),
    ...slots.map((slot) => canvas.height - slot.y - slot.height)
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const current = slots[row * columns + column]!;
      const next = slots[row * columns + column + 1]!;
      gaps.push(next.x - current.x - current.width);
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const current = slots[row * columns + column]!;
      const next = slots[(row + 1) * columns + column]!;
      gaps.push(next.y - current.y - current.height);
    }
  }

  const positiveGaps = gaps.filter((gap) => gap > 0);
  return positiveGaps.length > 0 ? Math.max(1, Math.min(...positiveGaps)) : 0;
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
  const aspectDelta = Math.abs(Math.log(
    (actualCanvas.width / actualCanvas.height) /
    (geometry.canvas.width / geometry.canvas.height)
  ));
  if (aspectDelta > 1e-3) {
    throw new Error(
      `Generated tileset raster is ${actualCanvas.width}x${actualCanvas.height}, ` +
      `which does not match the planned ${geometry.canvas.width}x${geometry.canvas.height} ` +
      "canvas aspect ratio. Refusing to stretch tile ownership regions."
    );
  }
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
