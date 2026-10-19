/*
 * Tests de la caméra : conversions, zoom, déplacement, recentrage, seuil clic / glisser.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const suite = T.suite, test = T.test, assert = T.assert;
  const EPS = 1e-9;

  suite('Caméra — conversions et zoom', function () {
    test('état initial : cellules de 12 px, origine centrée', function () {
      const cam = camera.createCamera(800, 600);
      assert.equal(cam.cellSize, 12);
      assert.equal(camera.DEFAULT_CELL_SIZE, 12);
      assert.deepEqual(camera.screenToCell(cam, 400, 300), { x: 0, y: 0 }, 'la cellule (0,0) est au centre');
      const p = camera.worldToScreen(cam, 0.5, 0.5);
      assert.near(p.x, 400, EPS);
      assert.near(p.y, 300, EPS);
    });

    test('aller-retour écran → grille → écran exact', function () {
      const cams = [
        camera.createCamera(800, 600),
        Object.assign(camera.createCamera(1440, 900), { cellSize: 7.3, centerX: -123.4, centerY: 56.7 }),
        Object.assign(camera.createCamera(375, 812), { cellSize: 1, centerX: -1000000000.25, centerY: 1000000000.75 }),
        Object.assign(camera.createCamera(1000, 700), { cellSize: 64, centerX: 3, centerY: -3 }),
      ];
      const points = [[0, 0], [400, 300], [123.25, 456.5], [799, 599], [-50, 1200]];
      for (const cam of cams) {
        for (const pt of points) {
          const w = camera.screenToWorld(cam, pt[0], pt[1]);
          const back = camera.worldToScreen(cam, w.x, w.y);
          assert.near(back.x, pt[0], 1e-6, 'x pour cellSize ' + cam.cellSize);
          assert.near(back.y, pt[1], 1e-6, 'y pour cellSize ' + cam.cellSize);
        }
      }
    });

    test('aller-retour cellule → écran → cellule exact (y compris coordonnées extrêmes)', function () {
      const cam = Object.assign(camera.createCamera(1200, 800), { cellSize: 9, centerX: -1000000000, centerY: 1000000000 });
      for (let dx = -40; dx <= 40; dx += 7) {
        for (let dy = -30; dy <= 30; dy += 6) {
          const cx = -1000000000 + dx;
          const cy = 1000000000 + dy;
          const s = camera.worldToScreen(cam, cx + 0.5, cy + 0.5);
          assert.deepEqual(camera.screenToCell(cam, s.x, s.y), { x: cx, y: cy });
        }
      }
    });

    test('le zoom garde fixe le point situé sous le curseur', function () {
      let cam = Object.assign(camera.createCamera(1000, 700), { cellSize: 10, centerX: 12.3, centerY: -4.5 });
      const cursors = [[100, 80], [999, 699], [500, 350], [3, 640]];
      const factors = [1.1, 0.8, 2, 0.5, 1.37];
      for (const c of cursors) {
        for (const f of factors) {
          const before = camera.screenToWorld(cam, c[0], c[1]);
          const zoomed = camera.zoomAt(cam, f, c[0], c[1]);
          const after = camera.screenToWorld(zoomed, c[0], c[1]);
          assert.near(after.x, before.x, 1e-9, 'x fixe (facteur ' + f + ')');
          assert.near(after.y, before.y, 1e-9, 'y fixe (facteur ' + f + ')');
          const screen = camera.worldToScreen(zoomed, before.x, before.y);
          assert.near(screen.x, c[0], 1e-6);
          assert.near(screen.y, c[1], 1e-6);
          cam = zoomed;
        }
      }
    });

    test('les limites de zoom (1 à 64 px) sont respectées', function () {
      let cam = camera.createCamera(800, 600);
      for (let i = 0; i < 100; i++) cam = camera.zoomAt(cam, 1.5, 10, 20);
      assert.equal(cam.cellSize, 64, 'maximum');
      for (let i = 0; i < 100; i++) cam = camera.zoomAt(cam, 0.5, 700, 500);
      assert.equal(cam.cellSize, 1, 'minimum');
      assert.equal(camera.clampCellSize(0.2), 1);
      assert.equal(camera.clampCellSize(1000), 64);
    });

    test('zoomer en butée ne déplace pas la vue', function () {
      const cam = Object.assign(camera.createCamera(800, 600), { cellSize: 64, centerX: 5, centerY: 7 });
      const same = camera.zoomAt(cam, 2, 10, 10);
      assert.equal(same.centerX, 5);
      assert.equal(same.centerY, 7);
    });

    test('déplacement : le contenu suit le pointeur', function () {
      const cam = camera.createCamera(800, 600);
      const before = camera.screenToWorld(cam, 100, 100);
      const moved = camera.pan(cam, 36, -24);
      const after = camera.screenToWorld(moved, 136, 76);
      assert.near(after.x, before.x, EPS);
      assert.near(after.y, before.y, EPS);
      assert.equal(moved.cellSize, cam.cellSize, 'le zoom ne change pas');
    });

    test('plage visible : cellules partiellement visibles incluses', function () {
      const cam = Object.assign(camera.createCamera(100, 50), { cellSize: 10, centerX: 0, centerY: 0 });
      assert.deepEqual(camera.visibleCells(cam), { minX: -5, minY: -3, maxX: 4, maxY: 2 });
    });
  });

  suite('Caméra — recentrage', function () {
    test('ajuste la vue sur la boîte englobante, entièrement visible', function () {
      const cam = camera.createCamera(800, 600);
      const box = { minX: -50, minY: 10, maxX: 49, maxY: 29 };
      const fit = camera.fitToBox(cam, box);
      const v = camera.visibleCells(fit);
      assert.ok(v.minX <= box.minX && v.maxX >= box.maxX && v.minY <= box.minY && v.maxY >= box.maxY,
        'boîte visible : ' + JSON.stringify(v));
      assert.near(fit.centerX, 0, EPS);
      assert.near(fit.centerY, 20, EPS);
      assert.near(fit.cellSize, (800 - 64) / 100, EPS, 'la largeur est la contrainte');
    });

    test('recentrage dans les limites du zoom', function () {
      const cam = camera.createCamera(800, 600);
      assert.equal(camera.fitToBox(cam, { minX: 0, minY: 0, maxX: 0, maxY: 0 }).cellSize, 64, 'une cellule → 64 px');
      assert.equal(camera.fitToBox(cam, { minX: 0, minY: 0, maxX: 99999, maxY: 5 }).cellSize, 1, 'immense → 1 px');
    });

    test('grille vide (boîte null) : retour à l\'origine au zoom initial', function () {
      const cam = Object.assign(camera.createCamera(800, 600), { cellSize: 3, centerX: 900, centerY: -77 });
      const back = camera.fitToBox(cam, null);
      assert.deepEqual(back, camera.createCamera(800, 600));
    });
  });

  suite('Caméra — clic ou glisser (seuil de 4 px)', function () {
    test('un appui sans déplacement est un clic', function () {
      const t = camera.createDragTracker();
      t.down(100, 100);
      assert.deepEqual(t.up(100, 100).kind, 'click');
    });

    test('déplacement de 4 px exactement (ou moins) : toujours un clic, vue immobile', function () {
      const t = camera.createDragTracker();
      t.down(100, 100);
      assert.deepEqual(t.move(103, 100), { dragging: false, dx: 0, dy: 0 });
      assert.deepEqual(t.move(100, 96), { dragging: false, dx: 0, dy: 0 });
      const r = t.up(104, 100);
      assert.equal(r.kind, 'click');
      assert.equal(r.startX, 100);
      assert.equal(r.startY, 100);
    });

    test('au-delà de 4 px : glisser, avec rattrapage du chemin parcouru', function () {
      const t = camera.createDragTracker();
      t.down(100, 100);
      assert.deepEqual(t.move(103, 104), { dragging: true, dx: 3, dy: 4 }, 'distance 5 px > 4');
      assert.deepEqual(t.move(110, 104), { dragging: true, dx: 7, dy: 0 });
      assert.equal(t.up(110, 104).kind, 'drag');
    });

    test('un glisser revenu à son point de départ reste un glisser', function () {
      const t = camera.createDragTracker();
      t.down(0, 0);
      t.move(20, 0);
      t.move(0, 0);
      assert.equal(t.up(0, 0).kind, 'drag');
    });

    test('4,1 px en diagonale suffit à basculer en glisser', function () {
      const t = camera.createDragTracker();
      t.down(0, 0);
      assert.equal(t.up(2.9, 2.9).kind, 'drag', 'distance ≈ 4,1 px');
    });

    test('relâcher sans appui ou après annulation ne renvoie rien', function () {
      const t = camera.createDragTracker();
      assert.equal(t.up(0, 0), null);
      t.down(0, 0);
      t.cancel();
      assert.equal(t.up(50, 50), null);
      assert.equal(camera.DRAG_THRESHOLD, 4);
    });
  });
})(globalThis);
