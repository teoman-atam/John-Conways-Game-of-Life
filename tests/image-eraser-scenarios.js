/*
 * Scénarios de non-régression de l'import d'image et de la gomme.
 * Exécutés une fois sur le code du tag avant-image-gomme pour produire la référence figée
 * tests/fixtures/avant-image-gomme.js, puis à chaque exécution de la suite sur le code courant.
 * Les modules sont passés en paramètre (lib) ; les raccourcis et la sauvegarde réutilisent
 * tests/regression-scenarios.js (R).
 */
(function (root) {
  'use strict';

  const R = root.LifeRegressionScenarios || require('./regression-scenarios.js');

  const PLAIN = { shift: false, meta: false, ctrl: false, alt: false, repeat: false, editable: false };

  // Touches que la gomme et l'import vont utiliser : leur effet au tag (libres, ou ⌘X qui coupe)
  function keyScenarios() {
    return [
      { id: 'x : libre dans le contrôleur', setup: 'base', key: 'x' },
      { id: 'X majuscule : libre dans le contrôleur', setup: 'base', key: 'X', mods: { shift: true } },
      { id: 'i : libre dans le contrôleur', setup: 'base', key: 'i' },
      { id: 'I majuscule : libre dans le contrôleur', setup: 'base', key: 'I', mods: { shift: true } },
      { id: '⌘X : couper la sélection', setup: 'selection', key: 'x', mods: { meta: true } },
      { id: '⌘X sans sélection : sans effet', setup: 'base', key: 'x', mods: { meta: true } },
      { id: 'Ctrl+X hors Mac : couper', setup: 'selection', key: 'x', mods: { ctrl: true }, isMac: false },
      { id: '⌘I : laissé au navigateur', setup: 'base', key: 'i', mods: { meta: true } },
    ];
  }

  function runKeyScenario(lib, sc) {
    const options = {};
    if (sc.isMac === false) options.isMac = false;
    const env = R.makeController(lib, options);
    if (sc.setup === 'selection') {
      env.c.setTool('select');
      env.c.pointerDown(380, 280);
      env.c.pointerMove(420, 300);
      env.c.pointerMove(460, 330);
      env.c.pointerUp(460, 330);
      env.c.setTool('pencil');
    }
    const handled = env.c.handleShortcut(sc.key, Object.assign({}, PLAIN, sc.mods || {}));
    return { handled: handled, state: R.summarize(env.c) };
  }

  // Gestes des outils existants (mêmes situations que leurs tests) : effet complet sur l'état
  function toolScenarios() {
    const drag = function (c, points) {
      c.pointerDown(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) c.pointerMove(points[i][0], points[i][1]);
      const last = points[points.length - 1];
      return c.pointerUp(last[0], last[1]);
    };
    return [
      { id: 'Crayon : clic sur une case morte', run: function (c) { c.setTool('pencil'); return [drag(c, [[460, 350]])]; } },
      { id: 'Crayon : clic sur une case vivante', run: function (c) { c.setTool('pencil'); return [drag(c, [[400, 300]])]; } },
      { id: 'Crayon : glisser rapide (dessin continu)', run: function (c) {
        c.setTool('pencil');
        return [drag(c, [[100, 100], [180, 160], [400, 120], [500, 140]])];
      } },
      { id: 'Crayon : glisser depuis une case vivante (effacement)', run: function (c) {
        c.setTool('pencil');
        return [drag(c, [[400, 300], [430, 300], [460, 300], [520, 305]])];
      } },
      { id: 'Déplacer : glisser', run: function (c) { c.setTool('move'); return [drag(c, [[300, 300], [320, 310], [380, 360]])]; } },
      { id: 'Déplacer : clic sans effet', run: function (c) { c.setTool('move'); return [drag(c, [[400, 300]])]; } },
      { id: 'Sélection : tracé', run: function (c) { c.setTool('select'); return [drag(c, [[380, 280], [420, 300], [470, 340]])]; } },
      { id: 'Sélection : un clic efface la sélection', run: function (c) {
        c.setTool('select');
        const a = drag(c, [[380, 280], [470, 340]]);
        return [a, drag(c, [[200, 200]])];
      } },
      { id: 'Pose : deux poses, rotation et miroir', run: function (c) {
        c.loadPattern('glider');
        const a = drag(c, [[200, 200]]);
        c.rotatePlacing(true);
        c.mirrorPlacing(false);
        const b = drag(c, [[600, 420]]);
        const pan = drag(c, [[300, 300], [340, 330]]);
        return [a, b, pan];
      } },
      { id: 'Crayon pendant la lecture : déplace la vue', run: function (c) {
        c.setTool('pencil');
        c.start();
        return [drag(c, [[300, 300], [340, 300], [360, 320]]), drag(c, [[400, 300]])];
      } },
      { id: 'Sélection pendant un saut : déplace la vue', run: function (c) {
        c.setTool('select');
        c.startJump();
        return [drag(c, [[300, 300], [340, 300], [360, 320]])];
      } },
      { id: 'Espace maintenu + glisser avec le Crayon', run: function (c) {
        c.setTool('pencil');
        c.handleShortcut(' ', PLAIN);
        const r = drag(c, [[300, 300], [350, 330]]);
        c.handleKeyUp(' ');
        return [r];
      } },
    ];
  }

  function runToolScenario(lib, sc) {
    const env = R.makeController(lib, {});
    const kinds = sc.run(env.c);
    return { kinds: kinds, state: R.summarize(env.c) };
  }

  // Sauvegardes du code actuel : texte du contrôleur seul, et texte complété par l'interface (mini-carte masquée)
  function saveTexts(lib) {
    const plain = R.saveScenario(lib);
    const storage = R.fakeStorage();
    const env = { now: 0 };
    const wrapped = lib.persistence.withOptionalSettings(storage, function () { return { minimapVisible: false }; });
    const c = lib.controller.createController({
      random: R.seeded(5), width: 800, height: 600, clock: function () { return env.now; },
      dateNow: function () { return 1792400000000; }, storage: wrapped, autoPause: true,
    });
    c.restore();
    for (const p of [[0, 0], [1, 0], [2, 0], [5, 5]]) c.toggleCell(p[0], p[1]);
    c.setSpeed(21);
    c.flushSave();
    return { plain: plain, withMinimap: { text: storage.getItem(R.KEY), cells: Array.from(c.getState().cells).sort() } };
  }

  function capture(lib) {
    const save = saveTexts(lib);
    return {
      shortcuts: R.shortcutScenarios().map(function (sc) { return { id: sc.id, outcome: R.runShortcutScenario(lib, sc) }; }),
      keys: keyScenarios().map(function (sc) { return { id: sc.id, outcome: runKeyScenario(lib, sc) }; }),
      tools: toolScenarios().map(function (sc) { return { id: sc.id, outcome: runToolScenario(lib, sc) }; }),
      save: save,
      rejections: R.rejectionResults(lib, save.plain.text),
    };
  }

  const api = {
    keyScenarios: keyScenarios,
    runKeyScenario: runKeyScenario,
    toolScenarios: toolScenarios,
    runToolScenario: runToolScenario,
    saveTexts: saveTexts,
    capture: capture,
  };

  root.LifeImageEraserScenarios = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
