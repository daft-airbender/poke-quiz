import { Router } from 'express';
import { listModes } from '../quiz/modes/index.js';
import { GENERATIONS } from '../quiz/pokemon.js';

// The mode catalog: what the screens need to list modes (What to learn, Free Play) and explain them.
export function quizRouter() {
  const router = Router();

  router.get('/modes', (req, res) => {
    res.json({ modes: listModes(), generations: GENERATIONS });
  });

  return router;
}
