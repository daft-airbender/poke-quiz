import { Router } from 'express';
import data from '../../data/pokemon-palettes.json' with { type: 'json' };
import { ALL_POKEMON } from '../quiz/pokemon.js';

// Every Pokémon's name and palette (accent first), for the Theme setting's preview and for applying it.
// About 60 KB; built once at startup.
const THEMES = Object.fromEntries(ALL_POKEMON.map((p) => [p.id, { name: p.name, colors: data.palettes[p.id] }]));

export function themesRouter() {
  const router = Router();

  // { themes: { "257": { name: "Blaziken", colors: ["#bd4141", "#e4b056", "#9a8a70"] }, ... } }
  router.get('/themes', (req, res) => {
    res.json({ themes: THEMES });
  });

  return router;
}
