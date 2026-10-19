/*
 * Rendu Canvas 2D de la grille. Ne dessine que les cellules visibles,
 * en pixels physiques (devicePixelRatio) pour rester net sur écran Retina.
 * Un second canvas, superposé, porte les éléments d'édition (sélection, aperçu de pose) :
 * l'image PNG exportée ne contient donc que la grille.
 * Option « couleur selon l'âge » : une couleur par tranche d'âge, un seul fillStyle par tranche.
 * Le graphique de population a son propre petit canvas (createChartRenderer).
 */
(function (root) {
  'use strict';

  const camera = (root.Life && root.Life.camera) || require('./camera.js');
  const agesLib = (root.Life && root.Life.ages) || require('./ages.js');
  const sampling = (root.Life && root.Life.sampling) || require('./sampling.js');

  // Lignes de grille affichées à partir de cette taille de cellule (pixels CSS)
  const GRID_MIN_CELL_SIZE = 6;

  // Coordonnées décodées une seule fois par Set (les Set ne sont jamais modifiés en place)
  function createDecoder() {
    let cached = null;
    let xs = new Float64Array(0);
    let ys = new Float64Array(0);
    return function decode(cells) {
      if (cells !== cached) {
        xs = new Float64Array(cells.size);
        ys = new Float64Array(cells.size);
        let i = 0;
        for (const k of cells) {
          const comma = k.indexOf(',');
          xs[i] = +k.slice(0, comma);
          ys[i] = +k.slice(comma + 1);
          i++;
        }
        cached = cells;
      }
      return { xs: xs, ys: ys };
    };
  }

  function createRenderer(canvas, overlay) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const octx = overlay ? overlay.getContext('2d') : null;
    let ratio = 1;
    let colors = {
      dead: '#fbfbf9',
      live: '#1f2933',
      grid: '#e8e8e3',
      select: '#1f6f5c',
      selectText: '#ffffff',
      preview: '#1f6f5c',
      // Couleurs des tranches d'âge, de la plus jeune à la plus ancienne
      ages: ['#f59f00', '#f76707', '#e03131', '#9c36b5', '#1d2a33'],
    };
    const decodeCells = createDecoder();
    const decodePreview = createDecoder();

    // Tranche d'âge de chaque cellule, dans l'ordre du Set, recalculée seulement quand les âges changent
    let bucketCells = null;
    let bucketAges = null;
    let buckets = new Uint8Array(0);
    const bucketCounts = new Array(agesLib.AGE_BUCKET_COUNT).fill(0);

    function bucketsFor(cells, ages) {
      if (cells === bucketCells && ages === bucketAges) return buckets;
      buckets = new Uint8Array(cells.size);
      bucketCounts.fill(0);
      let i = 0;
      for (const k of cells) {
        const b = agesLib.ageBucket(ages.get(k) || 1);
        buckets[i++] = b;
        bucketCounts[b]++;
      }
      bucketCells = cells;
      bucketAges = ages;
      return buckets;
    }

    // Taille d'affichage en pixels CSS et densité de l'écran
    function resize(cssWidth, cssHeight, devicePixelRatio) {
      ratio = devicePixelRatio || 1;
      for (const c of [canvas, overlay]) {
        if (!c) continue;
        c.width = Math.max(1, Math.round(cssWidth * ratio));
        c.height = Math.max(1, Math.round(cssHeight * ratio));
      }
    }

    function setColors(next) {
      colors = Object.assign({}, colors, next);
    }

    // Conversions grille → pixels physiques entiers : pas de trou entre cellules
    function geometry(cam, W, H) {
      const size = cam.cellSize * ratio;
      return {
        x: function (n) { return Math.floor((n - cam.centerX) * size + W / 2); },
        y: function (n) { return Math.floor((n - cam.centerY) * size + H / 2); },
      };
    }

    function draw(state) {
      const cam = state.camera;
      const W = canvas.width;
      const H = canvas.height;
      const vis = camera.visibleCells(cam);
      const showGrid = cam.cellSize >= GRID_MIN_CELL_SIZE;
      const edge = geometry(cam, W, H);

      ctx.fillStyle = colors.dead;
      ctx.fillRect(0, 0, W, H);

      if (showGrid) {
        ctx.beginPath();
        for (let x = vis.minX; x <= vis.maxX + 1; x++) {
          const px = edge.x(x) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, H);
        }
        for (let y = vis.minY; y <= vis.maxY + 1; y++) {
          const py = edge.y(y) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(W, py);
        }
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Avec la grille, on laisse la ligne visible entre deux cellules
      const inset = showGrid ? 1 : 0;
      const cells = state.cells;

      function addCell(x, y) {
        const left = edge.x(x);
        const top = edge.y(y);
        const w = Math.max(1, edge.x(x + 1) - left - inset);
        const h = Math.max(1, edge.y(y + 1) - top - inset);
        ctx.rect(left + inset, top + inset, w, h);
      }

      const visibleArea = (vis.maxX - vis.minX + 1) * (vis.maxY - vis.minY + 1);
      if (state.ageColors && state.ages instanceof Map) {
        drawAgedCells(state, vis, visibleArea, addCell);
        if (octx) drawOverlay(state);
        return;
      }
      ctx.fillStyle = colors.live;
      ctx.beginPath();
      if (visibleArea < cells.size) {
        // Peu de cases visibles : on parcourt la zone
        for (let y = vis.minY; y <= vis.maxY; y++) {
          for (let x = vis.minX; x <= vis.maxX; x++) {
            if (cells.has(x + ',' + y)) addCell(x, y);
          }
        }
      } else {
        // Sinon on parcourt les cellules vivantes et on écarte celles hors champ
        const d = decodeCells(cells);
        for (let i = 0; i < d.xs.length; i++) {
          const x = d.xs[i];
          const y = d.ys[i];
          if (x >= vis.minX && x <= vis.maxX && y >= vis.minY && y <= vis.maxY) addCell(x, y);
        }
      }
      ctx.fill();
      if (octx) drawOverlay(state);
    }

    // Une passe par tranche d'âge : un seul fillStyle et un seul fill par tranche et par image
    function drawAgedCells(state, vis, visibleArea, addCell) {
      const cells = state.cells;
      const ages = state.ages;
      const scanArea = visibleArea < cells.size;
      let d = null;
      let b = null;
      if (!scanArea) {
        d = decodeCells(cells);
        b = bucketsFor(cells, ages);
      }
      for (let bucket = 0; bucket < agesLib.AGE_BUCKET_COUNT; bucket++) {
        if (!scanArea && bucketCounts[bucket] === 0) continue;
        ctx.fillStyle = colors.ages[bucket];
        ctx.beginPath();
        if (scanArea) {
          // Peu de cases visibles : on parcourt la zone
          for (let y = vis.minY; y <= vis.maxY; y++) {
            for (let x = vis.minX; x <= vis.maxX; x++) {
              const k = x + ',' + y;
              if (cells.has(k) && agesLib.ageBucket(ages.get(k) || 1) === bucket) addCell(x, y);
            }
          }
        } else {
          for (let i = 0; i < d.xs.length; i++) {
            if (b[i] !== bucket) continue;
            const x = d.xs[i];
            const y = d.ys[i];
            if (x >= vis.minX && x <= vis.maxX && y >= vis.minY && y <= vis.maxY) addCell(x, y);
          }
        }
        ctx.fill();
      }
    }

    // Rectangle de cellules en pixels physiques, borné à l'écran (marge de 8 px)
    function clampedRect(edge, minX, minY, maxX, maxY, W, H) {
      const left = Math.max(-8, edge.x(minX));
      const top = Math.max(-8, edge.y(minY));
      const right = Math.min(W + 8, edge.x(maxX + 1));
      const bottom = Math.min(H + 8, edge.y(maxY + 1));
      return { left: left, top: top, width: right - left, height: bottom - top };
    }

    function drawOverlay(state) {
      const W = overlay.width;
      const H = overlay.height;
      const cam = state.camera;
      const edge = geometry(cam, W, H);
      octx.clearRect(0, 0, W, H);

      // Aperçu de pose : cellules semi-transparentes et boîte en pointillés
      if (state.placing) {
        const p = state.placing;
        const vis = camera.visibleCells(cam);
        const d = decodePreview(p.shape.cells);
        octx.globalAlpha = 0.5;
        octx.fillStyle = colors.preview;
        octx.beginPath();
        for (let i = 0; i < d.xs.length; i++) {
          const x = d.xs[i] + p.origin.x;
          const y = d.ys[i] + p.origin.y;
          if (x < vis.minX || x > vis.maxX || y < vis.minY || y > vis.maxY) continue;
          const left = edge.x(x);
          const top = edge.y(y);
          octx.rect(left, top, Math.max(1, edge.x(x + 1) - left), Math.max(1, edge.y(y + 1) - top));
        }
        octx.fill();
        octx.globalAlpha = 1;
        if (p.shape.width > 0 && p.shape.height > 0) {
          const r = clampedRect(edge, p.origin.x, p.origin.y, p.origin.x + p.shape.width - 1,
            p.origin.y + p.shape.height - 1, W, H);
          octx.setLineDash([3 * ratio, 3 * ratio]);
          octx.lineWidth = ratio;
          octx.strokeStyle = colors.preview;
          octx.strokeRect(r.left + 0.5, r.top + 0.5, r.width - 1, r.height - 1);
          octx.setLineDash([]);
        }
      }

      // Sélection : rectangle en pointillés et dimensions en cellules
      if (state.selection) {
        const s = state.selection;
        const r = clampedRect(edge, s.minX, s.minY, s.maxX, s.maxY, W, H);
        octx.fillStyle = colors.select;
        octx.globalAlpha = 0.08;
        octx.fillRect(r.left, r.top, r.width, r.height);
        octx.globalAlpha = 1;
        octx.setLineDash([5 * ratio, 4 * ratio]);
        octx.lineWidth = 1.5 * ratio;
        octx.strokeStyle = colors.select;
        octx.strokeRect(r.left + 0.75 * ratio, r.top + 0.75 * ratio, r.width - 1.5 * ratio, r.height - 1.5 * ratio);
        octx.setLineDash([]);

        const label = (s.maxX - s.minX + 1) + ' × ' + (s.maxY - s.minY + 1);
        octx.font = (11 * ratio) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const tw = octx.measureText(label).width;
        const padX = 5 * ratio;
        const lh = 17 * ratio;
        const lx = Math.max(2 * ratio, Math.min(r.left, W - tw - 2 * padX - 2 * ratio));
        let ly = r.top - lh - 3 * ratio;
        if (ly < 2 * ratio) ly = Math.min(H - lh - 2 * ratio, Math.max(2 * ratio, r.top) + 3 * ratio);
        octx.fillStyle = colors.select;
        octx.fillRect(lx, ly, tw + 2 * padX, lh);
        octx.fillStyle = colors.selectText;
        octx.textBaseline = 'middle';
        octx.fillText(label, lx + padX, ly + lh / 2);
      }
    }

    return { resize: resize, setColors: setColors, draw: draw };
  }

  /*
   * Graphique de population : enveloppe min / max réduite à la largeur du canvas,
   * de la génération 0 à la génération actuelle, échelle de 0 au maximum atteint.
   */
  function createChartRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let ratio = 1;
    let colors = { line: '#1f6f5c', fill: 'rgba(31, 111, 92, 0.15)', axis: '#e1e1dc' };

    function resize(cssWidth, cssHeight, devicePixelRatio) {
      ratio = devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(cssWidth * ratio));
      canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    }

    function setColors(next) {
      colors = Object.assign({}, colors, next);
    }

    // values : populations (une par génération) ; max : maximum atteint
    function draw(values, max) {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = ratio;
      ctx.beginPath();
      ctx.moveTo(0, H - ratio / 2);
      ctx.lineTo(W, H - ratio / 2);
      ctx.stroke();
      if (values.length === 0) return;
      const r = sampling.downsample(values, W);
      const top = Math.max(1, max) * 1.05;
      const pad = 2 * ratio;
      const y = function (v) { return H - pad - (v / top) * (H - 2 * pad); };
      const x = function (i) { return r.count === 1 ? W / 2 : (i / (r.count - 1)) * (W - 1); };
      // Aire sous le maximum de chaque tranche
      ctx.fillStyle = colors.fill;
      ctx.beginPath();
      ctx.moveTo(x(0), H);
      for (let i = 0; i < r.count; i++) ctx.lineTo(x(i), y(r.max[i]));
      ctx.lineTo(x(r.count - 1), H);
      ctx.closePath();
      ctx.fill();
      // Écart min / max de chaque tranche : les pics restent visibles
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = Math.max(1, ratio);
      ctx.beginPath();
      for (let i = 0; i < r.count; i++) {
        if (r.min[i] === r.max[i]) continue;
        ctx.moveTo(x(i), y(r.min[i]));
        ctx.lineTo(x(i), y(r.max[i]));
      }
      ctx.stroke();
      // Courbe des maxima
      ctx.lineWidth = 1.5 * ratio;
      ctx.beginPath();
      for (let i = 0; i < r.count; i++) {
        if (i === 0) ctx.moveTo(x(i), y(r.max[i]));
        else ctx.lineTo(x(i), y(r.max[i]));
      }
      if (r.count === 1) ctx.lineTo(x(0) + ratio, y(r.max[0]));
      ctx.stroke();
    }

    return { resize: resize, setColors: setColors, draw: draw };
  }

  const api = {
    GRID_MIN_CELL_SIZE: GRID_MIN_CELL_SIZE,
    createRenderer: createRenderer,
    createChartRenderer: createChartRenderer,
  };

  root.Life = root.Life || {};
  root.Life.renderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
