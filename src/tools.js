/*
 * Outils d'édition et machine d'état des gestes de pointeur, sans DOM.
 * Un geste traduit appui / déplacement / relâchement en actions abstraites
 * (déplacer la vue, peindre, sélectionner) que le contrôleur applique.
 */
(function (root) {
  'use strict';

  const camera = (root.Life && root.Life.camera) || require('./camera.js');
  const transform = (root.Life && root.Life.transform) || require('./transform.js');

  // Outils exclusifs choisis par l'utilisateur
  const TOOLS = { MOVE: 'move', PENCIL: 'pencil', SELECT: 'select' };
  // Mode pose : actif après le choix d'un motif, Cmd+V ou un import RLE
  const PLACE = 'place';

  function isTool(name) {
    return name === TOOLS.MOVE || name === TOOLS.PENCIL || name === TOOLS.SELECT;
  }

  /*
   * Outil réellement appliqué : pendant la simulation ou avec Espace maintenu,
   * tout se comporte comme Déplacer ; sinon le mode pose prime sur l'outil choisi.
   */
  function effectiveTool(state) {
    if (state.running || state.spaceHeld) return TOOLS.MOVE;
    if (state.placing) return PLACE;
    return state.tool;
  }

  // Cellules d'un segment (algorithme de Bresenham), extrémités incluses, sans trou
  function lineCells(x0, y0, x1, y1) {
    const out = [];
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      out.push({ x: x, y: y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return out;
  }

  /*
   * Geste de pointeur. Le seuil de 4 px de camera.createDragTracker sépare le clic
   * du glisser. Actions renvoyées pendant un glisser :
   *   { type: 'pan', dx, dy }                  Déplacer, ou pose (la vue suit)
   *   { type: 'paint', mode, cells }           Crayon : mode 'draw' ou 'erase'
   *   { type: 'select', rect }                 Sélection en cours de tracé
   */
  function createGesture(threshold) {
    const tracker = camera.createDragTracker(threshold);
    let g = null;

    // firstAlive : état de la première cellule touchée, qui fixe dessin ou effacement
    function begin(tool, sx, sy, cell, firstAlive) {
      tracker.down(sx, sy);
      g = { tool: tool, start: cell, last: cell, mode: firstAlive ? 'erase' : 'draw', dragging: false };
    }

    function actionFor(delta, cell) {
      if (!delta || !delta.dragging) return null;
      const first = !g.dragging;
      g.dragging = true;
      if (g.tool === TOOLS.PENCIL) {
        if (!first && cell.x === g.last.x && cell.y === g.last.y) return null;
        const from = first ? g.start : g.last;
        const points = lineCells(from.x, from.y, cell.x, cell.y);
        if (!first) points.shift(); // déjà peinte au déplacement précédent
        g.last = cell;
        return { type: 'paint', mode: g.mode, cells: points };
      }
      if (g.tool === TOOLS.SELECT) {
        return { type: 'select', rect: transform.rectFromCells(g.start, cell) };
      }
      if (delta.dx === 0 && delta.dy === 0) return null;
      return { type: 'pan', dx: delta.dx, dy: delta.dy };
    }

    function move(sx, sy, cell) {
      if (!g) return null;
      return actionFor(tracker.move(sx, sy), cell);
    }

    // Fin du geste : { kind: 'click' | 'drag', tool, cell (cellule d'appui), action }
    function end(sx, sy, cell) {
      if (!g) return null;
      const action = actionFor(tracker.move(sx, sy), cell);
      tracker.up(sx, sy);
      const result = { kind: g.dragging ? 'drag' : 'click', tool: g.tool, cell: g.start, action: action };
      g = null;
      return result;
    }

    function cancel() {
      tracker.cancel();
      g = null;
    }

    return {
      begin: begin,
      move: move,
      end: end,
      cancel: cancel,
      isActive: function () { return g !== null; },
      isDragging: function () { return g !== null && g.dragging; },
      tool: function () { return g ? g.tool : null; },
    };
  }

  const api = {
    TOOLS: TOOLS,
    PLACE: PLACE,
    isTool: isTool,
    effectiveTool: effectiveTool,
    lineCells: lineCells,
    createGesture: createGesture,
  };

  root.Life = root.Life || {};
  root.Life.tools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
