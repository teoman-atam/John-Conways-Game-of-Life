/*
 * Tests du lot B côté contrôleur : retour en arrière, saut de N générations fractionné,
 * détection et pause automatique, série du graphique, âges.
 * Le temps de calcul est simulé : une horloge factice avance de 4 ms à chaque génération.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const agesLib = (root.Life && root.Life.ages) || require('../src/ages.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Horloge factice : n'avance que pendant les calculs de génération (voir withCost)
  function fakeClock() {
    const c = { now: 0 };
    c.read = function () { return c.now; };
    return c;
  }

  function make(options) {
    return ctrl.createController(Object.assign({ random: seeded(3), width: 800, height: 600 }, options || {}));
  }

  // Pose un motif prédéfini centré sur la cellule (x, y)
  function place(c, id, x, y) {
    c.loadPattern(id);
    c.placeAt(x || 0, y || 0);
    c.cancelPlacing();
  }

  // Chaque appel au moteur coûte `ms` millisecondes sur l'horloge factice
  function withCost(clock, ms, body) {
    const real = engine.nextGeneration;
    engine.nextGeneration = function (cells) {
      clock.now += ms;
      return real(cells);
    };
    try {
      return body();
    } finally {
      engine.nextGeneration = real;
    }
  }

  function evolve(cells, n) {
    let c = cells;
    for (let i = 0; i < n; i++) c = engine.nextGeneration(c);
    return c;
  }

  // Fait tourner le saut jusqu'à son terme (ou maxTicks images)
  function finishJump(c, maxTicks) {
    let ticks = 0;
    while (c.getState().jumping && ticks < (maxTicks || 100000)) {
      c.tick(ticks * 16);
      ticks++;
    }
    return ticks;
  }

  function at(c, x, y) {
    return camera.worldToScreen(c.getState().camera, x + 0.5, y + 0.5);
  }

  suite('Lot B — retour en arrière', function () {
    test('N puis B restaure exactement les cellules, les âges et le compteur', function () {
      const c = make();
      place(c, 'r-pentomino');
      for (let i = 0; i < 5; i++) c.step();
      const s5 = c.getState();
      c.step();
      const s6 = c.getState();
      assert.equal(c.stepBack(), true);
      const back = c.getState();
      assert.ok(back.cells === s5.cells, 'mêmes cellules (référence)');
      assert.ok(back.ages === s5.ages, 'mêmes âges (référence)');
      assert.equal(back.generation, 5);
      c.step();
      assert.deepEqual(c.getState().cells, s6.cells, 'la génération suivante est recalculée à l\'identique');
      assert.deepEqual(Array.from(c.getState().ages), Array.from(s6.ages));
    });

    test('B au compteur 0 est impossible', function () {
      const c = make();
      assert.equal(c.stepBack(), false);
      place(c, 'glider');
      assert.equal(c.getState().canBack, false);
      assert.equal(c.handleShortcut('b'), true, 'touche prise en charge');
      assert.equal(c.getState().generation, 0);
      c.step();
      c.stepBack();
      assert.equal(c.stepBack(), false, 'le compteur ne passe jamais sous 0');
      assert.equal(c.getState().generation, 0);
    });

    test('après 100 générations, 100 retours fonctionnent et le 101e est refusé', function () {
      const c = make();
      place(c, 'r-pentomino');
      const start = c.getState().cells;
      for (let i = 0; i < 100; i++) c.step();
      assert.equal(c.getState().generation, 100);
      for (let i = 0; i < 100; i++) assert.equal(c.stepBack(), true, 'retour ' + (i + 1));
      assert.equal(c.getState().generation, 0);
      assert.ok(c.getState().cells === start);
      assert.equal(c.stepBack(), false, '101e retour refusé');
    });

    test('quand HISTORY_MAX_CELLS est dépassé, les états les plus anciens sont retirés', function () {
      const c = make({ historyMaxCells: 40 });
      place(c, 'r-pentomino'); // 5, 6, 7, 9, 8, 9, 12… cellules
      for (let i = 0; i < 10; i++) c.step();
      let backs = 0;
      while (c.stepBack()) backs++;
      assert.ok(backs > 0 && backs < 10, backs + ' retours seulement');
      assert.equal(c.getState().generation, 10 - backs, 'les générations les plus anciennes ne sont plus accessibles');
    });

    test('l\'historique est vidé par chaque type d\'édition', function () {
      const edits = {
        'clic au crayon': function (c) { const p = at(c, 30, 30); c.pointerDown(p.x, p.y); c.pointerUp(p.x, p.y); },
        'glisser au crayon': function (c) { const a = at(c, 30, 30), b = at(c, 35, 30); c.pointerDown(a.x, a.y); c.pointerMove(b.x, b.y); c.pointerUp(b.x, b.y); },
        'pose': function (c) { c.loadPattern('block'); c.placeAt(20, 20); },
        'couper': function (c) { c.setTool('select'); const a = at(c, -3, -3), b = at(c, 3, 3); c.pointerDown(a.x, a.y); c.pointerMove(b.x, b.y); c.pointerUp(b.x, b.y); c.cutSelection(); },
        'supprimer': function (c) { c.setTool('select'); const a = at(c, -3, -3), b = at(c, 3, 3); c.pointerDown(a.x, a.y); c.pointerMove(b.x, b.y); c.pointerUp(b.x, b.y); c.deleteSelection(); },
        'remplissage aléatoire': function (c) { c.randomFill(); },
        'remettre à zéro': function (c) { c.reset(); },
      };
      for (const name of Object.keys(edits)) {
        const c = make();
        place(c, 'r-pentomino');
        c.step();
        c.step();
        assert.equal(c.getState().canBack, true, name + ' : retour possible avant');
        edits[name](c);
        assert.equal(c.getState().canBack, false, name);
        assert.equal(c.stepBack(), false, name);
        assert.equal(c.getState().generation, 0, name);
      }
    });

    test('B est impossible pendant la simulation et pendant un saut', function () {
      const c = make();
      place(c, 'r-pentomino');
      c.step();
      c.start();
      assert.equal(c.stepBack(), false, 'pendant la simulation');
      assert.equal(c.getState().canBack, false);
      c.pause();
      const clock = fakeClock();
      const j = make({ clock: clock.read });
      place(j, 'r-pentomino');
      j.step();
      j.startJump();
      withCost(clock, 4, function () { j.tick(0); });
      assert.ok(j.getState().jumping);
      assert.equal(j.stepBack(), false, 'pendant un saut');
      assert.equal(j.getState().canBack, false);
    });
  });

  suite('Lot B — saut de N générations', function () {
    test('le résultat d\'un saut de N est identique à N appels de nextGeneration, compteur + N', function () {
      const c = make({ clock: function () { return 0; } });
      place(c, 'r-pentomino');
      c.step();
      const before = c.getState();
      assert.equal(c.setJumpCount('57'), true);
      assert.equal(c.startJump(), true);
      finishJump(c);
      const s = c.getState();
      assert.deepEqual(s.cells, evolve(before.cells, 57));
      assert.equal(s.generation, before.generation + 57);
      assert.equal(s.jumping, null);
      assert.equal(s.population.length, s.generation + 1, 'un point par génération');
      // Âges identiques à ceux calculés génération par génération
      let cells = before.cells;
      let ages = before.ages;
      for (let i = 0; i < 57; i++) {
        const next = engine.nextGeneration(cells);
        ages = agesLib.nextAges(cells, ages, next);
        cells = next;
      }
      assert.deepEqual(Array.from(s.ages), Array.from(ages));
    });

    test('avec une horloge injectée, le budget de 12 ms par image est respecté', function () {
      const clock = fakeClock();
      const c = make({ clock: clock.read });
      place(c, 'r-pentomino');
      c.setJumpCount(40);
      c.startJump();
      withCost(clock, 4, function () {
        let frames = 0;
        while (c.getState().jumping) {
          const t0 = clock.now;
          const steps = c.tick(frames * 16);
          assert.ok(clock.now - t0 <= ctrl.JUMP_BUDGET_MS, 'image ' + frames + ' : ' + (clock.now - t0) + ' ms');
          assert.ok(steps >= 1, 'au moins une génération par image');
          frames++;
        }
        assert.equal(frames, 14, '40 générations à 3 par image');
      });
      assert.equal(c.getState().generation, 40);
      assert.equal(ctrl.JUMP_BUDGET_MS, 12);
    });

    test('une génération plus longue que le budget avance quand même d\'une génération par image', function () {
      const clock = fakeClock();
      const c = make({ clock: clock.read });
      place(c, 'r-pentomino');
      c.setJumpCount(3);
      c.startJump();
      withCost(clock, 30, function () {
        assert.equal(c.tick(0), 1);
        assert.equal(c.tick(16), 1);
      });
    });

    test('progression, puis annulation : le compteur correspond aux générations calculées', function () {
      const clock = fakeClock();
      const c = make({ clock: clock.read });
      place(c, 'r-pentomino');
      const start = c.getState().cells;
      c.startJump(); // 100 par défaut
      assert.equal(c.getState().jumpCount, 100);
      withCost(clock, 4, function () { c.tick(0); c.tick(16); });
      assert.deepEqual(c.getState().jumping, { done: 6, total: 100 });
      assert.equal(c.handleShortcut('Escape'), true, 'Échap annule le saut');
      const s = c.getState();
      assert.equal(s.jumping, null);
      assert.equal(s.generation, 6);
      assert.deepEqual(s.cells, evolve(start, 6));
      assert.ok(/Saut annulé à la génération 6/.test(s.message.text), s.message.text);
    });

    test('un dépassement du plafond arrête le saut, avec la génération atteinte', function () {
      const c = make({ maxLiveCells: 10, clock: function () { return 0; } });
      place(c, 'r-pentomino');
      c.setJumpCount(100);
      c.startJump();
      finishJump(c);
      const s = c.getState();
      assert.equal(s.jumping, null);
      assert.ok(s.generation < 100 && s.liveCount <= 10);
      assert.ok(/Saut arrêté à la génération \d+ : la génération \d+ compterait/.test(s.message.text), s.message.text);
      assert.ok(s.message.text.indexOf('génération ' + s.generation + ' :') > 0, 'génération atteinte indiquée');
    });

    test('une détection arrête le saut si la pause automatique est active, et ne l\'arrête pas sinon', function () {
      const on = make({ autoPause: true, clock: function () { return 0; } });
      place(on, 'blinker');
      on.startJump();
      finishJump(on);
      assert.equal(on.getState().generation, 2, 'arrêt à la génération 2');
      assert.equal(on.getState().message.text, 'Saut arrêté : oscillateur de période 2 à la génération 2.');
      const off = make({ autoPause: false, clock: function () { return 0; } });
      place(off, 'blinker');
      off.startJump();
      finishJump(off);
      assert.equal(off.getState().generation, 100, 'saut complet');
      assert.equal(off.getState().message.text, 'Oscillateur de période 2 à la génération 2', 'signalé une seule fois');
    });

    test('N vaut 0, 10 001, 2,5 ou du texte : la valeur est refusée avec un message', function () {
      const c = make();
      for (const bad of [0, '0', 10001, '10001', 2.5, '2,5', '2.5', 'abc', '', '-5', '1e3']) {
        assert.equal(c.setJumpCount(bad), false, JSON.stringify(bad));
        assert.equal(c.getState().jumpCount, 100, 'valeur inchangée');
        assert.ok(/Nombre de générations refusé/.test(c.getState().message.text));
      }
      assert.equal(c.setJumpCount(' 250 '), true);
      assert.equal(c.setJumpCount(10000), true);
      assert.equal(c.setJumpCount(1), true);
      assert.equal(c.getState().jumpCount, 1);
    });

    test('un saut est impossible pendant la simulation', function () {
      const c = make();
      place(c, 'r-pentomino');
      c.start();
      assert.equal(c.startJump(), false);
      assert.equal(c.handleShortcut('j'), true);
      assert.equal(c.getState().jumping, null);
      assert.equal(c.getState().canJump, false);
    });

    test('pendant un saut : édition, lecture, pas à pas et motifs désactivés ; vue disponible', function () {
      const clock = fakeClock();
      const c = make({ clock: clock.read });
      place(c, 'r-pentomino');
      c.setTool('select');
      const a = at(c, -3, -3), b = at(c, 3, 3);
      c.pointerDown(a.x, a.y); c.pointerMove(b.x, b.y); c.pointerUp(b.x, b.y);
      c.copySelection();
      c.startJump();
      assert.equal(c.getState().selection, null, 'sélection effacée au départ du saut');
      withCost(clock, 4, function () { c.tick(0); });
      const before = c.getState();
      assert.equal(c.toggleCell(50, 50), false);
      assert.equal(c.start(), false, 'lecture');
      assert.equal(c.toggleRunning(), false);
      assert.equal(c.step(), false, 'une génération');
      assert.equal(c.loadPattern('glider'), false, 'motif');
      assert.equal(c.paste(), false, 'collage');
      assert.equal(c.randomFill(), false);
      assert.equal(c.reset(), false);
      assert.equal(c.importRle('x = 1, y = 1\no!').ok, false);
      assert.equal(c.startJump(), false, 'un seul saut à la fois');
      assert.ok(c.getState().cells === before.cells, 'aucune cellule modifiée');
      assert.equal(c.getState().placing, null);
      assert.equal(c.getState().effectiveTool, 'move');
      assert.equal(c.getState().canPlay, false);
      c.zoomAt(2, 100, 100);
      const p = at(c, 0, 0);
      c.pointerDown(p.x, p.y); c.pointerMove(p.x + 60, p.y); c.pointerUp(p.x + 60, p.y);
      assert.notDeepEqual(c.getState().camera, before.camera, 'zoom et déplacement possibles');
      assert.ok(c.getState().cells === before.cells);
      assert.ok(c.getState().jumping, 'le saut continue');
    });
  });

  suite('Lot B — détection et pause automatique', function () {
    test('lecture, case cochée : pause et message « Oscillateur de période 2 à la génération 2 »', function () {
      const c = make({ autoPause: true });
      place(c, 'blinker');
      c.start();
      c.tick(0);
      for (let t = 100; t <= 1000; t += 100) c.tick(t);
      const s = c.getState();
      assert.equal(s.running, false);
      assert.equal(s.generation, 2);
      assert.equal(s.message.text, 'Oscillateur de période 2 à la génération 2');
    });

    test('case décochée : le message s\'affiche une seule fois et la simulation continue', function () {
      const c = make({ autoPause: false });
      place(c, 'blinker');
      c.start();
      c.tick(0);
      c.tick(200);
      const first = c.getState().message;
      assert.equal(first.text, 'Oscillateur de période 2 à la génération 2');
      for (let t = 300; t <= 2000; t += 100) c.tick(t);
      assert.equal(c.getState().running, true);
      assert.equal(c.getState().generation, 20);
      assert.equal(c.getState().message.id, first.id, 'pas de nouveau message pour le même état');
    });

    test('après une pause automatique, Reprendre continue sans nouvelle pause pour le même état', function () {
      const c = make({ autoPause: true });
      place(c, 'block');
      c.start();
      c.tick(0);
      c.tick(100);
      assert.equal(c.getState().running, false);
      assert.equal(c.getState().message.text, 'État stable à la génération 1');
      c.start();
      c.tick(1000);
      for (let t = 1100; t <= 1500; t += 100) c.tick(t);
      assert.equal(c.getState().running, true);
      assert.equal(c.getState().generation, 6);
    });

    test('population éteinte et « Une génération » affichent aussi le message', function () {
      const c = make({ autoPause: true });
      c.toggleCell(0, 0);
      c.start();
      c.tick(0);
      c.tick(100);
      assert.equal(c.getState().running, false);
      assert.equal(c.getState().message.text, 'Population éteinte à la génération 1');
      const d = make();
      place(d, 'block');
      d.step();
      assert.equal(d.getState().message.text, 'État stable à la génération 1');
      d.step();
      assert.equal(d.getState().message.text, 'État stable à la génération 2', 'à chaque appui');
    });

    test('pulsar : période 3 détectée', function () {
      const c = make({ autoPause: true, clock: function () { return 0; } });
      place(c, 'pulsar');
      c.startJump();
      finishJump(c);
      assert.equal(c.getState().generation, 3);
      assert.ok(/oscillateur de période 3 à la génération 3/.test(c.getState().message.text));
    });

    test('les tampons de détection sont vidés par toute édition', function () {
      const c = make();
      place(c, 'blinker');
      c.step();
      c.step(); // génération 2 : période 2 détectée
      assert.ok(/période 2/.test(c.getState().message.text));
      c.dismissMessage();
      c.toggleCell(100, 100); // édition : nouvel état de départ (clignotant + cellule isolée)
      c.step(); // la cellule isolée meurt
      c.step(); // clignotant horizontal, identique à un état d'avant l'édition
      assert.equal(c.getState().message, null, 'aucune détection fondée sur les états d\'avant l\'édition');
      c.step();
      c.step();
      assert.ok(/période 2 à la génération 4/.test(c.getState().message.text), 'détection reconstruite après l\'édition');
    });

    test('après un retour arrière, la détection reste cohérente', function () {
      const c = make({ autoPause: true });
      place(c, 'pulsar');
      c.step();
      c.step();
      c.step();
      assert.ok(/période 3 à la génération 3/.test(c.getState().message.text));
      c.stepBack();
      c.stepBack();
      c.dismissMessage();
      c.step(); // génération 2 : rien
      assert.equal(c.getState().message, null);
      c.step(); // génération 3 : de nouveau période 3
      assert.equal(c.getState().message.text, 'Oscillateur de période 3 à la génération 3');
    });

    test('pause automatique désactivée par défaut dans le contrôleur, réglable', function () {
      const c = make();
      assert.equal(c.getState().autoPause, false);
      assert.equal(c.setAutoPause(true), true);
      assert.equal(c.getState().autoPause, true);
    });
  });

  suite('Lot B — graphique et âges', function () {
    test('la série compte compteur + 1 points (pas à pas, lecture, saut)', function () {
      const c = make({ clock: function () { return 0; } });
      place(c, 'r-pentomino');
      assert.equal(c.getState().population.length, 1);
      assert.deepEqual(Array.from(c.getState().population.values()), [5]);
      c.step();
      c.step();
      c.start();
      c.tick(0);
      c.tick(300);
      c.pause();
      c.setJumpCount(20);
      c.startJump();
      finishJump(c);
      const s = c.getState();
      assert.equal(s.generation, 25);
      assert.equal(s.population.length, 26);
      assert.equal(s.population.values()[25], s.liveCount, 'dernier point = population actuelle');
      assert.equal(s.population.max, Math.max.apply(null, Array.from(s.population.values())));
    });

    test('un retour arrière retire un point ; une édition vide la série', function () {
      const c = make();
      place(c, 'r-pentomino');
      for (let i = 0; i < 4; i++) c.step();
      c.stepBack();
      assert.equal(c.getState().population.length, 4);
      c.toggleCell(40, 40);
      const n = c.getState().liveCount;
      assert.deepEqual(Array.from(c.getState().population.values()), [n], 'un seul point : la population au compteur 0');
      c.reset();
      assert.deepEqual(Array.from(c.getState().population.values()), [0]);
    });

    test('au-delà de la limite de la série, l\'enregistrement s\'arrête et le signale', function () {
      const c = make({ seriesLimit: 4 });
      place(c, 'r-pentomino');
      for (let i = 0; i < 6; i++) c.step();
      const p = c.getState().population;
      assert.equal(p.length, 4);
      assert.equal(p.truncated, true);
      c.stepBack();
      assert.equal(c.getState().population.length, 4, 'pas de point retiré hors de la série enregistrée');
    });

    test('âges : 1 après une édition, puis + 1 par génération de survie', function () {
      const c = make();
      place(c, 'block');
      for (let i = 0; i < 3; i++) c.step();
      for (const v of c.getState().ages.values()) assert.equal(v, 4);
      c.toggleCell(30, 30);
      const s = c.getState();
      assert.equal(s.ages.size, 5);
      for (const v of s.ages.values()) assert.equal(v, 1, 'tout repart à 1 au compteur 0');
    });

    test('raccourcis B, J, G et Échap ; inactifs dans un champ', function () {
      const c = make({ clock: function () { return 0; } });
      place(c, 'r-pentomino');
      c.handleShortcut('N');
      assert.equal(c.handleShortcut('B', { shift: true }), true);
      assert.equal(c.getState().generation, 0, 'B revient d\'une génération');
      assert.equal(c.getState().chartVisible, false, 'graphique masqué au départ');
      c.handleShortcut('g');
      assert.equal(c.getState().chartVisible, true);
      c.handleShortcut('G', { shift: true });
      assert.equal(c.getState().chartVisible, false);
      assert.equal(c.handleShortcut('j', { editable: true }), false, 'J inactif dans un champ');
      assert.equal(c.handleShortcut('b', { editable: true }), false);
      assert.equal(c.handleShortcut('g', { editable: true }), false);
      assert.equal(c.getState().jumping, null);
      c.handleShortcut('j');
      assert.deepEqual(c.getState().jumping, { done: 0, total: 100 });
      assert.equal(c.handleShortcut('Escape', { editable: true }), false, 'Échap dans un champ : rien');
      assert.equal(c.handleShortcut('Escape'), true);
      assert.equal(c.getState().jumping, null);
      assert.equal(c.getState().ageColors, false, 'couleur selon l\'âge décochée au départ');
      assert.equal(c.setAgeColors(true), true);
    });
  });
})(globalThis);
