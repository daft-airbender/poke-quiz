// Builds data/pokemon-palettes.json: exactly two visually distinct colors per Pokémon, for the Theme setting.
// Downloads each sprite once (cached in .cache/sprites/), finds its dominant colors and groups shades of the
// same color. The first color is the biggest *colorful* group (the app's accent); the second is the biggest
// group that's visually distinct from it (scripts/colorDistinct.js: no "two reds"). Nearly single-colored
// Pokémon fall back to a small detail or their outline for the second color.
//
// Usage: npm run build:palettes      (one-off, like fetch:pokemon; the output is committed)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { distinctColors, isNeutral as isNeutralColor, oklch } from './colorDistinct.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(rootDir, '.cache/sprites');
const OUTPUT = path.join(rootDir, 'data/pokemon-palettes.json');

const CONCURRENCY = 4;
const DELAY_MS = 100;
// A colorful group must cover at least this share of the Pokémon to be the accent.
const MIN_SHARE = 0.08;
// A detail must cover at least this share to be the second color (otherwise the outline is used).
const MIN_DETAIL_SHARE = 0.015;
// Choosing the accent (OKLCH). Near-whites (very light and barely colored: creams, pale bellies) and grays can be
// the second color but never lead (Snorlax leads with its blue-teal, not its cream belly). Among the rest, the
// biggest area wins, discounted (squared) for weak color, so a big pastel body (Squirtle's light blue) still beats a small
// vivid patch, and a vivid part beats a similar-sized grayish one (Mewtwo's purple over its gray shading).
const MIN_ACCENT_CHROMA = 0.045;
const NEAR_WHITE = { lightness: 0.88, chroma: 0.09 };
const FULL_COLOR_CHROMA = 0.1; // at or above this, no discount
// Shades of one color: hues within this many degrees and lightness within this much (0–1).
const SAME_HUE_DEGREES = 25;
const SAME_LIGHTNESS = 0.3;
const SAME_CHROMA = 0.06; // OKLCH chroma
// Colors closer than this (redmean RGB distance) are treated as the same color.
const MIN_DISTANCE = 70;

const pokemon = JSON.parse(await readFile(path.join(rootDir, 'data/pokemon.json'), 'utf8'));
await mkdir(CACHE_DIR, { recursive: true });

