/*
 * Tests de l'outil Gomme dans le contrôleur : tampon et trait, règles d'édition, simulation et saut,
 * taille (bornes, curseur logarithmique, ⌥ + molette), sauvegarde, légende et touche X.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const persistence = (root.Life && root.Life.persistence) || require('../src/persistence.js');
  const eraser = (root.Life && root.Life.eraser) || require('../src/eraser.js');
  const tooltips = (root.Life && root.Life.tooltips) || require('../src/tooltips.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const PLAIN = { shift: false, meta: false, ctrl: false, alt: false, repeat: false, editable: false };

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function fakeStorage() {
    const store = { data: {} };
    store.getItem = function (k) { return Object.prototype.hasOwnProperty.call(store.data, k) ? store.data[k] : null; };
    store.setItem = function (k, v) { store.data[k] = String(v); };
    store.removeItem = function (k) { delete store.data[k]; };
    return store;
  }

  // Contrôleur 800 × 600 à 12 px par cellule, centre (0,5 ; 0,5) : la cellule (x, y) est au pixel (400 + 12x, 300 + 12y)
  function setup(options) {
    const env = { now: 0 };
    env.c = ctrl.createController(Object.assign({ random: seeded(5), width: 800, height: 600, clock: function () { return env.now; } }, options || {}));
    env.at = function (x, y) { return [400 + 12 * x + 1, 300 + 12 * y + 1]; };
    // Bloc plein de cellules : posé d'un coup (RLE), en pause, compteur à 0
    env.fill = function (x0, y0, w, h) {
      const row = w + 'o';
      const rle = 'x = ' + w + ', y = ' + h + '\n' + Array(h).fill(row).join('$') + '!';
      env.c.importRle(rle);
      env.c.placeAt(x0 + Math.floor(w / 2), y0 + Math.floor(h / 2));
      env.c.cancelPlacing();
    };
    env.drag = function (cellsPath) {
      const p0 = env.at(cellsPath[0][0], cellsPath[0][1]);
      env.c.pointerDown(p0[0], p0[1]);
      for (let i = 1; i < cellsPath.length; i++) {
        const p = env.at(cellsPath[i][0], cellsPath[i][1]);
        env.c.pointerMove(p[0], p[1]);
      }
      const last = env.at(cellsPath[cellsPath.length - 1][0], cellsPath[cellsPath.length - 1][1]);
      return env.c.pointerUp(last[0], last[1]);
    };
    return env;
  }

  function missing(before, after) {
    const out = new Set();
    for (const k of before) if (!after.has(k)) out.add(k);
    return out;
  }

  suite('Gomme — outil dans le contrôleur', function () {
    test('clic : un tampon à la taille choisie ; glisser rapide : trait interpolé, sans trou', function () {
      const e = setup();
      e.fill(-10, -10, 60, 40);
      const full = e.c.getState().cells;
      assert.equal(full.size, 2400);
      assert.equal(e.c.setTool('eraser'), 'eraser');
      assert.equal(e.c.getState().eraserSize, eraser.ERASER_DEFAULT_SIZE);
      assert.equal(e.drag([[5, 5]]), 'click');
      const afterClick = e.c.getState().cells;
      assert.deepEqual(missing(full, afterClick), new Set(eraser.erasedKeys(full, { x: 5, y: 5 }, { x: 5, y: 5 }, 3)));
      assert.equal(missing(full, afterClick).size, 9, 'diamètre 3 : carré de 3 × 3');
      // Glisser rapide : trois positions seulement, de (0, 20) à (40, 27)
      e.c.setEraserSize(1);
      assert.equal(e.drag([[0, 20], [22, 24], [40, 27]]), 'drag');
      const gone = missing(afterClick, e.c.getState().cells);
      const expected = new Set(eraser.erasedKeys(afterClick, { x: 0, y: 20 }, { x: 22, y: 24 }, 1)
        .concat(eraser.erasedKeys(afterClick, { x: 22, y: 24 }, { x: 40, y: 27 }, 1)));
      assert.deepEqual(gone, expected);
      for (let x = 0; x <= 40; x++) {
        let any = false;
        for (let y = 19; y <= 28; y++) if (gone.has(x + ',' + y)) any = true;
        assert.ok(any, 'aucun trou à la colonne ' + x);
      }
      // La gomme n'ajoute jamais de cellule
      for (const k of e.c.getState().cells) assert.ok(full.has(k));
    });

    test('pendant la simulation et pendant un saut, la gomme déplace la vue et n\'efface rien', function () {
      for (const mode of ['lecture', 'saut']) {
        const e = setup();
        e.fill(-5, -5, 20, 20);
        e.c.setTool('eraser');
        e.c.setEraserSize(50);
        if (mode === 'lecture') e.c.start();
        else e.c.startJump();
        const cells = e.c.getState().cells;
        const cam = e.c.getState().camera;
        assert.equal(e.c.getState().effectiveTool, 'move', mode + ' : la gomme se comporte comme Déplacer');
        e.drag([[0, 0], [5, 3], [9, 6]]);
        e.drag([[2, 2]]);
        assert.equal(e.c.getState().cells, cells, mode + ' : aucune cellule effacée');
        assert.ok(e.c.getState().camera.centerX !== cam.centerX, mode + ' : la vue a bougé');
      }
    });

    test('un geste remet le compteur à 0 et vide l\'historique, le graphique et la détection', function () {
      const e = setup({ autoPause: false });
      e.fill(30, 30, 3, 1); // clignotant
      e.fill(-20, -20, 2, 2); // bloc, loin
      e.c.step();
      e.c.step();
      let s = e.c.getState();
      assert.equal(s.generation, 2);
      assert.ok(/Oscillateur de période 2/.test(s.message.text));
      assert.equal(s.canBack, true);
      assert.equal(s.population.length, 3);
      e.c.dismissMessage();
      e.c.setTool('eraser');
      e.c.setEraserSize(3);
      e.drag([[-20, -20], [-19, -19]]);
      s = e.c.getState();
      assert.equal(s.generation, 0, 'compteur à 0');
      assert.equal(s.canBack, false, 'historique vidé');
      assert.equal(s.population.length, 1, 'graphique vidé');
      assert.equal(s.liveCount, 3, 'le bloc entier est effacé, le clignotant reste');
      // Détection vidée : l'oscillateur est signalé à nouveau
      e.c.step();
      e.c.step();
      assert.ok(/Oscillateur de période 2 à la génération 2/.test(e.c.getState().message.text), 'détection repartie de zéro');
      // Rien sous la gomme : aucune édition, le compteur ne bouge pas
      const g = e.c.getState().generation;
      e.drag([[200, 200]]);
      assert.equal(e.c.getState().generation, g);
    });

    test('taille : bornes 1 et 512, valeurs hors bornes ramenées', function () {
      const e = setup();
      assert.equal(e.c.setEraserSize(0), 1);
      assert.equal(e.c.setEraserSize(9999), 512);
      assert.equal(e.c.setEraserSize('12'), 12);
      assert.equal(e.c.setEraserSize(7.6), 8);
      assert.equal(e.c.setEraserSize('abc'), 3);
      assert.equal(e.c.getState().eraserSize, 3);
    });

    test('⌥ + molette change la taille sans zoomer ; la molette seule et le pincement zooment toujours', function () {
      const state = { tool: 'eraser', placing: null };
      assert.equal(eraser.wheelChangesSize({ altKey: true, ctrlKey: false }, state), true);
      assert.equal(eraser.wheelChangesSize({ altKey: false, ctrlKey: false }, state), false, 'molette seule : zoom');
      assert.equal(eraser.wheelChangesSize({ altKey: false, ctrlKey: true }, state), false, 'pincement : zoom');
      assert.equal(eraser.wheelChangesSize({ altKey: true, ctrlKey: true }, state), false, 'pincement avec ⌥ : zoom');
      assert.equal(eraser.wheelChangesSize({ altKey: true }, { tool: 'pencil', placing: null }), false, 'autre outil : zoom');
      assert.equal(eraser.wheelChangesSize({ altKey: true }, { tool: 'eraser', placing: { name: 'x' } }), false, 'en pose : zoom');
      // Vers le haut, plus grande ; vers le bas, plus petite ; toujours au moins une cellule d'écart
      assert.ok(eraser.sizeAfterWheel(20, -100, 0) > 20);
      assert.ok(eraser.sizeAfterWheel(20, 100, 0) < 20);
      assert.equal(eraser.sizeAfterWheel(1, -2, 0), 2);
      assert.equal(eraser.sizeAfterWheel(1, 100, 0), 1);
      assert.equal(eraser.sizeAfterWheel(512, -100, 0), 512);
      assert.equal(eraser.sizeAfterWheel(20, 0, 0), 20);
      assert.ok(eraser.sizeAfterWheel(20, -3, 1) > eraser.sizeAfterWheel(20, -3, 0), 'lignes plus fortes que pixels');
      // Le contrôleur, lui, ne zoome pas quand la taille change
      const e = setup();
      const cam = e.c.getState().camera;
      e.c.setEraserSize(eraser.sizeAfterWheel(3, -100, 0));
      assert.equal(e.c.getState().camera, cam);
    });

    test('curseur de taille à échelle logarithmique de 1 à 512', function () {
      assert.equal(eraser.sizeFromSlider(0), 1);
      assert.equal(eraser.sizeFromSlider(eraser.SLIDER_STEPS), 512);
      assert.equal(eraser.sizeFromSlider(-5), 1);
      assert.equal(eraser.sizeFromSlider(5000), 512);
      assert.equal(eraser.sizeFromSlider(eraser.sliderFromSize(32)), 32);
      let previous = 0;
      for (let t = 0; t <= eraser.SLIDER_STEPS; t += 10) {
        const size = eraser.sizeFromSlider(t);
        assert.ok(size >= previous, 'croissant');
        previous = size;
      }
      // Milieu du curseur : la moyenne géométrique (environ 23), pas 256
      const mid = eraser.sizeFromSlider(eraser.SLIDER_STEPS / 2);
      assert.ok(mid >= 22 && mid <= 23, String(mid));
      for (let n = 1; n <= 512; n++) {
        const back = eraser.sizeFromSlider(eraser.sliderFromSize(n));
        assert.ok(Math.abs(back - n) <= Math.max(1, n * 0.01), n + ' → ' + back);
      }
    });

    test('la taille est sauvegardée puis restaurée ; absente, taille par défaut', function () {
      const storage = fakeStorage();
      const e = setup();
      const wrapped = persistence.withOptionalSettings(storage, function () { return { minimapVisible: true, eraserSize: e.c.getState().eraserSize }; });
      const c = ctrl.createController({ random: seeded(2), width: 800, height: 600, storage: wrapped });
      e.c = c;
      c.restore();
      c.setEraserSize(40);
      c.toggleCell(1, 1);
      c.flushSave();
      const text = storage.getItem(persistence.STORAGE_KEY);
      assert.equal(JSON.parse(text).settings.eraserSize, 40);
      // Rechargement : le contrôleur relit la grille, l'interface relit la taille
      const c2 = ctrl.createController({ random: seeded(2), width: 800, height: 600, storage: storage });
      assert.equal(c2.restore().status, 'restored');
      c2.setEraserSize(persistence.readOptional(text).eraserSize);
      assert.equal(c2.getState().eraserSize, 40);
      const r = persistence.deserialize(text, { maxCells: 100000, minSpeed: 1, maxSpeed: 30, minDensity: 5, maxDensity: 50, minJump: 1, maxJump: 10000 });
      assert.equal(r.ok, true, r.error);
      assert.equal(r.value.eraserSize, 40);
      // Changement de taille sans autre modification : la sauvegarde existante est complétée
      const patched = persistence.writeOptional(text, { eraserSize: 7 });
      assert.equal(persistence.readOptional(patched).eraserSize, 7);
      // Champ absent : 3 ; champ invalide : refusé
      const data = JSON.parse(text);
      delete data.settings.eraserSize;
      assert.equal(persistence.readOptional(JSON.stringify(data)).eraserSize, 3);
      const limits = { maxCells: 100000, minSpeed: 1, maxSpeed: 30, minDensity: 5, maxDensity: 50, minJump: 1, maxJump: 10000 };
      assert.equal(persistence.deserialize(JSON.stringify(data), limits).value.eraserSize, 3);
      for (const bad of [0, 513, 2.5, 'grande', true]) {
        data.settings.eraserSize = bad;
        const rr = persistence.deserialize(JSON.stringify(data), limits);
        assert.equal(rr.ok, false, JSON.stringify(bad));
        assert.equal(rr.error, 'champ invalide : settings.eraserSize doit être un entier de 1 à 512');
        assert.equal(persistence.readOptional(JSON.stringify(data)).eraserSize, 3, 'lecture rapide : valeur par défaut');
      }
      // Une taille hors bornes n'est jamais écrite
      assert.equal(JSON.parse(persistence.writeOptional(text, { eraserSize: 600 })).settings.eraserSize, 40);
    });

    test('légende « Gomme » avec la taille courante et la touche X, lue dans la table des raccourcis', function () {
      const e = setup();
      const state = function () { return Object.assign({}, e.c.getState(), { isMac: true }); };
      let t = tooltips.getTooltip('tool-eraser', state());
      assert.deepEqual([t.label, t.shortcut], ['Gomme, diamètre 3 cellules', ['X']]);
      e.c.setTool('eraser');
      e.c.setEraserSize(1);
      t = tooltips.getTooltip('tool-eraser', state());
      assert.equal(t.label, 'Gomme, outil actif, diamètre 1 cellule');
      e.c.setEraserSize(512);
      assert.equal(tooltips.ariaFor('tool-eraser', state()).label, 'Gomme, outil actif, diamètre 512 cellules');
      assert.deepEqual(t.shortcut, tooltips.shortcutFor('tool-eraser').keys);
      assert.equal(tooltips.findShortcut('tool-eraser').handledBy, 'app');
      // X seule choisit la gomme ; ⌘X et Ctrl+X restent « couper », jamais dans un champ
      assert.equal(tooltips.matchShortcut('tool-eraser', 'x', PLAIN, true), true);
      assert.equal(tooltips.matchShortcut('tool-eraser', 'X', Object.assign({}, PLAIN, { shift: true }), true), true);
      assert.equal(tooltips.matchShortcut('tool-eraser', 'x', Object.assign({}, PLAIN, { meta: true }), true), false);
      assert.equal(tooltips.matchShortcut('tool-eraser', 'x', Object.assign({}, PLAIN, { ctrl: true }), false), false);
      assert.equal(tooltips.matchShortcut('tool-eraser', 'x', Object.assign({}, PLAIN, { editable: true }), true), false);
      assert.equal(e.c.handleShortcut('x', PLAIN), false, 'le contrôleur laisse X à l\'interface');
      // Les boutons ajoutés ont leur légende sans changer la liste des boutons du lot des légendes
      assert.deepEqual(tooltips.ADDED_BUTTON_ACTIONS, ['tool-eraser', 'image-import']);
      assert.equal(tooltips.BUTTON_ACTIONS.indexOf('tool-eraser'), -1);
    });
  });
})(globalThis);
