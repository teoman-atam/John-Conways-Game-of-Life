/*
 * Non-régression de l'import d'image et de la gomme, comparée au code du tag avant-image-gomme :
 * rendu de la grille, raccourcis (dont ⌘X), gestes des outils existants, sauvegardes et refus.
 * Références : tests/fixtures/render-lot-a.js et tests/fixtures/avant-image-gomme.js.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const renderer = (root.Life && root.Life.renderer) || require('../src/renderer.js');
  const persistence = (root.Life && root.Life.persistence) || require('../src/persistence.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const tooltips = (root.Life && root.Life.tooltips) || require('../src/tooltips.js');
  const S = root.LifeRenderScenarios || require('./render-scenarios.js');
  const renderFixture = root.LifeRenderFixture || require('./fixtures/render-lot-a.js');
  const R = root.LifeRegressionScenarios || require('./regression-scenarios.js');
  const IE = root.LifeImageEraserScenarios || require('./image-eraser-scenarios.js');
  const before = root.LifeBeforeImageEraserFixture || require('./fixtures/avant-image-gomme.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const lib = { controller: ctrl, persistence: persistence };
  const APP_KEYS = ['minimap', 'tool-eraser', 'image-import'];

  function byId(list) {
    const out = {};
    for (const x of list) out[x.id] = x.outcome;
    return out;
  }

  suite('Non-régression — gomme : rendu, raccourcis et outils', function () {
    test('rendu : appels de dessin de la grille identiques à la référence figée, gomme choisie ou non', function () {
      const variants = [
        null,
        { tool: 'eraser', effectiveTool: 'eraser', eraserSize: 25, hoverCell: { x: 1, y: 1 } },
        { tool: 'eraser', effectiveTool: 'eraser', eraserSize: 1, hoverCell: null },
        { tool: 'eraser', effectiveTool: 'move', eraserSize: 512, hoverCell: { x: -3, y: 2 }, running: true },
      ];
      for (const sc of S.scenarios()) {
        for (const v of variants) {
          assert.deepEqual(S.record(renderer, sc, v), renderFixture[sc.name], sc.name + ' / ' + JSON.stringify(v));
        }
      }
    });

    test('chaque raccourci existant déclenche la même action qu\'au tag avant-image-gomme', function () {
      const ref = byId(before.shortcuts);
      const scenarios = R.shortcutScenarios();
      assert.equal(scenarios.length, before.shortcuts.length);
      for (const sc of scenarios) {
        assert.deepEqual(R.runShortcutScenario(lib, sc), ref[sc.id], sc.id);
        // Les touches propres à l'interface ne prennent jamais une touche que le contrôleur utilisait
        if (ref[sc.id].handled) {
          const mods = Object.assign({ shift: false, meta: false, ctrl: false, alt: false, editable: false }, sc.mods || {});
          for (const action of APP_KEYS) {
            assert.equal(tooltips.matchShortcut(action, sc.key, mods, sc.isMac !== false), false, sc.id + ' / ' + action);
          }
        }
      }
    });

    test('⌘X et Ctrl+X coupent toujours la sélection ; X et I étaient libres et ne sont pris que par l\'interface', function () {
      const ref = byId(before.keys);
      for (const sc of IE.keyScenarios()) {
        assert.deepEqual(IE.runKeyScenario(lib, sc), ref[sc.id], sc.id);
      }
      // ⌘X : coupe (presse-papiers rempli, cellules retirées) et n'est jamais pris pour la gomme
      const cut = ref['⌘X : couper la sélection'];
      assert.equal(cut.handled, true);
      assert.ok(cut.state.clipboard && cut.state.clipboard.cells.length > 0, 'presse-papiers rempli');
      assert.equal(tooltips.matchShortcut('tool-eraser', 'x', { meta: true }, true), false);
      assert.equal(tooltips.matchShortcut('tool-eraser', 'x', { ctrl: true }, false), false);
      // X et I : ignorés par le contrôleur au tag comme aujourd'hui
      for (const id of ['x : libre dans le contrôleur', 'X majuscule : libre dans le contrôleur', 'i : libre dans le contrôleur', 'I majuscule : libre dans le contrôleur']) {
        assert.equal(ref[id].handled, false, id);
      }
      assert.equal(tooltips.matchShortcut('tool-eraser', 'x', {}, true), true);
      assert.equal(tooltips.matchShortcut('image-import', 'i', {}, true), true);
      assert.equal(tooltips.matchShortcut('image-import', 'i', { meta: true }, true), false, '⌘I reste au navigateur');
    });

    test('Déplacer, Crayon, Sélection et Pose : mêmes gestes, même effet qu\'au tag (gomme présente)', function () {
      const ref = byId(before.tools);
      assert.equal(IE.toolScenarios().length, before.tools.length);
      for (const sc of IE.toolScenarios()) {
        assert.deepEqual(IE.runToolScenario(lib, sc), ref[sc.id], sc.id);
      }
    });
  });

  suite('Non-régression — sauvegarde avec la gomme', function () {
    function restoreInto(text) {
      const storage = R.fakeStorage();
      storage.setItem(R.KEY, text);
      const c = ctrl.createController({ random: R.seeded(1), width: 800, height: 600, storage: storage });
      return { c: c, result: c.restore() };
    }

    test('les sauvegardes produites au tag se chargent à l\'identique, gomme à sa taille par défaut', function () {
      const plain = before.save.plain;
      const r = persistence.deserialize(plain.text, R.LIMITS);
      assert.equal(r.ok, true, r.error);
      assert.deepEqual(Array.from(r.value.cells).sort(), plain.expected.cells);
      assert.deepEqual(r.value.camera, plain.expected.camera);
      assert.deepEqual(r.value.settings, plain.expected.settings);
      assert.deepEqual(r.value.optional, { minimapVisible: true });
      assert.equal(r.value.eraserSize, 3);
      const e = restoreInto(plain.text);
      assert.equal(e.result.status, 'restored');
      assert.deepEqual(Array.from(e.c.getState().cells).sort(), plain.expected.cells);
      assert.equal(e.c.getState().eraserSize, 3);
      // Sauvegarde complétée par l'interface (mini-carte masquée)
      const withMinimap = before.save.withMinimap;
      const r2 = persistence.deserialize(withMinimap.text, R.LIMITS);
      assert.equal(r2.ok, true, r2.error);
      assert.deepEqual(r2.value.optional, { minimapVisible: false });
      assert.deepEqual(Array.from(r2.value.cells).sort(), withMinimap.cells);
      assert.deepEqual(persistence.readOptional(withMinimap.text), { minimapVisible: false, eraserSize: 3 });
      assert.equal(restoreInto(withMinimap.text).result.status, 'restored');
    });

    test('le contrôleur écrit le même texte qu\'au tag ; aller-retour avec eraserSize', function () {
      assert.equal(R.saveScenario(lib).text, before.save.plain.text, 'octet pour octet');
      assert.deepEqual(IE.saveTexts(lib).withMinimap, before.save.withMinimap, 'sauvegarde complétée par l\'interface, identique');
      const r0 = persistence.deserialize(before.save.plain.text, R.LIMITS).value;
      for (const size of [1, 3, 40, 512]) {
        const text = persistence.serialize({ cells: r0.cells, camera: r0.camera, settings: r0.settings, savedAt: 9,
          optional: { minimapVisible: false, eraserSize: size } });
        const r = persistence.deserialize(text, R.LIMITS);
        assert.equal(r.ok, true, r.error);
        assert.equal(r.value.eraserSize, size);
        assert.deepEqual(r.value.optional, { minimapVisible: false }, 'optional garde ses champs d\'avant');
        assert.deepEqual(r.value.settings, r0.settings);
        assert.equal(JSON.parse(text).schemaVersion, 1, 'schemaVersion inchangé');
      }
    });

    test('tous les cas de rejet existants sont toujours rejetés, avec le même message', function () {
      assert.deepEqual(R.rejectionResults(lib, before.save.plain.text), before.rejections);
      assert.ok(before.rejections.every(function (x) { return x.result !== 'accepté'; }));
      const withSize = persistence.writeOptional(before.save.plain.text, { eraserSize: 64 });
      const again = R.rejectionResults(lib, withSize);
      for (let i = 0; i < again.length; i++) {
        if (before.rejections[i].name === 'JSON invalide') continue;
        assert.equal(again[i].result, before.rejections[i].result, again[i].name + ' (avec eraserSize)');
      }
    });
  });
})(globalThis);
