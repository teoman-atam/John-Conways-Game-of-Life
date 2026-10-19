/*
 * Tests du contrôleur : une règle de la section 3 par test, plus la boucle unique,
 * l'accumulateur de temps, les raccourcis et le nom du fichier exporté.
 * Le temps est simulé par tick(now) et le hasard par une suite pseudo-aléatoire fixe.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const transform = (root.Life && root.Life.transform) || require('../src/transform.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  // Générateur pseudo-aléatoire déterministe (LCG), valeurs dans [0, 1[
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function make(options) {
    return ctrl.createController(Object.assign({ random: seeded(42), width: 800, height: 600 }, options || {}));
  }

  // Place un clignotant horizontal autour de l'origine via des clics de cellule
  function drawBlinker(c) {
    c.toggleCell(-1, 0);
    c.toggleCell(0, 0);
    c.toggleCell(1, 0);
  }

  // Fait tourner la simulation : frames images à fps images par seconde après startMs
  function runFrames(c, startMs, frames, fps) {
    let total = 0;
    for (let i = 1; i <= frames; i++) total += c.tick(startMs + (i * 1000) / fps);
    return total;
  }

  suite('Contrôleur — état initial et vitesse', function () {
    test('au démarrage : pause, grille vide, génération 0, vitesse 10', function () {
      const s = make().getState();
      assert.equal(s.running, false);
      assert.equal(s.cells.size, 0);
      assert.equal(s.liveCount, 0);
      assert.equal(s.generation, 0);
      assert.equal(s.speed, 10);
      assert.equal(s.playLabel, 'Démarrer');
      assert.equal(s.message, null);
    });

    test('le hasard doit être injecté', function () {
      assert.throws(function () { ctrl.createController({}); }, /random/);
    });

    test('vitesse réglable de 1 à 30 (bornée, entière)', function () {
      const c = make();
      assert.equal(c.setSpeed(30), 30);
      assert.equal(c.setSpeed(31), 30);
      assert.equal(c.setSpeed(0), 1);
      assert.equal(c.setSpeed(-5), 1);
      assert.equal(c.setSpeed('17'), 17);
      assert.equal(c.setSpeed(12.6), 13);
      assert.equal(c.setSpeed(NaN), 13, 'valeur invalide ignorée');
      assert.equal(c.getState().speed, 13);
    });

    test('changer la vitesse ne réinitialise rien', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      c.tick(0);
      c.tick(300); // 3 générations à 10 gén./s
      const before = c.getState();
      assert.equal(before.generation, 3);
      c.setSpeed(25);
      const after = c.getState();
      assert.equal(after.generation, 3, 'compteur conservé');
      assert.equal(after.running, true, 'toujours en cours');
      assert.ok(after.cells === before.cells, 'cellules inchangées');
      assert.deepEqual(after.camera, before.camera, 'vue inchangée');
    });

    test('changer la vitesse ne crée aucune boucle supplémentaire : le rythme suit la nouvelle vitesse', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      c.tick(0);
      c.setSpeed(20);
      c.setSpeed(20);
      c.setSpeed(20);
      // 1 seconde à 60 images/s → 20 générations, pas 60
      const n = runFrames(c, 0, 60, 60);
      assert.equal(n, 20);
      assert.equal(c.getState().generation, 20);
    });
  });

  suite('Contrôleur — Démarrer / Pause / Reprendre', function () {
    test('un seul bouton à bascule : Démarrer → Pause → Reprendre', function () {
      const c = make();
      drawBlinker(c);
      assert.equal(c.getState().playLabel, 'Démarrer');
      assert.equal(c.toggleRunning(), true);
      assert.equal(c.getState().playLabel, 'Pause');
      c.tick(0);
      c.tick(100);
      assert.equal(c.toggleRunning(), false);
      assert.equal(c.getState().running, false);
      assert.equal(c.getState().playLabel, 'Reprendre', 'génération > 0 en pause');
      c.toggleRunning();
      assert.equal(c.getState().running, true);
    });

    test('lancer alors que la simulation tourne n\'a aucun effet', function () {
      const c = make();
      drawBlinker(c);
      assert.equal(c.start(), true);
      c.tick(0);
      c.tick(50); // accumulateur à 50 ms
      assert.equal(c.start(), false, 'second démarrage refusé');
      assert.equal(c.tick(100), 1, 'accumulateur non remis à zéro par le second démarrage');
      assert.equal(c.getState().running, true);
    });

    test('démarrer deux fois ne crée qu\'une boucle : 10 gén./s pendant 1 s → 10 générations', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      c.start();
      c.handleShortcut(' '); // Espace bref : la pause a lieu au relâchement (lot A)
      c.handleKeyUp(' ');
      c.toggleRunning(); // relance
      c.start();
      c.tick(0);
      const n = runFrames(c, 0, 60, 60);
      assert.equal(n, 10);
    });

    test('boucle d\'animation unique : start() deux fois ne programme qu\'une image', function () {
      const pending = [];
      let nextId = 1;
      const requestFrame = function (cb) { pending.push({ id: nextId, cb: cb }); return nextId++; };
      const cancelFrame = function (id) {
        const i = pending.findIndex(function (p) { return p.id === id; });
        if (i >= 0) pending.splice(i, 1);
      };
      let frames = 0;
      const loop = ctrl.createFrameLoop(requestFrame, cancelFrame, function () { frames++; });
      assert.equal(loop.start(), true);
      assert.equal(loop.start(), false);
      assert.equal(pending.length, 1, 'une seule image programmée');
      for (let i = 0; i < 5; i++) {
        const p = pending.shift();
        p.cb(i * 16);
        assert.equal(pending.length, 1, 'toujours une seule image programmée');
      }
      assert.equal(frames, 5);
      loop.stop();
      assert.equal(pending.length, 0);
      assert.equal(loop.isRunning(), false);
    });
  });

  suite('Contrôleur — avance de la simulation', function () {
    test('accumulateur de temps : le nombre de générations suit la vitesse', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      assert.equal(c.tick(1000), 0, 'première image : référence de temps');
      assert.equal(c.tick(1099), 0);
      assert.equal(c.tick(1100), 1);
      assert.equal(c.tick(1350), 2);
      assert.equal(c.tick(1400), 1, 'le reste de 50 ms est conservé');
      assert.equal(c.getState().generation, 4);
    });

    test('au plus 5 générations par image, sans rattrapage après une longue absence', function () {
      const c = make();
      drawBlinker(c);
      c.setSpeed(30);
      c.start();
      c.tick(0);
      assert.equal(c.tick(60000), 5, 'onglet masqué 60 s → 5 générations seulement');
      assert.equal(c.tick(60016), 0, 'retard abandonné');
      assert.equal(c.tick(60034), 1);
      assert.equal(c.getState().generation, 6);
    });

    test('pas d\'avance en pause', function () {
      const c = make();
      drawBlinker(c);
      c.tick(0);
      c.tick(5000);
      assert.equal(c.getState().generation, 0);
    });

    test('générations par seconde réellement atteintes', function () {
      const c = make();
      drawBlinker(c);
      c.setSpeed(20);
      c.start();
      c.tick(0);
      runFrames(c, 0, 120, 60);
      assert.near(c.getState().measuredRate, 20, 0.5, '20 gén./s demandées à 60 images/s');
      c.setSpeed(1);
      runFrames(c, 2000, 300, 60);
      assert.near(c.getState().measuredRate, 1, 0.05, 'mesure stable à 1 gén./s');
      c.setSpeed(30);
      runFrames(c, 7000, 30, 6); // machine lente : 6 images/s, 5 générations par image
      assert.near(c.getState().measuredRate, 30, 0.5, 'plusieurs générations par image');
      c.pause();
      assert.equal(c.getState().measuredRate, 0, 'remis à 0 en pause');
    });
  });

  suite('Contrôleur — « Une génération »', function () {
    test('en pause : avance d\'une génération et incrémente le compteur de 1', function () {
      const c = make();
      drawBlinker(c);
      const before = c.getState().cells;
      assert.equal(c.step(), true);
      const s = c.getState();
      assert.equal(s.generation, 1);
      assert.deepEqual(s.cells, engine.nextGeneration(before));
      assert.deepEqual(s.cells, new Set(['0,-1', '0,0', '0,1']));
      c.step();
      assert.equal(c.getState().generation, 2);
    });

    test('actif uniquement en pause : ignoré pendant la simulation', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      const before = c.getState();
      assert.equal(before.canStep, false);
      assert.equal(c.step(), false);
      assert.equal(c.handleShortcut('n'), true);
      const after = c.getState();
      assert.equal(after.generation, 0);
      assert.ok(after.cells === before.cells);
    });
  });

  suite('Contrôleur — Remettre à zéro', function () {
    test('vide toute la grille, met en pause, compteur à 0', function () {
      const c = make();
      c.randomFill();
      c.start();
      c.tick(0);
      c.tick(200);
      assert.ok(c.getState().generation > 0);
      c.reset();
      const s = c.getState();
      assert.equal(s.cells.size, 0);
      assert.equal(s.liveCount, 0);
      assert.equal(s.running, false);
      assert.equal(s.generation, 0);
      assert.equal(s.playLabel, 'Démarrer');
    });

    test('la vue (zoom et position) n\'est pas modifiée', function () {
      const c = make();
      drawBlinker(c);
      c.zoomAt(2.5, 100, 100);
      c.panBy(-300, 120);
      const view = c.getState().camera;
      c.reset();
      assert.deepEqual(c.getState().camera, view);
    });
  });

  suite('Contrôleur — clic sur une cellule', function () {
    test('en pause : inverse l\'état de la cellule', function () {
      const c = make();
      assert.equal(c.toggleCell(5, -7), true);
      assert.ok(c.getState().cells.has('5,-7'));
      c.toggleCell(5, -7);
      assert.ok(!c.getState().cells.has('5,-7'));
    });

    test('une modification manuelle remet le compteur de générations à 0', function () {
      const c = make();
      drawBlinker(c);
      c.step();
      c.step();
      assert.equal(c.getState().generation, 2);
      c.toggleCell(10, 10);
      assert.equal(c.getState().generation, 0);
    });

    test('en cours de simulation, le clic est ignoré', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      const before = c.getState().cells;
      assert.equal(c.toggleCell(20, 20), false);
      c.pointerDown(400, 300);
      assert.equal(c.pointerUp(400, 300), 'click');
      assert.ok(c.getState().cells === before, 'aucune cellule modifiée');
    });

    test('clic pointeur (≤ 4 px) : inverse la cellule sous le point d\'appui', function () {
      const c = make();
      c.pointerDown(400 + 12 * 3 + 1, 300 - 12 * 2 + 1); // cellule (3,-2)
      c.pointerMove(400 + 12 * 3 + 3, 300 - 12 * 2 + 3);
      assert.equal(c.pointerUp(400 + 12 * 3 + 4, 300 - 12 * 2 + 1), 'click');
      assert.deepEqual(c.getState().cells, new Set(['3,-2']));
    });

    test('glisser (> 4 px) avec l\'outil Déplacer : déplace la vue, aucune cellule modifiée', function () {
      const c = make();
      c.setTool('move'); // lot A : avec le Crayon par défaut, glisser dessine
      const view = c.getState().camera;
      c.pointerDown(400, 300);
      c.pointerMove(403, 300);
      assert.equal(c.getState().dragging, false, 'pas encore un glisser');
      c.pointerMove(410, 300);
      assert.equal(c.getState().dragging, true, 'glisser en cours');
      c.pointerMove(460, 330);
      assert.equal(c.pointerUp(460, 330), 'drag');
      assert.equal(c.getState().dragging, false, 'glisser terminé');
      const s = c.getState();
      assert.equal(s.cells.size, 0);
      assert.near(s.camera.centerX, view.centerX - 60 / 12, 1e-9);
      assert.near(s.camera.centerY, view.centerY - 30 / 12, 1e-9);
    });
  });

  suite('Contrôleur — charger un motif', function () {
    test('choisir un motif : pause, mode pose centré sur la vue, ajout au contenu existant, compteur à 0', function () {
      const c = make();
      // Bloc stable : il survit aux générations calculées ci-dessous
      c.toggleCell(500, 500);
      c.toggleCell(501, 500);
      c.toggleCell(500, 501);
      c.toggleCell(501, 501);
      c.panBy(-1200, 600); // centre de la vue en (100.5, -49.5)
      c.start();
      c.tick(0);
      c.tick(100);
      const before = c.getState().cells;
      c.loadPattern('glider');
      let s = c.getState();
      assert.equal(s.running, false);
      assert.ok(s.cells === before, 'lot A : le choix seul ne modifie pas la grille');
      assert.deepEqual(s.placing.origin, { x: 99, y: -51 }, 'aperçu centré sur la vue');
      c.placeAt(100, -50);
      s = c.getState();
      assert.equal(s.generation, 0);
      assert.deepEqual(s.cells, transform.union(before, patterns.cells('glider', 99, -51)), 'planeur ajouté, centré');
      assert.ok(s.cells.has('500,500'), 'contenu existant conservé');
    });

    test('chaque motif de la liste se pose centré sur la vue', function () {
      const c = make();
      for (const p of patterns.list()) {
        c.reset();
        c.loadPattern(p.id);
        c.placeAt(0, 0);
        const s = c.getState();
        assert.equal(s.cells.size, patterns.cells(p.id).size, p.name);
        const box = engine.boundingBox(s.cells);
        assert.ok(box.minX <= 0 && box.maxX >= 0 && box.minY <= 0 && box.maxY >= 0, p.name + ' centré');
      }
    });
  });

  suite('Contrôleur — remplissage aléatoire', function () {
    test('toute la zone visible, probabilité de 30 % par défaut', function () {
      const c = make();
      const area = c.randomFillArea();
      // 800 × 600 px à 12 px : 67 × 51 cellules au moins partiellement visibles
      assert.deepEqual(area, { minX: -33, minY: -25, maxX: 33, maxY: 25 });
      c.randomFill();
      const s = c.getState();
      const total = 67 * 51;
      for (const k of s.cells) {
        const xy = engine.parseKey(k);
        assert.ok(xy[0] >= area.minX && xy[0] <= area.maxX && xy[1] >= area.minY && xy[1] <= area.maxY, 'dans la zone');
      }
      const density = s.cells.size / total;
      assert.ok(density > 0.26 && density < 0.34, 'densité ' + density.toFixed(3) + ' proche de 0,3');
    });

    test('seuil strict de 30 % : random() < 0,3 → vivante', function () {
      const values = [0, 0.29999, 0.3, 0.5, 0.99];
      let i = 0;
      const c = ctrl.createController({ random: function () { return values[i++ % values.length]; }, width: 50, height: 12 });
      c.zoomAt(10 / 12, 25, 6); // 10 px par cellule → zone de 5 × 3 cellules
      c.randomFill();
      const area = c.randomFillArea();
      const cols = area.maxX - area.minX + 1;
      const rows = area.maxY - area.minY + 1;
      assert.equal(c.getState().cells.size, Math.round(cols * rows * 2 / 5), '2 valeurs sur 5 sous le seuil');
    });

    test('plus de plafond 200 × 200 : la zone couvre toute la vue dézoomée', function () {
      const c = make({ width: 600, height: 500 });
      c.zoomAt(1 / 12, 300, 250); // 1 px par cellule : 600 × 500 cellules visibles
      const area = c.randomFillArea();
      // 601 × 501 : les cellules à cheval sur les bords comptent comme visibles
      assert.equal(area.maxX - area.minX + 1, 601, 'lot A : plus de limite à 200');
      assert.equal(area.maxY - area.minY + 1, 501);
      assert.deepEqual(area, camera.visibleCells(c.getState().camera));
    });

    test('remplace le contenu, met en pause, compteur à 0, déterministe', function () {
      const a = make();
      a.toggleCell(5000, 5000);
      a.step();
      a.start();
      a.randomFill();
      const s = a.getState();
      assert.ok(!s.cells.has('5000,5000'), 'ancien contenu remplacé');
      assert.equal(s.running, false);
      assert.equal(s.generation, 0);
      const b = make();
      b.randomFill();
      assert.deepEqual(b.getState().cells, s.cells, 'même graine → même résultat');
    });
  });

  suite('Contrôleur — plafond MAX_LIVE_CELLS', function () {
    test('valeur initiale documentée : 100 000', function () {
      assert.equal(ctrl.MAX_LIVE_CELLS, 100000);
    });

    test('dépassement : pause, message non bloquant, génération non appliquée', function () {
      // Un R-pentomino dépasse vite 10 cellules (il en compte 116 au bout de 1103 générations)
      const c = make({ maxLiveCells: 10 });
      c.loadPattern('r-pentomino');
      c.placeAt(0, 0); // lot A : choisir un motif passe en mode pose
      c.start();
      c.tick(0);
      for (let t = 100; t <= 3000; t += 100) c.tick(t);
      const s = c.getState();
      assert.equal(s.running, false, 'mise en pause');
      assert.ok(s.liveCount <= 10, 'le plafond n\'est jamais dépassé à l\'écran');
      assert.ok(s.message && /plafond/.test(s.message.text) && /MAX_LIVE_CELLS/.test(s.message.text), 'message explicatif');
      const gen = s.generation;
      assert.equal(c.step(), false, 'pas à pas refusé lui aussi');
      assert.equal(c.getState().generation, gen);
      assert.ok(c.getState().message.id > s.message.id, 'nouveau message');
      c.dismissMessage();
      assert.equal(c.getState().message, null);
    });
  });

  suite('Contrôleur — compteur, vue et raccourcis', function () {
    test('compteur de cellules vivantes à jour après chaque modification', function () {
      const c = make();
      c.toggleCell(0, 0);
      assert.equal(c.getState().liveCount, 1);
      drawBlinker(c); // (0,0) est inversée de nouveau
      assert.equal(c.getState().liveCount, 2);
      c.reset();
      c.loadPattern('gosper-gun');
      c.placeAt(0, 0); // lot A : choisir un motif passe en mode pose
      assert.equal(c.getState().liveCount, 36);
      c.step();
      assert.equal(c.getState().liveCount, c.getState().cells.size);
      c.randomFill();
      assert.equal(c.getState().liveCount, c.getState().cells.size);
      c.reset();
      assert.equal(c.getState().liveCount, 0);
    });

    test('zoom et déplacement restent disponibles pendant la simulation', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      const view = c.getState().camera;
      c.zoomAt(2, 10, 10);
      c.panBy(50, 50);
      c.pointerDown(100, 100);
      c.pointerMove(200, 100);
      c.pointerUp(200, 100);
      assert.notDeepEqual(c.getState().camera, view);
      assert.equal(c.getState().running, true);
    });

    test('Recentrer : ajuste la vue sur les cellules ; grille vide → origine au zoom initial', function () {
      const c = make();
      c.toggleCell(1000, 1000);
      c.toggleCell(1010, 1004);
      c.recenter();
      const cam = c.getState().camera;
      assert.near(cam.centerX, 1005.5, 1e-9);
      assert.near(cam.centerY, 1002.5, 1e-9);
      c.reset();
      c.zoomAt(3, 0, 0);
      c.recenter();
      const back = c.getState().camera;
      assert.equal(back.cellSize, 12);
      assert.equal(back.centerX, 0.5);
      assert.equal(back.centerY, 0.5);
    });

    test('raccourcis : Espace, N, R, + et -', function () {
      const c = make();
      drawBlinker(c);
      assert.equal(c.handleShortcut(' '), true);
      c.handleKeyUp(' '); // lot A : la bascule a lieu au relâchement
      assert.equal(c.getState().running, true, 'Espace démarre');
      c.handleShortcut(' ');
      c.handleKeyUp(' ');
      assert.equal(c.getState().running, false, 'Espace met en pause');
      c.handleShortcut('N');
      assert.equal(c.getState().generation, 1, 'N avance d\'une génération');
      const size = c.getState().camera.cellSize;
      c.handleShortcut('+');
      assert.near(c.getState().camera.cellSize, size * ctrl.ZOOM_STEP, 1e-9, '+ zoome');
      const centerBefore = c.getState().camera;
      c.handleShortcut('-');
      assert.near(c.getState().camera.cellSize, size, 1e-9, '- dézoome');
      assert.near(c.getState().camera.centerX, centerBefore.centerX, 1e-9, 'zoom au centre de la vue');
      c.panBy(500, 500);
      c.handleShortcut('r');
      assert.near(c.getState().camera.centerX, 0.5, 1e-9, 'R recentre');
      assert.equal(c.handleShortcut('x'), false, 'autre touche ignorée');
    });

    test('nom du fichier exporté : jeu-de-la-vie_gen-<n>_<AAAAMMJJ-HHMMSS>.png', function () {
      assert.equal(ctrl.exportFileName(42, new Date(2026, 0, 5, 7, 8, 9)), 'jeu-de-la-vie_gen-42_20260105-070809.png');
      const c = make();
      drawBlinker(c);
      c.step();
      c.step();
      assert.equal(c.exportFileName(new Date(2026, 9, 18, 23, 59, 1)), 'jeu-de-la-vie_gen-2_20261018-235901.png');
    });

    test('exporter ne modifie pas l\'état (la simulation continue)', function () {
      const c = make();
      drawBlinker(c);
      c.start();
      const before = c.getState();
      c.exportFileName(new Date());
      const after = c.getState();
      assert.equal(after.running, true);
      assert.ok(after.cells === before.cells);
    });

    test('formatInt sépare les milliers', function () {
      assert.equal(ctrl.formatInt(100000), '100 000');
      assert.equal(ctrl.formatInt(999), '999');
    });
  });
})(globalThis);
