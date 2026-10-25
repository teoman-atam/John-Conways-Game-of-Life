/*
 * Tests de l'import d'image dans le contrôleur, avec fichiers et décodage injectés (décodeur factice
 * synchrone) : refus avec message, pause, plafond, remplacement centré, mode pose, annulation,
 * mosaïque figée, et aucune donnée d'image dans le stockage.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const ic = (root.Life && root.Life.imageConvert) || require('../src/imageConvert.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const PLAIN = { shift: false, meta: false, ctrl: false, alt: false, repeat: false, editable: false };
  const MB = 1024 * 1024;

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeImage(width, height, fn) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = fn(x, y);
        data.set([v, v, v, 255], (y * width + x) * 4);
      }
    }
    return { width: width, height: height, data: data };
  }

  // Promesse factice synchrone : le test vérifie le résultat sans attendre
  function settled(ok, value) {
    return { then: function (onOk, onErr) { if (ok) onOk(value); else onErr(new Error('décodage impossible')); } };
  }

  function fakeStorage() {
    const store = { data: {}, writes: [] };
    store.getItem = function (k) { return Object.prototype.hasOwnProperty.call(store.data, k) ? store.data[k] : null; };
    store.setItem = function (k, v) { store.writes.push(String(v)); store.data[k] = String(v); };
    store.removeItem = function (k) { delete store.data[k]; };
    return store;
  }

  function setup(options) {
    const env = { now: 0, decoded: [] };
    env.decoder = function (file) {
      env.decoded.push(file.name);
      if (file.decodes === false) return settled(false);
      if (file.decodes === 'vide') return settled(true, { width: 0, height: 0 });
      return settled(true, { width: 1200, height: 800, name: file.name });
    };
    env.c = ctrl.createController(Object.assign({
      random: seeded(1), width: 800, height: 600, clock: function () { return env.now; }, decodeImage: env.decoder,
    }, options || {}));
    for (const p of [[0, 0], [1, 0], [2, 0], [9, 9]]) env.c.toggleCell(p[0], p[1]);
    env.open = function (file) {
      let result = null;
      env.c.openImageFile(file, function (r) { result = r; });
      return result;
    };
    return env;
  }

  function file(name, type, size, decodes) {
    return { name: name, type: type, size: size, decodes: decodes };
  }

  function sorted(cells) {
    return Array.from(cells).sort();
  }

  suite('Import d\'image — ouverture du fichier', function () {
    test('non-image, plus de 20 Mo, HEIC et échec de décodage : un message chacun, grille intacte', function () {
      const cases = [
        [file('notes.txt', 'text/plain', 120), /n'est pas une image prise en charge/],
        [file('enorme.jpg', 'image/jpeg', 25 * MB), /trop lourde : 25,0 Mo/],
        [file('IMG_1234.HEIC', 'image/heic', 3 * MB), /HEIC.*JPEG/],
        [file('faux.png', 'image/png', 2000, false), /n'a pas pu être lue/],
        [file('vide-decode.png', 'image/png', 2000, 'vide'), /n'a pas pu être lue/],
      ];
      for (const cse of cases) {
        const e = setup();
        const before = sorted(e.c.getState().cells);
        const r = e.open(cse[0]);
        assert.equal(r.ok, false, cse[0].name);
        assert.ok(cse[1].test(r.error), cse[0].name + ' : ' + r.error);
        assert.equal(e.c.getState().message.text, r.error, 'affiché en message');
        assert.deepEqual(sorted(e.c.getState().cells), before, 'grille intacte');
        assert.equal(e.c.getState().imageImport, null);
      }
      // Les fichiers refusés avant décodage ne sont même pas lus
      const e = setup();
      e.open(file('notes.txt', 'text/plain', 120));
      e.open(file('IMG.heic', 'image/heic', 10));
      e.open(file('lourde.png', 'image/png', 21 * MB));
      assert.deepEqual(e.decoded, []);
      const ok = e.open(file('photo.jpg', 'image/jpeg', 2 * MB));
      assert.deepEqual([ok.ok, ok.image.width, ok.image.height], [true, 1200, 800]);
    });

    test('pendant la lecture, l\'ouverture met d\'abord en pause ; pendant un saut, elle est refusée', function () {
      const e = setup();
      e.c.start();
      assert.equal(e.c.getState().running, true);
      const r = e.open(file('photo.png', 'image/png', 1000));
      assert.equal(r.ok, true);
      assert.equal(e.c.getState().running, false, 'mise en pause');
      const j = setup();
      j.c.startJump();
      const rj = j.open(file('photo.png', 'image/png', 1000));
      assert.equal(rj.ok, false);
      assert.ok(/pendant un saut/.test(rj.error));
      assert.deepEqual(j.decoded, []);
    });
  });

  suite('Import d\'image — aperçu, validation et annulation', function () {
    // Image de 40 × 20 : un disque sombre sur fond clair
    function disc() {
      return makeImage(40, 20, function (x, y) { return (x - 20) * (x - 20) + (y - 10) * (y - 10) * 4 < 64 ? 20 : 230; });
    }

    test('aperçu : estimation et dimensions avant validation, temps de conversion mesuré', function () {
      const e = setup();
      const r = e.c.previewImage(disc(), { mode: 'threshold' });
      const bmp = ic.convert(disc(), { mode: 'threshold' }).bitmap;
      assert.equal(r.count, bmp.count);
      assert.deepEqual([r.width, r.height, r.overCap], [40, 20, false]);
      assert.ok(r.threshold > 20 && r.threshold <= 230, 'seuil d\'Otsu ' + r.threshold);
      assert.equal(typeof r.ms, 'number');
      assert.deepEqual(e.c.getState().imageImport, { count: r.count, overCap: false, width: 40, height: 20, mosaic: false });
      const m = e.c.previewImage(disc(), { mode: 'threshold', mosaic: true });
      assert.deepEqual([m.count, m.width, m.height], [4 * r.count, 160, 80]);
      assert.equal(sorted(e.c.getState().cells).length, 4, 'l\'aperçu ne touche pas à la grille');
    });

    test('estimation au-delà du plafond : la validation est impossible', function () {
      const e = setup({ maxLiveCells: 50 });
      const r = e.c.previewImage(disc(), { mode: 'threshold' });
      assert.ok(r.count > 50);
      assert.equal(r.overCap, true);
      assert.equal(e.c.getState().imageImport.overCap, true);
      const before = sorted(e.c.getState().cells);
      const v = e.c.confirmImageImport(true);
      assert.equal(v.ok, false);
      assert.ok(/plafond de 50.*Réduisez la largeur ou changez de mode/.test(v.error), v.error);
      assert.deepEqual(sorted(e.c.getState().cells), before);
      // Image entièrement claire : aucune cellule, validation impossible aussi
      const blank = e.c.previewImage(makeImage(10, 10, function () { return 255; }), { mode: 'threshold', threshold: 128 });
      assert.equal(blank.count, 0);
      assert.equal(e.c.confirmImageImport(true).ok, false);
    });

    test('Remplacer : grille remplacée et centrée sur la vue, en pause, compteur à 0, âges à 1, historique vidé', function () {
      const e = setup({ autoPause: false });
      e.c.panBy(-120, 60); // centre de la vue en (10,5 ; -4,5)
      e.c.step();
      e.c.step();
      assert.equal(e.c.getState().canBack, true);
      const cam = e.c.getState().camera;
      const centerCell = { x: Math.floor(cam.centerX), y: Math.floor(cam.centerY) };
      e.c.start();
      e.c.previewImage(disc(), { mode: 'threshold' });
      const expected = ic.toCells(ic.convert(disc(), { mode: 'threshold' }).bitmap, false);
      const v = e.c.confirmImageImport(true);
      assert.equal(v.ok, true, v.error);
      const s = e.c.getState();
      assert.equal(s.running, false, 'en pause, pas de démarrage automatique');
      assert.equal(s.generation, 0);
      assert.equal(s.canBack, false, 'historique vidé');
      assert.equal(s.population.length, 1, 'graphique vidé');
      assert.equal(s.liveCount, expected.size);
      for (const k of s.cells) assert.equal(s.ages.get(k), 1, 'âge 1');
      // Centré : la grille de 40 × 20 commence à (centre − 20, centre − 10)
      const shifted = new Set();
      for (const k of expected) {
        const p = k.split(',').map(Number);
        shifted.add((p[0] + centerCell.x - 20) + ',' + (p[1] + centerCell.y - 10));
      }
      assert.deepEqual(s.cells, shifted, 'contenu exact et centré');
      // Vue recadrée comme avec Recentrer
      const box = engine.boundingBox(s.cells);
      assert.near(s.camera.centerX, box.minX + (box.maxX - box.minX + 1) / 2, 1e-9);
      assert.near(s.camera.centerY, box.minY + (box.maxY - box.minY + 1) / 2, 1e-9);
      assert.deepEqual(s.camera, camera.fitToBox(cam, box), 'même cadrage que Recentrer, zoom compris');
      assert.notDeepEqual(s.camera, cam, 'la vue a bien changé');
      assert.equal(s.imageImport, null, 'conversion oubliée après validation');
    });

    test('sans Remplacer : le résultat entre en mode pose, avec rotation et poses multiples', function () {
      const e = setup();
      const before = sorted(e.c.getState().cells);
      e.c.previewImage(disc(), { mode: 'dither', brightness: 10, invert: true });
      const bmp = ic.convert(disc(), { mode: 'dither', brightness: 10, invert: true }).bitmap;
      const v = e.c.confirmImageImport(false);
      assert.equal(v.ok, true);
      const s = e.c.getState();
      assert.equal(s.placing.name, 'Image');
      assert.deepEqual(s.placing.shape.cells, ic.toCells(bmp, false));
      assert.deepEqual([s.placing.shape.width, s.placing.shape.height], [40, 20]);
      assert.deepEqual(sorted(s.cells), before, 'rien n\'est posé avant le clic');
      e.c.rotatePlacing(true);
      assert.deepEqual([e.c.getState().placing.shape.width, e.c.getState().placing.shape.height], [20, 40]);
      e.c.placeAt(100, 100);
      e.c.placeAt(-100, -100);
      assert.equal(e.c.getState().liveCount, 4 + 2 * bmp.count, 'deux poses ajoutées à l\'existant');
    });

    test('Annuler ou Échap : aucune modification', function () {
      const e = setup();
      const before = JSON.stringify(sorted(e.c.getState().cells));
      e.c.previewImage(disc(), { mode: 'threshold' });
      assert.equal(e.c.cancelImageImport(), true);
      assert.equal(e.c.getState().imageImport, null);
      assert.equal(e.c.confirmImageImport(true).ok, false, 'plus rien à valider');
      assert.equal(JSON.stringify(sorted(e.c.getState().cells)), before);
      // Échap dans la fenêtre : la touche y est ignorée par le contrôleur (champ de saisie)
      e.c.previewImage(disc(), { mode: 'threshold' });
      assert.equal(e.c.handleShortcut('Escape', Object.assign({}, PLAIN, { editable: true })), false);
      e.c.cancelImageImport();
      assert.equal(JSON.stringify(sorted(e.c.getState().cells)), before);
      assert.equal(e.c.getState().generation, 0);
    });

    test('mosaïque stable validée : la grille reste figée génération après génération', function () {
      const e = setup({ autoPause: true });
      const r = seeded(77);
      const img = makeImage(30, 30, function () { return r() < 0.5 ? 0 : 255; });
      e.c.previewImage(img, { mode: 'threshold', threshold: 128, mosaic: true });
      assert.equal(e.c.confirmImageImport(true).ok, true);
      const cells = e.c.getState().cells;
      e.c.step();
      assert.deepEqual(e.c.getState().cells, cells, 'figée');
      assert.ok(/État stable/.test(e.c.getState().message.text), e.c.getState().message.text);
      // Une perturbation à la gomme (une seule cellule d'un bloc) la remet en mouvement
      e.c.setTool('eraser');
      e.c.setEraserSize(1);
      const k = Array.from(cells)[0].split(',').map(Number);
      const before = e.c.getState().cells;
      e.c.pointerDown(400 + (k[0] + 0.5 - e.c.getState().camera.centerX) * e.c.getState().camera.cellSize,
        300 + (k[1] + 0.5 - e.c.getState().camera.centerY) * e.c.getState().camera.cellSize);
      e.c.pointerUp(400 + (k[0] + 0.5 - e.c.getState().camera.centerX) * e.c.getState().camera.cellSize,
        300 + (k[1] + 0.5 - e.c.getState().camera.centerY) * e.c.getState().camera.cellSize);
      assert.ok(e.c.getState().liveCount < before.size, 'une partie effacée');
      const afterErase = e.c.getState().cells;
      e.c.step();
      e.c.step();
      assert.ok(e.c.getState().generation === 2 && e.c.getState().liveCount > 0);
      assert.notDeepEqual(e.c.getState().cells, afterErase, 'elle évolue de nouveau');
    });

    test('aucune écriture du stockage ne contient de données d\'image', function () {
      const storage = fakeStorage();
      const e = setup({ storage: storage, dateNow: function () { return 1792400000000; } });
      e.c.restore();
      const photo = makeImage(64, 48, function (x, y) { return (x * 7 + y * 13) % 256; });
      const opened = e.open(file('photo.jpg', 'image/jpeg', 3 * MB));
      assert.equal(opened.ok, true);
      e.c.previewImage(photo, { mode: 'dither' });
      e.now = 5000;
      e.c.tick(5000);
      const writesDuringPreview = storage.writes.length;
      e.c.confirmImageImport(true);
      e.c.flushSave();
      assert.ok(storage.writes.length > writesDuringPreview, 'la grille obtenue est sauvegardée');
      for (const w of storage.writes) {
        const data = JSON.parse(w);
        assert.deepEqual(Object.keys(data).sort(), ['camera', 'cells', 'savedAt', 'schemaVersion', 'settings']);
        assert.deepEqual(Object.keys(data.cells).sort(), ['originX', 'originY', 'rle']);
        assert.ok(!/photo|image|data:|base64/i.test(w), 'aucune trace de l\'image');
      }
      assert.equal(e.c.getState().imageImport, null);
    });
  });
})(globalThis);
