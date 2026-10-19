/*
 * Tests du rendu, sur un faux canvas qui journalise chaque appel de dessin.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const renderer = (root.Life && root.Life.renderer) || require('../src/renderer.js');
  const ages = (root.Life && root.Life.ages) || require('../src/ages.js');
  const S = root.LifeRenderScenarios || require('./render-scenarios.js');
  const fixture = root.LifeRenderFixture || require('./fixtures/render-lot-a.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const AGE_COLORS = ['#a00001', '#a00002', '#a00003', '#a00004', '#a00005'];
  const suite = T.suite, test = T.test, assert = T.assert;

  suite('Rendu — non-régression', function () {
    test('couleur selon l\'âge décochée : rendu identique à celui d\'avant le lot B', function () {
      for (const sc of S.scenarios()) {
        const withoutAges = S.record(renderer, sc);
        assert.deepEqual(withoutAges, fixture[sc.name], sc.name + ' (état sans âges)');
        // Âges variés présents dans l'état, mais option décochée
        const a = new Map();
        let i = 0;
        for (const k of sc.state.cells) a.set(k, 1 + (i++ * 7) % 80);
        const withAges = S.record(renderer, sc, { ages: a, ageColors: false });
        assert.deepEqual(withAges, fixture[sc.name], sc.name + ' (âges présents, option décochée)');
      }
    });

    test('couleur selon l\'âge : un seul fillStyle et un seul fill par tranche, chaque cellule dans sa tranche', function () {
      for (const sc of S.scenarios()) {
        // Âges couvrant les cinq tranches, y compris les bornes
        const sample = [1, 2, 3, 4, 10, 11, 50, 51, 300];
        const a = new Map();
        let i = 0;
        for (const k of sc.state.cells) a.set(k, sample[i++ % sample.length]);
        const log = [];
        const board = S.createRecordingCanvas(log, 'board');
        const overlay = S.createRecordingCanvas(log, 'overlay');
        const r = renderer.createRenderer(board, overlay);
        r.setColors({ ages: AGE_COLORS });
        r.resize(sc.size[0], sc.size[1], sc.size[2]);
        r.draw(Object.assign({}, sc.state, { ages: a, ageColors: true }));
        const boardLog = log.filter(function (e) { return e[0] === 'board'; });
        // Nombre attendu de cellules visibles par tranche
        const vis = camera.visibleCells(sc.state.camera);
        const expected = {};
        for (const k of sc.state.cells) {
          const p = k.split(',').map(Number);
          if (p[0] < vis.minX || p[0] > vis.maxX || p[1] < vis.minY || p[1] > vis.maxY) continue;
          const color = AGE_COLORS[ages.ageBucket(a.get(k))];
          expected[color] = (expected[color] || 0) + 1;
        }
        const counted = {};
        const fillStyles = [];
        let current = null;
        let fills = 0;
        for (const e of boardLog) {
          if (e[1] === 'set:fillStyle') { current = e[2]; fillStyles.push(e[2]); }
          if (e[1] === 'rect') counted[current] = (counted[current] || 0) + 1;
          if (e[1] === 'fill') fills++;
        }
        assert.deepEqual(counted, expected, sc.name + ' : cellules par tranche');
        const cellStyles = fillStyles.slice(1); // le premier est le fond
        assert.equal(new Set(cellStyles).size, cellStyles.length, sc.name + ' : un fillStyle par tranche');
        assert.equal(fills, cellStyles.length, sc.name + ' : un fill par tranche');
        assert.ok(cellStyles.length <= 5);
        // L'aperçu de pose et la sélection ne sont pas colorés
        const overlayLog = log.filter(function (e) { return e[0] === 'overlay'; });
        const refOverlay = fixture[sc.name].filter(function (e) { return e[0] === 'overlay'; });
        assert.deepEqual(overlayLog, refOverlay, sc.name + ' : calque d\'édition inchangé');
      }
    });

    test('la référence couvre la grille, les cellules, la sélection et l\'aperçu', function () {
      const log = fixture['grille, sélection et aperçu de pose'];
      const has = function (canvas, op) { return log.some(function (e) { return e[0] === canvas && e[1] === op; }); };
      assert.ok(has('board', 'lineTo') && has('board', 'rect') && has('overlay', 'strokeRect') && has('overlay', 'fillText'));
      assert.ok(ages.AGE_BUCKET_COUNT === 5);
    });
  });
})(globalThis);
