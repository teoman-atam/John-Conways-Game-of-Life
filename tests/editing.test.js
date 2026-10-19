/*
 * Tests du lot A « Composition » côté contrôleur : outils, crayon, sélection,
 * presse-papiers, mode pose, Espace, remplissage aléatoire, RLE et coordonnées.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const camera = (root.Life && root.Life.camera) || require('../src/camera.js');
  const transform = (root.Life && root.Life.transform) || require('../src/transform.js');
  const tools = (root.Life && root.Life.tools) || require('../src/tools.js');
  const rle = (root.Life && root.Life.rle) || require('../src/rle.js');
  const ctrl = (root.Life && root.Life.controller) || require('../src/controller.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const CMD = { meta: true };
  const GLIDER_RLE = 'x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!';

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function make(options) {
    return ctrl.createController(Object.assign({ random: seeded(7), width: 800, height: 600 }, options || {}));
  }

  // Centre à l'écran de la cellule (x, y)
  function at(c, x, y) {
    return camera.worldToScreen(c.getState().camera, x + 0.5, y + 0.5);
  }

  function drag(c, from, to) {
    const a = at(c, from[0], from[1]);
    const b = at(c, to[0], to[1]);
    c.pointerDown(a.x, a.y);
    c.pointerMove(b.x, b.y);
    return c.pointerUp(b.x, b.y);
  }

  function click(c, x, y) {
    const p = at(c, x, y);
    c.pointerDown(p.x, p.y);
    return c.pointerUp(p.x, p.y);
  }

  function set(keys) {
    return new Set(keys);
  }

  function blinkerAtGen2(c) {
    c.toggleCell(-1, 0);
    c.toggleCell(0, 0);
    c.toggleCell(1, 0);
    c.step();
    c.step();
    assert.equal(c.getState().generation, 2);
  }

  function shapeOf(id) {
    const m = patterns.matrix(id);
    return { cells: patterns.cells(id), width: m[0].length, height: m.length };
  }

  suite('Lot A — outils', function () {
    test('Crayon par défaut ; H, P et S choisissent Déplacer, Crayon et Sélection', function () {
      const c = make();
      assert.equal(c.getState().tool, 'pencil');
      c.handleShortcut('h');
      assert.equal(c.getState().tool, 'move');
      c.handleShortcut('S', { shift: true });
      assert.equal(c.getState().tool, 'select');
      c.handleShortcut('p');
      assert.equal(c.getState().tool, 'pencil');
      assert.throws(function () { c.setTool('gomme'); }, /Outil inconnu/);
    });

    test('Déplacer : glisser déplace la vue, un clic n\'a aucun effet', function () {
      const c = make();
      c.setTool('move');
      const before = c.getState();
      assert.equal(click(c, 2, 2), 'click');
      assert.ok(c.getState().cells === before.cells, 'clic sans effet');
      assert.equal(drag(c, [0, 0], [5, 0]), 'drag');
      assert.near(c.getState().camera.centerX, before.camera.centerX - 5, 1e-9);
      assert.equal(c.getState().cells.size, 0);
    });

    test('pendant la simulation, aucun outil ne modifie de cellule (tous se comportent comme Déplacer)', function () {
      for (const t of ['pencil', 'select', 'move']) {
        const c = make();
        c.toggleCell(0, 0);
        c.setTool(t);
        c.start();
        assert.equal(c.getState().effectiveTool, 'move');
        const cells = c.getState().cells;
        click(c, 3, 3);
        drag(c, [1, 1], [6, 4]);
        const s = c.getState();
        assert.ok(s.cells === cells, t + ' : aucune cellule modifiée');
        assert.equal(s.selection, null, t + ' : aucune sélection');
        assert.notEqual(s.camera.centerX, 0.5, t + ' : la vue a bougé');
      }
    });

    test('le démarrage efface la sélection et annule le mode pose', function () {
      const c = make();
      c.setTool('select');
      drag(c, [0, 0], [3, 3]);
      c.loadPattern('glider');
      assert.ok(c.getState().selection && c.getState().placing);
      c.start();
      assert.equal(c.getState().selection, null);
      assert.equal(c.getState().placing, null);
      assert.equal(c.getState().tool, 'select', 'l\'outil choisi est conservé');
    });

    test('toute édition (crayon, pose, couper, supprimer) remet le compteur de générations à 0', function () {
      const edits = {
        'clic au crayon': function (c) { click(c, 9, 9); },
        'glisser au crayon': function (c) { drag(c, [9, 9], [12, 9]); },
        'pose': function (c) { c.loadPattern('block'); c.placeAt(20, 20); },
        'couper': function (c) { c.setTool('select'); drag(c, [-2, -2], [2, 2]); c.cutSelection(); },
        'supprimer': function (c) { c.setTool('select'); drag(c, [-2, -2], [2, 2]); c.handleShortcut('Backspace'); },
      };
      for (const name of Object.keys(edits)) {
        const c = make();
        blinkerAtGen2(c);
        edits[name](c);
        assert.equal(c.getState().generation, 0, name);
      }
    });
  });

  suite('Lot A — crayon', function () {
    test('un clic sous le seuil de 4 px inverse une seule cellule', function () {
      const c = make();
      const p = at(c, 4, -1);
      c.pointerDown(p.x, p.y);
      c.pointerMove(p.x + 3, p.y);
      assert.equal(c.pointerUp(p.x + 2, p.y + 3), 'click');
      assert.deepEqual(c.getState().cells, set(['4,-1']));
    });

    test('un trajet rapide de (0,0) à (10,3) ne laisse aucun trou', function () {
      const c = make();
      assert.equal(drag(c, [0, 0], [10, 3]), 'drag');
      const cells = c.getState().cells;
      const expected = set(tools.lineCells(0, 0, 10, 3).map(function (p) { return engine.key(p.x, p.y); }));
      assert.deepEqual(cells, expected);
      assert.equal(cells.size, 11);
      for (let x = 0; x <= 10; x++) {
        let found = 0;
        for (let y = 0; y <= 3; y++) if (cells.has(engine.key(x, y))) found++;
        assert.equal(found, 1, 'colonne ' + x + ' couverte une fois');
      }
    });

    test('première cellule morte : on dessine, sans effacer les cellules déjà vivantes', function () {
      const c = make();
      c.toggleCell(3, 0);
      drag(c, [0, 0], [6, 0]);
      const s = c.getState().cells;
      assert.equal(s.size, 7);
      for (let x = 0; x <= 6; x++) assert.ok(s.has(engine.key(x, 0)), 'cellule ' + x + ' vivante');
    });

    test('première cellule vivante : on efface, sans rien dessiner', function () {
      const c = make();
      for (const x of [0, 1, 2, 5]) c.toggleCell(x, 0);
      c.toggleCell(0, 5);
      drag(c, [0, 0], [8, 0]);
      assert.deepEqual(c.getState().cells, set(['0,5']), 'seule la cellule hors trajet reste');
    });

    test('le plafond MAX_LIVE_CELLS arrête le dessin, avec un message', function () {
      const c = make({ maxLiveCells: 5 });
      drag(c, [0, 0], [9, 0]);
      assert.equal(c.getState().cells.size, 5);
      assert.ok(/Dessin refusé/.test(c.getState().message.text));
    });
  });

  suite('Lot A — sélection et presse-papiers', function () {
    test('glisser trace un rectangle aligné sur la grille ; un nouveau tracé le remplace ; Échap l\'efface', function () {
      const c = make();
      c.setTool('select');
      drag(c, [4, 3], [1, 1]);
      assert.deepEqual(c.getState().selection, { minX: 1, minY: 1, maxX: 4, maxY: 3 });
      drag(c, [10, 10], [11, 12]);
      assert.deepEqual(c.getState().selection, { minX: 10, minY: 10, maxX: 11, maxY: 12 });
      assert.equal(c.handleShortcut('Escape'), true);
      assert.equal(c.getState().selection, null);
      assert.equal(c.handleShortcut('Escape'), false, 'rien à annuler');
    });

    test('un clic sans glisser avec la Sélection efface la sélection', function () {
      const c = make();
      c.setTool('select');
      drag(c, [0, 0], [2, 2]);
      click(c, 8, 8);
      assert.equal(c.getState().selection, null);
    });

    test('Cmd+C copie sans rien modifier ; la boîte garde les dimensions de la sélection', function () {
      const c = make();
      // Bloc stable en (5,5), assez loin du clignotant pour ne pas interagir avec lui
      c.toggleCell(5, 5);
      c.toggleCell(6, 5);
      c.toggleCell(5, 6);
      c.toggleCell(6, 6);
      blinkerAtGen2(c);
      c.setTool('select');
      const cellsBefore = c.getState().cells;
      drag(c, [4, 4], [7, 7]);
      assert.equal(c.handleShortcut('c', CMD), true);
      const s = c.getState();
      assert.ok(s.cells === cellsBefore, 'copier ne modifie rien');
      assert.equal(s.generation, 2, 'compteur inchangé');
      // Boîte 4 × 4 : la colonne et la ligne vides de droite et du bas sont conservées
      assert.deepEqual(s.clipboard, { cells: set(['1,1', '2,1', '1,2', '2,2']), width: 4, height: 4 });
    });

    test('Cmd+X copie puis retire les cellules de la sélection', function () {
      const c = make();
      for (const k of [[0, 0], [1, 1], [2, 2], [5, 5]]) c.toggleCell(k[0], k[1]);
      c.setTool('select');
      drag(c, [0, 0], [2, 2]);
      assert.equal(c.handleShortcut('x', CMD), true);
      assert.deepEqual(c.getState().cells, set(['5,5']));
      assert.deepEqual(c.getState().clipboard.cells, set(['0,0', '1,1', '2,2']));
    });

    test('Retour arrière et Suppr retirent les cellules de la sélection, sans toucher au presse-papiers', function () {
      for (const key of ['Backspace', 'Delete']) {
        const c = make();
        c.toggleCell(0, 0);
        c.toggleCell(7, 0);
        c.setTool('select');
        drag(c, [-1, -1], [1, 1]);
        assert.equal(c.handleShortcut(key), true);
        assert.deepEqual(c.getState().cells, set(['7,0']), key);
        assert.equal(c.getState().clipboard, null, key);
      }
    });

    test('Cmd+V sans presse-papiers ne fait rien', function () {
      const c = make();
      c.toggleCell(0, 0);
      const before = c.getState();
      assert.equal(c.handleShortcut('v', CMD), false);
      const s = c.getState();
      assert.equal(s.placing, null);
      assert.ok(s.cells === before.cells);
    });

    test('copier puis coller ailleurs : le contenu est posé par union, sans effacer l\'existant', function () {
      const c = make();
      c.toggleCell(0, 0);
      c.toggleCell(1, 0);
      c.toggleCell(2, 1);
      c.setTool('select');
      drag(c, [0, 0], [2, 1]);
      c.handleShortcut('c', CMD);
      assert.equal(c.handleShortcut('v', CMD), true);
      assert.equal(c.getState().placing.name, 'Collage');
      c.placeAt(21, 10); // boîte 3 × 2 : coin haut gauche en (20, 9)
      assert.deepEqual(c.getState().cells, set(['0,0', '1,0', '2,1', '20,9', '21,9', '22,10']));
    });

    test('actions possibles seulement en pause avec une sélection ; boutons actifs en conséquence', function () {
      const c = make();
      c.toggleCell(0, 0);
      let s = c.getState();
      assert.ok(!s.canCopy && !s.canCut && !s.canDelete && !s.canPaste, 'rien sans sélection');
      assert.equal(c.handleShortcut('c', CMD), false);
      c.setTool('select');
      drag(c, [0, 0], [1, 1]);
      s = c.getState();
      assert.ok(s.canCopy && s.canCut && s.canDelete && !s.canPaste);
      c.copySelection();
      assert.ok(c.getState().canPaste, 'coller possible après copie');
      c.start();
      s = c.getState();
      assert.ok(!s.canCopy && !s.canDelete, 'pas pendant la simulation');
      assert.equal(c.deleteSelection(), false);
    });

    test('Ctrl remplace Cmd hors Mac ; Ctrl+C est ignoré sur Mac', function () {
      const pc = make({ isMac: false });
      pc.toggleCell(0, 0);
      pc.setTool('select');
      drag(pc, [0, 0], [0, 0 + 1]);
      assert.equal(pc.handleShortcut('c', { meta: true }), false, 'Cmd sans effet hors Mac');
      assert.equal(pc.handleShortcut('c', { ctrl: true }), true);
      assert.ok(pc.getState().clipboard);
      const mac = make();
      mac.toggleCell(0, 0);
      mac.setTool('select');
      drag(mac, [0, 0], [0, 1]);
      assert.equal(mac.handleShortcut('c', { ctrl: true }), false);
      assert.equal(mac.getState().clipboard, null);
    });

    test('le presse-papiers persiste : plusieurs collages successifs', function () {
      const c = make();
      c.toggleCell(0, 0);
      c.setTool('select');
      drag(c, [-1, -1], [1, 1]); // boîte 3 × 3 centrée sur (0,0)
      c.copySelection();
      c.paste();
      c.placeAt(10, 0);
      c.cancelPlacing();
      c.paste();
      c.placeAt(20, 0);
      assert.deepEqual(c.getState().cells, set(['0,0', '10,0', '20,0']));
    });
  });

  suite('Lot A — mode pose', function () {
    test('aperçu centré sous le curseur (centre de la boîte arrondi à la cellule)', function () {
      const c = make();
      c.loadPattern('glider');
      const p = at(c, 20, -7);
      c.pointerMove(p.x, p.y);
      assert.deepEqual(c.getState().placing.origin, { x: 19, y: -8 });
      c.loadPattern('block'); // boîte 2 × 2
      assert.deepEqual(c.getState().placing.origin, { x: 19, y: -8 });
      c.pointerLeave();
      assert.deepEqual(c.getState().placing.origin, { x: 19, y: -8 }, 'reste en place quand le curseur sort');
    });

    test('un clic pose par union ; le mode reste actif pour plusieurs poses à la suite', function () {
      const c = make();
      c.toggleCell(0, 0);
      c.loadPattern('glider');
      assert.equal(click(c, 0, 0), 'click');
      assert.equal(click(c, 10, 0), 'click');
      const s = c.getState();
      const expected = transform.union(transform.union(set(['0,0']), patterns.cells('glider', -1, -1)),
        patterns.cells('glider', 9, -1));
      assert.deepEqual(s.cells, expected);
      assert.ok(s.cells.has('0,0'), 'cellule existante conservée');
      assert.ok(s.placing, 'toujours en mode pose');
      assert.equal(s.effectiveTool, 'place');
    });

    test('Échap ou le choix d\'un autre outil quitte le mode pose', function () {
      const c = make();
      c.loadPattern('glider');
      assert.equal(c.handleShortcut('Escape'), true);
      assert.equal(c.getState().placing, null);
      c.loadPattern('glider');
      c.handleShortcut('h');
      assert.equal(c.getState().placing, null);
      assert.equal(c.getState().tool, 'move');
    });

    test('R, Maj+R, F et Maj+F transforment l\'aperçu ; hors pose, R recentre', function () {
      const c = make();
      const glider = shapeOf('glider');
      c.loadPattern('glider');
      c.handleShortcut('r');
      assert.deepEqual(c.getState().placing.shape, transform.rotateClockwise(glider));
      c.handleShortcut('R', { shift: true });
      assert.deepEqual(c.getState().placing.shape, glider);
      c.handleShortcut('f');
      assert.deepEqual(c.getState().placing.shape, transform.mirrorHorizontal(glider));
      c.handleShortcut('f');
      c.handleShortcut('F', { shift: true });
      assert.deepEqual(c.getState().placing.shape, transform.mirrorVertical(glider));
      c.cancelPlacing();
      c.toggleCell(100, 100);
      c.handleShortcut('r');
      assert.near(c.getState().camera.centerX, 100.5, 1e-9, 'R recentre hors pose');
      assert.equal(c.handleShortcut('f'), false, 'F sans effet hors pose');
    });

    test('poses multiples d\'un planeur tourné : chaque copie reste un planeur', function () {
      const c = make();
      c.loadPattern('glider');
      c.rotatePlacing(true);
      c.placeAt(0, 0);
      c.placeAt(20, 0);
      const s = c.getState().cells;
      assert.equal(s.size, 10);
      let g = s;
      for (let i = 0; i < 4; i++) g = engine.nextGeneration(g);
      assert.deepEqual(g, engine.translate(s, -1, 1), 'tournés d\'un quart de tour, ils filent vers (-1,+1)');
    });

    test('une pose au-delà de MAX_LIVE_CELLS est refusée et ne modifie rien', function () {
      const c = make({ maxLiveCells: 40 });
      c.loadPattern('gosper-gun');
      assert.equal(c.placeAt(0, 0), true);
      const before = c.getState();
      assert.equal(c.placeAt(100, 100), false);
      const s = c.getState();
      assert.ok(s.cells === before.cells, 'grille inchangée');
      assert.ok(/Pose refusée/.test(s.message.text) && /MAX_LIVE_CELLS/.test(s.message.text));
    });

    test('choisir un motif pendant la simulation la met en pause', function () {
      const c = make();
      c.toggleCell(0, 0);
      c.start();
      c.loadPattern('lwss');
      assert.equal(c.getState().running, false);
      assert.equal(c.getState().placing.name, 'Vaisseau léger (LWSS)');
    });
  });

  suite('Lot A — Espace', function () {
    test('un appui bref fait une bascule au relâchement', function () {
      const c = make();
      assert.equal(c.handleShortcut(' '), true);
      assert.equal(c.getState().running, false, 'rien à l\'appui');
      assert.equal(c.getState().spaceHeld, true);
      assert.equal(c.handleKeyUp(' '), true);
      assert.equal(c.getState().running, true, 'bascule au relâchement');
      c.handleShortcut(' ');
      c.handleShortcut(' ', { repeat: true });
      c.handleShortcut(' ', { repeat: true });
      c.handleKeyUp(' ');
      assert.equal(c.getState().running, false, 'la répétition automatique ne fait qu\'une bascule');
    });

    test('Espace maintenu avec glisser déplace la vue, quel que soit l\'outil, sans bascule', function () {
      for (const t of ['pencil', 'select', 'move']) {
        const c = make();
        c.setTool(t);
        c.handleShortcut(' ');
        assert.equal(c.getState().effectiveTool, 'move');
        drag(c, [0, 0], [6, 2]);
        const s = c.getState();
        assert.equal(s.cells.size, 0, t + ' : aucune cellule');
        assert.equal(s.selection, null, t + ' : aucune sélection');
        assert.near(s.camera.centerX, 0.5 - 6, 1e-9, t + ' : vue déplacée');
        c.handleKeyUp(' ');
        assert.equal(c.getState().running, false, t + ' : pas de bascule');
        assert.equal(c.getState().spaceHeld, false);
      }
    });

    test('aucune bascule quand le focus est dans un champ', function () {
      const c = make();
      assert.equal(c.handleShortcut(' ', { editable: true }), false);
      assert.equal(c.handleKeyUp(' '), false);
      assert.equal(c.getState().running, false);
      assert.equal(c.handleShortcut('n', { editable: true }), false, 'aucun raccourci dans un champ');
      assert.equal(c.getState().generation, 0);
    });

    test('perte du focus de la fenêtre : Espace relâché sans bascule', function () {
      const c = make();
      c.handleShortcut(' ');
      c.releaseKeys();
      assert.equal(c.handleKeyUp(' '), false);
      assert.equal(c.getState().running, false);
    });
  });

  suite('Lot A — remplissage aléatoire', function () {
    test('avec un générateur injecté, la zone remplie correspond exactement à la zone visible', function () {
      const c = ctrl.createController({ random: function () { return 0; }, width: 500, height: 300 });
      c.zoomAt(0.5, 123, 77); // vue décentrée et dézoomée
      c.randomFill();
      const area = camera.visibleCells(c.getState().camera);
      const cells = c.getState().cells;
      assert.equal(cells.size, (area.maxX - area.minX + 1) * (area.maxY - area.minY + 1), 'chaque case visible');
      assert.deepEqual(engine.boundingBox(cells), {
        minX: area.minX, minY: area.minY, maxX: area.maxX, maxY: area.maxY,
        width: area.maxX - area.minX + 1, height: area.maxY - area.minY + 1,
      }, 'rien hors de la vue');
    });

    test('densité réglable de 5 à 50 %, 30 % au départ, utilisée comme seuil', function () {
      const c = make();
      assert.equal(c.getState().density, 30);
      assert.equal(c.setDensity(4), 5);
      assert.equal(c.setDensity(51), 50);
      assert.equal(c.setDensity('12'), 12);
      assert.equal(c.setDensity(NaN), 12, 'valeur invalide ignorée');
      const values = [0, 0.1, 0.119, 0.12, 0.5];
      let i = 0;
      const d = ctrl.createController({ random: function () { return values[i++ % values.length]; }, width: 50, height: 12 });
      d.zoomAt(10 / 12, 25, 6); // 5 × 3 cellules visibles
      d.setDensity(12);
      d.randomFill();
      assert.equal(d.getState().cells.size, 9, '3 valeurs sur 5 sous 0,12, sur 15 cases');
    });

    test('refusé sans modification quand le nombre attendu dépasse le plafond', function () {
      const c = make({ width: 1440, height: 900 });
      c.toggleCell(1, 1);
      c.zoomAt(1 / 12, 720, 450); // 1 px par cellule : environ 1,3 million de cases visibles
      const before = c.getState();
      assert.equal(c.randomFill(), false);
      const s = c.getState();
      assert.ok(s.cells === before.cells, 'grille inchangée');
      assert.ok(/Remplissage refusé/.test(s.message.text) && /Zoomez ou baissez la densité/.test(s.message.text));
      c.zoomAt(4, 720, 450); // 4 px par cellule : environ 81 000 cases × 30 % = 24 300
      assert.equal(c.randomFill(), true, 'accepté une fois zoomé');
      const small = make({ maxLiveCells: 100 }); // 67 × 51 cases
      small.setDensity(5); // 171 attendues > 100
      assert.equal(small.randomFill(), false);
      assert.equal(small.getState().cells.size, 0);
    });
  });

  suite('Lot A — RLE et coordonnées', function () {
    test('import réussi : mode pose avec ce contenu, la grille n\'est modifiée qu\'à la pose', function () {
      const c = make();
      c.toggleCell(50, 50);
      c.start();
      const r = c.importRle('#N Glider\n' + GLIDER_RLE);
      assert.equal(r.ok, true);
      const s = c.getState();
      assert.equal(s.running, false, 'mise en pause');
      assert.equal(s.placing.name, 'Motif RLE');
      assert.deepEqual(s.placing.shape.cells, patterns.cells('glider'));
      assert.deepEqual(s.cells, set(['50,50']));
      c.placeAt(1, 1);
      assert.deepEqual(c.getState().cells, transform.union(set(['50,50']), patterns.cells('glider')));
    });

    test('import refusé (règle, format, plafond, motif vide) : message et aucune modification', function () {
      const c = make({ maxLiveCells: 4 });
      const cases = [
        ['x = 3, y = 3, rule = B36/S23\nbo$2bo$3o!', /règle « B36\/S23 »/],
        ['x = 3, y = 3\nbo$2bo', /« ! » manquante/],
        [GLIDER_RLE, /plafond de 4/],
        ['x = 2, y = 2\n2b!', /aucune cellule vivante/],
      ];
      for (const k of cases) {
        const r = c.importRle(k[0]);
        assert.equal(r.ok, false);
        assert.ok(k[1].test(r.error), r.error);
        assert.equal(c.getState().placing, null);
        assert.equal(c.getState().cells.size, 0);
      }
    });

    test('export : la sélection si elle existe, sinon toutes les cellules vivantes', function () {
      const c = make();
      for (const k of [[0, 0], [1, 0], [2, 1], [30, 40]]) c.toggleCell(k[0], k[1]);
      let e = c.exportRle();
      assert.equal(e.scope, 'all');
      assert.deepEqual([e.width, e.height, e.count], [31, 41, 4]);
      assert.deepEqual(rle.parse(e.text).cells, transform.shapeFromCells(c.getState().cells).cells);
      c.setTool('select');
      drag(c, [-1, -1], [3, 2]);
      e = c.exportRle();
      assert.equal(e.scope, 'selection');
      assert.deepEqual([e.width, e.height, e.count], [5, 4, 3]);
      assert.deepEqual(rle.parse(e.text).cells, set(['1,1', '2,1', '3,2']));
    });

    test('nom du fichier .rle', function () {
      assert.equal(ctrl.exportFileName(3, new Date(2026, 9, 18, 9, 5, 0), 'rle'), 'jeu-de-la-vie_gen-3_20261018-090500.rle');
    });

    test('coordonnées de la cellule survolée, vidées quand le curseur quitte le canvas', function () {
      const c = make();
      assert.equal(c.getState().hoverCell, null);
      const p = at(c, 7, -3);
      c.pointerMove(p.x, p.y);
      assert.deepEqual(c.getState().hoverCell, { x: 7, y: -3 });
      c.zoomAt(2, 0, 0);
      assert.deepEqual(c.getState().hoverCell, camera.screenToCell(c.getState().camera, p.x, p.y), 'suit le zoom');
      c.pointerLeave();
      assert.equal(c.getState().hoverCell, null);
    });
  });
})(globalThis);
