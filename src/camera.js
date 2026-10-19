/*
 * Caméra : conversions écran ↔ grille, zoom et déplacement. Aucun accès au DOM.
 * Une caméra est un objet simple { cellSize, centerX, centerY, width, height } :
 * - cellSize : taille d'une cellule en pixels CSS ;
 * - centerX, centerY : point de la grille (en unités de cellule) affiché au centre de la vue ;
 * - width, height : taille de la vue en pixels CSS.
 * Les fonctions sont pures : elles renvoient une nouvelle caméra.
 */
(function (root) {
  'use strict';

  const MIN_CELL_SIZE = 1;
  const MAX_CELL_SIZE = 64;
  const DEFAULT_CELL_SIZE = 12;
  // Centre de la cellule (0,0) au centre de la vue
  const DEFAULT_CENTER = 0.5;
  // Au-delà de ce déplacement (en pixels), un appui devient un glisser
  const DRAG_THRESHOLD = 4;
  // Marge en pixels laissée autour des cellules lors du recentrage
  const FIT_PADDING = 32;

  function clampCellSize(size) {
    return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, size));
  }

  function createCamera(width, height) {
    return {
      cellSize: DEFAULT_CELL_SIZE,
      centerX: DEFAULT_CENTER,
      centerY: DEFAULT_CENTER,
      width: width || 0,
      height: height || 0,
    };
  }

  function withChanges(cam, changes) {
    return Object.assign({}, cam, changes);
  }

  // Revient à l'origine au zoom initial, en gardant la taille de la vue
  function reset(cam) {
    return createCamera(cam.width, cam.height);
  }

  function setViewport(cam, width, height) {
    return withChanges(cam, { width: width, height: height });
  }

  // Pixel écran → coordonnées continues de la grille
  function screenToWorld(cam, sx, sy) {
    return {
      x: cam.centerX + (sx - cam.width / 2) / cam.cellSize,
      y: cam.centerY + (sy - cam.height / 2) / cam.cellSize,
    };
  }

  // Coordonnées continues de la grille → pixel écran
  function worldToScreen(cam, wx, wy) {
    return {
      x: (wx - cam.centerX) * cam.cellSize + cam.width / 2,
      y: (wy - cam.centerY) * cam.cellSize + cam.height / 2,
    };
  }

  // Cellule (entiers) située sous un pixel écran
  function screenToCell(cam, sx, sy) {
    const w = screenToWorld(cam, sx, sy);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  // Zoom d'un facteur donné ; le point de la grille sous (sx, sy) reste fixe à l'écran
  function zoomAt(cam, factor, sx, sy) {
    const size = clampCellSize(cam.cellSize * factor);
    if (size === cam.cellSize) return cam;
    const anchor = screenToWorld(cam, sx, sy);
    return withChanges(cam, {
      cellSize: size,
      centerX: anchor.x - (sx - cam.width / 2) / size,
      centerY: anchor.y - (sy - cam.height / 2) / size,
    });
  }

  // Déplace le contenu de (dx, dy) pixels, comme une carte qu'on fait glisser
  function pan(cam, dx, dy) {
    return withChanges(cam, {
      centerX: cam.centerX - dx / cam.cellSize,
      centerY: cam.centerY - dy / cam.cellSize,
    });
  }

  // Plage de cellules au moins partiellement visibles (bornes incluses)
  function visibleCells(cam) {
    const halfW = cam.width / 2 / cam.cellSize;
    const halfH = cam.height / 2 / cam.cellSize;
    return {
      minX: Math.floor(cam.centerX - halfW),
      minY: Math.floor(cam.centerY - halfH),
      maxX: Math.ceil(cam.centerX + halfW) - 1,
      maxY: Math.ceil(cam.centerY + halfH) - 1,
    };
  }

  // Cellule affichée au centre de la vue
  function centerCell(cam) {
    return { x: Math.floor(cam.centerX), y: Math.floor(cam.centerY) };
  }

  // Ajuste la vue sur une boîte { minX, minY, maxX, maxY } dans les limites du zoom ; null → origine
  function fitToBox(cam, box) {
    if (!box) return reset(cam);
    const boxW = box.maxX - box.minX + 1;
    const boxH = box.maxY - box.minY + 1;
    const availW = Math.max(1, cam.width - 2 * FIT_PADDING);
    const availH = Math.max(1, cam.height - 2 * FIT_PADDING);
    return withChanges(cam, {
      cellSize: clampCellSize(Math.min(availW / boxW, availH / boxH)),
      centerX: box.minX + boxW / 2,
      centerY: box.minY + boxH / 2,
    });
  }

  /*
   * Distingue un clic d'un glisser. Tant que le pointeur reste à DRAG_THRESHOLD pixels
   * ou moins de son point de départ, c'est un clic ; au-delà, c'est un glisser,
   * définitivement pour ce geste.
   */
  function createDragTracker(threshold) {
    const limit = threshold === undefined ? DRAG_THRESHOLD : threshold;
    let active = false;
    let dragging = false;
    let startX = 0, startY = 0, lastX = 0, lastY = 0;

    function down(x, y) {
      active = true;
      dragging = false;
      startX = lastX = x;
      startY = lastY = y;
    }

    // Renvoie le déplacement de vue à appliquer depuis le dernier appel (0 avant le seuil)
    function move(x, y) {
      if (!active) return null;
      if (!dragging && Math.hypot(x - startX, y - startY) > limit) {
        dragging = true;
        // Rattrape tout le chemin parcouru depuis l'appui
        lastX = startX;
        lastY = startY;
      }
      if (!dragging) return { dragging: false, dx: 0, dy: 0 };
      const delta = { dragging: true, dx: x - lastX, dy: y - lastY };
      lastX = x;
      lastY = y;
      return delta;
    }

    // Termine le geste : 'click' ou 'drag' (null si aucun appui en cours)
    function up(x, y) {
      if (!active) return null;
      const delta = move(x, y);
      active = false;
      return {
        kind: dragging ? 'drag' : 'click',
        dx: delta.dx,
        dy: delta.dy,
        startX: startX,
        startY: startY,
      };
    }

    function cancel() {
      active = false;
      dragging = false;
    }

    return {
      down: down,
      move: move,
      up: up,
      cancel: cancel,
      isActive: function () { return active; },
      isDragging: function () { return active && dragging; },
    };
  }

  const api = {
    MIN_CELL_SIZE: MIN_CELL_SIZE,
    MAX_CELL_SIZE: MAX_CELL_SIZE,
    DEFAULT_CELL_SIZE: DEFAULT_CELL_SIZE,
    DRAG_THRESHOLD: DRAG_THRESHOLD,
    clampCellSize: clampCellSize,
    createCamera: createCamera,
    reset: reset,
    setViewport: setViewport,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    screenToCell: screenToCell,
    zoomAt: zoomAt,
    pan: pan,
    visibleCells: visibleCells,
    centerCell: centerCell,
    fitToBox: fitToBox,
    createDragTracker: createDragTracker,
  };

  root.Life = root.Life || {};
  root.Life.camera = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
