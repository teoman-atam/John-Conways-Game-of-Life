/*
 * Tests de la gomme (fonctions pures) : règle de distance, trait sans trou, entrées intactes,
 * bornes de la taille et coût (zone couverte ou cellules vivantes, le plus petit des deux).
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const tools = (root.Life && root.Life.tools) || require('../src/tools.js');
  const eraser = (root.Life && root.Life.eraser) || require('../src/eraser.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function square(minX, minY, maxX, maxY) {
    const out = new Set();
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) out.add(x + ',' + y);
    return out;
  }

  function randomCells(seed, n, half) {
    const r = seeded(seed);
    const out = new Set();
    while (out.size < n) out.add((Math.floor(r() * 2 * half) - half) + ',' + (Math.floor(r() * 2 * half) - half));
    return out;
  }

  // Référence indépendante : distance au segment évaluée en nombres rationnels simples, cellule par cellule
  function expectedErased(cells, a, b, d) {
    const r2 = (d / 2) * (d / 2);
    const out = new Set();
    for (const k of cells) {
      const p = k.split(',').map(Number);
      let best = Infinity;
      // Échantillonnage fin du segment, puis distance exacte aux extrémités et au projeté
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a.x) * vx + (p[1] - a.y) * vy) / len2));
      for (const s of [0, 1, t]) {
        const dx = p[0] - (a.x + s * vx);
        const dy = p[1] - (a.y + s * vy);
        best = Math.min(best, dx * dx + dy * dy);
      }
      if (best <= r2 + 1e-9) out.add(k);
    }
    return out;
  }

  function erased(before, after) {
    const out = new Set();
    for (const k of before) if (!after.has(k)) out.add(k);
    return out;
  }

  suite('Gomme — règle de distance et trait', function () {
    test('diamètre 1 : exactement la cellule visée', function () {
      const cells = square(-3, -3, 3, 3);
      const after = eraser.eraseStamp(cells, { x: 0, y: 0 }, 1);
      assert.deepEqual(erased(cells, after), new Set(['0,0']));
      assert.equal(after.size, 48);
    });

    test('diamètres 2, 3, 10 et 512 : l\'ensemble effacé suit exactement la règle de distance', function () {
      // Diamètres 2 et 3 : la croix de 5 cellules, puis le carré de 3 × 3
      assert.deepEqual(erased(square(-5, -5, 5, 5), eraser.eraseStamp(square(-5, -5, 5, 5), { x: 0, y: 0 }, 2)),
        new Set(['0,0', '1,0', '-1,0', '0,1', '0,-1']));
      assert.deepEqual(erased(square(-5, -5, 5, 5), eraser.eraseStamp(square(-5, -5, 5, 5), { x: 0, y: 0 }, 3)), square(-1, -1, 1, 1));
      // Diamètre 10 : comptage direct (cercle de rayon 5), en parcourant la zone puis les cellules vivantes
      const dense = square(-20, -20, 20, 20);
      const sparse = randomCells(4, 300, 40);
      for (const cells of [dense, sparse]) {
        for (const c of [{ x: 0, y: 0 }, { x: 3, y: -7 }]) {
          const info = {};
          const keys = eraser.erasedKeys(cells, c, c, 10, info);
          assert.deepEqual(new Set(keys), expectedErased(cells, c, c, 10), 'diamètre 10, parcours ' + info.mode);
        }
      }
      let inDisc = 0;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (dx * dx + dy * dy <= 25) inDisc++;
      assert.equal(eraser.erasedKeys(dense, { x: 0, y: 0 }, { x: 0, y: 0 }, 10).length, inDisc);
      // Diamètre 512 : un disque de rayon 256 sur 30 000 cellules aléatoires (parcours des vivantes)
      const big = randomCells(9, 30000, 350);
      const info = {};
      const keys = eraser.erasedKeys(big, { x: 10, y: -20 }, { x: 10, y: -20 }, 512, info);
      assert.equal(info.mode, 'live');
      assert.deepEqual(new Set(keys), expectedErased(big, { x: 10, y: -20 }, { x: 10, y: -20 }, 512));
      assert.ok(keys.length > 10000 && keys.length < 30000, keys.length + ' cellules effacées');
      // Trait au diamètre 512, comparé à la référence
      const stroke = eraser.erasedKeys(big, { x: -300, y: 100 }, { x: 250, y: -60 }, 512);
      assert.deepEqual(new Set(stroke), expectedErased(big, { x: -300, y: 100 }, { x: 250, y: -60 }, 512));
    });

    test('trait rapide de (0, 0) à (40, 7) au diamètre 1 : aucune cellule intacte sur le segment', function () {
      const line = new Set(tools.lineCells(0, 0, 40, 7).map(function (p) { return p.x + ',' + p.y; }));
      const around = square(-2, -3, 42, 10);
      const after = eraser.eraseStroke(around, { x: 0, y: 0 }, { x: 40, y: 7 }, 1);
      for (const k of line) assert.ok(!after.has(k), 'cellule du segment effacée : ' + k);
      // Chaque colonne de 0 à 40 a au moins une cellule effacée : pas de trou
      const gone = erased(around, after);
      for (let x = 0; x <= 40; x++) {
        let any = false;
        for (let y = -3; y <= 10; y++) if (gone.has(x + ',' + y)) any = true;
        assert.ok(any, 'colonne ' + x);
      }
      assert.deepEqual(gone, expectedErased(around, { x: 0, y: 0 }, { x: 40, y: 7 }, 1), 'exactement la règle de distance');
    });

    test('la gomme n\'ajoute jamais de cellule et ne modifie pas son entrée', function () {
      const r = seeded(12);
      for (let i = 0; i < 30; i++) {
        const cells = randomCells(100 + i, 500, 30);
        const copy = Array.from(cells).sort();
        const a = { x: Math.floor(r() * 60) - 30, y: Math.floor(r() * 60) - 30 };
        const b = { x: Math.floor(r() * 60) - 30, y: Math.floor(r() * 60) - 30 };
        const d = 1 + Math.floor(r() * 20);
        const after = eraser.eraseStroke(cells, a, b, d);
        assert.notEqual(after, cells, 'nouveau Set');
        for (const k of after) assert.ok(cells.has(k), 'aucune cellule ajoutée');
        assert.deepEqual(Array.from(cells).sort(), copy, 'entrée intacte');
      }
      const empty = new Set();
      assert.equal(eraser.eraseStamp(empty, { x: 0, y: 0 }, 512).size, 0);
    });
  });

  suite('Gomme — taille et coût', function () {
    test('bornes 1 et 512 respectées, valeurs hors bornes ramenées', function () {
      assert.equal(eraser.ERASER_MIN_SIZE, 1);
      assert.equal(eraser.ERASER_MAX_SIZE, 512);
      assert.equal(eraser.ERASER_DEFAULT_SIZE, 3);
      const cases = [[1, 1], [512, 512], [0, 1], [-40, 1], [513, 512], [100000, 512], [3.4, 3], [7.6, 8], ['25', 25],
        [Infinity, 512], [-Infinity, 1], ['abc', 3], [undefined, 3], [null, 3], ['', 3]];
      for (const c of cases) assert.equal(eraser.clampSize(c[0]), c[1], String(c[0]));
      // Un diamètre hors bornes est ramené aussi dans le calcul
      const cells = square(-3, -3, 3, 3);
      assert.deepEqual(eraser.erasedKeys(cells, { x: 0, y: 0 }, { x: 0, y: 0 }, 0), ['0,0']);
    });

    test('coût : zone couverte ou cellules vivantes, le plus petit des deux', function () {
      // Peu de cellules et grande gomme : on parcourt les cellules vivantes
      const few = new Set(['0,0', '100,100', '-300,40']);
      const info = {};
      const keys = eraser.erasedKeys(few, { x: 0, y: 0 }, { x: 50, y: 0 }, 512, info);
      assert.equal(info.mode, 'live');
      assert.equal(info.visited, 3);
      assert.deepEqual(keys.sort(), ['0,0', '100,100']);
      // Beaucoup de cellules et petite gomme : on parcourt la zone couverte
      const many = square(-100, -100, 100, 100);
      const info2 = {};
      eraser.erasedKeys(many, { x: 0, y: 0 }, { x: 0, y: 0 }, 3, info2);
      assert.equal(info2.mode, 'area');
      assert.ok(info2.visited <= 25 && info2.visited < many.size, 'zone visitée : ' + info2.visited);
    });
  });
})(globalThis);
