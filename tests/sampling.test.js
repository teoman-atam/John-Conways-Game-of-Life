/*
 * Tests de la série des populations et de sa réduction pour le graphique.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const sampling = (root.Life && root.Life.sampling) || require('../src/sampling.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  suite('Graphique — réduction et série', function () {
    test('série plus courte que la largeur : un point par tranche, inchangé', function () {
      const r = sampling.downsample([3, 1, 4], 100);
      assert.deepEqual(r, { min: [3, 1, 4], max: [3, 1, 4], count: 3 });
    });

    test('la réduction conserve le minimum et le maximum de chaque tranche', function () {
      // 1 000 points, un pic isolé et un creux isolé
      const series = [];
      for (let i = 0; i < 1000; i++) series.push(500 + (i % 7));
      series[333] = 9000;
      series[777] = 2;
      const width = 37;
      const r = sampling.downsample(series, width);
      assert.equal(r.count, width);
      // Chaque tranche couvre une plage contiguë ; ensemble, elles couvrent toute la série
      let covered = 0;
      for (let b = 0; b < width; b++) {
        const from = Math.floor(b * 1000 / width);
        const to = Math.floor((b + 1) * 1000 / width);
        covered += to - from;
        const slice = series.slice(from, to);
        assert.equal(r.min[b], Math.min.apply(null, slice), 'minimum de la tranche ' + b);
        assert.equal(r.max[b], Math.max.apply(null, slice), 'maximum de la tranche ' + b);
      }
      assert.equal(covered, 1000);
      assert.equal(Math.max.apply(null, r.max), 9000, 'pic visible');
      assert.equal(Math.min.apply(null, r.min), 2, 'creux visible');
    });

    test('fonctionne sur une vue Uint32Array', function () {
      const s = sampling.createSeries();
      for (let i = 0; i < 10; i++) s.push(i * i);
      const r = sampling.downsample(s.values(), 2);
      assert.deepEqual(r, { min: [0, 25], max: [16, 81], count: 2 });
    });

    test('série : ajout, retrait, maximum suivi, remise à zéro', function () {
      const s = sampling.createSeries();
      s.reset(5);
      s.push(9);
      s.push(3);
      assert.equal(s.length(), 3);
      assert.equal(s.max(), 9);
      assert.equal(s.last(), 3);
      s.pop();
      s.pop();
      assert.equal(s.max(), 5, 'maximum recalculé après retrait du pic');
      assert.deepEqual(Array.from(s.values()), [5]);
      s.reset(0);
      assert.deepEqual(Array.from(s.values()), [0]);
      for (let i = 0; i < 5000; i++) s.push(i);
      assert.equal(s.length(), 5001, 'croissance au-delà de la capacité initiale');
    });

    test('au-delà de la limite, l\'enregistrement s\'arrête et le signale', function () {
      assert.equal(sampling.SERIES_MAX, 1000000);
      const s = sampling.createSeries(4);
      s.reset(1);
      assert.equal(s.push(2) && s.push(3) && s.push(4), true);
      assert.equal(s.truncated(), false);
      assert.equal(s.push(5), false);
      assert.equal(s.truncated(), true);
      assert.equal(s.length(), 4);
    });
  });
})(globalThis);
