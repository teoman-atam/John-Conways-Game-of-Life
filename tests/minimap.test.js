/*
 * Tests de la mini-carte : étendue et paliers d'échelle, hystérésis, conversions, rastérisation,
 * rectangle de la vue, rafraîchissement limité (horloge injectée), navigation au clic et au glisser,
 * touche M et sauvegarde de la visibilité.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const persistence = (root.Life && root.Life.persistence) || require('../src/persistence.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const mm = (root.Life && root.Life.minimap) || require('../src/minimap.js');
  const tooltips = (root.Life && root.Life.tooltips) || require('../src/tooltips.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const W = mm.MINIMAP_WIDTH;
  const H = mm.MINIMAP_HEIGHT;

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function cam(centerX, centerY, cellSize, width, height) {
    return { centerX: centerX, centerY: centerY, cellSize: cellSize, width: width || 976, height: height || 760 };
  }

  // Contenu (cellules + vue) agrandi de 10 % de chaque côté, comme l'exige l'étendue
  function padded(cellsBox, view) {
    const b = { minX: view.minX, minY: view.minY, maxX: view.maxX, maxY: view.maxY };
    if (cellsBox) {
      b.minX = Math.min(b.minX, cellsBox.minX);
      b.minY = Math.min(b.minY, cellsBox.minY);
      b.maxX = Math.max(b.maxX, cellsBox.maxX + 1);
      b.maxY = Math.max(b.maxY, cellsBox.maxY + 1);
    }
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    return { minX: b.minX - 0.1 * w, minY: b.minY - 0.1 * h, maxX: b.maxX + 0.1 * w, maxY: b.maxY + 0.1 * h };
  }

  function covers(extent, box) {
    return extent.minX <= box.minX && box.maxX <= extent.maxX && extent.minY <= box.minY && box.maxY <= extent.maxY;
  }

  function isPowerOfTwo(x) {
    return x > 0 && Number.isInteger(Math.log2(x)) && Math.pow(2, Math.log2(x)) === x;
  }

  function stateOf(c) {
    const s = c.getState();
    return { cells: s.cells, camera: s.camera, busy: s.running || s.jumping !== null };
  }

  function fakeStorage() {
    const store = { data: {}, writes: 0 };
    store.getItem = function (k) { return Object.prototype.hasOwnProperty.call(store.data, k) ? store.data[k] : null; };
    store.setItem = function (k, v) { store.writes++; store.data[k] = String(v); };
    store.removeItem = function (k) { delete store.data[k]; };
    return store;
  }

  suite('Mini-carte — étendue et échelle', function () {
    test('l\'étendue couvre toutes les cellules vivantes et la vue, avec une marge de 10 %', function () {
      const configs = [
        { box: { minX: -50, minY: -40, maxX: -30, maxY: -35 }, view: mm.viewportBox(cam(0.5, 0.5, 12)) },
        { box: { minX: 100, minY: 200, maxX: 900, maxY: 260 }, view: mm.viewportBox(cam(-300.25, 10.5, 4)) },
        { box: { minX: -1000000000, minY: 999999990, maxX: 1000000000, maxY: 1000000000 }, view: mm.viewportBox(cam(0.5, 0.5, 12)) },
        { box: { minX: 3, minY: 3, maxX: 3, maxY: 3 }, view: mm.viewportBox(cam(4, 4, 64)) },
      ];
      for (const c of configs) {
        const e = mm.computeExtent(c.box, c.view, null);
        assert.ok(covers(e, padded(c.box, c.view)), JSON.stringify(e) + ' couvre ' + JSON.stringify(padded(c.box, c.view)));
        assert.equal(e.maxX - e.minX, W * e.scale, 'largeur = 200 px × échelle');
        assert.equal(e.maxY - e.minY, H * e.scale, 'hauteur = 140 px × échelle');
        assert.ok(Number.isFinite(e.minX) && Number.isFinite(e.minY));
      }
    });

    test('grille vide : l\'étendue est celle de la vue, avec sa marge, centrée sur elle', function () {
      for (const c of [cam(0.5, 0.5, 12), cam(-12345.5, 678.25, 2), cam(1e9, -1e9, 30, 400, 300)]) {
        const view = mm.viewportBox(c);
        const e = mm.computeExtent(null, view, null);
        assert.ok(covers(e, padded(null, view)));
        // Centrée sur la vue à un pixel près (alignement de l'origine sur l'échelle)
        assert.ok(Math.abs((e.minX + e.maxX) / 2 - c.centerX) <= e.scale, 'centre x');
        assert.ok(Math.abs((e.minY + e.maxY) / 2 - c.centerY) <= e.scale, 'centre y');
        // Même étendue que si l'on passe une boîte de cellules contenue dans la vue
        const inside = { minX: Math.floor(c.centerX), minY: Math.floor(c.centerY), maxX: Math.floor(c.centerX), maxY: Math.floor(c.centerY) };
        assert.deepEqual(mm.computeExtent(inside, view, null), e);
      }
    });

    test('paliers d\'échelle : toujours une puissance de 2, la plus petite qui convient', function () {
      // Vue de 1280 × 760 px à 12 px par cellule : 128 × 76 cellules avec la marge → 1 cellule par pixel
      assert.equal(mm.computeExtent(null, mm.viewportBox(cam(0.5, 0.5, 12, 1280, 760)), null).scale, 1);
      // À 3 px par cellule : 512 × 304 → 4 cellules par pixel
      assert.equal(mm.computeExtent(null, mm.viewportBox(cam(0.5, 0.5, 3, 1280, 760)), null).scale, 4);
      // Un planeur parti à (10⁹, 10⁹) : environ 1,2 × 10⁹ cellules sur 140 px de haut → 2^24
      const far = { minX: 1000000000, minY: 1000000000, maxX: 1000000002, maxY: 1000000002 };
      assert.equal(mm.computeExtent(far, mm.viewportBox(cam(0.5, 0.5, 12)), null).scale, Math.pow(2, 24));
      // De près : au plus 8 px par cellule
      assert.equal(mm.computeExtent(null, mm.viewportBox(cam(0.5, 0.5, 64, 200, 140)), null).scale, mm.MIN_SCALE);
      const r = seeded(17);
      for (let i = 0; i < 300; i++) {
        const span = Math.pow(10, 1 + r() * 8);
        const x = (r() - 0.5) * 2e9;
        const y = (r() - 0.5) * 2e9;
        const box = { minX: Math.floor(x), minY: Math.floor(y), maxX: Math.floor(x + span * r()), maxY: Math.floor(y + span * r()) };
        const view = mm.viewportBox(cam(x + (r() - 0.5) * span, y + (r() - 0.5) * span, 1 + r() * 63));
        const e = mm.computeExtent(box, view, null);
        assert.ok(isPowerOfTwo(e.scale), 'échelle ' + e.scale);
        const p = padded(box, view);
        assert.ok(covers(e, p), 'couvre le contenu et sa marge');
        // Le palier inférieur serait trop petit (à l'alignement près, qui peut coûter un palier)
        const tooSmall = (p.maxX - p.minX) > W * e.scale / 4 || (p.maxY - p.minY) > H * e.scale / 4;
        assert.ok(tooSmall || e.scale === mm.MIN_SCALE, 'pas plus de deux paliers au-dessus du nécessaire');
      }
    });

    test('hystérésis : un planeur qui avance de 4 cases dans l\'étendue ne change pas l\'échelle', function () {
      const view = mm.viewportBox(cam(0.5, 0.5, 12, 400, 300));
      let cells = patterns.cells('glider');
      const e0 = mm.computeExtent(engine.boundingBox(cells), view, null);
      // Déplacement direct de 4 cases en diagonale
      const moved = engine.translate(cells, 4, 4);
      assert.equal(mm.computeExtent(engine.boundingBox(moved), view, e0), e0, 'même étendue, même objet');
      // Les 16 générations qui le font avancer de 4 cases : jamais de changement
      for (let g = 0; g < 16; g++) {
        cells = engine.nextGeneration(cells);
        assert.equal(mm.computeExtent(engine.boundingBox(cells), view, e0), e0, 'génération ' + (g + 1));
      }
    });

    test('hystérésis : nouvelle étendue si le contenu sort, ou s\'il en occupe moins d\'un quart', function () {
      const view = mm.viewportBox(cam(0.5, 0.5, 12, 400, 300));
      const box = { minX: -20, minY: -20, maxX: 20, maxY: 20 };
      const e0 = mm.computeExtent(box, view, null);
      // Le contenu sort de l'étendue : elle s'agrandit et le couvre
      const out = { minX: -20, minY: -20, maxX: Math.ceil(e0.maxX) + 5, maxY: 20 };
      const e1 = mm.computeExtent(out, view, e0);
      assert.notEqual(e1, e0);
      assert.ok(covers(e1, padded(out, view)) && e1.scale >= e0.scale);
      // Contenu qui occupe entre un quart et la moitié de l'étendue : rien ne bouge
      const big = mm.computeExtent({ minX: -400, minY: -300, maxX: 400, maxY: 300 }, view, null);
      const mid = { minX: -250, minY: -150, maxX: 250, maxY: 150 };
      assert.ok(501 / (big.maxX - big.minX) >= 0.25 && 501 / (big.maxX - big.minX) < 0.5, 'un tiers environ');
      assert.ok(mm.computeExtent(mid, view, null).scale < big.scale, 'calculée à neuf, l\'échelle serait plus fine');
      assert.equal(mm.computeExtent(mid, view, big), big, 'au moins un quart : étendue gardée');
      // Moins d'un quart : l'échelle se resserre, et le contenu reste couvert
      const small = { minX: -20, minY: -20, maxX: 20, maxY: 20 };
      const e2 = mm.computeExtent(small, view, big);
      assert.ok(e2.scale < big.scale, 'échelle plus fine : ' + e2.scale + ' < ' + big.scale);
      assert.ok(covers(e2, padded(small, view)));
      // Taille de mini-carte différente : nouvelle étendue
      assert.notEqual(mm.computeExtent(box, view, e0, { width: 100, height: 70 }), e0);
    });
  });

  suite('Mini-carte — conversions, rastérisation et vue', function () {
    test('aller-retour exact des conversions, en négatif et jusqu\'à ±10⁹, sans NaN', function () {
      const extents = [
        mm.computeExtent(null, mm.viewportBox(cam(0.5, 0.5, 64, 200, 140)), null),
        mm.computeExtent({ minX: -1000000000, minY: -1000000000, maxX: 1000000000, maxY: 1000000000 }, mm.viewportBox(cam(0, 0, 12)), null),
        mm.computeExtent({ minX: 999999000, minY: -1000000000, maxX: 1000000000, maxY: -999999500 }, mm.viewportBox(cam(999999500, -999999800, 2)), null),
        mm.computeExtent({ minX: -77, minY: -5, maxX: -3, maxY: 40 }, mm.viewportBox(cam(-40, 10, 6)), null),
      ];
      const points = [[0, 0], [-1, -1], [1000000000, -1000000000], [-1000000000, 1000000000], [-999999999, 999999998], [123456789, -987654321], [-77, 40]];
      for (const e of extents) {
        assert.ok(isPowerOfTwo(e.scale));
        for (const p of points) {
          const m = mm.worldToMinimap(e, p[0], p[1]);
          assert.ok(!Number.isNaN(m.x) && !Number.isNaN(m.y));
          const back = mm.minimapToWorld(e, m.x, m.y);
          assert.equal(back.x, p[0], 'x exact pour ' + p);
          assert.equal(back.y, p[1], 'y exact pour ' + p);
        }
        // Coordonnées non entières : écart invisible (bien moins d'une cellule)
        for (const p of [[1000000000.37, -999999999.62], [-0.125, 0.75]]) {
          const back = mm.minimapToWorld(e, mm.worldToMinimap(e, p[0], p[1]).x, mm.worldToMinimap(e, p[0], p[1]).y);
          assert.near(back.x, p[0], 1e-6);
          assert.near(back.y, p[1], 1e-6);
        }
        // Et dans l'autre sens, pour chaque pixel de la carte
        for (const px of [0, 1, 99.5, 199, 200]) {
          const w = mm.minimapToWorld(e, px, px * 0.7);
          const m = mm.worldToMinimap(e, w.x, w.y);
          assert.equal(m.x, px);
          assert.near(m.y, px * 0.7, 1e-6, 'écart invisible (millionième de pixel)');
        }
      }
    });

    test('rastérisation : une cellule allume un pixel, plusieurs dans un même pixel l\'allument une fois', function () {
      const e = { minX: -64, minY: -32, maxX: -64 + W * 4, maxY: -32 + H * 4, scale: 4, width: W, height: H };
      const one = mm.rasterize(new Set(['-61,-29']), e, W, H);
      assert.equal(one.lit, 1);
      assert.equal(one.pixels[0], 1, 'pixel (0, 0)');
      assert.equal(one.pixels.length, W * H);
      // Seize cellules dans le même pixel de 4 × 4 cellules
      const many = new Set();
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) many.add(engine.key(-64 + 4 * 10 + x, -32 + 4 * 5 + y));
      const r = mm.rasterize(many, e, W, H);
      assert.equal(r.lit, 1, 'un seul pixel allumé');
      assert.equal(r.pixels[5 * W + 10], 1);
      let total = 0;
      for (const v of r.pixels) total += v;
      assert.equal(total, 1, 'valeur 1, pas un compte');
    });

    test('rastérisation : une cellule hors de l\'étendue est ignorée', function () {
      const e = { minX: 0, minY: 0, maxX: W, maxY: H, scale: 1, width: W, height: H };
      const r = mm.rasterize(new Set(['-1,0', '0,-1', String(W) + ',5', '5,' + H, '-1000000000,1000000000', '3,4']), e, W, H);
      assert.equal(r.lit, 1);
      assert.equal(r.pixels[4 * W + 3], 1);
      // De près (8 px par cellule), une cellule couvre un carré de 8 × 8 pixels
      const near = { minX: 0, minY: 0, maxX: W / 8, maxY: H / 8, scale: 1 / 8, width: W, height: H };
      const big = mm.rasterize(new Set(['2,1', '-1,-1']), near, W, H);
      assert.equal(big.lit, 64);
      assert.equal(big.pixels[8 * W + 16], 1);
      assert.equal(big.pixels[15 * W + 23], 1);
      assert.equal(big.pixels[16 * W + 24], 0);
      // Les cellules décodées à l'avance donnent le même résultat
      assert.deepEqual(Array.from(mm.rasterize(mm.decodeCells(new Set(['2,1'])), near, W, H).pixels),
        Array.from(mm.rasterize(new Set(['2,1']), near, W, H).pixels));
    });

    test('rectangle de la vue, et repère de taille fixe sous 4 px', function () {
      const e = { minX: -100, minY: -70, maxX: 100, maxY: 70, scale: 1, width: W, height: H };
      const r = mm.viewportRect(e, { minX: -50, minY: -20, maxX: 30, maxY: 25 }, W, H);
      assert.deepEqual([r.x, r.y, r.width, r.height, r.marker, r.visible], [50, 50, 80, 45, false, true]);
      // Vue de 3 × 2 cellules à 1 cellule par pixel : moins de 4 px → repère centré
      const tiny = mm.viewportRect(e, { minX: 10, minY: 10, maxX: 13, maxY: 12 }, W, H);
      assert.equal(tiny.marker, true);
      assert.equal(tiny.width, mm.MARKER_SIZE);
      assert.equal(tiny.height, mm.MARKER_SIZE);
      assert.equal(tiny.x + tiny.width / 2, 111.5);
      assert.equal(tiny.y + tiny.height / 2, 81);
      // Exactement 4 px : rectangle réel
      assert.equal(mm.viewportRect(e, { minX: 0, minY: 0, maxX: 4, maxY: 4 }, W, H).marker, false);
      // Vue hors de la carte
      assert.equal(mm.viewportRect(e, { minX: 500, minY: 0, maxX: 600, maxY: 50 }, W, H).visible, false);
    });

    test('texte de l\'échelle, couleurs des thèmes et place sous les barres flottantes', function () {
      assert.equal(mm.scaleLabel(64), '1 px = 64 cellules');
      assert.equal(mm.scaleLabel(1), '1 px = 1 cellule');
      assert.equal(mm.scaleLabel(8388608), '1 px = 8 388 608 cellules');
      assert.equal(mm.scaleLabel(0.25), '1 cellule = 4 px');
      assert.deepEqual(mm.parseColor('#1d2a33'), [29, 42, 51, 255]);
      assert.deepEqual(mm.parseColor(' #7EE2BD '), [126, 226, 189, 255]);
      assert.deepEqual(mm.parseColor('#fff'), [255, 255, 255, 255]);
      assert.deepEqual(mm.parseColor('#00000080'), [0, 0, 0, 128]);
      assert.deepEqual(mm.parseColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 128]);
      assert.deepEqual(mm.parseColor('rgb(1 2 3)'), [1, 2, 3, 255]);
      assert.deepEqual(mm.parseColor('n\'importe quoi'), [0, 0, 0, 255]);
      // Zone de 976 px : la barre (12 → 917 px) occupe la bande de la mini-carte → dessous
      assert.equal(mm.minimapTop(976, [{ left: 12, top: 12, right: 917, bottom: 50 }], 200, 157), 58);
      // Panneau replié (1 280 px) : la barre s'arrête avant → tout en haut
      assert.equal(mm.minimapTop(1280, [{ left: 12, top: 12, right: 917, bottom: 50 }], 200, 157), 12);
      // Barre sur deux lignes, plus la barre de pose dessous : sous les trois
      const rects = [{ left: 12, top: 12, right: 600, bottom: 50 }, { left: 12, top: 58, right: 560, bottom: 96 }, { left: 12, top: 104, right: 520, bottom: 142 }];
      assert.equal(mm.minimapTop(700, rects, 200, 157), 150);
      // Un élément bas (graphique) ne repousse pas la mini-carte
      assert.equal(mm.minimapTop(976, [{ left: 600, top: 580, right: 964, bottom: 748 }], 200, 157), 12);
    });
  });

  suite('Mini-carte — rafraîchissement et navigation', function () {
    function setup(options) {
      const env = { now: 0, pans: [] };
      env.c = ctrl.createController({ random: seeded(4), width: 976, height: 760, clock: function () { return env.now; } });
      env.m = mm.createMinimap(Object.assign({
        clock: function () { return env.now; },
        panTo: function (x, y) { env.pans.push([x, y]); mm.centerViewOn(env.c, x, y); },
      }, options || {}));
      return env;
    }

    test('pendant la simulation : au plus 10 rastérisations par seconde, horloge injectée', function () {
      const env = setup();
      env.c.loadPattern('gosper-gun');
      env.c.placeAt(0, 0);
      env.c.cancelPlacing();
      env.c.setSpeed(30);
      env.c.start();
      const times = [];
      let generationsSeen = 0;
      for (let f = 0; f <= 120; f++) {
        env.now = f * 1000 / 60; // 60 images par seconde pendant 2 s
        env.c.tick(env.now);
        const frame = env.m.update(stateOf(env.c));
        if (frame && frame.rasterized) times.push(env.now);
        generationsSeen = env.c.getState().generation;
      }
      assert.ok(generationsSeen >= 55, 'la simulation a tourné : ' + generationsSeen + ' générations');
      assert.ok(times.length <= 21, times.length + ' rastérisations en 2 s');
      assert.ok(times.length >= 18, 'elle suit quand même la simulation : ' + times.length);
      for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 100 - 1e-9, 'écart ' + (times[i] - times[i - 1]));
      assert.equal(env.m.rasterCount(), times.length);
    });

    test('en pause : immédiate après une édition ; zoom et déplacement : la vue suit aussitôt', function () {
      const env = setup();
      const first = env.m.update(stateOf(env.c));
      assert.ok(first && first.rasterized, 'premier affichage');
      assert.equal(env.m.update(stateOf(env.c)), null, 'rien n\'a changé : rien à redessiner');
      env.now = 5;
      env.c.toggleCell(3, 4);
      const edited = env.m.update(stateOf(env.c));
      assert.ok(edited && edited.rasterized && edited.lit === 1, 'édition visible dès l\'image suivante');
      env.now = 10;
      env.c.panBy(24, 0);
      const panned = env.m.update(stateOf(env.c));
      assert.ok(panned, 'déplacement : redessin immédiat');
      assert.equal(panned.rasterized, false, 'sans nouvelle rastérisation : l\'étendue n\'a pas changé');
      assert.near(panned.rect.x, edited.rect.x - 2 / edited.extent.scale, 1e-9, 'le rectangle a suivi');
      env.now = 15;
      env.c.zoomAt(0.5, 488, 380);
      const zoomed = env.m.update(stateOf(env.c));
      assert.ok(zoomed && zoomed.rect.width > panned.rect.width, 'dézoom : rectangle plus grand');
      // Grand dézoom : la vue sort de l'étendue → nouvelle étendue et rastérisation immédiates
      env.c.zoomAt(1 / 8, 488, 380);
      const out = env.m.update(stateOf(env.c));
      assert.ok(out.rasterized && out.extent.scale > zoomed.extent.scale);
    });

    test('un clic centre la vue principale sur le point visé et conserve le zoom', function () {
      const env = setup();
      env.c.zoomAt(1.6, 100, 100);
      const before = env.c.getState().camera;
      env.m.update(stateOf(env.c));
      const e = env.m.extent();
      assert.ok(env.m.pointerDown(170, 20, before));
      assert.equal(env.m.pointerUp(170, 20), 'click');
      const target = mm.minimapToWorld(e, 170, 20);
      const after = env.c.getState().camera;
      assert.near(after.centerX, target.x, 1e-9);
      assert.near(after.centerY, target.y, 1e-9);
      assert.equal(after.cellSize, before.cellSize, 'zoom inchangé');
      // Loin de l'origine aussi
      env.c.panBy(-2e9 * after.cellSize, 1e9 * after.cellSize);
      env.m.update(stateOf(env.c));
      const e2 = env.m.extent();
      env.m.pointerDown(30, 120, env.c.getState().camera);
      env.m.pointerUp(30, 120);
      const t2 = mm.minimapToWorld(e2, 30, 120);
      assert.near(env.c.getState().camera.centerX, t2.x, 1e-6);
      assert.near(env.c.getState().camera.centerY, t2.y, 1e-6);
    });

    test('un glisser déplace la vue en continu ; l\'étendue reste figée pendant le glisser', function () {
      const env = setup();
      const f = env.m.update(stateOf(env.c));
      const e = f.extent;
      const cx = f.rect.x + f.rect.width / 2 + 7;
      const cy = f.rect.y + f.rect.height / 2 - 3;
      const start = env.c.getState().camera;
      // Prise dans le rectangle de la vue : rien ne bouge à l'appui ni sous le seuil
      env.m.pointerDown(cx, cy, start);
      env.m.pointerMove(cx + 2, cy + 1);
      assert.deepEqual(env.pans, [], 'sous le seuil de glisser');
      const steps = [[20, 0], [40, 10], [60, 25], [300, 200]];
      for (const s of steps) {
        env.m.pointerMove(cx + s[0], cy + s[1]);
        const c = env.c.getState().camera;
        assert.near(c.centerX, start.centerX + s[0] * e.scale, 1e-9, 'suivi en x');
        assert.near(c.centerY, start.centerY + s[1] * e.scale, 1e-9, 'suivi en y');
        assert.equal(env.m.update(stateOf(env.c)).extent, e, 'étendue figée');
      }
      assert.equal(env.m.pointerUp(cx + 300, cy + 200), 'drag');
      assert.equal(env.c.getState().camera.cellSize, start.cellSize);
      // Relâché : la vue est sortie de l'étendue, qui s'adapte
      assert.notEqual(env.m.update(stateOf(env.c)).extent, e);
      // Appui hors du rectangle : la vue y saute aussitôt, puis suit
      const f2 = env.m.update(stateOf(env.c)) || { extent: env.m.extent() };
      env.m.pointerDown(5, 5, env.c.getState().camera);
      const t = mm.minimapToWorld(env.m.extent(), 5, 5);
      assert.near(env.c.getState().camera.centerX, t.x, 1e-9);
      env.m.pointerCancel();
      assert.equal(env.m.isDragging(), false);
      assert.ok(f2);
    });

    test('masquée : aucune mise à jour ni navigation ; réaffichée : tout est redessiné', function () {
      const env = setup();
      env.m.update(stateOf(env.c));
      assert.equal(env.m.toggle(), false);
      assert.equal(env.m.isVisible(), false);
      env.c.toggleCell(1, 1);
      assert.equal(env.m.update(stateOf(env.c)), null);
      assert.equal(env.m.pointerDown(10, 10, env.c.getState().camera), false);
      assert.equal(env.m.toggle(), true);
      const f = env.m.update(stateOf(env.c));
      assert.ok(f && f.rasterized && f.lit === 1);
      env.m.invalidate();
      assert.ok(env.m.update(stateOf(env.c)), 'invalidate : redessin (thème, taille)');
      assert.equal(mm.createMinimap({ clock: function () { return 0; }, visible: false }).isVisible(), false);
      assert.throws(function () { mm.createMinimap({}); }, /clock/);
    });

    test('rendu sur un canvas séparé, en pixels physiques (net sur écran Retina)', function () {
      const log = [];
      const ctx = {
        createImageData: function (w, h) { log.push(['createImageData', w, h]); return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData: function (img, x, y) { log.push(['putImageData', x, y]); ctx.last = img; },
        strokeRect: function () { log.push(['strokeRect'].concat(Array.prototype.slice.call(arguments))); },
        beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, stroke: function () { log.push(['stroke']); },
      };
      const canvas = { width: 0, height: 0, getContext: function () { return ctx; } };
      const r = mm.createMinimapRenderer(canvas);
      r.resize(W, H, 2);
      assert.deepEqual([canvas.width, canvas.height], [400, 280]);
      r.setColors({ cell: '#102030', view: '#e8590c' });
      const pixels = new Uint8Array(W * H);
      pixels[7 * W + 5] = 1;
      r.draw({ pixels: pixels, width: W, height: H, rect: { x: 50, y: 40, width: 80, height: 45, marker: false, visible: true } });
      const d = ctx.last.data;
      const at = function (x, y) { return Array.from(d.slice((y * 400 + x) * 4, (y * 400 + x) * 4 + 4)); };
      // Le pixel (5, 7) de la carte couvre exactement les pixels physiques 10–11 × 14–15
      for (const p of [[10, 14], [11, 14], [10, 15], [11, 15]]) assert.deepEqual(at(p[0], p[1]), [16, 32, 48, 255]);
      for (const p of [[9, 14], [12, 14], [10, 13], [10, 16]]) assert.deepEqual(at(p[0], p[1]), [0, 0, 0, 0], 'transparent : fond du CSS');
      assert.equal(ctx.strokeStyle, '#e8590c');
      assert.deepEqual(log.filter(function (e) { return e[0] === 'strokeRect'; })[0], ['strokeRect', 101.5, 81.5, 157, 87]);
      // Même tampon : l'image n'est pas reconstruite
      r.draw({ pixels: pixels, width: W, height: H, rect: { x: 0, y: 0, width: 10, height: 10, marker: true, visible: true } });
      assert.equal(log.filter(function (e) { return e[0] === 'createImageData'; }).length, 1);
      assert.ok(log.some(function (e) { return e[0] === 'stroke'; }), 'repère : croix');
    });
  });

  suite('Mini-carte — touche M et sauvegarde de la visibilité', function () {
    test('M (ou Maj+M) bascule la mini-carte, sans ⌘, Ctrl ni Alt, jamais dans un champ', function () {
      const plain = { shift: false, meta: false, ctrl: false, alt: false, editable: false };
      assert.equal(tooltips.matchShortcut('minimap', 'm', plain), true);
      assert.equal(tooltips.matchShortcut('minimap', 'M', Object.assign({}, plain, { shift: true })), true);
      assert.equal(tooltips.matchShortcut('minimap', 'm', Object.assign({}, plain, { meta: true })), false, '⌘M : réduire la fenêtre');
      assert.equal(tooltips.matchShortcut('minimap', 'm', Object.assign({}, plain, { ctrl: true })), false);
      assert.equal(tooltips.matchShortcut('minimap', 'm', Object.assign({}, plain, { alt: true })), false);
      assert.equal(tooltips.matchShortcut('minimap', 'm', Object.assign({}, plain, { editable: true })), false);
      assert.equal(tooltips.matchShortcut('minimap', 'n', plain), false);
      const m = mm.createMinimap({ clock: function () { return 0; } });
      assert.equal(m.isVisible(), true, 'visible au départ');
      assert.equal(m.toggle(), false);
      assert.equal(m.toggle(), true);
    });

    test('la visibilité est sauvegardée avec la grille, puis restaurée ; sans le champ, visible', function () {
      const env = { now: 0 };
      const storage = fakeStorage();
      const map = mm.createMinimap({ clock: function () { return env.now; } });
      const wrapped = persistence.withOptionalSettings(storage, function () { return { minimapVisible: map.isVisible() }; });
      const c = ctrl.createController({ random: seeded(2), width: 800, height: 600, clock: function () { return env.now; }, storage: wrapped });
      c.restore();
      c.toggleCell(5, 5);
      c.flushSave();
      assert.equal(JSON.parse(storage.data[persistence.STORAGE_KEY]).settings.minimapVisible, true);
      // M : la sauvegarde existante est complétée aussitôt
      map.toggle();
      const patched = persistence.writeOptional(storage.getItem(persistence.STORAGE_KEY), { minimapVisible: map.isVisible() });
      storage.setItem(persistence.STORAGE_KEY, patched);
      assert.equal(JSON.parse(storage.data[persistence.STORAGE_KEY]).settings.minimapVisible, false);
      // Les écritures suivantes du contrôleur gardent la valeur courante
      c.toggleCell(6, 6);
      c.flushSave();
      const text = storage.getItem(persistence.STORAGE_KEY);
      assert.equal(JSON.parse(text).settings.minimapVisible, false);
      // Rechargement : nouveau contrôleur et nouvelle mini-carte
      const c2 = ctrl.createController({ random: seeded(2), width: 800, height: 600, storage: persistence.withOptionalSettings(storage, function () { return {}; }) });
      assert.equal(c2.restore().status, 'restored');
      assert.deepEqual(c2.getState().cells, new Set(['5,5', '6,6']));
      const restored = persistence.readOptional(text);
      assert.equal(restored.minimapVisible, false);
      assert.equal(mm.createMinimap({ clock: function () { return 0; }, visible: restored.minimapVisible }).isVisible(), false);
      const r = persistence.deserialize(text, { maxCells: 100000, minSpeed: 1, maxSpeed: 30, minDensity: 5, maxDensity: 50, minJump: 1, maxJump: 10000 });
      assert.equal(r.ok, true, r.error);
      assert.deepEqual(r.value.optional, { minimapVisible: false });
      // Sauvegarde sans le champ : mini-carte visible
      const data = JSON.parse(text);
      delete data.settings.minimapVisible;
      assert.equal(persistence.readOptional(JSON.stringify(data)).minimapVisible, true);
      assert.equal(persistence.readOptional('illisible').minimapVisible, true);
      assert.equal(persistence.readOptional(null).minimapVisible, true);
      assert.equal(persistence.writeOptional('illisible', { minimapVisible: false }), null);
    });

    test('le stockage complété laisse passer lectures, suppressions et erreurs de quota', function () {
      const storage = fakeStorage();
      const wrapped = persistence.withOptionalSettings(storage, function () { return { minimapVisible: false }; });
      wrapped.setItem('autre-clé', '{"settings":{}}');
      assert.equal(storage.data['autre-clé'], '{"settings":{}}', 'autre clé : texte inchangé');
      wrapped.setItem(persistence.STORAGE_KEY, 'pas du JSON');
      assert.equal(storage.data[persistence.STORAGE_KEY], 'pas du JSON', 'texte illisible écrit tel quel');
      assert.equal(wrapped.getItem(persistence.STORAGE_KEY), 'pas du JSON');
      wrapped.removeItem(persistence.STORAGE_KEY);
      assert.equal(storage.getItem(persistence.STORAGE_KEY), null);
      const full = { getItem: function () { return null; }, removeItem: function () {},
        setItem: function () { const e = new Error('plein'); e.name = 'QuotaExceededError'; throw e; } };
      const c = ctrl.createController({ random: seeded(2), width: 800, height: 600,
        storage: persistence.withOptionalSettings(full, function () { return { minimapVisible: true }; }) });
      c.restore();
      c.toggleCell(1, 1);
      c.flushSave();
      assert.equal(c.getState().save.status, 'error', 'le contrôleur voit l\'erreur de quota');
      assert.ok(/espace de stockage local est plein/.test(c.getState().message.text));
    });
  });
})(globalThis);
