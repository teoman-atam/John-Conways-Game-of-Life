/*
 * Tests des transformations pures : rotations, miroirs, extraction, union et retrait.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const tf = (root.Life && root.Life.transform) || require('../src/transform.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function shapeOf(id) {
    const m = patterns.matrix(id);
    return { cells: patterns.cells(id), width: m[0].length, height: m.length };
  }

  function snapshot(shape) {
    return { cells: Array.from(shape.cells).sort(), width: shape.width, height: shape.height };
  }

  function run(cells, generations) {
    let current = cells;
    for (let i = 0; i < generations; i++) current = engine.nextGeneration(current);
    return current;
  }

  // Forme asymétrique (aucune symétrie) pour que chaque transformation soit visible
  const L_SHAPE = { cells: engine.fromMatrix([[1, 0, 0], [1, 0, 0], [1, 1, 0]]), width: 3, height: 3 };
  const WIDE = { cells: engine.fromMatrix([[1, 1, 0, 0], [0, 0, 0, 1]]), width: 4, height: 2 };

  suite('Transformations — rotations et miroirs', function () {
    test('rotation horaire : le coin haut gauche passe en haut à droite, la boîte pivote', function () {
      const r = tf.rotateClockwise(WIDE);
      assert.equal(r.width, 2);
      assert.equal(r.height, 4);
      assert.deepEqual(engine.toMatrix(r.cells, 0, 0, 2, 4), [[0, 1], [0, 1], [0, 0], [1, 0]]);
    });

    test('rotation antihoraire : le coin haut gauche passe en bas à gauche', function () {
      const r = tf.rotateCounterclockwise(WIDE);
      assert.deepEqual([r.width, r.height], [2, 4]);
      assert.deepEqual(engine.toMatrix(r.cells, 0, 0, 2, 4), [[0, 1], [0, 0], [1, 0], [1, 0]]);
    });

    test('miroir horizontal (gauche ↔ droite) et vertical (haut ↔ bas)', function () {
      const h = tf.mirrorHorizontal(L_SHAPE);
      assert.deepEqual(engine.toMatrix(h.cells, 0, 0, 3, 3), [[0, 0, 1], [0, 0, 1], [0, 1, 1]]);
      const v = tf.mirrorVertical(L_SHAPE);
      assert.deepEqual(engine.toMatrix(v.cells, 0, 0, 3, 3), [[1, 1, 0], [1, 0, 0], [1, 0, 0]]);
    });

    test('4 rotations horaires donnent l\'identité', function () {
      for (const s of [L_SHAPE, WIDE, shapeOf('gosper-gun'), shapeOf('lwss')]) {
        let r = s;
        for (let i = 0; i < 4; i++) r = tf.rotateClockwise(r);
        assert.deepEqual(snapshot(r), snapshot(s));
      }
    });

    test('une rotation horaire suivie d\'une antihoraire donne l\'identité', function () {
      for (const s of [L_SHAPE, WIDE, shapeOf('r-pentomino')]) {
        assert.deepEqual(snapshot(tf.rotateCounterclockwise(tf.rotateClockwise(s))), snapshot(s));
        assert.deepEqual(snapshot(tf.rotateClockwise(tf.rotateCounterclockwise(s))), snapshot(s));
      }
    });

    test('deux miroirs identiques donnent l\'identité', function () {
      for (const s of [L_SHAPE, WIDE, shapeOf('glider')]) {
        assert.deepEqual(snapshot(tf.mirrorHorizontal(tf.mirrorHorizontal(s))), snapshot(s));
        assert.deepEqual(snapshot(tf.mirrorVertical(tf.mirrorVertical(s))), snapshot(s));
      }
    });

    test('le nombre de cellules est conservé', function () {
      const s = shapeOf('gosper-gun');
      const fns = [tf.rotateClockwise, tf.rotateCounterclockwise, tf.mirrorHorizontal, tf.mirrorVertical];
      for (const fn of fns) assert.equal(fn(s).cells.size, 36);
    });

    test('un planeur tourné de 90° reste un planeur : après 4 générations, translaté en diagonale', function () {
      const glider = shapeOf('glider');
      const turned = tf.rotateClockwise(glider);
      assert.notDeepEqual(turned.cells, glider.cells, 'orientation différente');
      const start = tf.placeShape(turned, 10, -20);
      // Le planeur d'origine va vers (+1,+1) ; tourné d'un quart de tour horaire, il va vers (-1,+1)
      assert.deepEqual(run(start, 4), engine.translate(start, -1, 1));
      const back = tf.placeShape(tf.rotateCounterclockwise(glider), 0, 0);
      assert.deepEqual(run(back, 4), engine.translate(back, 1, -1), 'sens antihoraire : vers (+1,-1)');
    });

    test('les entrées ne sont jamais modifiées', function () {
      const s = shapeOf('lwss');
      const before = snapshot(s);
      tf.rotateClockwise(s);
      tf.rotateCounterclockwise(s);
      tf.mirrorHorizontal(s);
      tf.mirrorVertical(s);
      tf.placeShape(s, 3, 4);
      assert.deepEqual(snapshot(s), before);
      const a = new Set(['0,0', '1,1']);
      const b = new Set(['1,1', '2,2']);
      const rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
      tf.union(a, b);
      tf.removeRect(a, rect);
      tf.extractRect(a, rect);
      assert.deepEqual(Array.from(a), ['0,0', '1,1']);
      assert.deepEqual(Array.from(b), ['1,1', '2,2']);
      assert.deepEqual(rect, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    });

    test('une forme dont une cellule sort de sa boîte est refusée', function () {
      assert.throws(function () { tf.rotateClockwise({ cells: new Set(['3,0']), width: 3, height: 1 }); }, /sort de la boîte/);
      assert.throws(function () { tf.mirrorVertical({ cells: [], width: 1, height: 1 }); }, /Set/);
    });
  });

  suite('Transformations — extraction, union, retrait', function () {
    test('extraction : normalisée à l\'origine, intérieur du rectangle seulement, bornes incluses', function () {
      const cells = new Set(['10,20', '12,22', '13,20', '9,21', '11,19', '12,23']);
      const rect = { minX: 10, minY: 20, maxX: 12, maxY: 22 };
      const shape = tf.extractRect(cells, rect);
      assert.deepEqual(shape.cells, new Set(['0,0', '2,2']), 'coins inclus, extérieur exclu');
      assert.equal(shape.width, 3);
      assert.equal(shape.height, 3);
    });

    test('extraction : la boîte garde les dimensions du rectangle, même avec des bords vides', function () {
      const shape = tf.extractRect(new Set(['5,5']), { minX: 0, minY: 0, maxX: 9, maxY: 7 });
      assert.deepEqual(shape, { cells: new Set(['5,5']), width: 10, height: 8 });
      const empty = tf.extractRect(new Set(['50,50']), { minX: -2, minY: -2, maxX: 2, maxY: 2 });
      assert.deepEqual(empty, { cells: new Set(), width: 5, height: 5 });
    });

    test('union : conserve toutes les cellules existantes, sans doublon', function () {
      const a = new Set(['0,0', '1,0']);
      const b = new Set(['1,0', '5,5']);
      const u = tf.union(a, b);
      assert.deepEqual(u, new Set(['0,0', '1,0', '5,5']));
      assert.ok(u !== a && u !== b, 'nouvel objet');
    });

    test('retrait : enlève exactement le rectangle, bornes incluses', function () {
      const cells = new Set();
      for (let y = -1; y <= 4; y++) for (let x = -1; x <= 4; x++) cells.add(engine.key(x, y));
      const out = tf.removeRect(cells, { minX: 0, minY: 0, maxX: 3, maxY: 3 });
      assert.equal(out.size, 36 - 16);
      for (let y = 0; y <= 3; y++) for (let x = 0; x <= 3; x++) assert.ok(!out.has(engine.key(x, y)));
      assert.ok(out.has('-1,-1') && out.has('4,4') && out.has('4,0') && out.has('0,4'), 'le pourtour reste');
    });

    test('rectangle tracé dans n\'importe quel sens, et rectangle invalide refusé', function () {
      assert.deepEqual(tf.rectFromCells({ x: 5, y: -2 }, { x: 1, y: 3 }), { minX: 1, minY: -2, maxX: 5, maxY: 3 });
      assert.deepEqual(tf.rectSize({ minX: 1, minY: -2, maxX: 5, maxY: 3 }), { width: 5, height: 6 });
      assert.throws(function () { tf.removeRect(new Set(), { minX: 2, minY: 0, maxX: 1, maxY: 0 }); }, /inversé/);
      assert.throws(function () { tf.extractRect(new Set(), { minX: 0.5, minY: 0, maxX: 1, maxY: 0 }); }, /entier/);
    });

    test('forme ajustée et pose à une origine', function () {
      const shape = tf.shapeFromCells(new Set(['-3,7', '-1,8']));
      assert.deepEqual(shape, { cells: new Set(['0,0', '2,1']), width: 3, height: 2 });
      assert.deepEqual(tf.placeShape(shape, 100, -4), new Set(['100,-4', '102,-3']));
      assert.deepEqual(tf.shapeFromCells(new Set()), { cells: new Set(), width: 0, height: 0 });
      assert.deepEqual(tf.translate(new Set(['1,1']), -1, 2), new Set(['0,3']));
    });
  });
})(globalThis);
