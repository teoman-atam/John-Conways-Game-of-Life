/*
 * Tests de la sauvegarde : aller-retour exact et refus explicites, sans exception.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const persistence = (root.Life && root.Life.persistence) || require('../src/persistence.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const LIMITS = {
    maxCells: ctrl.MAX_LIVE_CELLS,
    minSpeed: ctrl.MIN_SPEED,
    maxSpeed: ctrl.MAX_SPEED,
    minDensity: ctrl.MIN_DENSITY,
    maxDensity: ctrl.MAX_DENSITY,
    minJump: ctrl.JUMP_MIN,
    maxJump: ctrl.JUMP_MAX,
  };

  function sampleState() {
    const cells = new Set(['-3,-7', '0,0', '5,2', '1000000000,-1000000000', '-1000000000,1000000000', '-999999999,1000000000']);
    for (const k of patterns.cells('glider', -40, 17)) cells.add(k);
    return {
      cells: cells,
      camera: { centerX: -1234.5678, centerY: 987654.25, cellSize: 7.3 },
      settings: {
        speed: 23,
        density: 12,
        jumpCount: 4567,
        theme: 'dark',
        ageColors: true,
        autoPause: false,
        chartVisible: true,
        panelCollapsed: true,
      },
      savedAt: 1792400000000,
    };
  }

  // Version modifiable d'une sauvegarde valide
  function validData() {
    return JSON.parse(persistence.serialize(sampleState()));
  }

  // deserialize ne doit jamais lever d'exception
  function safeDeserialize(text, limits) {
    try {
      return persistence.deserialize(text, limits || LIMITS);
    } catch (err) {
      return { thrown: err };
    }
  }

  suite('Persistance — format et aller-retour', function () {
    test('aller-retour exact : cellules (négatives, ±10⁹), caméra et tous les réglages', function () {
      const state = sampleState();
      const text = persistence.serialize(state);
      const r = persistence.deserialize(text, LIMITS);
      assert.equal(r.ok, true, r.error);
      assert.deepEqual(r.value.cells, state.cells);
      assert.deepEqual(r.value.camera, state.camera);
      assert.deepEqual(r.value.settings, state.settings);
      assert.equal(r.value.savedAt, 1792400000000);
    });

    test('format JSON versionné, cellules en RLE avec origine à part, clé préfixée', function () {
      const data = validData();
      assert.equal(data.schemaVersion, 1);
      assert.equal(data.cells.originX, -1000000000);
      assert.equal(data.cells.originY, -1000000000);
      assert.ok(/^x = 2000000001, y = 2000000001, rule = B3\/S23\n/.test(data.cells.rle), data.cells.rle.slice(0, 60));
      assert.deepEqual(Object.keys(data).sort(), ['camera', 'cells', 'savedAt', 'schemaVersion', 'settings']);
      assert.equal(persistence.STORAGE_KEY, 'jeu-de-la-vie:sauvegarde');
    });

    test('grille vide et réglages par défaut', function () {
      const state = {
        cells: new Set(),
        camera: { centerX: 0.5, centerY: 0.5, cellSize: 12 },
        settings: { speed: 10, density: 30, jumpCount: 100, theme: 'auto', ageColors: false, autoPause: true, chartVisible: false, panelCollapsed: false },
      };
      const r = persistence.deserialize(persistence.serialize(state), LIMITS);
      assert.equal(r.ok, true, r.error);
      assert.equal(r.value.cells.size, 0);
      assert.deepEqual(r.value.settings, state.settings);
      assert.equal(r.value.savedAt, null);
    });

    test('rien ne sauvegarde le compteur, les âges, l\'historique, la sélection ni le presse-papiers', function () {
      const text = persistence.serialize(Object.assign(sampleState(), { generation: 42, ages: new Map(), selection: {}, clipboard: {} }));
      for (const word of ['generation', 'ages', 'history', 'selection', 'clipboard', 'tool']) {
        assert.ok(text.indexOf('"' + word) < 0, word + ' absent');
      }
    });
  });

  suite('Persistance — refus explicites, sans exception', function () {
    function expectFailure(text, pattern, limits) {
      const r = safeDeserialize(text, limits);
      assert.ok(!r.thrown, 'exception levée : ' + (r.thrown && r.thrown.message));
      assert.equal(r.ok, false, 'refus attendu');
      assert.ok(typeof r.error === 'string' && pattern.test(r.error), r.error);
    }
    function mutate(fn) {
      const d = validData();
      fn(d);
      return JSON.stringify(d);
    }

    test('JSON invalide, ou JSON qui n\'est pas un objet', function () {
      expectFailure('{ pas du json', /JSON invalide/);
      expectFailure('', /JSON invalide/);
      expectFailure('42', /objet JSON attendu/);
      expectFailure('null', /objet JSON attendu/);
      expectFailure('[1, 2]', /objet JSON attendu/);
      expectFailure(null, /objet JSON attendu/);
    });

    test('version 2 (ou absente) refusée', function () {
      expectFailure(mutate(function (d) { d.schemaVersion = 2; }), /version de format inconnue \(2/);
      expectFailure(mutate(function (d) { delete d.schemaVersion; }), /version de format inconnue/);
    });

    test('champ manquant', function () {
      expectFailure(mutate(function (d) { delete d.settings.speed; }), /champ manquant : settings\.speed/);
      expectFailure(mutate(function (d) { delete d.settings.autoPause; }), /champ manquant : settings\.autoPause/);
      expectFailure(mutate(function (d) { delete d.camera; }), /champ manquant : camera/);
      expectFailure(mutate(function (d) { delete d.camera.cellSize; }), /champ manquant : camera\.cellSize/);
      expectFailure(mutate(function (d) { delete d.cells.rle; }), /champ manquant : cells\.rle/);
    });

    test('zoom et réglages hors bornes, types invalides', function () {
      expectFailure(mutate(function (d) { d.camera.cellSize = 0.5; }), /hors bornes : camera\.cellSize = 0\.5/);
      expectFailure(mutate(function (d) { d.camera.cellSize = 65; }), /hors bornes : camera\.cellSize = 65/);
      expectFailure(mutate(function (d) { d.camera.centerX = 1e300; }), /hors bornes : centre/);
      expectFailure(mutate(function (d) { d.camera.centerY = 'milieu'; }), /champ invalide : camera\.centerY/);
      expectFailure(mutate(function (d) { d.settings.speed = 31; }), /hors bornes : settings\.speed = 31 \(attendu de 1 à 30\)/);
      expectFailure(mutate(function (d) { d.settings.density = 4; }), /settings\.density/);
      expectFailure(mutate(function (d) { d.settings.jumpCount = 2.5; }), /settings\.jumpCount/);
      expectFailure(mutate(function (d) { d.settings.theme = 'violet'; }), /settings\.theme/);
      expectFailure(mutate(function (d) { d.settings.ageColors = 'oui'; }), /settings\.ageColors doit valoir true ou false/);
      expectFailure(mutate(function (d) { d.cells.originX = 1.5; }), /origine des cellules/);
    });

    test('RLE invalide', function () {
      expectFailure(mutate(function (d) { d.cells.rle = 'x = 3, y = 3\nbo$2zo!'; }), /cellules : RLE invalide : symbole inattendu « z »/);
      expectFailure(mutate(function (d) { d.cells.rle = 'x = 3, y = 3, rule = B36/S23\nbo$2bo$3o!'; }), /règle/);
      expectFailure(mutate(function (d) { d.cells.rle = 42; }), /cells\.rle/);
    });

    test('cellules au-delà du plafond MAX_LIVE_CELLS', function () {
      const small = Object.assign({}, LIMITS, { maxCells: 5 });
      expectFailure(persistence.serialize(sampleState()), /plafond de 5 cellules/, small);
    });

    test('origine qui ferait sortir les cellules des entiers sûrs', function () {
      expectFailure(mutate(function (d) { d.cells.originX = Number.MAX_SAFE_INTEGER; }), /cellules : .*entiers sûrs/);
    });
  });
})(globalThis);
