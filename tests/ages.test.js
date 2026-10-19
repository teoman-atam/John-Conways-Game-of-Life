/*
 * Tests des âges des cellules et de leurs tranches de couleur.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const ages = (root.Life && root.Life.ages) || require('../src/ages.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  // Fait avancer cellules et âges de k générations
  function evolve(cells, k) {
    let c = cells;
    let a = ages.initialAges(c);
    for (let i = 0; i < k; i++) {
      const next = engine.nextGeneration(c);
      a = ages.nextAges(c, a, next);
      c = next;
    }
    return { cells: c, ages: a };
  }

  suite('Âges des cellules', function () {
    test('au compteur 0, toutes les cellules ont l\'âge 1', function () {
      const a = ages.initialAges(patterns.cells('gosper-gun'));
      assert.equal(a.size, 36);
      for (const v of a.values()) assert.equal(v, 1);
    });

    test('une naissance donne l\'âge 1, une survie ajoute 1', function () {
      const prev = new Set(['0,0', '1,0', '2,0']);
      const prevAges = new Map([['0,0', 4], ['1,0', 7], ['2,0', 2]]);
      const next = engine.nextGeneration(prev); // (1,-1) et (1,1) naissent, (1,0) survit
      const a = ages.nextAges(prev, prevAges, next);
      assert.deepEqual(Array.from(a.entries()).sort(), [['1,-1', 1], ['1,0', 8], ['1,1', 1]]);
    });

    test('un bloc après k générations a toutes ses cellules à l\'âge 1 + k', function () {
      for (const k of [1, 5, 37]) {
        const r = evolve(patterns.cells('block'), k);
        assert.equal(r.ages.size, 4);
        for (const v of r.ages.values()) assert.equal(v, 1 + k, 'k = ' + k);
      }
    });

    test('clignotant : la cellule centrale vieillit, les extrémités reviennent à 1', function () {
      const start = patterns.cells('blinker', -1, 0); // (-1,0) (0,0) (1,0)
      for (const k of [1, 2, 3, 10]) {
        const r = evolve(start, k);
        assert.equal(r.ages.get('0,0'), 1 + k, 'centre après ' + k + ' générations');
        for (const [key, age] of r.ages) if (key !== '0,0') assert.equal(age, 1, key + ' après ' + k);
      }
    });

    test('aucune entrée n\'est modifiée', function () {
      const prev = patterns.cells('glider');
      const prevAges = ages.initialAges(prev);
      const next = engine.nextGeneration(prev);
      const snap = [Array.from(prev), Array.from(prevAges.entries()), Array.from(next)];
      const out = ages.nextAges(prev, prevAges, next);
      assert.deepEqual([Array.from(prev), Array.from(prevAges.entries()), Array.from(next)], snap);
      assert.ok(out !== prevAges, 'nouveau Map');
      assert.equal(out.size, next.size, 'aligné sur les cellules suivantes');
    });

    test('entrées invalides refusées', function () {
      assert.throws(function () { ages.nextAges([], new Map(), new Set()); }, /prevCells/);
      assert.throws(function () { ages.nextAges(new Set(), {}, new Set()); }, /prevAges/);
      assert.throws(function () { ages.initialAges(null); }, /Set/);
    });
  });

  suite('Âges — tranches de couleur', function () {
    test('bornes exactes : 1 | 2-3 | 4-10 | 11-50 | plus de 50', function () {
      const expected = [[1, 0], [2, 1], [3, 1], [4, 2], [10, 2], [11, 3], [50, 3], [51, 4], [100000, 4]];
      for (const e of expected) assert.equal(ages.ageBucket(e[0]), e[1], 'âge ' + e[0]);
      assert.equal(ages.AGE_BUCKET_COUNT, 5);
    });
  });
})(globalThis);
