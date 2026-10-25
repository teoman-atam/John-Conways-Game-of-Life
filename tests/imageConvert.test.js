/*
 * Tests de la conversion d'image en cellules, sur des images synthétiques (objets de forme ImageData).
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const ic = (root.Life && root.Life.imageConvert) || require('../src/imageConvert.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Image synthétique : fn(x, y) → [r, g, b, a]
  function makeImage(width, height, fn) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = fn(x, y);
        data.set([p[0], p[1], p[2], p[3] === undefined ? 255 : p[3]], (y * width + x) * 4);
      }
    }
    return { width: width, height: height, data: data };
  }

  function gray(v, a) { return [v, v, v, a === undefined ? 255 : a]; }

  function aliveList(bitmap) {
    return Array.from(bitmap.alive);
  }

  suite('Image — luminance, seuil et tramage', function () {
    test('luminance Rec. 709', function () {
      assert.near(ic.luminance(255, 0, 0), 0.2126 * 255, 1e-9);
      assert.near(ic.luminance(0, 255, 0), 0.7152 * 255, 1e-9);
      assert.near(ic.luminance(0, 0, 255), 0.0722 * 255, 1e-9);
      assert.near(ic.luminance(255, 255, 255), 255, 1e-9);
    });

    test('un pixel noir donne une cellule vivante, un blanc une morte ; Inverser fait l\'inverse', function () {
      const img = makeImage(2, 1, function (x) { return gray(x === 0 ? 0 : 255); });
      for (const mode of ['threshold', 'dither']) {
        assert.deepEqual(aliveList(ic.convert(img, { mode: mode }).bitmap), [1, 0], mode);
        assert.deepEqual(aliveList(ic.convert(img, { mode: mode, invert: true }).bitmap), [0, 1], mode + ' inversé');
      }
      assert.deepEqual(aliveList(ic.convert(img, { mode: 'threshold', threshold: 128 }).bitmap), [1, 0]);
      // Couleur : un rouge vif est plus sombre qu'un vert vif (Rec. 709)
      const colors = makeImage(2, 1, function (x) { return x === 0 ? [255, 0, 0] : [0, 255, 0]; });
      assert.deepEqual(aliveList(ic.convert(colors, { mode: 'threshold', threshold: 128 }).bitmap), [1, 0]);
    });

    test('un pixel transparent (moins de 50 % d\'opacité) donne une cellule morte, dans tous les modes', function () {
      const img = makeImage(4, 1, function (x) { return gray(0, [0, 127, 128, 255][x]); });
      for (const mode of ['threshold', 'dither']) {
        assert.deepEqual(aliveList(ic.convert(img, { mode: mode, threshold: 128 }).bitmap), [0, 0, 1, 1], mode);
        const white = makeImage(4, 1, function (x) { return gray(255, [0, 127, 128, 255][x]); });
        assert.deepEqual(aliveList(ic.convert(white, { mode: mode, threshold: 128, invert: true }).bitmap), [0, 0, 1, 1], mode + ' inversé');
      }
      assert.equal(ic.ALPHA_MIN, 128);
    });

    test('seuil d\'Otsu : entre les deux niveaux d\'une image à deux niveaux', function () {
      for (const spec of [[60, 190, 0.5], [60, 190, 0.1], [20, 90, 0.8], [140, 250, 0.3], [0, 255, 0.5]]) {
        const r = seeded(spec[0] + spec[1]);
        const img = makeImage(40, 30, function () { return gray(r() < spec[2] ? spec[0] : spec[1]); });
        const t = ic.otsuThreshold(img);
        assert.ok(t > spec[0] && t <= spec[1], 'seuil ' + t + ' entre ' + spec[0] + ' et ' + spec[1]);
        // Et la conversion sépare exactement les deux niveaux
        const res = ic.convert(img, { mode: 'threshold' });
        assert.equal(res.threshold, t);
        for (let i = 0; i < res.bitmap.alive.length; i++) {
          assert.equal(res.bitmap.alive[i], img.data[i * 4] === spec[0] ? 1 : 0);
        }
      }
      // Une seule teinte, ou rien d'opaque : 128
      assert.equal(ic.otsuThreshold(makeImage(5, 5, function () { return gray(30); })), 128);
      assert.equal(ic.otsuThreshold(makeImage(5, 5, function () { return gray(30, 0); })), 128);
    });

    test('tramage : gris à 50 % → 50 % ± 5 %, noir → tout vivant, blanc → rien, résultat déterministe', function () {
      const mid = makeImage(100, 100, function () { return gray(128); });
      const a = ic.convert(mid, { mode: 'dither' }).bitmap;
      const density = a.count / (100 * 100);
      assert.ok(Math.abs(density - 0.5) <= 0.05, 'densité ' + density);
      const b = ic.convert(mid, { mode: 'dither' }).bitmap;
      assert.deepEqual(aliveList(a), aliveList(b), 'deux exécutions identiques');
      assert.equal(ic.convert(makeImage(30, 20, function () { return gray(0); }), { mode: 'dither' }).bitmap.count, 600);
      assert.equal(ic.convert(makeImage(30, 20, function () { return gray(255); }), { mode: 'dither' }).bitmap.count, 0);
      // Luminosité : +100 éclaircit tout, -100 assombrit tout
      assert.equal(ic.convert(mid, { mode: 'dither', brightness: 100 }).bitmap.count, 0);
      assert.equal(ic.convert(mid, { mode: 'dither', brightness: -100 }).bitmap.count, 10000);
      const lighter = ic.convert(mid, { mode: 'dither', brightness: 30 }).bitmap.count;
      assert.ok(lighter < a.count, 'plus clair : moins de cellules');
      // Inverser : complément exact sur une image opaque
      const inv = ic.convert(mid, { mode: 'dither', invert: true }).bitmap;
      assert.equal(inv.count, 10000 - a.count);
    });
  });

  // Floyd-Steinberg de référence, écrit à part : valeurs de 0 à 255, noir si < 128
  function referenceDither(values, width, height) {
    const buf = new Float32Array(values);
    const out = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const v = buf[i] < 128 ? 0 : 255;
        const e = buf[i] - v;
        out[i] = v === 0 ? 1 : 0;
        const spread = [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]];
        for (const s of spread) {
          const nx = x + s[0];
          const ny = y + s[1];
          if (nx >= 0 && nx < width && ny < height) buf[ny * width + nx] += e * s[2] / 16;
        }
      }
    }
    return out;
  }

  suite('Image — tramage de Floyd-Steinberg exact', function () {
    test('erreur reportée à 7/16, 3/16, 5/16 et 1/16 : petit cas calculé à la main, puis dégradé', function () {
      // 2 × 2 gris à 100 : noir, blanc (100 + 7/16 × 100 = 143,75), puis noir, noir
      const small = makeImage(2, 2, function () { return gray(100); });
      assert.deepEqual(aliveList(ic.convert(small, { mode: 'dither' }).bitmap), [1, 0, 1, 1]);
      // Dégradé de 24 × 16 : identique pixel par pixel à la référence
      const values = [];
      const img = makeImage(24, 16, function (x, y) {
        const v = Math.round((x * 11 + y * 7) % 256);
        values.push(ic.luminance(v, v, v));
        return gray(v);
      });
      assert.deepEqual(aliveList(ic.convert(img, { mode: 'dither' }).bitmap), referenceDither(values, 24, 16));
    });
  });

  suite('Image — dimensions, estimation, mosaïque et fichier', function () {
    test('dimensions et proportions conservées, y compris 1 × 1, 1 × 1 000 et 1 000 × 1 pixel', function () {
      assert.deepEqual(ic.targetSize(4000, 3000, 200), { width: 200, height: 150 });
      assert.deepEqual(ic.targetSize(4000, 3000, 1000), { width: 1000, height: 750 });
      assert.deepEqual(ic.targetSize(3000, 4000, 200), { width: 200, height: 267 });
      assert.deepEqual(ic.targetSize(1, 1, 200), { width: 200, height: 200 });
      assert.deepEqual(ic.targetSize(1000, 1, 200), { width: 200, height: 1 });
      // Image très haute : ramenée à MAX_SIDE de haut, largeur proportionnelle
      const tall = ic.targetSize(1, 1000, 200);
      assert.equal(tall.height, ic.MAX_SIDE);
      assert.ok(Math.abs(tall.width - tall.height / 1000) <= 1, 'proportions : ' + tall.width + ' × ' + tall.height);
      // Bornes de la largeur demandée
      assert.deepEqual(ic.targetSize(400, 400, 5), { width: 20, height: 20 });
      assert.deepEqual(ic.targetSize(400, 400, 5000), { width: 1000, height: 1000 });
      // Le bitmap garde les dimensions de l'image, la grille ×4 en mosaïque
      for (const dims of [[1, 1], [1, 1000], [1000, 1], [7, 3]]) {
        const img = makeImage(dims[0], dims[1], function (x, y) { return gray((x + y) % 2 ? 0 : 255); });
        const bmp = ic.convert(img, { mode: 'threshold', threshold: 128 }).bitmap;
        assert.deepEqual([bmp.width, bmp.height], dims);
        assert.deepEqual(ic.gridSize(bmp, false), { width: dims[0], height: dims[1] });
        assert.deepEqual(ic.gridSize(bmp, true), { width: dims[0] * 4, height: dims[1] * 4 });
      }
    });

    test('l\'estimation est égale au résultat réel, en mode normal et en mosaïque', function () {
      const r = seeded(7);
      const img = makeImage(57, 31, function () { return [r() * 255, r() * 255, r() * 255, r() < 0.1 ? 0 : 255]; });
      for (const options of [{ mode: 'threshold' }, { mode: 'dither' }, { mode: 'threshold', invert: true }, { mode: 'dither', brightness: -40 }]) {
        const bmp = ic.convert(img, options).bitmap;
        for (const mosaic of [false, true]) {
          const cells = ic.toCells(bmp, mosaic);
          assert.equal(ic.estimate(bmp, mosaic), cells.size, JSON.stringify(options) + (mosaic ? ' mosaïque' : ''));
        }
        // Normalisé à l'origine : coordonnées de 0 à largeur − 1 et hauteur − 1
        for (const k of ic.toCells(bmp, false)) {
          const p = k.split(',').map(Number);
          assert.ok(p[0] >= 0 && p[0] < 57 && p[1] >= 0 && p[1] < 31, k);
        }
      }
    });

    test('aucune entrée n\'est modifiée', function () {
      const r = seeded(3);
      const img = makeImage(20, 10, function () { return [r() * 255, r() * 255, r() * 255, r() * 255]; });
      const copy = Array.from(img.data);
      ic.otsuThreshold(img);
      const bmp = ic.convert(img, { mode: 'dither', brightness: 25, invert: true }).bitmap;
      ic.convert(img, { mode: 'threshold' });
      ic.lumaPlane(img);
      const aliveCopy = Array.from(bmp.alive);
      ic.toCells(bmp, true);
      ic.estimate(bmp, true);
      assert.deepEqual(Array.from(img.data), copy, 'image intacte');
      assert.deepEqual(Array.from(bmp.alive), aliveCopy, 'bitmap intact');
    });

    test('mosaïque stable : 20 images aléatoires de 30 × 30 donnent des natures mortes', function () {
      for (let seed = 1; seed <= 20; seed++) {
        const r = seeded(seed * 101);
        const density = 0.1 + 0.8 * r();
        const img = makeImage(30, 30, function () { return gray(r() < density ? 0 : 255); });
        const bmp = ic.convert(img, { mode: seed % 2 ? 'threshold' : 'dither', threshold: 128 }).bitmap;
        const cells = ic.toCells(bmp, true);
        assert.ok(cells.size > 0, 'graine ' + seed + ' : image non vide');
        assert.deepEqual(engine.nextGeneration(cells), cells, 'graine ' + seed + ' : nature morte');
      }
    });

    test('mosaïque : un bloc 2 × 2 par pixel vivant, au pas de 4 cellules', function () {
      const one = { width: 3, height: 2, alive: new Uint8Array([0, 0, 0, 0, 0, 1]), count: 1 };
      assert.deepEqual(ic.toCells(one, true), new Set(['8,4', '9,4', '8,5', '9,5']));
      assert.deepEqual(ic.toCells(one, false), new Set(['2,1']));
      // Deux pixels voisins : deux cases vides entre les blocs
      const two = { width: 2, height: 1, alive: new Uint8Array([1, 1]), count: 2 };
      assert.deepEqual(ic.toCells(two, true), new Set(['0,0', '1,0', '0,1', '1,1', '4,0', '5,0', '4,1', '5,1']));
      assert.equal(ic.MOSAIC_STEP, 4);
      assert.equal(ic.MOSAIC_BLOCK, 2);
    });

    test('fichier choisi : formats acceptés, HEIC, non-image, trop lourd ou vide refusés avec un message', function () {
      const MB = 1024 * 1024;
      assert.deepEqual(ic.checkImageFile({ name: 'a.png', type: 'image/png', size: 1000 }), { ok: true });
      assert.equal(ic.checkImageFile({ name: 'photo.JPG', type: 'image/jpeg', size: 5 * MB }).ok, true);
      assert.equal(ic.checkImageFile({ name: 'x.webp', type: 'image/webp', size: 10 }).ok, true);
      assert.equal(ic.checkImageFile({ name: 'x.gif', type: 'image/gif', size: 10 }).ok, true);
      assert.equal(ic.checkImageFile({ name: 'sans-type.jpeg', type: '', size: 10 }).ok, true);
      const heic = ic.checkImageFile({ name: 'IMG_0001.HEIC', type: 'image/heic', size: 3 * MB });
      assert.equal(heic.kind, 'heic');
      assert.ok(/JPEG/.test(heic.error) && /HEIC/.test(heic.error));
      assert.equal(ic.checkImageFile({ name: 'IMG.heif', type: '', size: 10 }).kind, 'heic');
      assert.equal(ic.checkImageFile({ name: 'notes.txt', type: 'text/plain', size: 10 }).kind, 'type');
      assert.equal(ic.checkImageFile({ name: 'logo.svg', type: 'image/svg+xml', size: 10 }).kind, 'type');
      const big = ic.checkImageFile({ name: 'grande.jpg', type: 'image/jpeg', size: 21 * MB });
      assert.equal(big.kind, 'size');
      assert.ok(/21,0 Mo/.test(big.error) && /20,0 Mo/.test(big.error), big.error);
      assert.equal(ic.checkImageFile({ name: 'pile.png', type: 'image/png', size: 20 * MB }).ok, true, '20 Mo tout juste : accepté');
      assert.equal(ic.checkImageFile({ name: 'vide.png', type: 'image/png', size: 0 }).kind, 'empty');
    });
  });
})(globalThis);
