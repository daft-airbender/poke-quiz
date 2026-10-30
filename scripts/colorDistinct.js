// "Are these two colors visually distinct?" for theme palettes, in OKLCH (perceptual lightness, chroma, hue).
// Used by scripts/build-palettes.js to pick each Pokémon's two colors, and by the tests to check all of them.
//   Two colorful colors: hues at least MIN_HUE_DEGREES apart (red and orange: yes; red and dark red: no).
//   A colorful and a neutral color (white, cream, gray, black): clearly different lightness or colorfulness.
//   Two neutrals: far apart in lightness (white and black: yes; two grays: no).

export const MIN_HUE_DEGREES = 25;
const NEUTRAL_CHROMA = 0.05; // below this, hue isn't really visible
const MIN_LIGHTNESS_GAP_NEUTRALS = 0.3;
const MIN_LIGHTNESS_GAP_MIXED = 0.15;
const MIN_CHROMA_GAP_MIXED = 0.08;

const toRgb = (color) => (typeof color === 'string' ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) : color);

// sRGB ([r, g, b] 0-255 or '#rrggbb') -> { L (0-1), C, h (degrees) }.
export function oklch(color) {
  const [r, g, b] = toRgb(color).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

export const isNeutral = (color) => oklch(color).C < NEUTRAL_CHROMA;

export function hueGap(a, b) {
  const gap = Math.abs(oklch(a).h - oklch(b).h);
  return Math.min(gap, 360 - gap);
}

export function distinctColors(a, b) {
  const [x, y] = [oklch(a), oklch(b)];
  const neutralX = x.C < NEUTRAL_CHROMA;
  const neutralY = y.C < NEUTRAL_CHROMA;
  if (neutralX && neutralY) return Math.abs(x.L - y.L) >= MIN_LIGHTNESS_GAP_NEUTRALS;
  if (neutralX || neutralY) return Math.abs(x.L - y.L) >= MIN_LIGHTNESS_GAP_MIXED || Math.abs(x.C - y.C) >= MIN_CHROMA_GAP_MIXED;
  return hueGap(a, b) >= MIN_HUE_DEGREES;
}
