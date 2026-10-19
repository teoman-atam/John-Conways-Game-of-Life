/*
 * Non-régression de la mini-carte et des légendes, comparée au code du tag avant-minimap-legendes :
 * rendu de la grille, absence d'effet de la mini-carte sur la simulation, raccourcis, sauvegardes.
 * Références : tests/fixtures/render-lot-a.js (rendu) et tests/fixtures/avant-minimap-legendes.js
 * (raccourcis, sauvegarde, refus), produites avant toute modification.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const renderer = (root.Life && root.Life.renderer) || require('../src/renderer.js');
  const persistence = (root.Life && root.Life.persistence) || require('../src/persistence.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const mm = (root.Life && root.Life.minimap) || require('../src/minimap.js');
  const tooltips = (root.Life && root.Life.tooltips) || require('../src/tooltips.js');
  const S = root.LifeRenderScenarios || require('./render-scenarios.js');
  const renderFixture = root.LifeRenderFixture || require('./fixtures/render-lot-a.js');
  const R = root.LifeRegressionScenarios || require('./regression-scenarios.js');
  const before = root.LifeBeforeMinimapFixture || require('./fixtures/avant-minimap-legendes.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const lib = { controller: ctrl, persistence: persistence };
  const AGE_COLORS = ['#a00001', '#a00002', '#a00003', '#a00004', '#a00005'];

  // Canvas factice de la mini-carte : journalise dans le même journal que la grille
  function minimapCanvas(log) {
    const ctx = {
      createImageData: function (w, h) { log.push(['minimap', 'createImageData', w, h]); return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData: function () { log.push(['minimap', 'putImageData']); },
      strokeRect: function () { log.push(['minimap', 'strokeRect']); },
      beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, stroke: function () {},
    };
    return { width: 0, height: 0, getContext: function () { return ctx; } };
  }

  /*
   * Rendu d'une scène comme le fait l'application à chaque image : la grille, puis la mini-carte
   * (affichée ou non) sur son propre canvas, deux images de suite. Renvoie les appels de la grille
   * (canvas principal et calque d'édition) et ceux de la mini-carte.
   */
  function renderScene(sc, extra, minimapShown) {
    const log = [];
    const board = S.createRecordingCanvas(log, 'board');
    const overlay = S.createRecordingCanvas(log, 'overlay');
    const r = renderer.createRenderer(board, overlay);
    if (extra && extra.ageColors) r.setColors({ ages: AGE_COLORS });
    r.resize(sc.size[0], sc.size[1], sc.size[2]);
    const m = mm.createMinimap({ clock: function () { return 0; }, visible: minimapShown });
    const mr = mm.createMinimapRenderer(minimapCanvas(log));
    mr.resize(mm.MINIMAP_WIDTH, mm.MINIMAP_HEIGHT, sc.size[2]);
    mr.setColors({ cell: '#102030', view: '#e8590c' });
    const state = Object.assign({}, sc.state, extra || {});
    const grid = [];
    for (let frame = 0; frame < 2; frame++) {
      const start = log.length;
      r.draw(state);
      grid.push(log.slice(start));
      const f = m.update({ cells: state.cells, camera: state.camera, busy: false });
      if (f) mr.draw(f);
    }
    return {
      grid: grid,
      minimap: log.filter(function (e) { return e[0] === 'minimap'; }),
    };
  }

  function agesFor(cells) {
    const sample = [1, 2, 3, 4, 10, 11, 50, 51, 300];
    const a = new Map();
    let i = 0;
    for (const k of cells) a.set(k, sample[i++ % sample.length]);
    return a;
  }

  suite('Non-régression — rendu de la grille avec la mini-carte', function () {
    test('mini-carte affichée ou masquée : appels de dessin de la grille identiques, et à la référence figée', function () {
      for (const sc of S.scenarios()) {
        const shown = renderScene(sc, null, true);
        const hidden = renderScene(sc, null, false);
        assert.ok(shown.minimap.length > 0, sc.name + ' : la mini-carte a bien été dessinée');
        assert.equal(hidden.minimap.length, 0, sc.name + ' : masquée, rien n\'est dessiné');
        for (let f = 0; f < 2; f++) {
          assert.deepEqual(shown.grid[f], hidden.grid[f], sc.name + ', image ' + f + ' : affichée = masquée');
          assert.deepEqual(shown.grid[f], renderFixture[sc.name], sc.name + ', image ' + f + ' : référence figée');
        }
        assert.ok(shown.minimap.every(function (e) { return e[0] === 'minimap'; }));
      }
    });

    test('même chose avec la couleur selon l\'âge : grille identique, mini-carte affichée ou masquée', function () {
      for (const sc of S.scenarios()) {
        const extra = { ages: agesFor(sc.state.cells), ageColors: true };
        const shown = renderScene(sc, extra, true);
        const hidden = renderScene(sc, extra, false);
        // Rendu de référence : le renderer seul, sans aucun code de la mini-carte
        const log = [];
        const r = renderer.createRenderer(S.createRecordingCanvas(log, 'board'), S.createRecordingCanvas(log, 'overlay'));
        r.setColors({ ages: AGE_COLORS });
        r.resize(sc.size[0], sc.size[1], sc.size[2]);
        r.draw(Object.assign({}, sc.state, extra));
        for (let f = 0; f < 2; f++) {
          assert.deepEqual(shown.grid[f], hidden.grid[f], sc.name + ', image ' + f);
          assert.deepEqual(shown.grid[f], log, sc.name + ', image ' + f + ' : identique au renderer seul');
        }
        assert.ok(log.some(function (e) { return e[0] === 'board' && e[1] === 'set:fillStyle' && e[2] === '#a00003'; }), 'couleurs d\'âge présentes');
      }
    });
  });

  suite('Non-régression — la mini-carte n\'agit jamais sur la simulation', function () {
    // Deux contrôleurs identiques : l'un reçoit les gestes sur la mini-carte, l'autre non
    function pair(setup) {
      const make = function () {
        // Horloge qui avance d'une demi-milliseconde à chaque lecture : le saut se découpe en tranches
        const env = { now: 0, reads: 0 };
        env.c = ctrl.createController({ random: R.seeded(6), width: 800, height: 600,
          clock: function () { env.reads++; return env.now + env.reads * 0.5; } });
        for (const p of [[0, 0], [1, 0], [2, 0], [10, 10], [11, 11], [9, 12], [10, 12], [11, 12], [-5, 3], [-6, 3], [-5, 4]]) env.c.toggleCell(p[0], p[1]);
        setup(env);
        return env;
      };
      return { test: make(), control: make() };
    }

    // Tout sauf la caméra, plus l'historique complet (rejoué par retours arrière)
    function fingerprint(env) {
      const s = R.summarize(env.c);
      delete s.camera;
      const st = env.c.getState();
      s.populationLength = st.population.length;
      s.populationValues = st.population.values();
      s.ages = Array.from(st.ages.entries()).sort();
      return s;
    }

    function history(env) {
      const out = [];
      while (env.c.getState().canBack && out.length < 200) {
        env.c.stepBack();
        out.push(Array.from(env.c.getState().cells).sort().join(' '));
      }
      return out;
    }

    // Clic puis glisser sur la mini-carte, dans et hors du rectangle de la vue
    function useMinimap(env) {
      const m = mm.createMinimap({ clock: function () { return env.now; }, panTo: function (x, y) { mm.centerViewOn(env.c, x, y); } });
      const f = m.update({ cells: env.c.getState().cells, camera: env.c.getState().camera, busy: env.c.getState().running });
      const cx = f.rect.x + f.rect.width / 2;
      const cy = f.rect.y + f.rect.height / 2;
      m.pointerDown(15, 12, env.c.getState().camera);
      assert.equal(m.pointerUp(15, 12), 'click');
      m.pointerDown(cx, cy, env.c.getState().camera);
      m.pointerMove(cx + 20, cy + 5);
      m.pointerMove(cx + 60, cy - 30);
      assert.equal(m.pointerUp(cx + 61, cy - 31), 'drag');
      return m;
    }

    test('clic et glisser avec chaque outil (Déplacer, Crayon, Sélection, Pose) : rien ne change hors de la vue', function () {
      const tools = {
        'Déplacer': function (env) { env.c.setTool('move'); },
        'Crayon': function (env) { env.c.setTool('pencil'); },
        'Sélection': function (env) { env.c.setTool('select'); },
        'Pose': function (env) { env.c.loadPattern('glider'); },
      };
      for (const name of Object.keys(tools)) {
        // En pause, avec un historique, une sélection et un presse-papiers
        const p = pair(function (env) {
          env.c.step();
          env.c.step();
          env.c.setTool('select');
          env.c.pointerDown(380, 280);
          env.c.pointerMove(470, 340);
          env.c.pointerUp(470, 340);
          env.c.copySelection();
          tools[name](env);
        });
        const camBefore = p.test.c.getState().camera;
        useMinimap(p.test);
        const camAfter = p.test.c.getState().camera;
        assert.deepEqual(fingerprint(p.test), fingerprint(p.control), name + ' : cellules, compteur, sélection, presse-papiers, pose');
        assert.ok(camAfter.centerX !== camBefore.centerX || camAfter.centerY !== camBefore.centerY, name + ' : la vue a bougé');
        assert.equal(camAfter.cellSize, camBefore.cellSize, name + ' : zoom inchangé');
        assert.deepEqual(history(p.test), history(p.control), name + ' : historique identique');
        assert.ok(history(pair(function (env) { env.c.step(); }).test).length === 1, 'le contrôle de l\'historique n\'est pas vide');
      }
    });

    test('pendant la simulation et pendant un saut : ni interruption, ni modification', function () {
      for (const mode of ['lecture', 'saut']) {
        const p = pair(function (env) {
          env.c.setSpeed(30);
          if (mode === 'lecture') env.c.start();
          else { env.c.setJumpCount(500); env.c.startJump(); }
        });
        // Quelques images, des gestes sur la mini-carte au milieu, puis d'autres images
        for (const env of [p.test, p.control]) {
          for (let f = 1; f <= 30; f++) {
            env.now = f * 1000 / 60;
            env.c.tick(env.now);
            if (f === 15 && env === p.test) useMinimap(env);
          }
        }
        const t = p.test.c.getState();
        assert.ok(mode === 'lecture' ? t.running : t.jumping !== null, mode + ' : toujours en cours');
        assert.ok(t.generation > 0);
        assert.deepEqual(fingerprint(p.test), fingerprint(p.control), mode + ' : même état que sans mini-carte');
      }
    });
  });

  suite('Non-régression — raccourcis', function () {
    test('chaque raccourci existant déclenche la même action qu\'au tag avant-minimap-legendes', function () {
      const scenarios = R.shortcutScenarios();
      assert.equal(scenarios.length, before.shortcuts.length, 'mêmes scénarios que la référence');
      const ref = {};
      for (const s of before.shortcuts) ref[s.id] = s.outcome;
      for (const sc of scenarios) {
        assert.ok(ref[sc.id], 'scénario présent dans la référence : ' + sc.id);
        // L'interface ne prend pour elle qu'une touche que le contrôleur laissait libre
        const mods = Object.assign({ shift: false, meta: false, ctrl: false, alt: false, editable: false }, sc.mods || {});
        if (tooltips.matchShortcut('minimap', sc.key, mods, sc.isMac !== false)) {
          assert.equal(ref[sc.id].handled, false, sc.id + ' : touche libre au tag');
          continue;
        }
        assert.deepEqual(R.runShortcutScenario(lib, sc), ref[sc.id], sc.id);
      }
      // M n'était pas utilisé : le contrôleur l'ignorait, en minuscule comme en majuscule
      assert.equal(ref['m : libre dans le contrôleur'].handled, false);
      assert.equal(ref['M majuscule : libre dans le contrôleur'].handled, false);
    });

    test('la table des raccourcis correspond au contrôleur, dans les deux sens', function () {
      const scenarios = R.shortcutScenarios();
      const ref = {};
      for (const s of before.shortcuts) ref[s.id] = s.outcome;
      const lower = function (k) { return k.length === 1 ? k.toLowerCase() : k; };
      // Table → contrôleur : chaque touche de la table a l'effet annoncé
      for (const entry of tooltips.SHORTCUTS) {
        if (entry.handledBy === 'app') continue;
        for (const key of entry.keys) {
          const found = scenarios.filter(function (sc) {
            const shift = !!(sc.mods && sc.mods.shift);
            return sc.action === entry.action && lower(sc.key) === key && (entry.shift === undefined || entry.shift === shift) &&
              ref[sc.id].handled && (ref[sc.id].changed || ref[sc.id].commands.length > 0);
          });
          assert.ok(found.length >= 1, entry.action + ' ← ' + JSON.stringify(key) + ' : effet constaté sur le contrôleur');
        }
      }
      // Contrôleur → table : chaque raccourci qui agit est dans la table, avec sa touche
      for (const sc of scenarios) {
        if (!ref[sc.id].handled || !sc.action) continue;
        const entry = tooltips.findShortcut(sc.action);
        assert.ok(entry, sc.id + ' : action dans la table');
        assert.ok(entry.keys.indexOf(lower(sc.key)) >= 0, sc.id + ' : touche dans la table');
        const mods = Object.assign({ shift: false, meta: false, ctrl: false, alt: false, editable: false }, sc.mods || {});
        assert.ok(tooltips.matchShortcut(sc.action, sc.key, mods, sc.isMac !== false), sc.id + ' : reconnu par la table');
      }
      // Les cas sans effet au tag ne correspondent à aucune entrée active de la table
      for (const sc of scenarios.filter(function (s) { return s.action === null; })) {
        assert.equal(ref[sc.id].changed, false, sc.id);
      }
    });
  });

  suite('Non-régression — sauvegarde', function () {
    function restoreInto(text) {
      const storage = R.fakeStorage();
      storage.setItem(R.KEY, text);
      const c = ctrl.createController({ random: R.seeded(1), width: 800, height: 600, storage: storage });
      return { c: c, result: c.restore() };
    }

    test('une sauvegarde produite au tag avant-minimap-legendes se charge à l\'identique, mini-carte visible', function () {
      const text = before.save.text;
      assert.ok(text.indexOf('minimapVisible') < 0, 'la référence ne connaît pas le nouveau champ');
      const r = persistence.deserialize(text, R.LIMITS);
      assert.equal(r.ok, true, r.error);
      assert.deepEqual(Array.from(r.value.cells).sort(), before.save.expected.cells);
      assert.deepEqual(r.value.camera, before.save.expected.camera);
      assert.deepEqual(r.value.settings, before.save.expected.settings);
      assert.deepEqual(r.value.optional, { minimapVisible: true });
      const e = restoreInto(text);
      assert.equal(e.result.status, 'restored');
      const s = e.c.getState();
      assert.deepEqual(Array.from(s.cells).sort(), before.save.expected.cells);
      assert.deepEqual({ centerX: s.camera.centerX, centerY: s.camera.centerY, cellSize: s.camera.cellSize }, before.save.expected.camera);
      assert.deepEqual({ speed: s.speed, density: s.density, jumpCount: s.jumpCount, theme: s.theme, ageColors: s.ageColors,
        autoPause: s.autoPause, chartVisible: s.chartVisible, panelCollapsed: s.panelCollapsed }, before.save.expected.settings);
      assert.equal(persistence.readOptional(text).minimapVisible, true);
    });

    test('le contrôleur écrit exactement le même texte qu\'au tag ; seul le champ facultatif s\'y ajoute', function () {
      assert.equal(R.saveScenario(lib).text, before.save.text, 'octet pour octet, sans le champ facultatif');
      const withField = persistence.writeOptional(before.save.text, { minimapVisible: false });
      const a = JSON.parse(withField);
      assert.equal(a.settings.minimapVisible, false);
      delete a.settings.minimapVisible;
      assert.deepEqual(a, JSON.parse(before.save.text), 'rien d\'autre ne change');
      assert.equal(JSON.parse(before.save.text).schemaVersion, persistence.SCHEMA_VERSION, 'schemaVersion inchangé');
      assert.equal(persistence.SCHEMA_VERSION, 1);
    });

    test('aller-retour avec le nouveau champ, dans les deux valeurs', function () {
      const r0 = persistence.deserialize(before.save.text, R.LIMITS).value;
      for (const visible of [false, true]) {
        const text = persistence.serialize({ cells: r0.cells, camera: r0.camera, settings: r0.settings, savedAt: 5, optional: { minimapVisible: visible } });
        const r = persistence.deserialize(text, R.LIMITS);
        assert.equal(r.ok, true, r.error);
        assert.deepEqual(r.value.optional, { minimapVisible: visible });
        assert.deepEqual(r.value.settings, r0.settings, 'settings garde exactement ses huit champs');
        assert.deepEqual(r.value.cells, r0.cells);
        assert.equal(restoreInto(text).result.status, 'restored');
      }
    });

    test('les cas de rejet existants sont toujours rejetés, avec le même message ; le nouveau champ est contrôlé', function () {
      assert.deepEqual(R.rejectionResults(lib, before.save.text), before.rejections);
      assert.ok(before.rejections.every(function (x) { return x.result !== 'accepté'; }), 'toutes refusées au tag');
      // Mêmes refus quand la sauvegarde porte aussi le nouveau champ
      const withField = persistence.writeOptional(before.save.text, { minimapVisible: false });
      const again = R.rejectionResults(lib, withField);
      for (let i = 0; i < again.length; i++) {
        if (before.rejections[i].name === 'JSON invalide') continue; // texte tronqué différent
        assert.equal(again[i].result, before.rejections[i].result, again[i].name);
      }
      // Nouveau champ de mauvais type : refusé, comme les autres booléens
      const bad = JSON.parse(before.save.text);
      bad.settings.minimapVisible = 'oui';
      const r = persistence.deserialize(JSON.stringify(bad), R.LIMITS);
      assert.equal(r.ok, false);
      assert.equal(r.error, 'champ invalide : settings.minimapVisible doit valoir true ou false');
      assert.equal(restoreInto(JSON.stringify(bad)).result.status, 'invalid');
    });
  });
})(globalThis);
