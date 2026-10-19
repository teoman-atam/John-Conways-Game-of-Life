/*
 * Historique des générations pour le retour en arrière : tampon circulaire d'états
 * { cells, ages, generation }. Les Sets et Maps sont immuables par contrat : on stocke
 * des références, sans copie.
 */
(function (root) {
  'use strict';

  /*
   * HISTORY_MAX_GENERATIONS : nombre maximal d'états conservés, donc de retours possibles.
   * HISTORY_MAX_CELLS : somme maximale des cellules de tous les états conservés ; elle borne
   * la mémoire quand la population est grande. Au-delà de l'une ou l'autre limite, les états
   * les plus anciens sont retirés.
   */
  const HISTORY_MAX_GENERATIONS = 100;
  const HISTORY_MAX_CELLS = 2000000;

  function createHistory(options) {
    const opts = options || {};
    const capacity = opts.maxGenerations === undefined ? HISTORY_MAX_GENERATIONS : opts.maxGenerations;
    const maxCells = opts.maxCells === undefined ? HISTORY_MAX_CELLS : opts.maxCells;
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new TypeError('createHistory : maxGenerations doit être un entier ≥ 1');

    const buffer = new Array(capacity);
    let start = 0; // indice du plus ancien état
    let count = 0;
    let totalCells = 0;

    function at(i) {
      return buffer[(start + i) % capacity];
    }

    function dropOldest() {
      totalCells -= buffer[start].cells.size;
      buffer[start] = undefined;
      start = (start + 1) % capacity;
      count--;
    }

    function push(state) {
      if (!state || !(state.cells instanceof Set) || !(state.ages instanceof Map) || !Number.isSafeInteger(state.generation)) {
        throw new TypeError('history.push : état { cells: Set, ages: Map, generation: entier } attendu');
      }
      if (count === capacity) dropOldest();
      buffer[(start + count) % capacity] = state;
      count++;
      totalCells += state.cells.size;
      while (count > 0 && totalCells > maxCells) dropOldest();
    }

    // Retire et renvoie l'état le plus récent, ou null si l'historique est vide
    function pop() {
      if (count === 0) return null;
      const i = (start + count - 1) % capacity;
      const state = buffer[i];
      buffer[i] = undefined;
      count--;
      totalCells -= state.cells.size;
      return state;
    }

    function clear() {
      for (let i = 0; i < capacity; i++) buffer[i] = undefined;
      start = 0;
      count = 0;
      totalCells = 0;
    }

    // Les n états les plus récents, du plus ancien au plus récent
    function recent(n) {
      const k = Math.min(n, count);
      const out = [];
      for (let i = count - k; i < count; i++) out.push(at(i));
      return out;
    }

    return {
      push: push,
      pop: pop,
      clear: clear,
      recent: recent,
      size: function () { return count; },
      totalCells: function () { return totalCells; },
    };
  }

  const api = {
    HISTORY_MAX_GENERATIONS: HISTORY_MAX_GENERATIONS,
    HISTORY_MAX_CELLS: HISTORY_MAX_CELLS,
    createHistory: createHistory,
  };

  root.Life = root.Life || {};
  root.Life.history = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