async function spritePng({ id, sprite }) {
  const file = path.join(CACHE_DIR, `${id}.png`);
  try {
    return await readFile(file);
  } catch {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(sprite);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        await writeFile(file, buffer);
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        return buffer;
      }
      if (attempt === 3) throw new Error(`${sprite}: HTTP ${res.status}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Perceptual-ish RGB distance ("redmean"), good enough for telling colors apart.
function distance([r1, g1, b1], [r2, g2, b2]) {
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

// Hue (0–360), saturation and lightness (0–1).
function hsl([r, g, b]) {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

// Whites, creams, grays and near-blacks (by perceptual chroma, so a pale pink still counts as a color):
// fine as the second color, but not as the accent if anything else is colorful.
const isNeutral = ({ rgb }) => isNeutralColor(rgb);

// Shades of one color: same kind (neutral or colorful), close hue and lightness, and similarly colorful,
// so a vivid part isn't swallowed by grayish shading of the same hue (Mewtwo's purple tail vs. its body).
function sameColor(a, b) {
  const neutral = isNeutral(a);
  if (neutral !== isNeutral(b)) return false;
  const hueGap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  const chromaGap = Math.abs(oklch(a.rgb).C - oklch(b.rgb).C);
  return (neutral || (hueGap <= SAME_HUE_DEGREES && chromaGap <= SAME_CHROMA)) && Math.abs(a.l - b.l) <= SAME_LIGHTNESS;
}

const hex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

// Dominant colors of one sprite: { colors: [{ rgb, share }] most common first, outline: rgb | null }.
function dominantColors(png) {
  // Count opaque pixels in 32 levels per channel. Near-black is the sprite outline: kept aside as a last resort.
  const bins = new Map();
  let total = 0;
  const outline = { sum: [0, 0, 0], count: 0 };
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = png.data.subarray(i, i + 4);
    if (a < 128) continue;
    if (Math.max(r, g, b) < 48) {
      outline.sum[0] += r;
      outline.sum[1] += g;
      outline.sum[2] += b;
      outline.count++;
      continue;
    }
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key) ?? { sum: [0, 0, 0], count: 0 };
    bin.sum[0] += r;
    bin.sum[1] += g;
    bin.sum[2] += b;
    bin.count++;
    bins.set(key, bin);
    total++;
  }
  const points = [...bins.values()].map((bin) => ({ rgb: bin.sum.map((c) => c / bin.count), count: bin.count }));
  points.sort((a, b) => b.count - a.count);

  // Seed clusters with the most common colors that are clearly different from each other,
  // then refine with a few rounds of (weighted) k-means.
  let centers = [];
  for (const point of points) {
    if (centers.every((center) => distance(center, point.rgb) >= MIN_DISTANCE)) centers.push(point.rgb);
    if (centers.length === 6) break;
  }
  let clusters = [];
  for (let round = 0; round < 6; round++) {
    clusters = centers.map(() => ({ sum: [0, 0, 0], count: 0 }));
    for (const point of points) {
      let best = 0;
      for (let c = 1; c < centers.length; c++) {
        if (distance(point.rgb, centers[c]) < distance(point.rgb, centers[best])) best = c;
      }
      for (let k = 0; k < 3; k++) clusters[best].sum[k] += point.rgb[k] * point.count;
      clusters[best].count += point.count;
    }
    centers = clusters.map((cluster, c) => (cluster.count ? cluster.sum.map((v) => v / cluster.count) : centers[c]));
  }

  return {
    colors: centers.map((rgb, c) => ({ rgb, share: clusters[c].count / total })).sort((a, b) => b.share - a.share),
    outline: outline.count ? outline.sum.map((v) => v / outline.count) : null,
    points: points.map((p) => ({ ...p, share: p.count / total })),
  };
}

// Exactly two visually distinct colors, accent first.
// Shades of one color (Squirtle's light and dark blue) are grouped and shown as the group's biggest shade.
// The accent is the biggest colorful group, so a mostly-cream Snorlax gets its blue-teal, not cream.
// Returns { colors: [accent, second], fallback: '' | 'outline' | 'synthetic' } (fallback is for the report).
function palette(png) {
  const { colors: dominant, outline, points } = dominantColors(png);
  const groups = [];
  for (const color of dominant) {
    const props = { ...hsl(color.rgb), rgb: color.rgb };
    const group = groups.find((g) => sameColor(g.props, props));
    if (group) group.share += color.share;
    else groups.push({ rgb: color.rgb, props, share: color.share });
  }
  groups.sort((a, b) => b.share - a.share);

  const main = groups.filter((g) => g.share >= MIN_SHARE);
  const canLead = (g) => {
    const { L, C } = oklch(g.rgb);
    return C >= MIN_ACCENT_CHROMA && !(L > NEAR_WHITE.lightness && C < NEAR_WHITE.chroma);
  };
  const score = (g) => g.share * Math.min(1, oklch(g.rgb).C / FULL_COLOR_CHROMA) ** 2;
  const best = (list) => list.filter(canLead).sort((a, b) => score(b) - score(a))[0];
  const accent = best(main) ?? best(groups) ?? main.find((g) => !isNeutral(g.props)) ?? groups[0];

  // The second color: of all the pixels visually distinct from the accent, the biggest color family
  // (hue band for colors, lightness band for neutrals). Small details count: Charmander's flame and belly,
  // Zapdos's beak. The family's average stays in the family, so it's still distinct from the accent.
  const families = new Map();
  for (const point of points) {
    if (!distinctColors(accent.rgb, point.rgb)) continue;
    const { L, C, h } = oklch(point.rgb);
    const key = C < 0.05 ? `n${Math.floor(L * 4)}` : `h${Math.floor(h / 30)}`;
    const family = families.get(key) ?? { sum: [0, 0, 0], count: 0, share: 0, best: point };
    for (let k = 0; k < 3; k++) family.sum[k] += point.rgb[k] * point.count;
    family.count += point.count;
    family.share += point.share;
    if (point.count > family.best.count) family.best = point;
    families.set(key, family);
  }
  const biggest = [...families.values()].sort((a, b) => b.count - a.count)[0];
  if (biggest && biggest.share >= MIN_DETAIL_SHARE) {
    const mean = biggest.sum.map((v) => v / biggest.count);
    return { colors: [hex(accent.rgb), hex(distinctColors(accent.rgb, mean) ? mean : biggest.best.rgb)], fallback: '' };
  }
  // ...else the outline, if it's distinct (a near-single-colored Pokémon)...
  if (outline && distinctColors(accent.rgb, outline)) return { colors: [hex(accent.rgb), hex(outline)], fallback: 'outline' };
  // ...else a neutral that contrasts with it: near-black for light accents, near-white for dark ones.
  const neutral = hsl(accent.rgb).l > 0.5 ? [40, 40, 44] : [240, 240, 236];
  return { colors: [hex(accent.rgb), hex(neutral)], fallback: 'synthetic' };
}

const palettes = {};
const fallbacks = { outline: [], synthetic: [] };
let done = 0;
const queue = [...pokemon];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      const { colors, fallback } = palette(PNG.sync.read(await spritePng(entry)));
      palettes[entry.id] = colors;
      if (fallback) fallbacks[fallback].push(entry.name);
      if (++done % 100 === 0) console.log(`${done} / ${pokemon.length}`);
    }
  }),
);

// One Pokémon per line, in Pokédex order, so diffs stay readable.
const lines = pokemon.map((p) => `    "${p.id}": ${JSON.stringify(palettes[p.id])}`);
const note = 'Generated by scripts/build-palettes.js from the front sprites. Two visually distinct colors each, accent first.';
await writeFile(OUTPUT, `{\n  "_note": ${JSON.stringify(note)},\n  "palettes": {\n${lines.join(',\n')}\n  }\n}\n`);
console.log(`Wrote ${pokemon.length} palettes to ${path.relative(rootDir, OUTPUT)}`);
console.log(`Second color from the outline (${fallbacks.outline.length}): ${fallbacks.outline.join(', ') || 'none'}`);
console.log(`Second color synthesized (${fallbacks.synthetic.length}): ${fallbacks.synthetic.join(', ') || 'none'}`);
