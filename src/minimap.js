/*
 * Mini-carte : vue d'ensemble de la grille sans limite, pour se repérer et naviguer.
 * - Fonctions pures : étendue représentée (paliers en puissances de 2, avec hystérésis),
 *   conversions grille ↔ mini-carte, rastérisation des cellules, rectangle de la vue.
 * - createMinimap : état sans DOM qui décide quand rastériser et redessiner (horloge injectée)
 *   et qui traduit clic et glisser en déplacement de la vue, sans jamais toucher aux cellules.
 * - createMinimapRenderer : dessin sur un canvas séparé ; le canvas de la grille et l'image
 *   PNG exportée n'en dépendent donc pas.
 * Les étendues sont en coordonnées de la grille (unités de cellule) ; l'échelle `scale` est
 * le nombre de cellules par pixel CSS de la mini-carte.
 */
(function (root) {
  'use strict';

  const camera = (root.Life && root.Life.camera) || require('./camera.js');

  // Taille de la mini-carte en pixels CSS
  const MINIMAP_WIDTH = 200;
  const MINIMAP_HEIGHT = 140;
  // Marge autour du contenu (cellules et vue), en proportion de sa taille
  const MARGIN_RATIO = 0.1;
  // Hystérésis : l'échelle se resserre quand le contenu occupe moins d'un quart de l'étendue
  const SHRINK_FILL = 0.25;
  // Échelles extrêmes : au plus 8 px par cellule, au moins 2^60 cellules par pixel
  const MIN_SCALE = 1 / 8;
  const MAX_SCALE = Math.pow(2, 60);
  // Pendant la simulation ou un saut : au plus 10 rastérisations par seconde
  const REFRESH_INTERVAL_MS = 100;
  // Rectangle de vue plus petit que ce seuil (px) : remplacé par un repère de taille fixe
  const MIN_RECT_SIZE = 4;
  const MARKER_SIZE = 10;
  // Espace laissé autour de la mini-carte (px CSS)
  const EDGE_MARGIN = 12;
  const GAP = 8;

  // --- Boîtes ---

  // Zone de la grille visible dans la vue principale, en coordonnées continues
  function viewportBox(cam) {
    const halfW = cam.width / 2 / cam.cellSize;
    const halfH = cam.height / 2 / cam.cellSize;
    return { minX: cam.centerX - halfW, minY: cam.centerY - halfH, maxX: cam.centerX + halfW, maxY: cam.centerY + halfH };
  }

  // Union des cellules (boîte d'engine.boundingBox, bornes incluses) et de la vue ; au moins une cellule de côté
  function contentBox(cellsBox, view) {
    const box = { minX: view.minX, minY: view.minY, maxX: view.maxX, maxY: view.maxY };
    if (cellsBox) {
      box.minX = Math.min(box.minX, cellsBox.minX);
      box.minY = Math.min(box.minY, cellsBox.minY);
      box.maxX = Math.max(box.maxX, cellsBox.maxX + 1);
      box.maxY = Math.max(box.maxY, cellsBox.maxY + 1);
    }
    if (!(box.maxX - box.minX >= 1)) box.maxX = box.minX + 1;
    if (!(box.maxY - box.minY >= 1)) box.maxY = box.minY + 1;
    return box;
  }

  function contains(outer, inner) {
    return outer.minX <= inner.minX && inner.maxX <= outer.maxX && outer.minY <= inner.minY && inner.maxY <= outer.maxY;
  }

  // Part de l'étendue occupée par le contenu, dans la dimension où il est le plus grand
  function fillRatio(box, extent) {
    return Math.max((box.maxX - box.minX) / (extent.maxX - extent.minX), (box.maxY - box.minY) / (extent.maxY - extent.minY));
  }

  function sameExtent(a, b) {
    return !!a && !!b && a.minX === b.minX && a.minY === b.minY && a.scale === b.scale &&
      a.width === b.width && a.height === b.height;
  }

  // Plus petite puissance de 2 supérieure ou égale à need, dans [MIN_SCALE, MAX_SCALE]
  function powerOfTwoAtLeast(need) {
    if (!(need > MIN_SCALE)) return MIN_SCALE;
    if (!(need < MAX_SCALE)) return MAX_SCALE;
    let s = Math.pow(2, Math.ceil(Math.log2(need)));
    while (s < need) s *= 2;
    while (s / 2 >= need) s /= 2;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  // Nouvelle étendue : contenu plus 10 % de marge, centré ; origine alignée sur l'échelle
  function freshExtent(content, W, H) {
    const w = content.maxX - content.minX;
    const h = content.maxY - content.minY;
    const padded = {
      minX: content.minX - w * MARGIN_RATIO,
      minY: content.minY - h * MARGIN_RATIO,
      maxX: content.maxX + w * MARGIN_RATIO,
      maxY: content.maxY + h * MARGIN_RATIO,
    };
    const cx = (padded.minX + padded.maxX) / 2;
    const cy = (padded.minY + padded.maxY) / 2;
    let scale = powerOfTwoAtLeast(Math.max((padded.maxX - padded.minX) / W, (padded.maxY - padded.minY) / H));
    for (;;) {
      // Origine multiple de l'échelle : une cellule tombe toujours dans le même pixel
      const minX = Math.floor((cx - W * scale / 2) / scale) * scale;
      const minY = Math.floor((cy - H * scale / 2) / scale) * scale;
      const extent = { minX: minX, minY: minY, maxX: minX + W * scale, maxY: minY + H * scale, scale: scale, width: W, height: H };
      if (contains(extent, padded) || scale >= MAX_SCALE) return extent;
      scale *= 2; // l'alignement a fait perdre un pixel : palier suivant
    }
  }

  /*
   * Étendue représentée par la mini-carte : toutes les cellules vivantes et la vue courante,
   * avec 10 % de marge. cellsBox : boîte d'engine.boundingBox (null si grille vide) ;
   * viewportBox : zone visible (voir viewportBox) ; previousExtent : étendue précédente ou null ;
   * size : { width, height } en pixels (200 × 140 par défaut).
   * Hystérésis : l'étendue précédente est gardée tant que le contenu y tient et en occupe
   * au moins un quart (dans sa plus grande dimension) ; la carte ne tremble pas à chaque génération.
   * Renvoie { minX, minY, maxX, maxY, scale, width, height }.
   */
  function computeExtent(cellsBox, viewBox, previousExtent, size) {
    const W = (size && size.width) || MINIMAP_WIDTH;
    const H = (size && size.height) || MINIMAP_HEIGHT;
    const content = contentBox(cellsBox, viewBox);
    const prev = previousExtent;
    if (prev && prev.width === W && prev.height === H && contains(prev, content)) {
      if (fillRatio(content, prev) >= SHRINK_FILL) return prev;
      const next = freshExtent(content, W, H);
      return next.scale < prev.scale ? next : prev;
    }
    return freshExtent(content, W, H);
  }

  // --- Conversions : exactes pour des coordonnées entières, l'échelle étant une puissance de 2 ---

  function worldToMinimap(extent, wx, wy) {
    return { x: (wx - extent.minX) / extent.scale, y: (wy - extent.minY) / extent.scale };
  }

  function minimapToWorld(extent, px, py) {
    return { x: extent.minX + px * extent.scale, y: extent.minY + py * extent.scale };
  }

  // --- Rastérisation ---

  // Coordonnées décodées des clés "x,y" et boîte englobante, en un seul passage
  function decodeCells(cells) {
    const n = cells.size;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let i = 0;
    for (const k of cells) {
      const comma = k.indexOf(',');
      const x = +k.slice(0, comma);
      const y = +k.slice(comma + 1);
      xs[i] = x;
      ys[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      i++;
    }
    return { xs: xs, ys: ys, count: n, box: n ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY } : null };
  }

  /*
   * Tampon de width × height pixels (1 = allumé) : un pixel est allumé s'il contient au moins
   * une cellule vivante ; les cellules hors de l'étendue sont ignorées. cells : Set de clés "x,y"
   * ou résultat de decodeCells. Renvoie { pixels, lit } (lit : nombre de pixels allumés).
   */
  function rasterize(cells, extent, width, height) {
    const d = cells instanceof Set ? decodeCells(cells) : cells;
    const pixels = new Uint8Array(width * height);
    const s = extent.scale;
    const minX = extent.minX;
    const minY = extent.minY;
    // Une cellule couvre span × span pixels quand l'échelle est inférieure à 1
    const span = s < 1 ? Math.round(1 / s) : 1;
    let lit = 0;
    for (let i = 0; i < d.count; i++) {
      const px = Math.floor((d.xs[i] - minX) / s);
      const py = Math.floor((d.ys[i] - minY) / s);
      if (px >= width || py >= height || px + span <= 0 || py + span <= 0) continue;
      const x0 = Math.max(0, px), x1 = Math.min(width, px + span);
      const y0 = Math.max(0, py), y1 = Math.min(height, py + span);
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          if (pixels[row + x] === 0) {
            pixels[row + x] = 1;
            lit++;
          }
        }
      }
    }
    return { pixels: pixels, lit: lit };
  }

  /*
   * Rectangle de la vue sur la mini-carte, en pixels : { x, y, width, height, marker }.
   * Plus petit que 4 px dans une dimension, il est remplacé par un repère de taille fixe
   * centré au même endroit (marker: true). visible : le rectangle touche la mini-carte.
   */
  function viewportRect(extent, viewBox, width, height) {
    const a = worldToMinimap(extent, viewBox.minX, viewBox.minY);
    const b = worldToMinimap(extent, viewBox.maxX, viewBox.maxY);
    let r = { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, marker: false };
    if (r.width < MIN_RECT_SIZE || r.height < MIN_RECT_SIZE) {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      r = { x: cx - MARKER_SIZE / 2, y: cy - MARKER_SIZE / 2, width: MARKER_SIZE, height: MARKER_SIZE, marker: true };
    }
    r.visible = r.x < width && r.y < height && r.x + r.width > 0 && r.y + r.height > 0;
    return r;
  }

  // --- Texte et couleurs ---

  function formatInt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Échelle en texte discret : « 1 px = 64 cellules », ou « 1 cellule = 4 px » de près
  function scaleLabel(scale) {
    if (scale >= 1) return '1 px = ' + formatInt(scale) + (scale === 1 ? ' cellule' : ' cellules');
    return '1 cellule = ' + formatInt(Math.round(1 / scale)) + ' px';
  }

  // Couleur CSS (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) en [r, g, b, a] de 0 à 255 ; noir opaque sinon
  function parseColor(text) {
    const t = String(text || '').trim().toLowerCase();
    let m = /^#([0-9a-f]{3})$/.exec(t);
    if (m) return [0, 1, 2].map(function (i) { return parseInt(m[1][i] + m[1][i], 16); }).concat(255);
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(t);
    if (m) {
      return [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16); }).concat(m[2] ? parseInt(m[2], 16) : 255);
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(t);
    if (m) {
      let a = 255;
      if (m[4] !== undefined) a = Math.round(255 * (m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4])));
      return [+m[1], +m[2], +m[3]].map(function (v) { return Math.max(0, Math.min(255, Math.round(v))); })
        .concat(Math.max(0, Math.min(255, a)));
    }
    return [0, 0, 0, 255];
  }

  /*
   * Position verticale de la mini-carte, en haut à droite de la zone de grille : sous les barres
   * flottantes (rectangles relatifs à la zone, { left, top, right, bottom }) qui occupent sa bande.
   */
  function minimapTop(stageWidth, obstacles, width, height) {
    const left = stageWidth - EDGE_MARGIN - width;
    const right = stageWidth - EDGE_MARGIN;
    let top = EDGE_MARGIN;
    const sorted = obstacles.slice().sort(function (a, b) { return a.top - b.top; });
    for (const r of sorted) {
      const across = r.right + GAP > left && r.left - GAP < right;
      const below = r.top < top + height + GAP && r.bottom + GAP > top;
      if (across && below) top = r.bottom + GAP;
    }
    return top;
  }

  // Centre la vue principale sur un point de la grille, sans changer le zoom (déplacement de la vue seulement)
  function centerViewOn(controller, wx, wy) {
    const cam = controller.getState().camera;
    controller.panBy((cam.centerX - wx) * cam.cellSize, (cam.centerY - wy) * cam.cellSize);
  }

  /*
   * État de la mini-carte, sans DOM. options : { clock (ms), panTo(wx, wy), width, height,
   * interval, visible }. update({ cells, camera, busy }) renvoie ce qu'il faut redessiner,
   * ou null si rien n'a changé :
   * - cellules modifiées en pause (édition, pas à pas) : rastérisation immédiate ;
   * - pendant la simulation ou un saut : au plus une rastérisation toutes les 100 ms ;
   * - zoom ou déplacement : le rectangle de la vue suit aussitôt ; nouvelle rastérisation
   *   seulement si l'étendue change ;
   * - pendant un glisser sur la mini-carte, l'étendue est figée : la carte ne bouge pas sous le pointeur.
   */
  function createMinimap(options) {
    const o = options || {};
    if (typeof o.clock !== 'function') throw new TypeError('createMinimap : options.clock doit être une fonction');
    const clock = o.clock;
    const panTo = typeof o.panTo === 'function' ? o.panTo : function () {};
    let width = o.width || MINIMAP_WIDTH;
    let height = o.height || MINIMAP_HEIGHT;
    let size = { width: width, height: height };
    const interval = o.interval === undefined ? REFRESH_INTERVAL_MS : o.interval;

    let visible = o.visible !== false;
    let extent = null;
    let decoded = null;
    let decodedFor = null; // Set des cellules de la dernière rastérisation
    let raster = null;
    let rasterAt = -Infinity;
    let rasterCount = 0;
    let camKey = null;
    let rect = null;
    let forced = true;
    let drag = null;

    function decode(cells) {
      decoded = decodeCells(cells);
      decodedFor = cells;
    }

    function update(input) {
      if (!visible) return null;
      const now = clock();
      const cam = input.camera;
      const view = viewportBox(cam);
      const key = cam.centerX + ':' + cam.centerY + ':' + cam.cellSize + ':' + cam.width + ':' + cam.height;
      const camChanged = key !== camKey;
      let needRaster = raster === null;
      if (input.cells !== decodedFor && (!input.busy || now - rasterAt >= interval)) needRaster = true;
      if (needRaster) decode(input.cells);
      if (!drag && (needRaster || camChanged || forced || extent === null)) {
        let next = computeExtent(decoded.box, view, extent, size);
        if (!sameExtent(next, extent) && decodedFor !== input.cells) {
          // La vue sort de l'étendue : nouvelle étendue calculée avec les cellules actuelles
          decode(input.cells);
          next = computeExtent(decoded.box, view, extent, size);
        }
        if (!sameExtent(next, extent)) {
          extent = next;
          needRaster = true;
        }
      }
      if (!needRaster && !camChanged && !forced) return null;
      if (needRaster) {
        raster = rasterize(decoded, extent, width, height);
        rasterAt = now;
        rasterCount++;
      }
      camKey = key;
      forced = false;
      rect = viewportRect(extent, view, width, height);
      return { rasterized: needRaster, pixels: raster.pixels, lit: raster.lit, extent: extent, rect: rect,
        label: scaleLabel(extent.scale), width: width, height: height };
    }

    // --- Navigation : clic = centrer la vue sur le point visé ; glisser = la vue suit en continu ---

    function insideRect(px, py) {
      return !!rect && !rect.marker && px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
    }

    // cam : caméra courante, pour garder la prise quand on saisit le rectangle de la vue
    function pointerDown(px, py, cam) {
      if (!visible || !extent) return false;
      const w = minimapToWorld(extent, px, py);
      if (insideRect(px, py) && cam) {
        drag = { sx: px, sy: py, ox: w.x - cam.centerX, oy: w.y - cam.centerY, moved: false };
      } else {
        drag = { sx: px, sy: py, ox: 0, oy: 0, moved: false };
        panTo(w.x, w.y);
      }
      return true;
    }

    function pointerMove(px, py) {
      if (!drag) return false;
      if (!drag.moved && Math.hypot(px - drag.sx, py - drag.sy) <= camera.DRAG_THRESHOLD) return false;
      drag.moved = true;
      const w = minimapToWorld(extent, px, py);
      panTo(w.x - drag.ox, w.y - drag.oy);
      return true;
    }

    // Renvoie 'click' ou 'drag' (null sans appui en cours)
    function pointerUp(px, py) {
      if (!drag) return null;
      let kind = 'click';
      if (drag.moved) {
        pointerMove(px, py);
        kind = 'drag';
        forced = true; // étendue figée pendant le glisser : recalculée à la prochaine mise à jour
      } else {
        const w = minimapToWorld(extent, px, py);
        panTo(w.x, w.y);
      }
      drag = null;
      return kind;
    }

    function pointerCancel() {
      drag = null;
    }

    function setVisible(value) {
      visible = !!value;
      drag = null;
      forced = true;
      return visible;
    }

    // Nouvelle taille en pixels CSS (petit écran) : étendue et tampon recalculés à la prochaine mise à jour
    function setSize(w, h) {
      if (!(w > 0) || !(h > 0) || (w === width && h === height)) return false;
      width = w;
      height = h;
      size = { width: width, height: height };
      extent = null;
      raster = null;
      drag = null;
      forced = true;
      return true;
    }

    return {
      update: update,
      pointerDown: pointerDown,
      pointerMove: pointerMove,
      pointerUp: pointerUp,
      pointerCancel: pointerCancel,
      setVisible: setVisible,
      toggle: function () { return setVisible(!visible); },
      isVisible: function () { return visible; },
      setSize: setSize,
      size: function () { return { width: width, height: height }; },
      isDragging: function () { return drag !== null; },
      // Prochaine mise à jour : tout est redessiné (thème, taille, réaffichage)
      invalidate: function () { forced = true; },
      extent: function () { return extent; },
      rasterCount: function () { return rasterCount; },
    };
  }

  /*
   * Dessin d'une mise à jour de createMinimap sur son propre canvas, en pixels physiques :
   * cellules (chaque pixel de la carte couvre devicePixelRatio × devicePixelRatio pixels, net
   * sur écran Retina), puis rectangle de la vue en contour. Le fond semi-opaque est celui du CSS.
   */
  function createMinimapRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let cssWidth = MINIMAP_WIDTH;
    let cssHeight = MINIMAP_HEIGHT;
    let ratio = 1;
    let cellColor = [0, 0, 0, 255];
    let viewColor = '#000000';
    let image = null;
    let imageFor = null;

    function resize(w, h, devicePixelRatio) {
      cssWidth = w;
      cssHeight = h;
      ratio = devicePixelRatio || 1;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      image = null;
    }

    function setColors(colors) {
      cellColor = parseColor(colors.cell);
      viewColor = colors.view;
      image = null;
    }

    function buildImage(pixels, w, h) {
      const dw = canvas.width;
      const dh = canvas.height;
      const img = ctx.createImageData(dw, dh);
      const data = img.data;
      const cols = new Int32Array(dw);
      for (let i = 0; i < dw; i++) cols[i] = Math.min(w - 1, Math.floor(i / ratio));
      for (let j = 0; j < dh; j++) {
        const row = Math.min(h - 1, Math.floor(j / ratio)) * w;
        for (let i = 0; i < dw; i++) {
          if (pixels[row + cols[i]] === 0) continue;
          const at = (j * dw + i) * 4;
          data[at] = cellColor[0];
          data[at + 1] = cellColor[1];
          data[at + 2] = cellColor[2];
          data[at + 3] = cellColor[3];
        }
      }
      return img;
    }

    function draw(frame) {
      if (!image || imageFor !== frame.pixels) {
        image = buildImage(frame.pixels, frame.width, frame.height);
        imageFor = frame.pixels;
      }
      ctx.putImageData(image, 0, 0);
      const r = frame.rect;
      if (!r.visible) return;
      // Contour aligné sur les pixels physiques, toujours au moins 1 px
      const line = Math.max(1, Math.round(1.5 * ratio));
      const half = line / 2;
      const x0 = Math.round(r.x * ratio) + half;
      const y0 = Math.round(r.y * ratio) + half;
      const x1 = Math.round((r.x + r.width) * ratio) - half;
      const y1 = Math.round((r.y + r.height) * ratio) - half;
      ctx.lineWidth = line;
      ctx.strokeStyle = viewColor;
      ctx.strokeRect(x0, y0, Math.max(line, x1 - x0), Math.max(line, y1 - y0));
      if (r.marker) {
        // Repère : petite croix au centre du carré
        const cx = Math.round((r.x + r.width / 2) * ratio);
        const cy = Math.round((r.y + r.height / 2) * ratio);
        const arm = Math.round(2 * ratio);
        ctx.beginPath();
        ctx.moveTo(cx - arm, cy);
        ctx.lineTo(cx + arm, cy);
        ctx.moveTo(cx, cy - arm);
        ctx.lineTo(cx, cy + arm);
        ctx.stroke();
      }
    }

    return {
      resize: resize,
      setColors: setColors,
      draw: draw,
      size: function () { return { width: cssWidth, height: cssHeight, ratio: ratio }; },
    };
  }

  const api = {
    MINIMAP_WIDTH: MINIMAP_WIDTH,
    MINIMAP_HEIGHT: MINIMAP_HEIGHT,
    MARGIN_RATIO: MARGIN_RATIO,
    SHRINK_FILL: SHRINK_FILL,
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    REFRESH_INTERVAL_MS: REFRESH_INTERVAL_MS,
    MIN_RECT_SIZE: MIN_RECT_SIZE,
    MARKER_SIZE: MARKER_SIZE,
    viewportBox: viewportBox,
    computeExtent: computeExtent,
    worldToMinimap: worldToMinimap,
    minimapToWorld: minimapToWorld,
    decodeCells: decodeCells,
    rasterize: rasterize,
    viewportRect: viewportRect,
    scaleLabel: scaleLabel,
    parseColor: parseColor,
    minimapTop: minimapTop,
    centerViewOn: centerViewOn,
    createMinimap: createMinimap,
    createMinimapRenderer: createMinimapRenderer,
  };

  root.Life = root.Life || {};
  root.Life.minimap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
