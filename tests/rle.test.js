/*
 * Tests du format RLE : lecture, écriture, aller-retour, règles et erreurs.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const rle = (root.Life && root.Life.rle) || require('../src/rle.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  const GLIDER_RLE = 'x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!';

  function shapeOf(id) {
    const m = patterns.matrix(id);
    return { cells: patterns.cells(id), width: m[0].length, height: m.length };
  }

  suite('RLE — lecture', function () {
    test('le planeur de référence donne le planeur', function () {
      const r = rle.parse(GLIDER_RLE);
      assert.deepEqual(r.cells, patterns.cells('glider'));
      assert.deepEqual(engine.toMatrix(r.cells, 0, 0, 3, 3), [[0, 1, 0], [0, 0, 1], [1, 1, 1]]);
      assert.equal(r.width, 3);
      assert.equal(r.height, 3);
      assert.equal(r.rule, 'B3/S23');
    });

    test('nombres de répétitions sur b, o et $', function () {
      const r = rle.parse('x = 6, y = 5\n3b2o$2$6o$bo!');
      assert.deepEqual(engine.toMatrix(r.cells, 0, 0, 6, 5), [
        [0, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1],
        [0, 1, 0, 0, 0, 0],
      ]);
      assert.equal(r.cells.size, 9);
      assert.equal(rle.parse('x = 12, y = 1\n12o!').cells.size, 12, 'nombre à deux chiffres');
    });

    test('commentaires ignorés, espaces et retours à la ligne ignorés dans les données (CRLF compris)', function () {
      const text = '#N Glider\r\n#O Richard K. Guy\r\n#C Un commentaire\r\nx = 3, y = 3, rule = B3/S23\r\nbo$2b\r\no$ 3o\r\n!';
      assert.deepEqual(rle.parse(text).cells, patterns.cells('glider'));
    });

    test('règle absente ou au format 23/3 acceptée, majuscules indifférentes', function () {
      assert.equal(rle.parse('x = 3, y = 3\nbo$2bo$3o!').rule, null);
      assert.equal(rle.parse('x = 3, y = 3, rule = 23/3\nbo$2bo$3o!').rule, 'B3/S23');
      assert.equal(rle.parse('x=3,y=3,rule=b3/s23\nbo$2bo$3o!').rule, 'B3/S23');
    });

    test('une règle B36/S23 est refusée avec un message explicite', function () {
      assert.throws(function () { rle.parse('x = 3, y = 3, rule = B36/S23\nbo$2bo$3o!'); },
        /règle « B36\/S23 » non prise en charge/);
      assert.throws(function () { rle.parse('x = 3, y = 3, rule = B3/S23:T10,10\nbo$2bo$3o!'); }, /règle/);
    });

    test('un RLE mal formé est refusé, avec la nature de l\'erreur', function () {
      const cases = [
        ['', /vide/],
        ['#C rien que des commentaires', /vide/],
        ['bo$2bo$3o!', /en-tête/],
        ['x = 3\nbo$2bo$3o!', /en-tête/],
        ['x = 3, y = 3\nbo$2bo$3o', /« ! » manquante/],
        ['x = 3, y = 3\nbo$2bz$3o!', /symbole inattendu « z »/],
        ['x = 3, y = 3\n0o!', /répétitions « 0 »/],
        ['x = 3, y = 3\nbo$2bo$3o3!', /sans symbole/],
        ['x = 2, y = 2\n3o!', /hors des dimensions/],
        ['x = 3, y = 1\no$o!', /hors des dimensions/],
      ];
      for (const c of cases) {
        assert.throws(function () { rle.parse(c[0]); }, c[1], JSON.stringify(c[0]));
      }
      assert.throws(function () { rle.parse(null); }, /texte/);
    });

    test('un contenu au-delà du plafond est refusé (y compris un énorme nombre de répétitions)', function () {
      assert.throws(function () { rle.parse(GLIDER_RLE, { maxCells: 4 }); }, /plafond de 4.*MAX_LIVE_CELLS/);
      assert.equal(rle.parse(GLIDER_RLE, { maxCells: 5 }).cells.size, 5, 'pile au plafond : accepté');
      assert.throws(function () { rle.parse('x = 1000000000, y = 1\n999999999o!', { maxCells: 100000 }); }, /plafond/);
    });
  });

  suite('RLE — écriture', function () {
    test('le planeur s\'écrit comme la référence', function () {
      assert.equal(rle.write(shapeOf('glider')), 'x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!\n');
    });

    test('aller-retour lecture puis écriture : mêmes cellules pour les 7 motifs prédéfinis', function () {
      for (const p of patterns.list()) {
        const shape = shapeOf(p.id);
        const back = rle.parse(rle.write(shape));
        assert.deepEqual(back.cells, shape.cells, p.name);
        assert.deepEqual([back.width, back.height], [shape.width, shape.height], p.name + ' : dimensions');
        assert.equal(back.rule, 'B3/S23');
      }
    });

    test('lignes vides et bords vides conservés par les dimensions', function () {
      const shape = { cells: new Set(['2,3', '0,6']), width: 5, height: 8 };
      const text = rle.write(shape);
      assert.equal(text, 'x = 5, y = 8, rule = B3/S23\n3$2bo3$o!\n');
      assert.deepEqual(rle.parse(text), { cells: shape.cells, width: 5, height: 8, rule: 'B3/S23' });
      assert.equal(rle.write({ cells: new Set(), width: 0, height: 0 }), 'x = 0, y = 0, rule = B3/S23\n!\n');
    });

    test('les lignes exportées font 70 caractères au plus, et le contenu est intact', function () {
      // Grand motif pseudo-aléatoire : beaucoup de symboles par ligne
      let s = 12345;
      const cells = new Set();
      for (let y = 0; y < 60; y++) {
        for (let x = 0; x < 300; x++) {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          if (s / 4294967296 < 0.37) cells.add(engine.key(x, y));
        }
      }
      const text = rle.write({ cells: cells, width: 300, height: 60 });
      const lines = text.trim().split('\n');
      assert.ok(lines.length > 50, 'plusieurs lignes');
      for (const line of lines) assert.ok(line.length <= 70, 'ligne de ' + line.length + ' caractères');
      assert.deepEqual(rle.parse(text).cells, cells);
    });

    test('une forme dont une cellule sort de la boîte est refusée', function () {
      assert.throws(function () { rle.write({ cells: new Set(['3,0']), width: 3, height: 1 }); }, /sort de la boîte/);
    });
  });
})(globalThis);
