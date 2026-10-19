/*
 * Scènes de rendu et faux canvas qui enregistre chaque appel de dessin.
 * Sert à prouver que le rendu sans couleur selon l'âge est identique à celui
 * d'avant le lot B (référence figée dans tests/fixtures/render-lot-a.js).
 */
(function (root) {
  'use strict';

  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');

  // Contexte 2D factice : chaque appel de méthode et chaque affectation est journalisé
  function createRecordingCanvas(log, name) {
    const ctx = new Proxy({}, {
      get: function (target, prop) {
        if (prop === 'measureText') {
          return function (text) {
            log.push([name, 'measureText', text]);
            return { width: text.length * 6 };
          };
        }
        return function () {
          log.push([name, prop].concat(Array.prototype.slice.call(arguments)));
        };
      },
      set: function (target, prop, value) {
        log.push([name, 'set:' + String(prop), value]);
        return true;
      },
    });
    return { width: 0, height: 0, getContext: function () { return ctx; } };
  }

  // Générateur pseudo-aléatoire déterministe
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function randomCells(seed, minX, minY, w, h, density) {
    const r = seeded(seed);
    const out = new Set();
    for (let y = minY; y < minY + h; y++) {
      for (let x = minX; x < minX + w; x++) if (r() < density) out.add(engine.key(x, y));
    }
    return out;
  }

  function union(a, b) {
    const out = new Set(a);
    for (const k of b) out.add(k);
    return out;
  }

  // Trois scènes : grille visible avec sélection et aperçu, vue dézoomée, vue très zoomée
  function scenarios() {
    return [
      {
        name: 'grille, sélection et aperçu de pose',
        size: [120, 90, 2],
        state: {
          cells: union(union(patterns.cells('glider'), patterns.cells('blinker', -4, 2)), new Set(['5,-3', '-6,-4'])),
          camera: { cellSize: 12, centerX: 0.5, centerY: 0.5, width: 120, height: 90 },
          selection: { minX: -2, minY: -2, maxX: 1, maxY: 1 },
          placing: { name: 'Planeur', shape: { cells: patterns.cells('glider'), width: 3, height: 3 }, origin: { x: 2, y: 1 } },
        },
      },
      {
        name: 'vue dézoomée sans grille',
        size: [60, 45, 1],
        state: {
          cells: randomCells(11, -12, -9, 24, 18, 0.4),
          camera: { cellSize: 3, centerX: 0.25, centerY: -0.5, width: 60, height: 45 },
          selection: null,
          placing: null,
        },
      },
      {
        name: 'vue très zoomée',
        size: [80, 80, 2],
        state: {
          cells: randomCells(5, -6, -6, 12, 12, 0.5),
          camera: { cellSize: 40, centerX: 0.3, centerY: 0.6, width: 80, height: 80 },
          selection: { minX: -20, minY: -20, maxX: 20, maxY: 20 },
          placing: null,
        },
      },
    ];
  }

  // Journal des appels de dessin d'une scène ; extra complète l'état (ex. âges)
  function record(rendererApi, scenario, extra) {
    const log = [];
    const board = createRecordingCanvas(log, 'board');
    const overlay = createRecordingCanvas(log, 'overlay');
    const renderer = rendererApi.createRenderer(board, overlay);
    renderer.resize(scenario.size[0], scenario.size[1], scenario.size[2]);
    renderer.draw(Object.assign({}, scenario.state, extra || {}));
    return log;
  }

  const api = { createRecordingCanvas: createRecordingCanvas, scenarios: scenarios, record: record };

  root.LifeRenderScenarios = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
