/*
 * Transformations pures d'ensembles de cellules : extraction, translation, rotations,
 * miroirs, union et retrait. Aucune fonction ne modifie ses entrées.
 *
 * Un rectangle est { minX, minY, maxX, maxY }, bornes incluses.
 * Une « forme » est { cells, width, height } : un Set de clés "x,y" normalisées à
 * l'origine, toutes dans la boîte [0, width[ × [0, height[. La boîte peut contenir
 * des lignes ou colonnes vides (une sélection garde ses dimensions).
 */
(function (root) {
  'use strict';

  const engine = (root.Life && root.Life.engine) || require('./engine.js');

  function checkRect(rect, fnName) {
    if (!rect || typeof rect !== 'object') {
      throw new TypeError(fnName + ' : rectangle { minX, minY, maxX, maxY } attendu');
    }
    const names = ['minX', 'minY', 'maxX', 'maxY'];
    for (const n of names) {
      if (!Number.isSafeInteger(rect[n])) {
        throw new TypeError(fnName + ' : ' + n + ' doit être un entier sûr (' + rect[n] + ')');
      }
    }
    if (rect.minX > rect.maxX || rect.minY > rect.maxY) {
      throw new RangeError(fnName + ' : rectangle inversé (min > max)');
    }
  }

  function checkSet(cells, fnName) {
    if (!(cells instanceof Set)) throw new TypeError(fnName + ' : un Set de clés "x,y" est attendu');
  }

  // Valide une forme et renvoie les coordonnées de ses cellules
  function parseShape(shape, fnName) {
    if (!shape || typeof shape !== 'object') throw new TypeError(fnName + ' : forme { cells, width, height } attendue');
    checkSet(shape.cells, fnName);
    const w = shape.width;
    const h = shape.height;
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 0 || h < 0) {
      throw new TypeError(fnName + ' : width et height doivent être des entiers positifs ou nuls');
    }
    const points = [];
    for (const k of shape.cells) {
      const p = engine.parseKey(k);
      if (p[0] < 0 || p[1] < 0 || p[0] >= w || p[1] >= h) {
        throw new RangeError(fnName + ' : la cellule "' + k + '" sort de la boîte ' + w + ' × ' + h);
      }
      points.push(p);
    }
    return points;
  }

  // Rectangle délimité par deux cellules, dans n'importe quel ordre
  function rectFromCells(a, b) {
    return {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    };
  }

  function rectSize(rect) {
    checkRect(rect, 'rectSize');
    return { width: rect.maxX - rect.minX + 1, height: rect.maxY - rect.minY + 1 };
  }

  // Cellules à l'intérieur du rectangle (bornes incluses), normalisées à l'origine
  function extractRect(cells, rect) {
    checkSet(cells, 'extractRect');
    checkRect(rect, 'extractRect');
    const out = new Set();
    for (const k of cells) {
      const p = engine.parseKey(k);
      if (p[0] >= rect.minX && p[0] <= rect.maxX && p[1] >= rect.minY && p[1] <= rect.maxY) {
        out.add(engine.key(p[0] - rect.minX, p[1] - rect.minY));
      }
    }
    return { cells: out, width: rect.maxX - rect.minX + 1, height: rect.maxY - rect.minY + 1 };
  }

  // Toutes les cellules sauf celles du rectangle
  function removeRect(cells, rect) {
    checkSet(cells, 'removeRect');
    checkRect(rect, 'removeRect');
    const out = new Set();
    for (const k of cells) {
      const p = engine.parseKey(k);
      if (p[0] < rect.minX || p[0] > rect.maxX || p[1] < rect.minY || p[1] > rect.maxY) out.add(k);
    }
    return out;
  }

  // Union de deux ensembles : les cellules existantes sont conservées
  function union(a, b) {
    checkSet(a, 'union');
    checkSet(b, 'union');
    const out = new Set(a);
    for (const k of b) {
      engine.parseKey(k);
      out.add(k);
    }
    return out;
  }

  function translate(cells, dx, dy) {
    return engine.translate(cells, dx, dy);
  }

  // Forme ajustée à la boîte englobante (grille vide → forme 0 × 0)
  function shapeFromCells(cells) {
    const box = engine.boundingBox(cells);
    if (!box) return { cells: new Set(), width: 0, height: 0 };
    return extractRect(cells, box);
  }

  // Cellules de la forme posée avec son coin haut gauche en (originX, originY)
  function placeShape(shape, originX, originY) {
    parseShape(shape, 'placeShape');
    return engine.translate(shape.cells, originX, originY);
  }

  function mapShape(shape, fnName, width, height, fn) {
    const points = parseShape(shape, fnName);
    const out = new Set();
    for (const p of points) {
      const q = fn(p[0], p[1]);
      out.add(engine.key(q[0], q[1]));
    }
    return { cells: out, width: width, height: height };
  }

  // Rotation de 90° dans le sens horaire (y vers le bas) : le coin haut gauche passe en haut à droite
  function rotateClockwise(shape) {
    const w = shape.width, h = shape.height;
    return mapShape(shape, 'rotateClockwise', h, w, function (x, y) { return [h - 1 - y, x]; });
  }

  // Rotation de 90° dans le sens antihoraire : le coin haut gauche passe en bas à gauche
  function rotateCounterclockwise(shape) {
    const w = shape.width, h = shape.height;
    return mapShape(shape, 'rotateCounterclockwise', h, w, function (x, y) { return [y, w - 1 - x]; });
  }

  // Miroir horizontal : la gauche et la droite sont échangées
  function mirrorHorizontal(shape) {
    const w = shape.width, h = shape.height;
    return mapShape(shape, 'mirrorHorizontal', w, h, function (x, y) { return [w - 1 - x, y]; });
  }

  // Miroir vertical : le haut et le bas sont échangés
  function mirrorVertical(shape) {
    const w = shape.width, h = shape.height;
    return mapShape(shape, 'mirrorVertical', w, h, function (x, y) { return [x, h - 1 - y]; });
  }

  const api = {
    rectFromCells: rectFromCells,
    rectSize: rectSize,
    extractRect: extractRect,
    removeRect: removeRect,
    union: union,
    translate: translate,
    shapeFromCells: shapeFromCells,
    placeShape: placeShape,
    rotateClockwise: rotateClockwise,
    rotateCounterclockwise: rotateCounterclockwise,
    mirrorHorizontal: mirrorHorizontal,
    mirrorVertical: mirrorVertical,
  };

  root.Life = root.Life || {};
  root.Life.transform = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
