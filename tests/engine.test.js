/*
 * Tests du moteur (A à M) et des fonctions utilitaires.
 * Convention : matrices converties par fromMatrix avec l'origine (0,0) ; chaque comparaison
 * vérifie le contenu de la zone ET le nombre total de cellules (rien hors zone).
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function ones(matrix) {
    let n = 0;
    for (const row of matrix) for (const v of row) n += v;
    return n;
  }

  // Compare un Set à une matrice attendue : zone identique et aucune cellule hors zone
  function assertGrid(cells, expected, label) {
    const prefix = label ? label + ' : ' : '';
    const actual = engine.toMatrix(cells, 0, 0, expected[0].length, expected.length);
    assert.deepEqual(actual, expected, prefix + 'contenu de la zone');
    assert.equal(engine.countCells(cells), ones(expected), prefix + 'nombre total de cellules');
  }

  function run(cells, generations) {
    let current = cells;
    for (let i = 0; i < generations; i++) current = engine.nextGeneration(current);
    return current;
  }

  suite('Moteur — règles de base', function () {
    test('A. grille 3 × 3 vide → vide', function () {
      const input = engine.fromMatrix([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      const out = engine.nextGeneration(input);
      assertGrid(out, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      assert.equal(out.size, 0);
    });

    test('B. cellule isolée au centre d\'une grille 3 × 3 → vide', function () {
      const out = engine.nextGeneration(engine.fromMatrix([[0, 0, 0], [0, 1, 0], [0, 0, 0]]));
      assertGrid(out, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    });

    test('C. bloc 2 × 2 stable, 4 cellules', function () {
      const m = [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]];
      const out = engine.nextGeneration(engine.fromMatrix(m));
      assertGrid(out, m);
      assert.equal(out.size, 4);
    });

    test('D. clignotant : vertical après 1 génération, retour exact après 2', function () {
      const input = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
      const vertical = [[0, 0, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0]];
      const start = engine.fromMatrix(input);
      const g1 = engine.nextGeneration(start);
      assertGrid(g1, vertical, 'génération 1');
      const g2 = engine.nextGeneration(g1);
      assertGrid(g2, input, 'génération 2');
      assert.deepEqual(g2, start, 'génération 2 identique à l\'entrée');
    });

    test('E. naissance hors zone : [[1,1,1]] → {"1,-1","1,0","1,1"} exactement', function () {
      const out = engine.nextGeneration(engine.fromMatrix([[1, 1, 1]]));
      assert.deepEqual(out, new Set(['1,-1', '1,0', '1,1']));
      assert.equal(out.size, 3);
    });

    test('F. [[1]] → vide, [[0]] → vide', function () {
      const a = engine.nextGeneration(engine.fromMatrix([[1]]));
      assertGrid(a, [[0]]);
      assert.equal(a.size, 0);
      const b = engine.nextGeneration(engine.fromMatrix([[0]]));
      assertGrid(b, [[0]]);
      assert.equal(b.size, 0);
    });

    test('Surpopulation (n = 4), survie et naissance (n = 3), évaluation simultanée', function () {
      // Croix : le centre a 4 voisines et meurt, chaque bras a 3 voisines et survit,
      // chaque coin a 3 voisines et naît
      const out = engine.nextGeneration(engine.fromMatrix([[0, 1, 0], [1, 1, 1], [0, 1, 0]]));
      assertGrid(out, [[1, 1, 1], [1, 0, 1], [1, 1, 1]]);
      assert.equal(out.size, 8, 'aucune naissance hors de la zone 3 × 3');
    });
  });

  suite('Moteur — immutabilité et déterminisme', function () {
    test('G. l\'entrée est inchangée après le calcul', function () {
      const input = engine.fromMatrix([[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
      const snapshot = Array.from(input).sort();
      engine.nextGeneration(input);
      assert.deepEqual(Array.from(input).sort(), snapshot);
    });

    test('G. le résultat est un objet distinct, même pour un motif stable', function () {
      const input = engine.fromMatrix([[1, 1], [1, 1]]);
      const out = engine.nextGeneration(input);
      assert.ok(out !== input, 'objet distinct');
      assert.ok(out instanceof Set, 'le résultat est un Set');
      assert.deepEqual(out, input, 'même contenu');
    });

    test('G. modifier le résultat ne modifie pas l\'entrée', function () {
      const input = engine.fromMatrix([[1, 1], [1, 1]]);
      const out = engine.nextGeneration(input);
      out.add('100,100');
      out.delete('0,0');
      assert.ok(input.has('0,0') && !input.has('100,100'));
      assert.equal(input.size, 4);
    });

    test('G. deux appels donnent des résultats égaux', function () {
      const input = patterns.cells('r-pentomino');
      const a = run(input, 20);
      const b = run(input, 20);
      assert.deepEqual(a, b);
      assert.deepEqual(Array.from(engine.nextGeneration(input)), Array.from(engine.nextGeneration(input)),
        'même ordre d\'itération');
    });
  });

  suite('Moteur — validation (H)', function () {
    test('H. nextGeneration refuse une entrée qui n\'est pas un Set', function () {
      const bad = [null, undefined, [], ['0,0'], {}, 'abc', 42, new Map([['0,0', true]])];
      for (const value of bad) {
        assert.throws(function () { engine.nextGeneration(value); }, /nextGeneration.*Set/, 'entrée ' + String(value));
      }
    });

    test('H. nextGeneration refuse une clé mal formée', function () {
      const bad = ['1', '1,2,3', 'a,b', '', ',1', '1,', ' 1,2', '1, 2', '01,2', '-0,1', '+1,2', '1e3,0', '0x1,0'];
      for (const k of bad) {
        assert.throws(function () { engine.nextGeneration(new Set([k])); }, /mal formée/, 'clé "' + k + '"');
      }
      assert.throws(function () { engine.nextGeneration(new Set([12])); }, /mal formée/, 'clé numérique');
      assert.throws(function () { engine.nextGeneration(new Set([[1, 2]])); }, /mal formée/, 'clé tableau');
    });

    test('H. nextGeneration refuse une coordonnée non entière', function () {
      assert.throws(function () { engine.nextGeneration(new Set(['1.5,2'])); }, /non entière/);
      assert.throws(function () { engine.nextGeneration(new Set(['0,-0.25'])); }, /non entière/);
    });

    test('H. nextGeneration refuse une coordonnée NaN', function () {
      assert.throws(function () { engine.nextGeneration(new Set(['NaN,0'])); }, /NaN/);
      assert.throws(function () { engine.nextGeneration(new Set(['3,NaN'])); }, /NaN/);
    });

    test('H. nextGeneration refuse une coordonnée hors des entiers sûrs', function () {
      assert.throws(function () { engine.nextGeneration(new Set(['9007199254740992,0'])); }, /entiers sûrs/);
      assert.throws(function () { engine.nextGeneration(new Set(['0,-9007199254740992'])); }, /entiers sûrs/);
      // Une voisine qui sortirait de l'intervalle est signalée plutôt que tronquée
      assert.throws(function () { engine.nextGeneration(new Set(['9007199254740991,0'])); }, /entiers sûrs/);
    });

    test('H. fromMatrix refuse null et les entrées qui ne sont pas des tableaux', function () {
      const bad = [null, undefined, 'abc', 42, {}, new Set([1])];
      for (const value of bad) {
        assert.throws(function () { engine.fromMatrix(value); }, /fromMatrix.*tableau/, 'entrée ' + String(value));
      }
      assert.throws(function () { engine.fromMatrix([1, 0]); }, /ligne 0 n'est pas un tableau/);
      assert.throws(function () { engine.fromMatrix([[1], null]); }, /ligne 1 n'est pas un tableau/);
    });

    test('H. fromMatrix refuse une matrice vide ou une ligne vide', function () {
      assert.throws(function () { engine.fromMatrix([]); }, /matrice vide/);
      assert.throws(function () { engine.fromMatrix([[]]); }, /ligne 0 est vide/);
      assert.throws(function () { engine.fromMatrix([[1], []]); }, /ligne 1 est vide/);
    });

    test('H. fromMatrix refuse une matrice non rectangulaire', function () {
      assert.throws(function () { engine.fromMatrix([[1, 0], [1]]); }, /non rectangulaire/);
      assert.throws(function () { engine.fromMatrix([[1], [1, 0]]); }, /non rectangulaire/);
    });

    test('H. fromMatrix refuse toute valeur autre que les nombres 0 et 1', function () {
      const bad = [true, false, '1', '0', 2, -1, 0.5, NaN, null, undefined, Infinity];
      for (const v of bad) {
        assert.throws(function () { engine.fromMatrix([[0, v]]); }, /valeur invalide.*0 et 1/, 'valeur ' + String(v));
      }
    });

    test('H. fromMatrix refuse une origine non entière, NaN ou hors des entiers sûrs', function () {
      assert.throws(function () { engine.fromMatrix([[1]], 1.5, 0); }, /non entière/);
      assert.throws(function () { engine.fromMatrix([[1]], 0, NaN); }, /NaN/);
      assert.throws(function () { engine.fromMatrix([[1]], 2 ** 53, 0); }, /entiers sûrs/);
      assert.throws(function () { engine.fromMatrix([[1, 1]], Number.MAX_SAFE_INTEGER, 0); }, /entiers sûrs/,
        'bord droit hors intervalle');
      assert.throws(function () { engine.fromMatrix([[1]], '0', 0); }, /coordonnée x invalide/);
    });
  });

  suite('Moteur — motifs connus (I à M)', function () {
    test('I. planeur : après 4 générations, même forme translatée de (+1,+1)', function () {
      const m = [[0, 1, 0], [0, 0, 1], [1, 1, 1]];
      const start = engine.fromMatrix(m);
      const g4 = run(start, 4);
      assert.deepEqual(g4, engine.translate(start, 1, 1));
      assertGrid(g4, [[0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, 1, 1, 1]]);
      assert.deepEqual(patterns.matrix('glider'), m, 'le motif « Planeur » est ce planeur');
    });

    test('J. vaisseau léger : après 4 générations, même forme translatée de 2 cases vers la gauche', function () {
      const start = patterns.cells('lwss');
      const g4 = run(start, 4);
      assert.deepEqual(g4, engine.translate(start, -2, 0));
      assert.equal(g4.size, 9);
      for (let g = 1; g < 4; g++) {
        assert.notDeepEqual(run(start, g), start, 'génération ' + g + ' différente de l\'entrée');
      }
    });

    test('K. pulsar : identique après 3 générations, différent après 1 et 2', function () {
      const start = patterns.cells('pulsar');
      assert.equal(start.size, 48);
      const g1 = run(start, 1);
      const g2 = run(start, 2);
      const g3 = run(start, 3);
      assert.notDeepEqual(g1, start, 'génération 1');
      assert.notDeepEqual(g2, start, 'génération 2');
      assert.deepEqual(g3, start, 'génération 3');
      assertGrid(g3, patterns.matrix('pulsar'), 'génération 3');
    });

    test('L. canon de Gosper : population après 120 générations > population initiale', function () {
      const start = patterns.cells('gosper-gun');
      assert.equal(start.size, 36);
      const g120 = run(start, 120);
      assert.ok(g120.size > start.size, 'population ' + g120.size + ' > ' + start.size);
    });

    test('M. coordonnées extrêmes : bloc autour de (-1000000000, 1000000000) stable', function () {
      const start = engine.fromMatrix([[1, 1], [1, 1]], -1000000000, 1000000000);
      assert.deepEqual(start, new Set(['-1000000000,1000000000', '-999999999,1000000000',
        '-1000000000,1000000001', '-999999999,1000000001']));
      const g = run(start, 5);
      assert.deepEqual(g, start);
      assert.deepEqual(engine.toMatrix(g, -1000000001, 999999999, 4, 4),
        [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]]);
    });

    test('Bloc, clignotant et R-pentomino des motifs prédéfinis', function () {
      const block = patterns.cells('block');
      assert.deepEqual(engine.nextGeneration(block), block, 'bloc stable');
      const blinker = patterns.cells('blinker');
      assert.notDeepEqual(run(blinker, 1), blinker, 'clignotant change');
      assert.deepEqual(run(blinker, 2), blinker, 'clignotant de période 2');
      assert.equal(patterns.cells('r-pentomino').size, 5, 'R-pentomino à 5 cellules');
    });

    test('Liste des motifs : les 7 motifs demandés, noms en français', function () {
      const ids = patterns.list().map(function (p) { return p.id; });
      assert.deepEqual(ids, ['block', 'blinker', 'glider', 'lwss', 'pulsar', 'r-pentomino', 'gosper-gun']);
      assert.throws(function () { patterns.cells('inconnu'); }, /Motif inconnu/);
    });
  });

  suite('Moteur — fonctions utilitaires', function () {
    test('fromMatrix applique l\'origine (x = colonne, y = ligne)', function () {
      const cells = engine.fromMatrix([[1, 0], [0, 1]], -5, 7);
      assert.deepEqual(cells, new Set(['-5,7', '-4,8']));
    });

    test('toMatrix extrait une zone, ignore le reste', function () {
      const cells = new Set(['0,0', '2,1', '10,10', '-3,-3']);
      assert.deepEqual(engine.toMatrix(cells, 0, 0, 3, 2), [[1, 0, 0], [0, 0, 1]]);
      assert.throws(function () { engine.toMatrix(cells, 0, 0, 0, 2); }, /width/);
      assert.throws(function () { engine.toMatrix(cells, 0, 0, 2, 1.5); }, /height/);
    });

    test('countCells compte les cellules vivantes', function () {
      assert.equal(engine.countCells(new Set()), 0);
      assert.equal(engine.countCells(patterns.cells('gosper-gun')), 36);
      assert.throws(function () { engine.countCells([]); }, /Set/);
    });

    test('boundingBox : null si vide, bornes incluses sinon', function () {
      assert.equal(engine.boundingBox(new Set()), null);
      assert.deepEqual(engine.boundingBox(new Set(['-2,5', '3,-1', '0,0'])),
        { minX: -2, minY: -1, maxX: 3, maxY: 5, width: 6, height: 7 });
    });

    test('parseKey et key sont réciproques', function () {
      assert.deepEqual(engine.parseKey('-12,34'), [-12, 34]);
      assert.equal(engine.key(-12, 34), '-12,34');
    });
  });
})(globalThis);
