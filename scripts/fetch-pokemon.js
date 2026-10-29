// One-off: builds data/pokemon.json from PokéAPI. The app never calls PokéAPI at runtime.
//
//   npm run fetch:pokemon
//
// Responses are cached in .cache/pokeapi/ (gitignored), so re-running is fast and
// doesn't hit the API again. Delete that folder to force a fresh download.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Generation range to include (inclusive). Base forms only: no megas or regional forms.
const GEN_MIN = 1;
const GEN_MAX = 9;

// Be polite to PokéAPI: a few requests in flight at once, with a pause between each.
const CONCURRENCY = 4;
const DELAY_MS = 100;
const MAX_RETRIES = 3;

const API = 'https://pokeapi.co/api/v2';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(rootDir, '.cache/pokeapi');
const outFile = path.join(rootDir, 'data/pokemon.json');

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch a PokéAPI URL as JSON, reading from / writing to the local cache.
async function getJson(url) {
  const cacheFile = path.join(cacheDir, url.replace(API, '').replace(/[^a-z0-9]+/gi, '_') + '.json');
  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    // Not cached yet.
  }

  for (let attempt = 1; ; attempt++) {
    try {
      await sleep(DELAY_MS);
      const res = await fetch(url, { headers: { 'User-Agent': 'poke-quiz personal project' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await fs.writeFile(cacheFile, JSON.stringify(data));
      return data;
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw new Error(`Failed to fetch ${url}: ${err.message}`);
      await sleep(1000 * attempt);
    }
  }
}

// Run fn over items with at most `limit` calls in flight.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function idFromUrl(url) {
  return Number(url.match(/\/(\d+)\/?$/)[1]);
}

async function buildEntry(speciesId) {
  const species = await getJson(`${API}/pokemon-species/${speciesId}/`);
  const defaultVariety = species.varieties.find((v) => v.is_default);
  const pokemon = await getJson(defaultVariety.pokemon.url);

  // English display name, e.g. "Mr. Mime", "Farfetch’d" (not the slug).
  const name = species.names.find((n) => n.language.name === 'en')?.name ?? species.name;
  const generation = ROMAN[species.generation.name.replace('generation-', '')];
  const types = pokemon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
  const sprite =
    pokemon.sprites.front_default ?? pokemon.sprites.other?.['official-artwork']?.front_default ?? null;

  if (!sprite) console.warn(`  warning: no sprite for #${speciesId} ${name}`);
  return { id: species.id, name, types, generation, sprite };
}

async function main() {
  await fs.mkdir(cacheDir, { recursive: true });

  const speciesIds = [];
  for (let gen = GEN_MIN; gen <= GEN_MAX; gen++) {
    const generation = await getJson(`${API}/generation/${gen}/`);
    speciesIds.push(...generation.pokemon_species.map((s) => idFromUrl(s.url)));
  }
  speciesIds.sort((a, b) => a - b);
  console.log(`Fetching ${speciesIds.length} species (gens ${GEN_MIN}–${GEN_MAX})...`);

  const pokemon = await mapWithConcurrency(speciesIds, CONCURRENCY, async (id, i) => {
    const entry = await buildEntry(id);
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${speciesIds.length}`);
    return entry;
  });

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  // One Pokémon per line keeps the file readable and git diffs small.
  const body = pokemon.map((p) => '  ' + JSON.stringify(p)).join(',\n');
  await fs.writeFile(outFile, `[\n${body}\n]\n`);
  console.log(`Wrote ${pokemon.length} Pokémon to ${path.relative(rootDir, outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
