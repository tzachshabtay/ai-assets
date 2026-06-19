const squareAspect = 1;
const wideAspect = 4 / 3;

export function displayTargetId(
  viewportWidth = globalThis.innerWidth,
  viewportHeight = globalThis.innerHeight
): string | undefined {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const aspect = width / height;

  if (height > width && width <= 720) {
    return "mobilePortrait";
  }

  return isCloserToWide(aspect) ? "wide" : undefined;
}

function isCloserToWide(aspect: number): boolean {
  return Math.abs(aspect - wideAspect) < Math.abs(aspect - squareAspect);
}
