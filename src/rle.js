/*
 * Lecture et écriture du format RLE (Run Length Encoded), compatible LifeWiki et Golly.
 *   #N Nom          ← lignes de commentaire, ignorées
 *   x = 3, y = 3, rule = B3/S23
 *   bo$2bo$3o!      ← b morte, o vivante, $ fin de ligne, ! fin du motif
 * Chaque symbole peut être précédé d'un nombre de répétitions. Espaces et retours
 * à la ligne sont ignorés dans les données. Seule la règle de Conway est acceptée.
 */
(function (root) {
  'use strict';

  const engine = (root.Life && root.Life.engine) || require('./engine.js');

  const MAX_LINE_LENGTH = 70;
  const CONWAY_RULE = 'B3/S23';

  function fail(message) {
    throw new Error('RLE invalide : ' + message);
  }

  // Accepte B3/S23, 23/3 (notation S/B) ou une règle absente
  function normalizeRule(rule) {
    const r = rule.trim().toUpperCase();
    if (r === 'B3/S23' || r === '23/3') return CONWAY_RULE;
    fail('règle « ' + rule + ' » non prise en charge ; seule la règle de Conway est acceptée (B3/S23 ou 23/3)');
  }

  /*
   * Lit un texte RLE. Renvoie { cells, width, height, rule } : une forme normalisée
   * à l'origine (coin haut gauche en 0,0) aux dimensions de l'en-tête.
   * options.maxCells : nombre maximal de cellules vivantes accepté.
   */
  function parse(text, options) {
    const maxCells = options && options.maxCells !== undefined ? options.maxCells : Infinity;
    if (typeof text !== 'string') fail('un texte est attendu');
    const lines = text.split(/\r\n|\r|\n/);

    // En-tête : première ligne qui n'est ni vide ni un commentaire
    let i = 0;
    let header = null;
    for (; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === '' || t.charAt(0) === '#') continue;
      header = t;
      i++;
      break;
    }
    if (header === null) fail('le texte est vide (en-tête « x = …, y = … » manquant)');
    const m = /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*(?:,\s*rule\s*=\s*(.*?))?\s*$/i.exec(header);
    if (!m) fail('en-tête « ' + header + ' » incorrect, attendu « x = …, y = … » (ligne ' + i + ')');
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) fail('dimensions trop grandes dans l\'en-tête');
    const rule = m[3] === undefined ? null : normalizeRule(m[3]);

    const cells = new Set();
    let x = 0;
    let y = 0;
    let count = '';
    let ended = false;
    for (; i < lines.length && !ended; i++) {
      const line = lines[i];
      if (line.trim().charAt(0) === '#') continue;
      const where = ' (ligne ' + (i + 1) + ')';
      for (let c = 0; c < line.length; c++) {
        const ch = line.charAt(c);
        if (/\s/.test(ch)) continue;
        if (ch >= '0' && ch <= '9') {
          count += ch;
          continue;
        }
        if (ch === '!') {
          if (count !== '') fail('nombre de répétitions « ' + count + ' » sans symbole avant « ! »' + where);
          ended = true;
          break;
        }
        const n = count === '' ? 1 : Number(count);
        if (count !== '' && (n === 0 || !Number.isSafeInteger(n))) {
          fail('nombre de répétitions « ' + count + ' » incorrect' + where);
        }
        count = '';
        if (ch === 'b') {
          x += n;
        } else if (ch === 'o') {
          if (y >= height || x + n > width) {
            fail('cellule vivante hors des dimensions déclarées (x = ' + width + ', y = ' + height + ')' + where);
          }
          if (cells.size + n > maxCells) {
            fail('le motif dépasse le plafond de ' + maxCells + ' cellules vivantes (MAX_LIVE_CELLS)');
          }
          for (let k = 0; k < n; k++) cells.add(engine.key(x + k, y));
          x += n;
        } else if (ch === '$') {
          y += n;
          x = 0;
        } else {
          fail('symbole inattendu « ' + ch + ' »' + where + ' ; seuls b, o, $ et ! sont acceptés');
        }
      }
    }
    if (!ended) fail('fin de motif « ! » manquante (texte incomplet ?)');
    return { cells: cells, width: width, height: height, rule: rule };
  }

  function run(n, symbol) {
    return (n > 1 ? String(n) : '') + symbol;
  }

  /*
   * Écrit une forme { cells, width, height } en RLE B3/S23, lignes de 70 caractères au plus.
   * Les cellules mortes en fin de ligne et les lignes vides finales sont implicites.
   */
  function write(shape) {
    if (!shape || !(shape.cells instanceof Set)) throw new TypeError('write : forme { cells, width, height } attendue');
    const width = shape.width;
    const height = shape.height;
    const rows = new Map();
    for (const k of shape.cells) {
      const p = engine.parseKey(k);
      if (p[0] < 0 || p[1] < 0 || p[0] >= width || p[1] >= height) {
        throw new RangeError('write : la cellule "' + k + '" sort de la boîte ' + width + ' × ' + height);
      }
      if (!rows.has(p[1])) rows.set(p[1], []);
      rows.get(p[1]).push(p[0]);
    }
    const ys = Array.from(rows.keys()).sort(function (a, b) { return a - b; });
    const tokens = [];
    let cursorY = 0;
    for (const y of ys) {
      if (y > cursorY) tokens.push(run(y - cursorY, '$'));
      cursorY = y;
      const xs = rows.get(y).sort(function (a, b) { return a - b; });
      let cursorX = 0;
      let i = 0;
      while (i < xs.length) {
        let j = i;
        while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
        if (xs[i] > cursorX) tokens.push(run(xs[i] - cursorX, 'b'));
        tokens.push(run(j - i + 1, 'o'));
        cursorX = xs[j] + 1;
        i = j + 1;
      }
    }
    tokens.push('!');
    // Retour à la ligne entre deux symboles, jamais au milieu d'un nombre
    const lines = [];
    let line = '';
    for (const t of tokens) {
      if (line.length + t.length > MAX_LINE_LENGTH) {
        lines.push(line);
        line = '';
      }
      line += t;
    }
    lines.push(line);
    return 'x = ' + width + ', y = ' + height + ', rule = ' + CONWAY_RULE + '\n' + lines.join('\n') + '\n';
  }

  const api = { MAX_LINE_LENGTH: MAX_LINE_LENGTH, parse: parse, write: write };

  root.Life = root.Life || {};
  root.Life.rle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
