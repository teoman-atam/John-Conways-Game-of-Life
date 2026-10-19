/*
 * Tests du tampon circulaire d'historique.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const history = (root.Life && root.Life.history) || require('../src/history.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function state(generation, size) {
    const cells = new Set();
    const ages = new Map();
    for (let i = 0; i < size; i++) {
      cells.add(i + ',' + generation);
      ages.set(i + ',' + generation, 1);
    }
    return { cells: cells, ages: ages, generation: generation };
  }

  suite('Historique — tampon circulaire', function () {
    test('constantes documentées : 100 générations, 2 000 000 cellules', function () {
      assert.equal(history.HISTORY_MAX_GENERATIONS, 100);
      assert.equal(history.HISTORY_MAX_CELLS, 2000000);
    });

    test('dernier entré, premier sorti ; références stockées sans copie', function () {
      const h = history.createHistory();
      const a = state(0, 3);
      const b = state(1, 2);
      h.push(a);
      h.push(b);
      assert.equal(h.size(), 2);
      assert.equal(h.totalCells(), 5);
      assert.ok(h.pop() === b, 'même objet');
      assert.ok(h.pop() === a);
      assert.equal(h.pop(), null, 'vide');
      assert.equal(h.totalCells(), 0);
    });

    test('au-delà du nombre maximal de générations, les plus anciens sont retirés', function () {
      const h = history.createHistory({ maxGenerations: 3 });
      for (let g = 0; g < 7; g++) h.push(state(g, 1));
      assert.equal(h.size(), 3);
      assert.deepEqual(h.recent(10).map(function (s) { return s.generation; }), [4, 5, 6]);
      assert.equal(h.pop().generation, 6);
    });

    test('au-delà de HISTORY_MAX_CELLS, les états les plus anciens sont retirés', function () {
      const h = history.createHistory({ maxCells: 10 });
      h.push(state(0, 4));
      h.push(state(1, 4));
      assert.equal(h.size(), 2);
      h.push(state(2, 4)); // 12 cellules > 10 : l'état 0 part
      assert.equal(h.size(), 2);
      assert.equal(h.totalCells(), 8);
      assert.deepEqual(h.recent(5).map(function (s) { return s.generation; }), [1, 2]);
      h.push(state(3, 9)); // 9 + 4 > 10 puis 9 ≤ 10
      assert.deepEqual(h.recent(5).map(function (s) { return s.generation; }), [3]);
    });

    test('vidage et états récents dans l\'ordre chronologique', function () {
      const h = history.createHistory();
      for (let g = 0; g < 5; g++) h.push(state(g, 1));
      assert.deepEqual(h.recent(2).map(function (s) { return s.generation; }), [3, 4]);
      h.clear();
      assert.equal(h.size(), 0);
      assert.equal(h.pop(), null);
      assert.throws(function () { h.push({ cells: [], ages: new Map(), generation: 0 }); }, /état/);
    });
  });
})(globalThis);
