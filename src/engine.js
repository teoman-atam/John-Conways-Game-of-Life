/*
 * Moteur pur du jeu de la vie.
 * Représentation creuse : un Set de clés "x,y" (cellules vivantes uniquement).
 * x = colonne, y = ligne (y croît vers le bas), entiers sûrs, négatifs autorisés.
 * Script classique : API sur globalThis.Life.engine, et module.exports sous Node.
 */
(function (root) {
  'use strict';

  // Décalages des 8 voisines
  const NEIGHBOR_OFFSETS = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  function key(x, y) {
    return x + ',' + y;
  }

  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'un tableau';
    if (typeof value === 'string') return 'la chaîne "' + value + '"';
    if (typeof value === 'object') return 'un objet ' + (value.constructor ? value.constructor.name : '');
    return typeof value + ' ' + String(value);
  }

  // Vérifie qu'une coordonnée est un entier sûr ; context décrit l'origine de la valeur
  function checkCoordinate(value, axis, context) {
    if (typeof value !== 'number') {
      throw new TypeError(context + ' : coordonnée ' + axis + ' invalide (' + describe(value) + ', nombre entier attendu)');
    }
    if (Number.isNaN(value)) {
      throw new TypeError(context + ' : coordonnée ' + axis + ' invalide (NaN)');
    }
    if (!Number.isInteger(value)) {
      throw new TypeError(context + ' : coordonnée ' + axis + ' non entière (' + value + ')');
    }
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(context + ' : coordonnée ' + axis + ' hors de l\'intervalle des entiers sûrs (' + value + ')');
    }
  }

  // Convertit une clé "x,y" en [x, y] en la validant strictement (forme canonique)
  function parseKey(k) {
    if (typeof k !== 'string') {
      throw new TypeError('clé mal formée : ' + describe(k) + ' (chaîne "x,y" attendue)');
    }
    const parts = k.split(',');
    if (parts.length !== 2 || parts[0] === '' || parts[1] === '' || /\s/.test(k)) {
      throw new TypeError('clé mal formée : "' + k + '" (format attendu "x,y")');
    }
    const coords = [0, 0];
    for (let i = 0; i < 2; i++) {
      const part = parts[i];
      const value = Number(part);
      if (Number.isNaN(value) && part !== 'NaN') {
        throw new TypeError('clé mal formée : "' + k + '" (format attendu "x,y")');
      }
      checkCoordinate(value, i === 0 ? 'x' : 'y', 'clé "' + k + '"');
      coords[i] = value;
    }
    // Refuse les écritures non canoniques ("01,2", "-0,1", "1e3,0"…) qui créeraient des doublons
    if (key(coords[0], coords[1]) !== k) {
      throw new TypeError('clé mal formée : "' + k + '" (forme canonique attendue "' + key(coords[0], coords[1]) + '")');
    }
    return coords;
  }

  function assertSet(cells, fnName) {
    if (!(cells instanceof Set)) {
      throw new TypeError(fnName + ' : l\'entrée doit être un Set de clés "x,y", reçu ' + describe(cells));
    }
  }

  // Valide toutes les clés et renvoie leurs coordonnées
  function parseAll(cells, fnName) {
    assertSet(cells, fnName);
    const xs = new Array(cells.size);
    const ys = new Array(cells.size);
    let i = 0;
    for (const k of cells) {
      let coords;
      try {
        coords = parseKey(k);
      } catch (err) {
        err.message = fnName + ' : ' + err.message;
        throw err;
      }
      xs[i] = coords[0];
      ys[i] = coords[1];
      i++;
    }
    return { xs: xs, ys: ys };
  }

  /*
   * Calcule la génération suivante.
   * Règle : vivante au tour suivant si n == 3, ou si vivante et n == 2.
   * L'entrée n'est jamais modifiée ; la sortie est un nouveau Set.
   */
  function nextGeneration(cells) {
    const parsed = parseAll(cells, 'nextGeneration');
    const xs = parsed.xs;
    const ys = parsed.ys;
    // Compte, pour chaque case voisine d'une vivante, le nombre de voisines vivantes
    const counts = new Map();
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const y = ys[i];
      for (let j = 0; j < 8; j++) {
        const nx = x + NEIGHBOR_OFFSETS[j][0];
        const ny = y + NEIGHBOR_OFFSETS[j][1];
        if (!Number.isSafeInteger(nx) || !Number.isSafeInteger(ny)) {
          throw new RangeError('nextGeneration : une voisine de la cellule "' + key(x, y) +
            '" sortirait de l\'intervalle des entiers sûrs');
        }
        const k = key(nx, ny);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const next = new Set();
    for (const entry of counts) {
      const n = entry[1];
      if (n === 3 || (n === 2 && cells.has(entry[0]))) next.add(entry[0]);
    }
    return next;
  }

  // Convertit une matrice de 0 et de 1 en Set ; matrix[ligne][colonne]
  function fromMatrix(matrix, originX, originY) {
    if (originX === undefined) originX = 0;
    if (originY === undefined) originY = 0;
    if (!Array.isArray(matrix)) {
      throw new TypeError('fromMatrix : la matrice doit être un tableau de lignes, reçu ' + describe(matrix));
    }
    if (matrix.length === 0) {
      throw new TypeError('fromMatrix : matrice vide');
    }
    checkCoordinate(originX, 'x', 'fromMatrix (origine)');
    checkCoordinate(originY, 'y', 'fromMatrix (origine)');
    let width = -1;
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) {
        throw new TypeError('fromMatrix : la ligne ' + r + ' n\'est pas un tableau (' + describe(row) + ')');
      }
      if (row.length === 0) {
        throw new TypeError('fromMatrix : la ligne ' + r + ' est vide');
      }
      if (width === -1) width = row.length;
      else if (row.length !== width) {
        throw new TypeError('fromMatrix : matrice non rectangulaire (ligne ' + r + ' : ' + row.length +
          ' valeurs au lieu de ' + width + ')');
      }
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v !== 0 && v !== 1) {
          throw new TypeError('fromMatrix : valeur invalide ligne ' + r + ', colonne ' + c + ' (' +
            describe(v) + ') ; seuls les nombres 0 et 1 sont acceptés');
        }
      }
    }
    // Parenthèses nécessaires : originX + width - 1 s'arrondirait au-delà des entiers sûrs
    checkCoordinate(originX + (width - 1), 'x', 'fromMatrix (bord droit)');
    checkCoordinate(originY + (matrix.length - 1), 'y', 'fromMatrix (bord bas)');
    const cells = new Set();
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < width; c++) {
        if (matrix[r][c] === 1) cells.add(key(originX + c, originY + r));
      }
    }
    return cells;
  }

  function checkSize(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError('toMatrix : ' + name + ' doit être un entier strictement positif (' + describe(value) + ')');
    }
  }

  // Extrait la zone [x0, x0+width[ × [y0, y0+height[ sous forme de matrice de 0 et de 1
  function toMatrix(cells, x0, y0, width, height) {
    const parsed = parseAll(cells, 'toMatrix');
    checkCoordinate(x0, 'x', 'toMatrix (origine)');
    checkCoordinate(y0, 'y', 'toMatrix (origine)');
    checkSize(width, 'width');
    checkSize(height, 'height');
    const matrix = [];
    for (let r = 0; r < height; r++) matrix.push(new Array(width).fill(0));
    for (let i = 0; i < parsed.xs.length; i++) {
      const c = parsed.xs[i] - x0;
      const r = parsed.ys[i] - y0;
      if (c >= 0 && c < width && r >= 0 && r < height) matrix[r][c] = 1;
    }
    return matrix;
  }

  function countCells(cells) {
    assertSet(cells, 'countCells');
    return cells.size;
  }

  // Boîte englobante des cellules vivantes, ou null si la grille est vide
  function boundingBox(cells) {
    const parsed = parseAll(cells, 'boundingBox');
    if (parsed.xs.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < parsed.xs.length; i++) {
      const x = parsed.xs[i];
      const y = parsed.ys[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  // Renvoie un nouveau Set décalé de (dx, dy)
  function translate(cells, dx, dy) {
    const parsed = parseAll(cells, 'translate');
    checkCoordinate(dx, 'x', 'translate (décalage)');
    checkCoordinate(dy, 'y', 'translate (décalage)');
    const out = new Set();
    for (let i = 0; i < parsed.xs.length; i++) {
      const x = parsed.xs[i] + dx;
      const y = parsed.ys[i] + dy;
      checkCoordinate(x, 'x', 'translate (résultat)');
      checkCoordinate(y, 'y', 'translate (résultat)');
      out.add(key(x, y));
    }
    return out;
  }

  const api = {
    key: key,
    parseKey: parseKey,
    nextGeneration: nextGeneration,
    fromMatrix: fromMatrix,
    toMatrix: toMatrix,
    countCells: countCells,
    boundingBox: boundingBox,
    translate: translate,
  };

  root.Life = root.Life || {};
  root.Life.engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
