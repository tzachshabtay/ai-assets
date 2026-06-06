import type { AiAssetDefinition } from "@ai-game-assets/core";

export function aiAssetPlaceholderDataUrl(asset: AiAssetDefinition): string {
  const width = asset.frameGrid
    ? asset.frameGrid.frameWidth * asset.frameGrid.columns
    : asset.dimensions.width;
  const height = asset.frameGrid
    ? asset.frameGrid.frameHeight * asset.frameGrid.rows
    : asset.dimensions.height;
  const frameWidth = asset.frameGrid?.frameWidth ?? width;
  const frameHeight = asset.frameGrid?.frameHeight ?? height;
  const cells: string[] = [];

  if (asset.frameGrid) {
    const frameCount = asset.frameGrid.frameCount ?? asset.frameGrid.columns * asset.frameGrid.rows;

    for (let index = 0; index < frameCount; index += 1) {
      const column = index % asset.frameGrid.columns;
      const row = Math.floor(index / asset.frameGrid.columns);
      cells.push(placeholderCell(
        column * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
        index
      ));
    }
  } else {
    cells.push(placeholderCell(0, 0, width, height, 0));
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "<defs>",
    "<pattern id=\"grid\" width=\"8\" height=\"8\" patternUnits=\"userSpaceOnUse\">",
    "<path d=\"M8 0H0v8\" fill=\"none\" stroke=\"#334155\" stroke-width=\"1\" opacity=\".35\"/>",
    "</pattern>",
    "</defs>",
    `<rect width="${width}" height="${height}" rx="4" fill="#0f172a"/>`,
    `<rect width="${width}" height="${height}" fill="url(#grid)"/>`,
    cells.join(""),
    "</svg>"
  ].join("");

  return `data:image/svg+xml;base64,${base64Encode(svg)}`;
}

function placeholderCell(
  x: number,
  y: number,
  width: number,
  height: number,
  index: number
): string {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const pulse = 0.25 + (index % 4) * 0.15;

  return [
    `<rect x="${x + 1}" y="${y + 1}" width="${Math.max(1, width - 2)}" height="${Math.max(1, height - 2)}" rx="3" fill="#111827" stroke="#475569" stroke-width="1"/>`,
    `<circle cx="${cx}" cy="${cy - Math.max(5, height * 0.12)}" r="${Math.max(2, Math.min(width, height) * (0.1 + pulse * 0.04))}" fill="#38bdf8" opacity="${pulse}"/>`,
    `<text x="${cx}" y="${cy + Math.max(5, height * 0.18)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(5, Math.min(width / 5, height / 5, 12))}" fill="#e2e8f0">Loading...</text>`
  ].join("");
}

function base64Encode(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  const bufferConstructor = (globalThis as {
    Buffer?: { from(value: string, encoding: "utf8"): { toString(encoding: "base64"): string } };
  }).Buffer;

  if (!bufferConstructor) {
    throw new Error("AI asset placeholder generation requires btoa or Buffer.");
  }

  return bufferConstructor.from(value, "utf8").toString("base64");
}
