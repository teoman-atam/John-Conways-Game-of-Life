/*
 * Gomme, sans DOM. Le centre de la gomme est le centre de la cellule visée ; une cellule est effacée
 * si la distance entre son centre et ce centre est au plus diamètre / 2 (au diamètre 1, seule la
 * cellule visée l'est). Un trait entre deux cellules efface toutes les cellules dont le centre est
 * à au plus diamètre / 2 du segment qui relie leurs centres : un geste rapide ne laisse aucun trou.
 * Les centres étant tous décalés de 0,5, les distances se calculent sur les coordonnées entières.
 * Coût : proportionnel au plus petit des deux nombres, surface couverte ou cellules vivantes.
 * Les entrées ne sont jamais modifiées.
 */
(function (root) {
  'use strict';

  // Diamètre de la gomme, en cellules
  const ERASER_MIN_SIZE = 1;
  const ERASER_MAX_SIZE = 512;
  const ERASER_DEFAULT_SIZE = 3;
  // Tolérance d'arrondi des distances
  const EPSILON = 1e-9;

  // Taille entière ramenée dans les bornes (infini compris) ; valeur illisible : taille par défaut
  function clampSize(value) {
    const n = Number(value);
    if (value === null || value === '' || Number.isNaN(n)) return ERASER_DEFAULT_SIZE;
    return Math.max(ERASER_MIN_SIZE, Math.min(ERASER_MAX_SIZE, Math.round(n)));
  }

  // Carré de la distance du point (px, py) au segment [a, b]
  function distanceSqToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let t = 0;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
    const dx = px - (ax + t * vx);
    const dy = py - (ay + t * vy);
    return dx * dx + dy * dy;
  }

  /*
   * Clés des cellules vivantes effacées par un trait de la cellule a à la cellule b (a = b : un tampon).
   * info (facultatif) reçoit { mode: 'area' | 'live', visited } : parcours de la zone couverte, ou des
   * cellules vivantes quand elles sont moins nombreuses.
   */
  function erasedKeys(cells, a, b, diameter, info) {
    const d = clampSize(diameter);
    const r = d / 2;
    const limit = r * r + EPSILON;
    const minX = Math.floor(Math.min(a.x, b.x) - r);
    const maxX = Math.ceil(Math.max(a.x, b.x) + r);
    const minY = Math.floor(Math.min(a.y, b.y) - r);
    const maxY = Math.ceil(Math.max(a.y, b.y) + r);
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    const out = [];
    let visited = 0;
    if (area <= cells.size) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          visited++;
          if (distanceSqToSegment(x, y, a.x, a.y, b.x, b.y) > limit) continue;
          const k = x + ',' + y;
          if (cells.has(k)) out.push(k);
        }
      }
      if (info) { info.mode = 'area'; info.visited = visited; }
      return out;
    }
    for (const k of cells) {
      visited++;
      const comma = k.indexOf(',');
      const x = +k.slice(0, comma);
      if (x < minX || x > maxX) continue;
      const y = +k.slice(comma + 1);
      if (y < minY || y > maxY) continue;
      if (distanceSqToSegment(x, y, a.x, a.y, b.x, b.y) <= limit) out.push(k);
    }
    if (info) { info.mode = 'live'; info.visited = visited; }
    return out;
  }

  // Nouveau Set sans les cellules effacées par le trait de a à b
  function eraseStroke(cells, a, b, diameter) {
    const next = new Set(cells);
    for (const k of erasedKeys(cells, a, b, diameter)) next.delete(k);
    return next;
  }

  // Un tampon : effacement autour de la seule cellule visée
  function eraseStamp(cells, cell, diameter) {
    return eraseStroke(cells, cell, cell, diameter);
  }

  // --- Réglage de la taille : curseur logarithmique et ⌥ + molette ---

  // Position du curseur de réglage (0 à SLIDER_STEPS) → diamètre, sur une échelle logarithmique de 1 à 512
  const SLIDER_STEPS = 1000;

  function sizeFromSlider(position) {
    const t = Math.max(0, Math.min(SLIDER_STEPS, Number(position) || 0)) / SLIDER_STEPS;
    return clampSize(Math.exp(t * Math.log(ERASER_MAX_SIZE)));
  }

  function sliderFromSize(size) {
    return Math.round(Math.log(clampSize(size)) / Math.log(ERASER_MAX_SIZE) * SLIDER_STEPS);
  }

  /*
   * ⌥ + molette au-dessus de la grille change la taille de la Gomme quand elle est l'outil choisi ;
   * la molette seule et le pincement (ctrlKey) zooment toujours. event : { altKey, ctrlKey } ;
   * state : { tool, placing }.
   */
  function wheelChangesSize(event, state) {
    return !!event.altKey && !event.ctrlKey && state.tool === 'eraser' && !state.placing;
  }

  // Nouvelle taille après un cran de molette : vers le haut, plus grande ; au moins une cellule d'écart
  function sizeAfterWheel(size, deltaY, deltaMode) {
    const current = clampSize(size);
    let delta = Number(deltaY) || 0;
    if (deltaMode === 1) delta *= 16; // lignes
    else if (deltaMode === 2) delta *= 100; // pages
    delta = Math.max(-200, Math.min(200, delta));
    if (delta === 0) return current;
    let next = clampSize(current * Math.exp(-delta * 0.004));
    if (next === current) next = clampSize(current + (delta < 0 ? 1 : -1));
    return next;
  }

  const api = {
    ERASER_MIN_SIZE: ERASER_MIN_SIZE,
    ERASER_MAX_SIZE: ERASER_MAX_SIZE,
    ERASER_DEFAULT_SIZE: ERASER_DEFAULT_SIZE,
    clampSize: clampSize,
    distanceSqToSegment: distanceSqToSegment,
    erasedKeys: erasedKeys,
    eraseStroke: eraseStroke,
    eraseStamp: eraseStamp,
    SLIDER_STEPS: SLIDER_STEPS,
    sizeFromSlider: sizeFromSlider,
    sliderFromSize: sliderFromSize,
    wheelChangesSize: wheelChangesSize,
    sizeAfterWheel: sizeAfterWheel,
  };

  root.Life = root.Life || {};
  root.Life.eraser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
