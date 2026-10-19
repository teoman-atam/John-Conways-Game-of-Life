/*
 * Tests des outils : segment de Bresenham, outil effectif et machine d'état des gestes.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const tools = (root.Life && root.Life.tools) || require('../src/tools.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  // Vérifie qu'un trajet ne laisse aucun trou : chaque cellule touche la précédente
  function assertContiguous(points) {
    for (let i = 1; i < points.length; i++) {
      const dx = Math.abs(points[i].x - points[i - 1].x);
      const dy = Math.abs(points[i].y - points[i - 1].y);
      assert.ok(dx <= 1 && dy <= 1 && dx + dy > 0, 'trou entre ' + JSON.stringify(points[i - 1]) + ' et ' + JSON.stringify(points[i]));
    }
  }

  suite('Outils — segment de Bresenham', function () {
    test('(0,0) → (10,3) : 11 cellules, extrémités incluses, aucun trou', function () {
      const line = tools.lineCells(0, 0, 10, 3);
      assert.equal(line.length, 11);
      assert.deepEqual(line[0], { x: 0, y: 0 });
      assert.deepEqual(line[10], { x: 10, y: 3 });
      assertContiguous(line);
      for (let i = 0; i < line.length; i++) assert.equal(line[i].x, i, 'une cellule par colonne');
    });

    test('vertical, diagonal, à rebours et point unique', function () {
      const v = tools.lineCells(3, -2, 3, 4);
      assert.equal(v.length, 7);
      assertContiguous(v);
      const d = tools.lineCells(-5, -5, 5, 5);
      assert.equal(d.length, 11);
      assertContiguous(d);
      const back = tools.lineCells(10, 3, 0, 0);
      assert.equal(back.length, 11);
      assertContiguous(back);
      assert.deepEqual(back[0], { x: 10, y: 3 });
      assert.deepEqual(tools.lineCells(7, 7, 7, 7), [{ x: 7, y: 7 }]);
    });

    test('grands écarts et coordonnées extrêmes : toujours contigu', function () {
      const line = tools.lineCells(-1000000000, 5, -1000000000 + 37, -90);
      assert.equal(line.length, 96);
      assertContiguous(line);
    });
  });

  suite('Outils — outil effectif', function () {
    test('simulation ou Espace maintenu → Déplacer ; sinon la pose prime sur l\'outil choisi', function () {
      const base = { tool: 'pencil', placing: null, running: false, spaceHeld: false };
      assert.equal(tools.effectiveTool(base), 'pencil');
      assert.equal(tools.effectiveTool(Object.assign({}, base, { running: true })), 'move');
      assert.equal(tools.effectiveTool(Object.assign({}, base, { spaceHeld: true })), 'move');
      assert.equal(tools.effectiveTool(Object.assign({}, base, { placing: {} })), 'place');
      assert.equal(tools.effectiveTool(Object.assign({}, base, { placing: {}, running: true })), 'move');
      assert.equal(tools.effectiveTool(Object.assign({}, base, { tool: 'select' })), 'select');
      assert.ok(tools.isTool('move') && tools.isTool('select') && !tools.isTool('place'));
    });
  });

  suite('Outils — gestes', function () {
    test('appui relâché à 4 px ou moins : un clic, sur la cellule d\'appui', function () {
      const g = tools.createGesture(4);
      g.begin('pencil', 100, 100, { x: 3, y: 4 }, false);
      assert.equal(g.move(103, 102, { x: 3, y: 4 }), null, 'sous le seuil : aucune action');
      const r = g.end(104, 100, { x: 4, y: 4 });
      assert.deepEqual(r, { kind: 'click', tool: 'pencil', cell: { x: 3, y: 4 }, action: null });
      assert.equal(g.isActive(), false);
    });

    test('crayon : le mode est fixé par la première cellule, chaque segment prolonge le précédent', function () {
      const g = tools.createGesture(4);
      g.begin('pencil', 0, 0, { x: 0, y: 0 }, true);
      const a = g.move(30, 0, { x: 2, y: 0 });
      assert.deepEqual(a, { type: 'paint', mode: 'erase', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] });
      assert.equal(g.move(31, 1, { x: 2, y: 0 }), null, 'même cellule : rien à peindre');
      const b = g.move(60, 12, { x: 4, y: 1 });
      assert.deepEqual(b.cells, [{ x: 3, y: 1 }, { x: 4, y: 1 }], 'sans repeindre la cellule précédente');
      assert.equal(g.end(60, 12, { x: 4, y: 1 }).kind, 'drag');
      g.begin('pencil', 0, 0, { x: 9, y: 9 }, false);
      assert.equal(g.move(0, 20, { x: 9, y: 10 }).mode, 'draw', 'première cellule morte : on dessine');
    });

    test('sélection : rectangle aligné sur la grille, dans n\'importe quel sens', function () {
      const g = tools.createGesture(4);
      g.begin('select', 100, 100, { x: 5, y: 5 }, false);
      assert.deepEqual(g.move(40, 70, { x: 1, y: 2 }), { type: 'select', rect: { minX: 1, minY: 2, maxX: 5, maxY: 5 } });
      const r = g.end(40, 70, { x: 1, y: 2 });
      assert.equal(r.kind, 'drag');
      assert.deepEqual(r.action.rect, { minX: 1, minY: 2, maxX: 5, maxY: 5 });
    });

    test('déplacer et pose : glisser déplace la vue, avec rattrapage du chemin parcouru', function () {
      const g = tools.createGesture(4);
      g.begin('move', 10, 10, { x: 0, y: 0 }, false);
      assert.deepEqual(g.move(16, 10, { x: 0, y: 0 }), { type: 'pan', dx: 6, dy: 0 });
      assert.deepEqual(g.move(20, 15, { x: 0, y: 0 }), { type: 'pan', dx: 4, dy: 5 });
      assert.equal(g.isDragging(), true);
      g.end(20, 15, { x: 0, y: 0 });
      g.begin('place', 0, 0, { x: 0, y: 0 }, false);
      assert.equal(g.move(0, 9, { x: 0, y: 0 }).type, 'pan');
      g.cancel();
      assert.equal(g.end(0, 0, { x: 0, y: 0 }), null, 'annulé : plus de geste');
    });
  });
})(globalThis);
