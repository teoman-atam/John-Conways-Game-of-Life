/*
 * Tests des légendes dynamiques : libellé, raccourci et raison de chaque bouton dans chaque état,
 * concordance avec la table des raccourcis, aria-label, délai d'apparition (minuteur injecté),
 * disparition, mise à jour en direct, position dans la fenêtre, boutons aria-disabled.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const tooltips = (root.Life && root.Life.tooltips) || require('../src/tooltips.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const PLAIN = { shift: false, meta: false, ctrl: false, alt: false, repeat: false, editable: false };

  // Contrôleur dans un état donné, et état complet vu par les légendes
  function situation(name) {
    const env = { now: 0 };
    const c = ctrl.createController({ random: seeded(8), width: 800, height: 600, clock: function () { return env.now; } });
    const extra = { fullscreen: false, minimapVisible: true, isMac: true };
    if (name !== 'vide') for (const p of [[0, 0], [1, 0], [2, 0]]) c.toggleCell(p[0], p[1]);
    const select = function () {
      c.setTool('select');
      c.pointerDown(380, 280);
      c.pointerMove(460, 330);
      c.pointerUp(460, 330);
    };
    if (name === 'lecture') c.start();
    if (name === 'après pas') { c.step(); c.step(); }
    if (name === 'saut') c.startJump();
    if (name === 'sélection') select();
    if (name === 'presse-papiers') { select(); c.copySelection(); c.clearSelection(); }
    if (name === 'pose') c.loadPattern('glider');
    if (name === 'bascules') {
      c.handleShortcut('g', PLAIN);
      c.handleShortcut('l', PLAIN);
      c.handleShortcut('t', PLAIN);
      extra.fullscreen = true;
      extra.minimapVisible = false;
    }
    if (name === 'sombre') { c.setTheme('dark'); c.setJumpCount(1); }
    if (name === 'hors Mac') { extra.isMac = false; c.setJumpCount(2500); }
    return { c: c, state: function () { return Object.assign({}, c.getState(), extra); } };
  }

  function tip(id, state) {
    const t = tooltips.getTooltip(id, state);
    return [t.label, t.shortcut, t.disabledReason];
  }

  const SELECT_FIRST = 'Sélectionnez d\'abord une zone';

  suite('Légendes — contenu selon l\'état', function () {
    test('au départ (pause, compteur 0) : libellé, raccourci et raison de chaque bouton', function () {
      const s = situation('départ').state();
      const expected = {
        'tool-move': ['Déplacer la vue', ['H'], null],
        'tool-pencil': ['Crayon, outil actif', ['P'], null],
        'tool-select': ['Sélection rectangulaire', ['S'], null],
        copy: ['Copier la sélection', ['⌘', 'C'], SELECT_FIRST],
        cut: ['Couper la sélection', ['⌘', 'X'], SELECT_FIRST],
        paste: ['Coller, puis cliquer sur la grille pour poser', ['⌘', 'V'], 'Presse-papiers vide'],
        delete: ['Supprimer les cellules de la sélection', ['⌫'], SELECT_FIRST],
        recenter: ['Recentrer sur les cellules vivantes', ['R'], null],
        export: ['Enregistrer l\'image de la grille (PNG)', null, null],
        chart: ['Afficher le graphique', ['G'], null],
        minimap: ['Masquer la mini-carte', ['M'], null],
        fullscreen: ['Plein écran', ['E'], null],
        panel: ['Replier le panneau', ['L'], null],
        'panel-handle': ['Déplier le panneau', ['L'], null],
        settings: ['Réglages', null, null],
        rules: ['Règles du jeu', null, null],
        'rotate-cw': ['Rotation horaire', ['R'], null],
        'rotate-ccw': ['Rotation antihoraire', ['⇧', 'R'], null],
        'mirror-h': ['Miroir horizontal, gauche ↔ droite', ['F'], null],
        'mirror-v': ['Miroir vertical, haut ↔ bas', ['⇧', 'F'], null],
        'place-done': ['Terminer la pose', ['Échap'], null],
        play: ['Démarrer', ['Espace'], null],
        step: ['Une génération', ['N'], null],
        back: ['Génération précédente', ['B'], 'Aucune génération précédente en mémoire'],
        jump: ['Avancer de 100 générations', ['J'], null],
        'jump-cancel': ['Annuler le saut', ['Échap'], null],
      };
      assert.deepEqual(Object.keys(expected).sort(), tooltips.BUTTON_ACTIONS.slice().sort(), 'tous les boutons du périmètre');
      for (const id of Object.keys(expected)) assert.deepEqual(tip(id, s), expected[id], id);
      assert.deepEqual(tooltips.getTooltip('settings', s).detail, { label: 'Thème : Auto', shortcut: ['T'] });
      assert.equal(tooltips.getTooltip('copy', s).disabled, true);
      assert.equal(tooltips.getTooltip('chart', s).detail, null);
      assert.throws(function () { tooltips.getTooltip('inconnu', s); }, /sans légende/);
    });

    test('bascules : graphique, mini-carte, plein écran, panneau et thème suivent l\'état', function () {
      const s = situation('bascules').state();
      assert.deepEqual(tip('chart', s), ['Masquer le graphique', ['G'], null]);
      assert.deepEqual(tip('minimap', s), ['Afficher la mini-carte', ['M'], null]);
      assert.deepEqual(tip('fullscreen', s), ['Quitter le plein écran', ['E'], null]);
      assert.deepEqual(tip('panel', s), ['Déplier le panneau', ['L'], null]);
      assert.deepEqual(tooltips.getTooltip('settings', s).detail, { label: 'Thème : Clair', shortcut: ['T'] });
      const dark = situation('sombre').state();
      assert.deepEqual(tooltips.getTooltip('settings', dark).detail, { label: 'Thème : Sombre', shortcut: ['T'] });
      assert.deepEqual(tip('jump', dark), ['Avancer de 1 génération', ['J'], null]);
    });

    test('lecture et saut : « Pause », « Disponible en pause », « Indisponible pendant le saut »', function () {
      const run = situation('lecture').state();
      assert.deepEqual(tip('play', run), ['Pause', ['Espace'], null]);
      assert.deepEqual(tip('step', run), ['Une génération', ['N'], 'Disponible en pause']);
      assert.deepEqual(tip('back', run), ['Génération précédente', ['B'], 'Disponible en pause']);
      assert.deepEqual(tip('jump', run), ['Avancer de 100 générations', ['J'], 'Disponible en pause']);
      assert.deepEqual(tip('copy', run), ['Copier la sélection', ['⌘', 'C'], 'Disponible en pause']);
      assert.deepEqual(tip('delete', run), ['Supprimer les cellules de la sélection', ['⌫'], 'Disponible en pause']);
      assert.deepEqual(tip('tool-pencil', run), ['Crayon, outil actif', ['P'], null]);
      const jumping = situation('saut').state();
      assert.deepEqual(tip('play', jumping), ['Démarrer', ['Espace'], 'Indisponible pendant le saut']);
      assert.deepEqual(tip('step', jumping), ['Une génération', ['N'], 'Indisponible pendant le saut']);
      assert.deepEqual(tip('back', jumping), ['Génération précédente', ['B'], 'Indisponible pendant le saut']);
      assert.deepEqual(tip('cut', jumping), ['Couper la sélection', ['⌘', 'X'], 'Indisponible pendant le saut']);
      const after = situation('après pas').state();
      assert.deepEqual(tip('play', after), ['Reprendre', ['Espace'], null]);
      assert.deepEqual(tip('back', after), ['Génération précédente', ['B'], null]);
    });

    test('sélection, presse-papiers, pose et grille vide', function () {
      const sel = situation('sélection').state();
      for (const id of ['copy', 'cut', 'delete']) assert.equal(tooltips.getTooltip(id, sel).disabledReason, null, id);
      assert.deepEqual(tip('tool-select', sel), ['Sélection rectangulaire, outil actif', ['S'], null]);
      const clip = situation('presse-papiers').state();
      assert.deepEqual(tip('paste', clip), ['Coller, puis cliquer sur la grille pour poser', ['⌘', 'V'], null]);
      assert.deepEqual(tip('copy', clip), ['Copier la sélection', ['⌘', 'C'], SELECT_FIRST]);
      // En pose, aucun outil n'est actif et R fait pivoter : Recentrer n'affiche pas de raccourci
      const place = situation('pose').state();
      assert.deepEqual(tip('tool-pencil', place), ['Crayon', ['P'], null]);
      assert.deepEqual(tip('recenter', place), ['Recentrer sur les cellules vivantes', null, null]);
      const empty = situation('vide').state();
      assert.deepEqual(tip('recenter', empty), ['Revenir à l\'origine', ['R'], null]);
      const pc = situation('hors Mac').state();
      assert.deepEqual(tip('copy', pc)[1], ['Ctrl', 'C']);
      assert.deepEqual(tip('rotate-ccw', pc)[1], ['Maj', 'R']);
      assert.deepEqual(tip('jump', pc)[0], 'Avancer de 2 500 générations');
    });

    test('chaque raccourci affiché est celui de la table des raccourcis (parcours de toute la table)', function () {
      const used = {};
      const states = ['départ', 'lecture', 'saut', 'pose', 'hors Mac'].map(function (n) { return situation(n).state(); });
      for (const entry of tooltips.SHORTCUTS) {
        for (const mac of [true, false]) {
          // Touches affichées : dérivées de l'entrée, pas recopiées
          const expected = [];
          if (entry.command) expected.push(mac ? '⌘' : 'Ctrl');
          if (entry.shift === true) expected.push(mac ? '⇧' : 'Maj');
          expected.push(tooltips.keyLabel(entry.keys[0]));
          assert.deepEqual(tooltips.shortcutFor(entry.action, mac).keys, expected, entry.action);
        }
        // Chaque touche de l'entrée est reconnue avec ses modificateurs
        for (const key of entry.keys) {
          const mods = Object.assign({}, PLAIN, { meta: !!entry.command, shift: entry.shift === true });
          assert.ok(tooltips.matchShortcut(entry.action, key, mods, true), entry.action + ' ← ' + JSON.stringify(key));
        }
      }
      for (const s of states) {
        for (const id of tooltips.BUTTON_ACTIONS) {
          const t = tooltips.getTooltip(id, s);
          // Aucun raccourci écrit dans le libellé lui-même
          assert.ok(!/\((?:[A-Z]|⌘.|Ctrl\+.|Maj\+.|Échap|Espace|⌫)\)/.test(t.label), id + ' : ' + t.label);
          if (!t.shortcut) continue;
          const entry = tooltips.SHORTCUTS.filter(function (e) {
            return JSON.stringify(tooltips.shortcutFor(e.action, s.isMac).keys) === JSON.stringify(t.shortcut);
          });
          assert.ok(entry.length >= 1, id + ' : raccourci ' + t.shortcut + ' présent dans la table');
          used[id] = true;
        }
      }
      assert.ok(Object.keys(used).length >= 20, 'la quasi-totalité des boutons a un raccourci');
      assert.equal(tooltips.findShortcut('minimap').handledBy, 'app');
      assert.equal(tooltips.findShortcut('inexistant'), null);
      assert.equal(tooltips.shortcutFor('inexistant'), null);
    });

    test('aria-label, aria-keyshortcuts et aria-disabled reprennent toujours la légende courante', function () {
      for (const name of ['départ', 'lecture', 'saut', 'sélection', 'presse-papiers', 'pose', 'bascules', 'vide', 'hors Mac']) {
        const s = situation(name).state();
        for (const id of tooltips.BUTTON_ACTIONS) {
          const t = tooltips.getTooltip(id, s);
          const a = tooltips.ariaFor(id, s);
          assert.equal(a.label, t.label, name + ' / ' + id);
          assert.equal(a.disabled, t.disabled);
          assert.equal(a.keyshortcuts, t.ariaShortcut);
        }
      }
      const s = situation('départ').state();
      assert.equal(tooltips.ariaFor('copy', s).keyshortcuts, 'Meta+C');
      assert.equal(tooltips.ariaFor('play', s).keyshortcuts, 'Space');
      assert.equal(tooltips.ariaFor('rotate-ccw', s).keyshortcuts, 'Shift+R');
      assert.equal(tooltips.ariaFor('export', s).keyshortcuts, null);
      assert.equal(tooltips.ariaFor('copy', situation('hors Mac').state()).keyshortcuts, 'Control+C');
    });
  });

  // Minuteur factice : le temps n'avance que par advance(ms)
  function fakeTimers() {
    const t = { now: 0, queue: [], nextId: 1 };
    t.setTimeout = function (fn, ms) {
      const id = t.nextId++;
      t.queue.push({ id: id, at: t.now + ms, fn: fn });
      return id;
    };
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

  function makeTooltips() {
    const timers = fakeTimers();
    const shown = [];
    const tc = tooltips.createTooltipController({
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      onChange: function (id) { shown.push(id); },
    });
    return { timers: timers, shown: shown, tc: tc };
  }

  suite('Légendes — apparition, disparition et position', function () {
    test('apparition après 400 ms de survol (minuteur injecté), immédiate au focus clavier', function () {
      const e = makeTooltips();
      assert.equal(tooltips.SHOW_DELAY_MS, 400);
      e.tc.hover('chart');
      e.timers.advance(399);
      assert.equal(e.tc.current(), null, 'rien avant 400 ms');
      e.timers.advance(1);
      assert.equal(e.tc.current(), 'chart', 'affichée à 400 ms');
      // Survol bref : rien
      e.tc.leave('chart');
      e.tc.hover('panel');
      e.timers.advance(200);
      e.tc.leave('panel');
      e.timers.advance(1000);
      assert.equal(e.tc.current(), null, 'survol de 200 ms : aucune légende');
      // Focus clavier : tout de suite
      e.tc.focus('copy');
      assert.equal(e.tc.current(), 'copy');
      assert.deepEqual(e.shown, ['chart', null, 'copy']);
    });

    test('disparition au départ du survol, au clic, à Échap et au geste sur la grille ; une seule à la fois', function () {
      const e = makeTooltips();
      e.tc.hover('chart');
      e.timers.advance(400);
      e.tc.leave('chart');
      assert.equal(e.tc.current(), null, 'départ du survol');
      e.tc.hover('chart');
      e.timers.advance(400);
      e.tc.press('chart');
      assert.equal(e.tc.current(), null, 'clic');
      e.tc.hover('chart'); // toujours sous le pointeur après le clic : pas de retour
      e.timers.advance(1000);
      assert.equal(e.tc.current(), null, 'pas de retour tant que le pointeur reste sur le bouton');
      e.tc.leave('chart');
      e.tc.hover('chart');
      e.timers.advance(400);
      assert.equal(e.tc.current(), 'chart', 'revient après être sorti puis rentré');
      assert.equal(e.tc.escape(), true);
      assert.equal(e.tc.current(), null, 'Échap');
      assert.equal(e.tc.escape(), false, 'Échap sans légende : rien à masquer');
      e.tc.focus('step');
      e.tc.dismiss();
      assert.equal(e.tc.current(), null, 'début d\'un geste sur la grille');
      // Une seule à la fois : le focus remplace le survol, un nouveau survol remplace l'ancien
      e.tc.focus('copy');
      e.tc.hover('paste');
      assert.equal(e.tc.current(), null, 'la précédente part dès qu\'on survole un autre bouton');
      e.timers.advance(400);
      assert.equal(e.tc.current(), 'paste');
      e.tc.focus('cut');
      assert.equal(e.tc.current(), 'cut');
      e.tc.blur('cut');
      assert.equal(e.tc.current(), null, 'perte du focus');
      // Une seule valeur courante : jamais deux légendes (un seul élément dans la page)
      assert.ok(e.shown.every(function (id) { return id === null || typeof id === 'string'; }));
    });

    test('mise à jour en direct : G pressé pendant l\'affichage change aussitôt le texte', function () {
      const e = makeTooltips();
      const sit = situation('départ');
      e.tc.focus('chart');
      assert.equal(e.tc.content(sit.state()).label, 'Afficher le graphique');
      sit.c.handleShortcut('g', PLAIN);
      assert.equal(e.tc.content(sit.state()).label, 'Masquer le graphique');
      const k1 = tooltips.contentKey(e.tc.content(sit.state()));
      sit.c.handleShortcut('g', PLAIN);
      assert.notEqual(tooltips.contentKey(e.tc.content(sit.state())), k1, 'empreinte différente : le DOM est mis à jour');
      e.tc.focus('step');
      sit.c.start();
      assert.equal(e.tc.content(sit.state()).disabledReason, 'Disponible en pause');
      e.tc.dismiss();
      assert.equal(e.tc.content(sit.state()), null);
    });

    test('position : sous le bouton par défaut, toujours entièrement dans la fenêtre', function () {
      const view = { width: 1280, height: 760 };
      const size = { width: 180, height: 44 };
      const inside = function (p) {
        return p.x >= 0 && p.y >= 0 && p.x + size.width <= view.width && p.y + size.height <= view.height;
      };
      const rect = function (left, top) { return { left: left, top: top, right: left + 30, bottom: top + 30 }; };
      // Au milieu : centrée, 6 px sous le bouton
      const mid = tooltips.positionTooltip(rect(600, 300), size, view);
      assert.deepEqual(mid, { x: 525, y: 336, placement: 'below' });
      // Collé à chaque bord et dans chaque coin
      const anchors = [rect(0, 300), rect(1250, 300), rect(600, 0), rect(600, 730), rect(0, 0), rect(1250, 0), rect(0, 730), rect(1250, 730)];
      for (const a of anchors) {
        const p = tooltips.positionTooltip(a, size, view);
        assert.ok(inside(p), JSON.stringify(a) + ' → ' + JSON.stringify(p));
        if (a.top === 730) assert.equal(p.placement, 'above', 'bord bas : au-dessus');
        else assert.equal(p.placement, 'below');
      }
      // Fenêtre étroite (plein écran d'un petit écran, légende plus large que l'espace) : reste visible
      const narrow = tooltips.positionTooltip(rect(10, 10), { width: 300, height: 44 }, { width: 320, height: 200 });
      assert.ok(narrow.x >= 0 && narrow.x + 300 <= 320);
    });

    test('un bouton aria-disabled ne déclenche jamais son action, ni au clic, ni au clavier', function () {
      // Mini-document : bouton (aria-disabled ou non) contenant une icône
      function element(attrs, parent) {
        const el = { attrs: attrs || {}, parent: parent || null };
        el.closest = function (selector) {
          assert.equal(selector, '[aria-disabled="true"]');
          for (let n = el; n; n = n.parent) if (n.attrs['aria-disabled'] === 'true') return n;
          return null;
        };
        return el;
      }
      // Diffusion d'un clic : garde en capture sur le document, puis gestionnaire du bouton
      function click(target, button, viaKeyboard) {
        let ran = false;
        const event = {
          target: target, detail: viaKeyboard ? 0 : 1, prevented: false, stopped: false,
          preventDefault: function () { event.prevented = true; },
          stopImmediatePropagation: function () { event.stopped = true; },
        };
        tooltips.guardActivation(event);
        if (!event.stopped) { button.onClick(); ran = true; }
        return { ran: ran, prevented: event.prevented };
      }
      const disabled = element({ 'aria-disabled': 'true' });
      const icon = element({}, disabled);
      const enabled = element({ 'aria-disabled': 'false' });
      let calls = 0;
      disabled.onClick = enabled.onClick = function () { calls++; };
      assert.deepEqual(click(disabled, disabled, false), { ran: false, prevented: true }, 'clic sur le bouton');
      assert.deepEqual(click(icon, disabled, false), { ran: false, prevented: true }, 'clic sur son icône');
      assert.deepEqual(click(disabled, disabled, true), { ran: false, prevented: true }, 'Entrée ou Espace sur le bouton');
      assert.equal(calls, 0);
      assert.deepEqual(click(enabled, enabled, false), { ran: true, prevented: false });
      assert.equal(calls, 1);
      assert.equal(tooltips.shouldBlockActivation(null), false);
      // Au clavier, le raccourci d'une action désactivée ne fait rien non plus (refus du contrôleur)
      const checks = [
        ['départ', 'c', { meta: true }, 'copy'], ['départ', 'x', { meta: true }, 'cut'], ['départ', 'Backspace', {}, 'delete'],
        ['départ', 'v', { meta: true }, 'paste'], ['départ', 'b', {}, 'back'], ['lecture', 'n', {}, 'step'],
        ['lecture', 'b', {}, 'back'], ['lecture', 'j', {}, 'jump'], ['saut', 'n', {}, 'step'],
      ];
      for (const ck of checks) {
        const sit = situation(ck[0]);
        assert.equal(tooltips.getTooltip(ck[3], sit.state()).disabled, true, ck[3] + ' désactivé');
        const before = JSON.stringify(sit.c.getState(), function (k, v) { return v instanceof Set || v instanceof Map ? Array.from(v) : (typeof v === 'function' ? undefined : v); });
        sit.c.handleShortcut(ck[1], Object.assign({}, PLAIN, ck[2]));
        const after = JSON.stringify(sit.c.getState(), function (k, v) { return v instanceof Set || v instanceof Map ? Array.from(v) : (typeof v === 'function' ? undefined : v); });
        assert.equal(after, before, ck[0] + ' / ' + ck[1] + ' : aucun effet');
      }
      // Démarrer pendant un saut : Espace ne lance rien
      const sit = situation('saut');
      sit.c.handleShortcut(' ', PLAIN);
      sit.c.handleKeyUp(' ');
      assert.equal(sit.c.getState().running, false);
    });
  });
})(globalThis);
