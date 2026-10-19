/*
 * Âge des cellules vivantes : nombre de générations depuis leur naissance.
 * Une cellule qui naît, ou qui est posée ou dessinée, a l'âge 1 ; une survivante gagne 1.
 * Les âges sont un Map clé "x,y" → âge, aligné sur le Set des cellules. Aucune entrée n'est modifiée.
 */
(function (root) {
  'use strict';

  // Bornes hautes incluses des tranches de couleur : 1 | 2-3 | 4-10 | 11-50 | plus de 50
  const AGE_BUCKET_LIMITS = [1, 3, 10, 50];
  const AGE_BUCKET_COUNT = AGE_BUCKET_LIMITS.length + 1;

  function checkSet(value, name) {
    if (!(value instanceof Set)) throw new TypeError('nextAges : ' + name + ' doit être un Set de clés "x,y"');
  }

  // Âges au compteur 0 (ou après une édition) : toutes les cellules ont l'âge 1
  function initialAges(cells) {
    checkSet(cells, 'cells');
    const ages = new Map();
    for (const k of cells) ages.set(k, 1);
    return ages;
  }

  // Âges de la génération suivante : naissance → 1, survie → âge précédent + 1
  function nextAges(prevCells, prevAges, nextCells) {
    checkSet(prevCells, 'prevCells');
    checkSet(nextCells, 'nextCells');
    if (!(prevAges instanceof Map)) throw new TypeError('nextAges : prevAges doit être un Map clé → âge');
    const ages = new Map();
    for (const k of nextCells) {
      ages.set(k, prevCells.has(k) ? (prevAges.get(k) || 1) + 1 : 1);
    }
    return ages;
  }

  // Indice de tranche (0 à 4) d'un âge
  function ageBucket(age) {
    for (let i = 0; i < AGE_BUCKET_LIMITS.length; i++) {
      if (age <= AGE_BUCKET_LIMITS[i]) return i;
    }
    return AGE_BUCKET_LIMITS.length;
  }

  const api = {
    AGE_BUCKET_LIMITS: AGE_BUCKET_LIMITS,
    AGE_BUCKET_COUNT: AGE_BUCKET_COUNT,
    initialAges: initialAges,
    nextAges: nextAges,
    ageBucket: ageBucket,
  };

  root.Life = root.Life || {};
  root.Life.ages = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
