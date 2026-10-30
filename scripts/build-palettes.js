// Builds data/pokemon-palettes.json: the 1–3 main colors of every Pokémon, for the Theme setting.
// Downloads each sprite once (cached in .cache/sprites/), finds its dominant colors, groups shades of
// the same color together, and orders them for theming: the biggest *colorful* group first (the app's
// accent), then the rest by area.
//
// Usage: npm run build:palettes      (one-off, like fetch:pokemon; the output is committed)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(rootDir, '.cache/sprites');
const OUTPUT = path.join(rootDir, 'data/pokemon-palettes.json');

const CONCURRENCY = 4;
const DELAY_MS = 100;
const MAX_COLORS = 3;
// A color group must cover at least this share of the Pokémon to count as a main color.
const MIN_SHARE = 0.08;
// Shades of one color: hues within this many degrees and lightness within this much (0–1).
const SAME_HUE_DEGREES = 25;
const SAME_LIGHTNESS = 0.3;
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

// Whites, creams, grays and near-blacks: fine as extra colors, but not as the accent if anything else is colorful.
const isNeutral = ({ s, l }) => s < 0.25 || l > 0.82 || l < 0.12;

function sameColor(a, b) {
  const neutral = isNeutral(a);
  if (neutral !== isNeutral(b)) return false;
  const hueGap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  return (neutral || hueGap <= SAME_HUE_DEGREES) && Math.abs(a.l - b.l) <= SAME_LIGHTNESS;
}

const hex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

// Dominant colors of one sprite: [{ rgb, share }], most common first.
function dominantColors(png) {
  // Count opaque pixels in 32 levels per channel. Skip near-black: that's the sprite outline.
  const bins = new Map();
  let total = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = png.data.subarray(i, i + 4);
    if (a < 128 || Math.max(r, g, b) < 48) continue;
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

  return centers
    .map((rgb, c) => ({ rgb, share: clusters[c].count / total }))
    .sort((a, b) => b.share - a.share);
}

// Up to 3 main colors, accent first.
// Shades of one color (Squirtle's light and dark blue) are grouped and shown as the group's biggest shade.
// The accent is the biggest colorful group, so a mostly-cream Snorlax gets its blue-teal, not cream.
function palette(png) {
  const groups = [];
  for (const color of dominantColors(png)) {
    const props = hsl(color.rgb);
    const group = groups.find((g) => sameColor(g.props, props));
    if (group) group.share += color.share;
    else groups.push({ rgb: color.rgb, props, share: color.share });
  }
  groups.sort((a, b) => b.share - a.share);

  const main = groups.filter((g) => g.share >= MIN_SHARE);
  const colors = main.length ? main : groups.slice(0, 1);
  const accent = colors.find((g) => !isNeutral(g.props)) ?? colors[0];
  return [accent, ...colors.filter((g) => g !== accent)].slice(0, MAX_COLORS).map((g) => hex(g.rgb));
}

const palettes = {};
let done = 0;
const queue = [...pokemon];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      palettes[entry.id] = palette(PNG.sync.read(await spritePng(entry)));
      if (++done % 100 === 0) console.log(`${done} / ${pokemon.length}`);
    }
  }),
);

// One Pokémon per line, in Pokédex order, so diffs stay readable.
const lines = pokemon.map((p) => `    "${p.id}": ${JSON.stringify(palettes[p.id])}`);
const note = 'Generated by scripts/build-palettes.js from the front sprites. Accent color first.';
await writeFile(OUTPUT, `{\n  "_note": ${JSON.stringify(note)},\n  "palettes": {\n${lines.join(',\n')}\n  }\n}\n`);
console.log(`Wrote ${pokemon.length} palettes to ${path.relative(rootDir, OUTPUT)}`);
