/*
 * Scénarios de non-régression de la mini-carte et des légendes.
 * Ils sont exécutés deux fois : une fois sur le code du tag avant-minimap-legendes, pour
 * produire la référence figée tests/fixtures/avant-minimap-legendes.js, puis à chaque
 * exécution de la suite, sur le code courant, pour comparer.
 * Les modules testés sont passés en paramètre (lib) : le même fichier sert aux deux.
 */
(function (root) {
  'use strict';

  const KEY = 'jeu-de-la-vie:sauvegarde';

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Stockage factice minimal
  function fakeStorage() {
    const store = { data: {}, writes: 0 };
    store.getItem = function (k) { return Object.prototype.hasOwnProperty.call(store.data, k) ? store.data[k] : null; };
    store.setItem = function (k, v) { store.writes++; store.data[k] = String(v); };
    store.removeItem = function (k) { delete store.data[k]; };
    return store;
  }

  function sorted(cells) {
    return Array.from(cells).sort();
  }

  // Résumé observable de l'état, comparable d'une version à l'autre
  function summarize(c) {
    const s = c.getState();
    return {
      generation: s.generation,
      cells: sorted(s.cells),
      running: s.running,
      tool: s.tool,
      effectiveTool: s.effectiveTool,
      selection: s.selection,
      clipboard: s.clipboard ? { width: s.clipboard.width, height: s.clipboard.height, cells: sorted(s.clipboard.cells) } : null,
      placing: s.placing ? { name: s.placing.name, width: s.placing.shape.width, height: s.placing.shape.height,
        cells: sorted(s.placing.shape.cells) } : null,
      camera: { cellSize: s.camera.cellSize, centerX: s.camera.centerX, centerY: s.camera.centerY },
      chartVisible: s.chartVisible,
      theme: s.theme,
      panelCollapsed: s.panelCollapsed,
      jumping: s.jumping,
      canBack: s.canBack,
      message: s.message ? s.message.text : null,
    };
  }

  // Contrôleur de départ : quelques cellules, en pause, compteur à 0, outil Crayon
  function makeController(lib, options) {
    const env = { commands: [], now: 0 };
    const opts = Object.assign({
      random: seeded(3),
      width: 800,
      height: 600,
      clock: function () { return env.now; },
      onCommand: function (name) { env.commands.push(name); },
    }, options || {});
    if (opts.onCommand === null) delete opts.onCommand;
    env.c = lib.controller.createController(opts);
    for (const p of [[0, 0], [1, 0], [2, 0], [10, 10], [11, 11], [9, 12], [10, 12], [11, 12], [-5, 3]]) env.c.toggleCell(p[0], p[1]);
    return env;
  }

  // Sélection tracée au glisser avec l'outil Sélection, puis retour au Crayon
  function select(env) {
    env.c.setTool('select');
    env.c.pointerDown(380, 280);
    env.c.pointerMove(420, 300);
    env.c.pointerMove(460, 330);
    env.c.pointerUp(460, 330);
    env.c.setTool('pencil');
  }

  const SETUPS = {
    base: function () {},
    selection: select,
    clipboard: function (env) { select(env); env.c.copySelection(); },
    placing: function (env) { env.c.loadPattern('glider'); },
    jumping: function (env) { env.c.startJump(); },
    running: function (env) { env.c.start(); },
    stepped: function (env) { env.c.step(); env.c.step(); env.c.step(); },
  };

  /*
   * Chaque raccourci du contrôleur dans l'état où il agit, plus les cas où il ne doit rien faire.
   * action : nom de l'action dans la table des raccourcis (src/tooltips.js) ; null = sans effet attendu.
   */
  function shortcutScenarios() {
    const list = [
      { id: 'espace bref : démarrer', action: 'play', setup: 'base', key: ' ', keyup: true },
      { id: 'espace bref : pause', action: 'play', setup: 'running', key: ' ', keyup: true },
      { id: 'espace maintenu + glisser : déplacer', action: 'pan-space', setup: 'base', key: ' ', keyup: true, drag: true },
      { id: 'n : une génération', action: 'step', setup: 'base', key: 'n' },
      { id: 'N majuscule : une génération', action: 'step', setup: 'base', key: 'N' },
      { id: 'n pendant la lecture : sans effet', action: 'step', setup: 'running', key: 'n' },
      { id: 'b : génération précédente', action: 'back', setup: 'stepped', key: 'b' },
      { id: 'j : saut de N', action: 'jump', setup: 'base', key: 'j' },
      { id: 'g : graphique', action: 'chart', setup: 'base', key: 'g' },
      { id: 't : thème suivant', action: 'theme', setup: 'base', key: 't' },
      { id: 'e : plein écran', action: 'fullscreen', setup: 'base', key: 'e' },
      { id: 'e sans commande : non pris en charge', action: null, setup: 'base', key: 'e', noCommand: true },
      { id: 'l : panneau', action: 'panel', setup: 'base', key: 'l' },
      { id: 'r : recentrer', action: 'recenter', setup: 'base', key: 'r' },
      { id: 'r en pose : rotation horaire', action: 'rotate-cw', setup: 'placing', key: 'r' },
      { id: 'Maj+R en pose : rotation antihoraire', action: 'rotate-ccw', setup: 'placing', key: 'R', mods: { shift: true } },
      { id: 'f en pose : miroir horizontal', action: 'mirror-h', setup: 'placing', key: 'f' },
      { id: 'Maj+F en pose : miroir vertical', action: 'mirror-v', setup: 'placing', key: 'F', mods: { shift: true } },
      { id: 'f hors pose : non pris en charge', action: null, setup: 'base', key: 'f' },
      { id: 'h : Déplacer', action: 'tool-move', setup: 'base', key: 'h' },
      { id: 'p : Crayon', action: 'tool-pencil', setup: 'placing', key: 'p' },
      { id: 's : Sélection', action: 'tool-select', setup: 'base', key: 's' },
      { id: '+ : zoomer', action: 'zoom-in', setup: 'base', key: '+' },
      { id: '= : zoomer', action: 'zoom-in', setup: 'base', key: '=' },
      { id: '- : dézoomer', action: 'zoom-out', setup: 'base', key: '-' },
      { id: '_ : dézoomer', action: 'zoom-out', setup: 'base', key: '_' },
      { id: 'Échap : annuler le saut', action: 'escape', setup: 'jumping', key: 'Escape' },
      { id: 'Échap : quitter la pose', action: 'escape', setup: 'placing', key: 'Escape' },
      { id: 'Échap : effacer la sélection', action: 'escape', setup: 'selection', key: 'Escape' },
      { id: 'Échap sans rien à annuler', action: null, setup: 'base', key: 'Escape' },
      { id: '⌫ : supprimer la sélection', action: 'delete', setup: 'selection', key: 'Backspace' },
      { id: 'Suppr : supprimer la sélection', action: 'delete', setup: 'selection', key: 'Delete' },
      { id: '⌘C : copier', action: 'copy', setup: 'selection', key: 'c', mods: { meta: true } },
      { id: '⌘X : couper', action: 'cut', setup: 'selection', key: 'x', mods: { meta: true } },
      { id: '⌘V : coller', action: 'paste', setup: 'clipboard', key: 'v', mods: { meta: true } },
      { id: '⌘V sans presse-papiers', action: null, setup: 'base', key: 'v', mods: { meta: true } },
      { id: 'Ctrl+C hors Mac : copier', action: 'copy', setup: 'selection', key: 'c', mods: { ctrl: true }, isMac: false },
      { id: '⌘C hors Mac : laissé au navigateur', action: null, setup: 'selection', key: 'c', mods: { meta: true }, isMac: false },
      { id: 'n dans un champ : ignoré', action: null, setup: 'base', key: 'n', mods: { editable: true } },
      { id: '⌘R : laissé au navigateur', action: null, setup: 'base', key: 'r', mods: { meta: true } },
      { id: 'Alt+N : laissé au navigateur', action: null, setup: 'base', key: 'n', mods: { alt: true } },
      { id: 'm : libre dans le contrôleur', action: null, setup: 'base', key: 'm' },
      { id: 'M majuscule : libre dans le contrôleur', action: null, setup: 'base', key: 'M', mods: { shift: true } },
    ];
    return list;
  }

  // Exécute un scénario : touche enfoncée (et relâchée pour Espace), puis résumé de l'état
  function runShortcutScenario(lib, sc) {
    const options = {};
    if (sc.isMac === false) options.isMac = false;
    if (sc.noCommand) options.onCommand = null;
    const env = makeController(lib, options);
    SETUPS[sc.setup](env);
    const before = summarize(env.c);
    const mods = Object.assign({ shift: false, meta: false, ctrl: false, alt: false, repeat: false, editable: false }, sc.mods || {});
    const handled = env.c.handleShortcut(sc.key, mods);
    if (sc.drag) {
      env.c.pointerDown(400, 300);
      env.c.pointerMove(430, 320);
      env.c.pointerMove(460, 340);
      env.c.pointerUp(460, 340);
    }
    const keyup = sc.keyup ? env.c.handleKeyUp(sc.key) : null;
    const after = summarize(env.c);
    return { handled: handled, keyup: keyup, commands: env.commands.slice(), changed: JSON.stringify(before) !== JSON.stringify(after), state: after };
  }

  // Sauvegarde type, écrite par le contrôleur : cellules, caméra et tous les réglages modifiés
  function saveScenario(lib) {
    const storage = fakeStorage();
    const env = { now: 0 };
    const c = lib.controller.createController({
      random: seeded(5),
      width: 800,
      height: 600,
      clock: function () { return env.now; },
      dateNow: function () { return 1792400000000; },
      storage: storage,
      autoPause: true,
    });
    c.restore();
    for (const p of [[0, 0], [1, 0], [2, 0], [-7, -3], [40, -12]]) c.toggleCell(p[0], p[1]);
    c.loadPattern('glider');
    c.placeAt(-30, 7);
    c.cancelPlacing();
    c.setSpeed(17);
    c.setDensity(23);
    c.setJumpCount(777);
    c.setTheme('dark');
    c.setAgeColors(true);
    c.setAutoPause(false);
    c.setChartVisible(true);
    c.setPanelCollapsed(true);
    c.zoomAt(1.7, 100, 50);
    c.panBy(-37, 21);
    c.flushSave();
    const s = c.getState();
    return {
      text: storage.getItem(KEY),
      expected: {
        cells: sorted(s.cells),
        camera: { centerX: s.camera.centerX, centerY: s.camera.centerY, cellSize: s.camera.cellSize },
        settings: { speed: s.speed, density: s.density, jumpCount: s.jumpCount, theme: s.theme, ageColors: s.ageColors,
          autoPause: s.autoPause, chartVisible: s.chartVisible, panelCollapsed: s.panelCollapsed },
      },
    };
  }

  // Variantes corrompues d'une sauvegarde valide : toutes doivent être refusées
  function rejectionVariants(text) {
    const edit = function (fn) {
      const data = JSON.parse(text);
      fn(data);
      return JSON.stringify(data);
    };
    return [
      { name: 'JSON invalide', text: text.slice(0, 40) },
      { name: 'tableau au lieu d\'objet', text: '[]' },
      { name: 'version 2', text: edit(function (d) { d.schemaVersion = 2; }) },
      { name: 'version absente', text: edit(function (d) { delete d.schemaVersion; }) },
      { name: 'cellules absentes', text: edit(function (d) { delete d.cells; }) },
      { name: 'vitesse absente', text: edit(function (d) { delete d.settings.speed; }) },
      { name: 'vitesse hors bornes', text: edit(function (d) { d.settings.speed = 31; }) },
      { name: 'densité décimale', text: edit(function (d) { d.settings.density = 12.5; }) },
      { name: 'N hors bornes', text: edit(function (d) { d.settings.jumpCount = 0; }) },
      { name: 'thème inconnu', text: edit(function (d) { d.settings.theme = 'violet'; }) },
      { name: 'booléen invalide', text: edit(function (d) { d.settings.ageColors = 'oui'; }) },
      { name: 'panneau absent', text: edit(function (d) { delete d.settings.panelCollapsed; }) },
      { name: 'zoom hors bornes', text: edit(function (d) { d.camera.cellSize = 0.5; }) },
      { name: 'centre infini', text: edit(function (d) { d.camera.centerX = 1e300; }) },
      { name: 'centre non numérique', text: edit(function (d) { d.camera.centerY = '3'; }) },
      { name: 'origine décimale', text: edit(function (d) { d.cells.originX = 1.5; }) },
      { name: 'RLE invalide', text: edit(function (d) { d.cells.rle = 'x = 2, y = 1\nzz!'; }) },
      { name: 'RLE d\'une autre règle', text: edit(function (d) { d.cells.rle = 'x = 1, y = 1, rule = B36/S23\no!'; }) },
    ];
  }

  const LIMITS = { maxCells: 100000, minSpeed: 1, maxSpeed: 30, minDensity: 5, maxDensity: 50, minJump: 1, maxJump: 10000 };

  // Résultat de la relecture de chaque variante : message d'erreur, ou 'accepté'
  function rejectionResults(lib, text) {
    return rejectionVariants(text).map(function (v) {
      const r = lib.persistence.deserialize(v.text, LIMITS);
      return { name: v.name, result: r.ok ? 'accepté' : r.error };
    });
  }

  // Tout ce que la référence figée enregistre
  function capture(lib) {
    const save = saveScenario(lib);
    return {
      shortcuts: shortcutScenarios().map(function (sc) { return { id: sc.id, outcome: runShortcutScenario(lib, sc) }; }),
      save: save,
      rejections: rejectionResults(lib, save.text),
    };
  }

  const api = {
    KEY: KEY,
    LIMITS: LIMITS,
    seeded: seeded,
    fakeStorage: fakeStorage,
    summarize: summarize,
    makeController: makeController,
    shortcutScenarios: shortcutScenarios,
    runShortcutScenario: runShortcutScenario,
    saveScenario: saveScenario,
    rejectionVariants: rejectionVariants,
    rejectionResults: rejectionResults,
    capture: capture,
  };

  root.LifeRegressionScenarios = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
