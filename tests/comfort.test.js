/*
 * Tests du lot C côté contrôleur : thème, panneau, plein écran (commande), sauvegarde
 * automatique, restauration et erreurs de stockage, sur stockage et horloge factices.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const persistence = (root.Life && root.Life.persistence) || require('../src/persistence.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const KEY = 'jeu-de-la-vie:sauvegarde';

  // Stockage factice : options.throwOnAccess, options.quotaAfter (nombre d'écritures réussies)
  function fakeStorage(options) {
    const o = options || {};
    const store = { data: {}, writes: 0, removes: 0 };
    store.getItem = function (k) {
      if (o.throwOnAccess) throw new Error('SecurityError');
      return Object.prototype.hasOwnProperty.call(store.data, k) ? store.data[k] : null;
    };
    store.setItem = function (k, v) {
      if (o.throwOnAccess) throw new Error('SecurityError');
      if (o.quotaAfter !== undefined && store.writes >= o.quotaAfter) {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.writes++;
      store.data[k] = String(v);
    };
    store.removeItem = function (k) {
      store.removes++;
      delete store.data[k];
    };
    return store;
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // env.now est l'horloge commune (ms) ; tick() fait avancer le temps comme des images
  function make(options) {
    const env = { now: 0 };
    env.c = ctrl.createController(Object.assign({
      random: seeded(9),
      width: 800,
      height: 600,
      clock: function () { return env.now; },
      dateNow: function () { return 1792400000000 + env.now; },
    }, options || {}));
    env.at = function (t) {
      env.now = t;
      env.c.tick(t);
    };
    return env;
  }

  function place(c, id, x, y) {
    c.loadPattern(id);
    c.placeAt(x || 0, y || 0);
    c.cancelPlacing();
  }

  suite('Lot C — thème, panneau et plein écran', function () {
    test('T fait défiler Auto, Clair, Sombre ; inactif dans un champ', function () {
      const c = make().c;
      assert.equal(c.getState().theme, 'auto', 'Auto au départ');
      assert.equal(c.handleShortcut('t'), true);
      assert.equal(c.getState().theme, 'light');
      c.handleShortcut('T', { shift: true });
      assert.equal(c.getState().theme, 'dark');
      c.handleShortcut('t');
      assert.equal(c.getState().theme, 'auto');
      assert.equal(c.handleShortcut('t', { editable: true }), false, 'champ ou fenêtre de dialogue');
      assert.equal(c.getState().theme, 'auto');
      assert.equal(c.setTheme('violet'), 'auto', 'préférence invalide ignorée');
      assert.equal(c.setTheme('dark'), 'dark');
    });

    test('E demande le plein écran pendant l\'événement clavier ; sans gestionnaire, la touche est libre', function () {
      const commands = [];
      const c = make({ onCommand: function (name) { commands.push(name); } }).c;
      assert.equal(c.handleShortcut('e'), true);
      assert.deepEqual(commands, ['fullscreen']);
      assert.equal(c.handleShortcut('E', { editable: true }), false);
      assert.deepEqual(commands, ['fullscreen'], 'inactif dans un champ');
      assert.equal(make().c.handleShortcut('e'), false);
    });

    test('L replie et déplie le panneau ; la mise en page et la vue sont restaurées', function () {
      const c = make().c;
      place(c, 'pulsar');
      c.zoomAt(1.7, 100, 80);
      const before = c.getState().camera;
      assert.equal(c.getState().panelCollapsed, false);
      c.handleShortcut('l');
      assert.equal(c.getState().panelCollapsed, true);
      c.setViewport(1104, 600); // replié : la grille prend la largeur du panneau
      c.handleShortcut('L', { shift: true });
      assert.equal(c.getState().panelCollapsed, false);
      c.setViewport(800, 600);
      assert.deepEqual(c.getState().camera, before, 'même vue après repli puis dépli');
      assert.equal(c.handleShortcut('l', { editable: true }), false);
    });

    test('le point de la grille au centre de l\'écran reste au centre après un redimensionnement', function () {
      const c = make().c;
      c.panBy(-333, 127);
      c.zoomAt(2.3, 40, 500);
      const cam = c.getState().camera;
      const center = camera.screenToWorld(cam, cam.width / 2, cam.height / 2);
      for (const size of [[1440, 900], [2560, 1600], [976, 760]]) {
        c.setViewport(size[0], size[1]);
        const cam2 = c.getState().camera;
        const after = camera.screenToWorld(cam2, size[0] / 2, size[1] / 2);
        assert.near(after.x, center.x, 1e-9, 'x à ' + size.join('×'));
        assert.near(after.y, center.y, 1e-9, 'y à ' + size.join('×'));
        assert.equal(cam2.cellSize, cam.cellSize, 'zoom inchangé');
      }
    });
  });

  suite('Lot C — planification de la sauvegarde', function () {
    test('en pause, plusieurs modifications en moins de 1 s ne produisent qu\'une écriture', function () {
      const storage = fakeStorage();
      const e = make({ storage: storage });
      e.c.restore();
      for (let t = 0; t <= 600; t += 100) {
        e.c.toggleCell(t / 100, 0);
        e.at(t);
      }
      e.at(1500);
      assert.equal(storage.writes, 0, 'pas avant 1 s de calme');
      e.at(1600);
      assert.equal(storage.writes, 1);
      e.at(9000);
      assert.equal(storage.writes, 1, 'rien sans nouvelle modification');
      assert.equal(e.c.getState().save.status, 'saved');
      assert.equal(e.c.getState().save.savedAt, 1792400000000 + 1600);
    });

    test('pendant la simulation, au plus une écriture par période de 5 s, jamais à chaque génération', function () {
      const storage = fakeStorage();
      const e = make({ storage: storage });
      e.c.restore();
      place(e.c, 'r-pentomino');
      e.c.setSpeed(30);
      e.c.start();
      const times = [];
      for (let t = 0; t <= 12000; t += 16) {
        const before = storage.writes;
        e.at(t);
        if (storage.writes > before) times.push(t);
      }
      assert.ok(e.c.getState().generation > 300, e.c.getState().generation + ' générations');
      assert.ok(times.length >= 2 && times.length <= 3, times.length + ' écritures en 12 s');
      for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 5000);
    });

    test('une mise en pause manuelle force une écriture immédiate', function () {
      const storage = fakeStorage();
      const e = make({ storage: storage });
      e.c.restore();
      place(e.c, 'r-pentomino');
      e.c.start();
      e.at(0);
      e.at(100);
      e.at(200);
      const before = storage.writes;
      e.c.pause();
      assert.equal(storage.writes, before + 1, 'écriture au moment de la pause');
      const saved = persistence.deserialize(storage.data[KEY], { maxCells: 100000 });
      assert.deepEqual(saved.value.cells, e.c.getState().cells, 'l\'état en pause est celui écrit');
    });

    test('une pause automatique force aussi une écriture', function () {
      const storage = fakeStorage();
      const e = make({ storage: storage, autoPause: true });
      e.c.restore();
      place(e.c, 'blinker');
      e.c.start();
      e.at(0);
      e.at(100);
      const before = storage.writes;
      e.at(200); // génération 2 : oscillateur, pause automatique
      assert.equal(e.c.getState().running, false);
      assert.equal(storage.writes, before + 1);
    });

    test('pagehide ou page cachée (flushSave) force une écriture immédiate', function () {
      const storage = fakeStorage();
      const e = make({ storage: storage });
      e.c.restore();
      e.c.toggleCell(3, 4);
      e.at(10);
      assert.equal(storage.writes, 0);
      assert.equal(e.c.flushSave(), true);
      assert.equal(storage.writes, 1);
      assert.equal(e.c.flushSave(), false, 'rien de nouveau à écrire');
    });

    test('réglages et vue déclenchent une sauvegarde ; un simple redimensionnement non', function () {
      const storage = fakeStorage();
      const e = make({ storage: storage });
      e.c.restore();
      e.c.setViewport(1000, 700);
      e.at(0);
      e.at(2000);
      assert.equal(storage.writes, 0, 'taille de la fenêtre : rien à sauvegarder');
      e.c.setDensity(40);
      e.at(2100);
      e.at(3200);
      assert.equal(storage.writes, 1);
      e.c.panBy(30, 0);
      e.at(3300);
      e.at(4400);
      assert.equal(storage.writes, 2);
      e.c.handleShortcut('l');
      e.at(4500);
      e.at(5600);
      assert.equal(storage.writes, 3, 'panneau replié sauvegardé');
      assert.equal(JSON.parse(storage.data[KEY]).settings.panelCollapsed, true);
    });
  });

  suite('Lot C — restauration', function () {
    // Prépare une sauvegarde complète à partir d'un premier contrôleur
    function savedStorage(autoPause) {
      const storage = fakeStorage();
      const a = make({ storage: storage });
      a.c.restore();
      place(a.c, 'glider', -1000000000, 1000000000);
      place(a.c, 'blinker', 7, -3);
      a.c.setSpeed(17);
      a.c.setDensity(22);
      a.c.setJumpCount(333);
      a.c.setTheme('light');
      a.c.setAgeColors(true);
      a.c.setAutoPause(autoPause);
      a.c.setChartVisible(true);
      a.c.setPanelCollapsed(true);
      a.c.panBy(-250, 90);
      a.c.zoomAt(1.9, 300, 200);
      a.c.step();
      a.c.step(); // compteur à 2, historique non vide, âges > 1
      a.c.setTool('select');
      a.c.flushSave();
      return { storage: storage, source: a.c.getState() };
    }

    test('restauration exacte : cellules, caméra et réglages ; en pause, compteur à 0, âges à 1', function () {
      const prep = savedStorage(false);
      const b = make({ storage: prep.storage, autoPause: true });
      assert.deepEqual(b.c.restore(), { status: 'restored' });
      const s = b.c.getState();
      assert.deepEqual(s.cells, prep.source.cells);
      assert.equal(s.camera.centerX, prep.source.camera.centerX);
      assert.equal(s.camera.centerY, prep.source.camera.centerY);
      assert.equal(s.camera.cellSize, prep.source.camera.cellSize);
      assert.deepEqual([s.speed, s.density, s.jumpCount, s.theme, s.ageColors, s.chartVisible, s.panelCollapsed],
        [17, 22, 333, 'light', true, true, true]);
      assert.equal(s.running, false, 'en pause');
      assert.equal(s.generation, 0, 'compteur à 0');
      for (const v of s.ages.values()) assert.equal(v, 1, 'âges à 1');
      assert.equal(s.ages.size, s.cells.size);
      assert.equal(s.canBack, false, 'historique vide');
      assert.equal(s.population.length, 1, 'graphique vide (un point : la population au compteur 0)');
      assert.equal(s.selection, null, 'sélection vide');
      assert.equal(s.clipboard, null, 'presse-papiers vide');
      assert.equal(s.tool, 'pencil', 'outil actif non sauvegardé');
      assert.equal(s.save.status, 'saved');
    });

    test('pause automatique restaurée décochée, et réellement appliquée au contrôleur', function () {
      const b = make({ storage: savedStorage(false).storage, autoPause: true });
      b.c.restore();
      assert.equal(b.c.getState().autoPause, false);
      b.c.reset();
      place(b.c, 'blinker');
      b.c.start();
      b.at(0);
      b.at(500);
      assert.equal(b.c.getState().running, true, 'pas de pause sur le clignotant');
    });

    test('pause automatique restaurée cochée, et réellement appliquée au contrôleur', function () {
      const b = make({ storage: savedStorage(true).storage });
      assert.equal(b.c.getState().autoPause, false, 'désactivée par défaut dans le contrôleur');
      b.c.restore();
      assert.equal(b.c.getState().autoPause, true);
      b.c.reset();
      place(b.c, 'blinker');
      b.c.start();
      b.at(0);
      b.at(500);
      assert.equal(b.c.getState().running, false, 'pause automatique à la génération 2');
    });

    test('historique, graphique et détection vidés par la restauration, même dans un contrôleur déjà utilisé', function () {
      const storage = fakeStorage();
      const b = make({ storage: storage });
      b.c.restore();
      place(b.c, 'blinker');
      b.c.flushSave(); // sauvegarde : clignotant horizontal
      b.c.step(); // génération 1 : historique et tampons de détection remplis
      assert.equal(b.c.getState().canBack, true);
      assert.equal(b.c.restore().status, 'restored');
      let s = b.c.getState();
      assert.equal(s.generation, 0);
      assert.equal(s.canBack, false, 'historique vide');
      assert.equal(s.population.length, 1, 'graphique vide');
      b.c.dismissMessage();
      b.c.step(); // vertical : un tampon périmé ferait croire à un état stable
      assert.equal(b.c.getState().message, null, 'aucune détection fondée sur des états périmés');
      b.c.step();
      assert.equal(b.c.getState().message.text, 'Oscillateur de période 2 à la génération 2', 'détection normale ensuite');
    });

    test('sans sauvegarde : démarrage comme avant le lot C, pause automatique cochée', function () {
      const storage = fakeStorage();
      const b = make({ storage: storage, autoPause: true }); // l'interface passe la case cochée
      assert.deepEqual(b.c.restore(), { status: 'none' });
      const s = b.c.getState();
      assert.equal(s.autoPause, true);
      assert.equal(s.cells.size, 0);
      assert.deepEqual([s.speed, s.density, s.jumpCount, s.theme, s.panelCollapsed], [10, 30, 100, 'auto', false]);
      assert.equal(s.message, null);
    });

    test('sauvegarde invalide : ignorée avec un message, démarrage vide, sans exception', function () {
      for (const bad of ['{ cassé', JSON.stringify({ schemaVersion: 2 }), '{"schemaVersion":1}']) {
        const storage = fakeStorage();
        storage.data[KEY] = bad;
        const b = make({ storage: storage });
        const r = b.c.restore();
        assert.equal(r.status, 'invalid');
        assert.ok(/Sauvegarde ignorée/.test(b.c.getState().message.text), b.c.getState().message.text);
        assert.equal(b.c.getState().cells.size, 0);
        b.c.toggleCell(0, 0);
        b.at(0);
        b.at(1500);
        assert.equal(JSON.parse(storage.data[KEY]).schemaVersion, 1, 'remplacée à la modification suivante');
      }
    });
  });

  suite('Lot C — erreurs de stockage', function () {
    test('stockage qui lève une exception à l\'accès : application fonctionnelle, « indisponible »', function () {
      const storage = fakeStorage({ throwOnAccess: true });
      const e = make({ storage: storage });
      assert.deepEqual(e.c.restore(), { status: 'unavailable' });
      place(e.c, 'r-pentomino');
      e.c.start();
      for (let t = 0; t <= 7000; t += 100) e.at(t);
      e.c.pause();
      assert.ok(e.c.getState().generation > 0, 'la simulation tourne');
      assert.equal(e.c.getState().save.status, 'unavailable');
      assert.equal(e.c.flushSave(), false);
      const none = make().c;
      assert.equal(none.getState().save.status, 'unavailable', 'sans stockage du tout');
      assert.deepEqual(none.restore(), { status: 'unavailable' });
    });

    test('quota dépassé : l\'ancienne sauvegarde est conservée, un seul message', function () {
      const storage = fakeStorage({ quotaAfter: 1 });
      const e = make({ storage: storage });
      e.c.restore();
      e.c.toggleCell(1, 1);
      e.c.flushSave();
      const first = storage.data[KEY];
      assert.equal(storage.writes, 1);
      e.c.toggleCell(2, 2);
      e.c.flushSave();
      assert.equal(storage.data[KEY], first, 'sauvegarde précédente intacte');
      const s = e.c.getState();
      assert.equal(s.save.status, 'error');
      assert.ok(/Échec de la sauvegarde : l'espace de stockage local est plein/.test(s.message.text));
      const id = s.message.id;
      e.c.toggleCell(3, 3);
      e.c.flushSave();
      assert.equal(e.c.getState().message.id, id, 'pas de message répété');
      assert.ok(e.c.getState().cells.has('3,3'), 'l\'application continue');
    });

    test('« Oublier » supprime la clé sans modifier la grille ; la sauvegarde reprend ensuite', function () {
      const storage = fakeStorage();
      const e = make({ storage: storage });
      e.c.restore();
      place(e.c, 'pulsar');
      e.c.setSpeed(25);
      e.c.flushSave();
      assert.ok(storage.data[KEY]);
      const before = e.c.getState();
      assert.equal(e.c.forgetSave(), true);
      assert.equal(storage.data[KEY], undefined, 'clé supprimée');
      const after = e.c.getState();
      assert.ok(after.cells === before.cells, 'grille inchangée');
      assert.equal(after.speed, 25, 'réglages inchangés');
      assert.equal(after.save.status, 'idle');
      e.at(5000);
      assert.equal(storage.data[KEY], undefined, 'pas de réécriture sans modification');
      e.c.toggleCell(50, 50);
      e.at(5100);
      e.at(6200);
      assert.ok(storage.data[KEY], 'la sauvegarde reprend à la modification suivante');
    });
  });
})(globalThis);
