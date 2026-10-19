/*
 * Tests de l'adaptation aux mobiles : pincement et glissement à deux doigts, aiguillage des doigts
 * (avec le vrai contrôleur), appui long sur un bouton, taille de la mini-carte, plein écran indisponible.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const touch = (root.Life && root.Life.touch) || require('../src/touch.js');
  const mm = (root.Life && root.Life.minimap) || require('../src/minimap.js');
  const fullscreen = (root.Life && root.Life.fullscreen) || require('../src/fullscreen.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Aiguillage branché sur un journal, ou sur un vrai contrôleur
  function logRouter(options) {
    const log = [];
    const router = touch.createTouchRouter({
      down: function (x, y) { log.push(['down', x, y]); },
      move: function (x, y) { log.push(['move', x, y]); },
      up: function (x, y) { log.push(['up', x, y]); },
      cancel: function () { log.push(['cancel']); },
      pinch: function (s) { log.push(['pinch', +s.factor.toFixed(4), s.x, s.y, s.dx, s.dy]); },
    }, options);
    return { log: log, router: router };
  }

  function controllerRouter() {
    const c = ctrl.createController({ random: seeded(3), width: 400, height: 600 });
    const router = touch.createTouchRouter({
      down: function (x, y) { c.pointerDown(x, y); },
      move: function (x, y) { c.pointerMove(x, y); },
      up: function (x, y) { c.pointerUp(x, y); },
      cancel: function () { c.pointerCancel(); },
      pinch: function (s) { c.zoomAt(s.factor, s.x, s.y); c.panBy(s.dx, s.dy); },
    });
    return { c: c, router: router };
  }

  suite('Mobile — pincement et glissement à deux doigts', function () {
    test('pinchStep : facteur de zoom et déplacement du milieu des doigts', function () {
      const s = touch.pinchStep({ x: 100, y: 200 }, { x: 140, y: 200 }, { x: 90, y: 210 }, { x: 170, y: 210 });
      assert.near(s.factor, 2, 1e-12);
      assert.deepEqual([s.x, s.y, s.dx, s.dy], [120, 200, 10, 10]);
      // Doigts confondus : pas de zoom (division instable), seulement le déplacement
      const tiny = touch.pinchStep({ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 });
      assert.equal(tiny.factor, 1);
    });

    test('zoom puis déplacement : chaque doigt garde sous lui le même point de la grille', function () {
      let cam = { cellSize: 12, centerX: 3.25, centerY: -7.5, width: 400, height: 600 };
      const a0 = { x: 150, y: 300 }, b0 = { x: 230, y: 340 };
      const wa = camera.screenToWorld(cam, a0.x, a0.y);
      const wb = camera.screenToWorld(cam, b0.x, b0.y);
      const a1 = { x: 120, y: 280 }, b1 = { x: 270, y: 360 };
      const s = touch.pinchStep(a0, b0, a1, b1);
      cam = camera.pan(camera.zoomAt(cam, s.factor, s.x, s.y), s.dx, s.dy);
      const pa = camera.worldToScreen(cam, wa.x, wa.y);
      const pb = camera.worldToScreen(cam, wb.x, wb.y);
      // Écart des doigts et milieu respectés exactement ; l'orientation n'est pas suivie (pas de rotation)
      assert.near((pa.x + pb.x) / 2, (a1.x + b1.x) / 2, 1e-9);
      assert.near((pa.y + pb.y) / 2, (a1.y + b1.y) / 2, 1e-9);
      assert.near(Math.hypot(pb.x - pa.x, pb.y - pa.y), Math.hypot(b1.x - a1.x, b1.y - a1.y), 1e-9);
    });
  });

  suite('Mobile — aiguillage des doigts', function () {
    test('toucher bref : un clic de l\'outil, à l\'endroit touché', function () {
      const e = logRouter();
      e.router.down(1, 50, 60, 0);
      e.router.up(1, 50, 60, 40);
      assert.deepEqual(e.log, [['down', 50, 60], ['up', 50, 60]]);
      assert.equal(e.router.mode(), 'idle');
    });

    test('un doigt qui glisse : transmis après le court armement, tracé complet depuis le départ', function () {
      const e = logRouter({ armMs: 90 });
      e.router.down(1, 10, 10, 0);
      e.router.move(1, 14, 12, 30);
      assert.deepEqual(e.log, [], 'pendant l\'armement, rien n\'est transmis');
      e.router.move(1, 30, 20, 100);
      e.router.move(1, 50, 30, 120);
      e.router.up(1, 60, 35, 140);
      assert.deepEqual(e.log, [['down', 10, 10], ['move', 30, 20], ['move', 50, 30], ['up', 60, 35]]);
      // Glissé rapide, relâché avant la fin de l'armement : rejoué d'un coup
      const f = logRouter({ armMs: 90 });
      f.router.down(1, 10, 10, 0);
      f.router.move(1, 40, 10, 20);
      f.router.up(1, 70, 10, 50);
      assert.deepEqual(f.log, [['down', 10, 10], ['move', 70, 10], ['up', 70, 10]]);
    });

    test('deux doigts posés ensemble : pincement seulement, le premier doigt ne fait rien', function () {
      const e = logRouter({ armMs: 90 });
      e.router.down(1, 100, 100, 0);
      e.router.down(2, 140, 100, 20);
      assert.equal(e.router.mode(), 'pinch');
      e.router.move(1, 80, 100, 40);
      e.router.move(2, 160, 100, 40);
      assert.deepEqual(e.log.map(function (x) { return x[0]; }), ['pinch', 'pinch']);
      assert.deepEqual(e.log[0], ['pinch', 1.5, 120, 100, -10, 0]);
      // Un doigt levé : le second ne se met pas à dessiner
      e.router.up(1, 80, 100, 60);
      e.router.move(2, 200, 150, 80);
      e.router.up(2, 200, 150, 90);
      assert.equal(e.log.length, 2, 'rien après le pincement');
      assert.equal(e.router.mode(), 'idle');
      assert.equal(e.router.active(), false);
    });

    test('second doigt après le début d\'un geste : le geste est annulé, puis pincement ; troisième doigt ignoré', function () {
      const e = logRouter({ armMs: 90 });
      e.router.down(1, 100, 100, 0);
      e.router.move(1, 110, 100, 100);
      e.router.down(2, 200, 100, 120);
      e.router.down(3, 300, 300, 130);
      e.router.move(3, 320, 300, 140);
      e.router.move(2, 210, 100, 150);
      assert.deepEqual(e.log.map(function (x) { return x[0]; }), ['down', 'move', 'cancel', 'pinch']);
      // Annulation du système (défilement, appel entrant) pendant un geste à un doigt
      const f = logRouter({ armMs: 0 });
      f.router.down(1, 0, 0, 0);
      f.router.move(1, 10, 0, 5);
      f.router.cancel(1);
      assert.deepEqual(f.log.map(function (x) { return x[0]; }), ['down', 'move', 'cancel']);
      assert.equal(f.router.mode(), 'idle');
    });

    test('avec le vrai contrôleur et le Crayon : deux doigts zooment et déplacent sans toucher aux cases', function () {
      const e = controllerRouter();
      e.c.toggleCell(0, 0);
      const before = Array.from(e.c.getState().cells);
      const cam0 = e.c.getState().camera;
      // Pincement (écartement)
      e.router.down(1, 180, 300, 0);
      e.router.down(2, 220, 300, 10);
      for (let k = 1; k <= 10; k++) {
        e.router.move(1, 180 - 4 * k, 300, 10 + k);
        e.router.move(2, 220 + 4 * k, 300, 10 + k);
      }
      e.router.up(1, 140, 300, 30);
      e.router.up(2, 260, 300, 31);
      const cam1 = e.c.getState().camera;
      assert.near(cam1.cellSize, cam0.cellSize * 3, 1e-9, 'écart des doigts ×3 → zoom ×3');
      // Glissement à deux doigts
      e.router.down(1, 150, 300, 100);
      e.router.down(2, 250, 300, 105);
      for (let k = 1; k <= 10; k++) {
        e.router.move(1, 150 + 6 * k, 300 - 2 * k, 105 + k);
        e.router.move(2, 250 + 6 * k, 300 - 2 * k, 105 + k);
      }
      e.router.up(1, 210, 280, 120);
      e.router.up(2, 310, 280, 121);
      const cam2 = e.c.getState().camera;
      assert.near((cam1.centerX - cam2.centerX) * cam2.cellSize, 60, 1e-9, 'la grille suit les doigts');
      assert.near((cam1.centerY - cam2.centerY) * cam2.cellSize, -20, 1e-9);
      assert.deepEqual(Array.from(e.c.getState().cells), before, 'aucune case modifiée');
      assert.equal(e.c.getState().generation, 0);
      // Et un doigt seul dessine toujours : toucher bref, puis trait
      e.router.down(1, 300, 400, 200);
      e.router.up(1, 300, 400, 230);
      assert.equal(e.c.getState().liveCount, 2, 'toucher bref : une case');
      e.router.down(1, 100, 500, 300);
      for (let k = 1; k <= 5; k++) e.router.move(1, 100 + 20 * k, 500, 300 + 30 * k);
      e.router.up(1, 200, 500, 460);
      assert.ok(e.c.getState().liveCount > 4, 'trait continu : ' + e.c.getState().liveCount + ' cases');
    });
  });

  // Minuteur factice
  function fakeTimers() {
    const t = { now: 0, queue: [], nextId: 1 };
    t.setTimeout = function (fn, ms) { const id = t.nextId++; t.queue.push({ id: id, at: t.now + ms, fn: fn }); return id; };
    t.clearTimeout = function (id) { t.queue = t.queue.filter(function (q) { return q.id !== id; }); };
    t.advance = function (ms) {
      const end = t.now + ms;
      for (;;) {
        const due = t.queue.filter(function (q) { return q.at <= end; }).sort(function (a, b) { return a.at - b.at; })[0];
        if (!due) break;
        t.queue = t.queue.filter(function (q) { return q !== due; });
        t.now = due.at;
        due.fn();
      }
      t.now = end;
    };
    return t;
  }

  suite('Mobile — appui long, mini-carte et plein écran', function () {
    test('appui long sur un bouton : légende après 500 ms, et le clic qui suit est ignoré', function () {
      const timers = fakeTimers();
      const shown = [];
      const lp = touch.createLongPress({ setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        onLongPress: function (id) { shown.push(id); } });
      assert.equal(touch.LONG_PRESS_MS, 500);
      lp.down('chart');
      timers.advance(300);
      assert.equal(lp.up(), false, 'toucher bref : le clic agit');
      assert.deepEqual(shown, []);
      lp.down('chart');
      timers.advance(499);
      assert.deepEqual(shown, []);
      timers.advance(1);
      assert.deepEqual(shown, ['chart']);
      assert.equal(lp.up(), true, 'appui long : le clic est ignoré');
      lp.down('copy');
      timers.advance(200);
      lp.cancel();
      timers.advance(1000);
      assert.deepEqual(shown, ['chart'], 'doigt parti du bouton : rien');
      assert.equal(lp.up(), false);
    });

    test('mini-carte plus petite sur petit écran : étendue, tampon et rectangle recalculés', function () {
      const c = ctrl.createController({ random: seeded(2), width: 375, height: 447 });
      c.toggleCell(3, 3);
      const m = mm.createMinimap({ clock: function () { return 0; }, panTo: function (x, y) { mm.centerViewOn(c, x, y); } });
      const big = m.update({ cells: c.getState().cells, camera: c.getState().camera, busy: false });
      assert.equal(big.pixels.length, 200 * 140);
      assert.equal(m.setSize(140, 98), true);
      assert.deepEqual(m.size(), { width: 140, height: 98 });
      const small = m.update({ cells: c.getState().cells, camera: c.getState().camera, busy: false });
      assert.ok(small && small.rasterized, 'redessinée à la nouvelle taille');
      assert.equal(small.pixels.length, 140 * 98);
      assert.deepEqual([small.width, small.height, small.extent.width, small.extent.height], [140, 98, 140, 98]);
      // Une cellule couvre (1 / échelle)² pixels quand l'échelle est inférieure à 1
      assert.equal(small.lit, Math.pow(Math.max(1, 1 / small.extent.scale), 2), 'échelle ' + small.extent.scale);
      assert.ok(small.rect.x >= 0 && small.rect.x + small.rect.width <= 140, 'la vue tient dans la petite carte');
      assert.equal(m.setSize(140, 98), false, 'même taille : rien à refaire');
      assert.equal(m.setSize(0, 98), false, 'taille nulle (mini-carte masquée) : ignorée');
      // Le clic reste juste à la nouvelle taille
      const target = mm.minimapToWorld(small.extent, 100, 20);
      m.pointerDown(100, 20, c.getState().camera);
      assert.equal(m.pointerUp(100, 20), 'click');
      assert.near(c.getState().camera.centerX, target.x, 1e-9);
      assert.near(c.getState().camera.centerY, target.y, 1e-9);
    });

    test('plein écran indisponible (iPhone) : détecté, le bouton peut être retiré', function () {
      function doc(props, el) {
        return Object.assign({ addEventListener: function () {}, documentElement: el || {} }, props);
      }
      const make = function (d) { return fullscreen.createFullscreen(d, {}).isSupported(); };
      assert.equal(make(doc({ fullscreenEnabled: true }, { requestFullscreen: function () {} })), true, 'Chrome, Safari sur Mac');
      assert.equal(make(doc({ fullscreenEnabled: false, webkitFullscreenEnabled: false }, {})), false, 'Safari sur iPhone');
      assert.equal(make(doc({ webkitFullscreenEnabled: true }, { webkitRequestFullscreen: function () {} })), true, 'ancien Safari');
      assert.equal(make(doc({}, { requestFullscreen: function () {} })), true, 'sans indicateur : méthode présente');
      assert.equal(make(doc({}, {})), false, 'rien du tout');
    });
  });
})(globalThis);
