/*
 * Détection d'une extinction, d'un état stable ou d'un oscillateur.
 * Chaque génération est comparée aux PERIOD_MAX précédentes : d'abord par empreinte,
 * puis, en cas d'égalité, par comparaison exacte des ensembles. Une collision
 * d'empreintes ne peut donc jamais produire de faux positif.
 * Limite : un motif qui émet des vaisseaux ne revient jamais à un état identique
 * et n'est jamais détecté.
 */
(function (root) {
  'use strict';

  // Période maximale détectée, en générations
  const PERIOD_MAX = 30;

  // Empreinte indépendante de l'ordre : taille, somme et ou exclusif des hachages FNV-1a des clés
  function fingerprint(cells) {
    let sum = 0;
    let xor = 0;
    for (const k of cells) {
      let h = 0x811c9dc5;
      for (let i = 0; i < k.length; i++) {
        h ^= k.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      sum = (sum + (h >>> 0)) >>> 0;
      xor = (xor ^ h) >>> 0;
    }
    return cells.size + ':' + sum + ':' + xor;
  }

  function sameCells(a, b) {
    if (a.size !== b.size) return false;
    for (const k of a) if (!b.has(k)) return false;
    return true;
  }

  /*
   * Tampon des PERIOD_MAX derniers états. observe(cells) renvoie null ou
   * { kind: 'extinct' | 'stable' | 'oscillator', period }, puis mémorise l'état.
   * options.fingerprint remplace la fonction d'empreinte (tests).
   */
  function createDetector(options) {
    const opts = options || {};
    const periodMax = opts.periodMax === undefined ? PERIOD_MAX : opts.periodMax;
    const hash = opts.fingerprint || fingerprint;
    let entries = [];

    function remember(fp, cells) {
      entries.push({ fp: fp, cells: cells });
      if (entries.length > periodMax) entries.shift();
    }

    // Mémorise un état sans rien détecter (état de départ)
    function push(cells) {
      remember(hash(cells), cells);
    }

    function observe(cells) {
      const fp = hash(cells);
      let found = null;
      if (cells.size === 0) {
        found = { kind: 'extinct', period: 0 };
      } else {
        // Plus petite période d'abord ; l'égalité d'empreinte est confirmée par comparaison exacte
        for (let p = 1; p <= entries.length; p++) {
          const e = entries[entries.length - p];
          if (e.fp === fp && sameCells(e.cells, cells)) {
            found = p === 1 ? { kind: 'stable', period: 1 } : { kind: 'oscillator', period: p };
            break;
          }
        }
      }
      remember(fp, cells);
      return found;
    }

    return {
      push: push,
      observe: observe,
      reset: function () { entries = []; },
      size: function () { return entries.length; },
    };
  }

  // Texte du message, par exemple « Oscillateur de période 3 à la génération 12 » (milliers séparés)
  function describe(result, generation) {
    const where = ' à la génération ' + String(generation).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    if (result.kind === 'extinct') return 'Population éteinte' + where;
    if (result.kind === 'stable') return 'État stable' + where;
    return 'Oscillateur de période ' + result.period + where;
  }

  const api = {
    PERIOD_MAX: PERIOD_MAX,
    fingerprint: fingerprint,
    sameCells: sameCells,
    createDetector: createDetector,
    describe: describe,
  };

  root.Life = root.Life || {};
  root.Life.detection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
