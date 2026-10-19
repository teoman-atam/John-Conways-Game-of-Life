/*
 * Écran tactile, sans DOM (temps et minuteur injectés) :
 * - createTouchRouter : un doigt → geste habituel de l'outil ; deux doigts → pincement (zoom) et
 *   glissement de la vue. Le premier doigt est « armé » un court instant : si un deuxième doigt
 *   le rejoint, rien n'est dessiné ni sélectionné ;
 * - pinchStep : zoom et déplacement entre deux positions des deux doigts ;
 * - createLongPress : appui long sur un bouton → sa légende, sans déclencher l'action.
 */
(function (root) {
  'use strict';

  // Délai pendant lequel un premier doigt immobile ou presque attend un éventuel second doigt (ms)
  const ARM_MS = 90;
  // Appui long sur un bouton (ms)
  const LONG_PRESS_MS = 500;
  // En dessous de cet écart entre les doigts (px), pas de zoom : division instable
  const MIN_PINCH_DISTANCE = 8;

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  /*
   * Passage des doigts de (a0, b0) à (a1, b1) : facteur de zoom autour du milieu de départ,
   * puis déplacement du milieu. Appliquer zoomAt(factor, x, y) puis panBy(dx, dy) garde sous
   * chaque doigt le même point de la grille.
   */
  function pinchStep(a0, b0, a1, b1) {
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const d0 = distance(a0, b0);
    const d1 = distance(a1, b1);
    const factor = d0 >= MIN_PINCH_DISTANCE && d1 >= MIN_PINCH_DISTANCE ? d1 / d0 : 1;
    return { factor: factor, x: m0.x, y: m0.y, dx: m1.x - m0.x, dy: m1.y - m0.y };
  }

  /*
   * Aiguillage des contacts d'un canvas. handlers : { down(x, y), move(x, y), up(x, y), cancel(),
   * pinch({ factor, x, y, dx, dy }) } ; options : { armMs }. Les temps t sont en ms.
   * États : 'idle' → 'armed' (un doigt, en attente) → 'single' (geste transmis) ou 'pinch'
   * (deux doigts) → 'done' (pincement fini, on attend que tous les doigts se lèvent).
   */
  function createTouchRouter(handlers, options) {
    const h = handlers;
    const armMs = options && options.armMs !== undefined ? options.armMs : ARM_MS;
    const touches = new Map();
    let mode = 'idle';
    let first = null; // { id, x0, y0, t0 } : doigt du geste à un doigt
    let pair = null; // [idA, idB] : doigts du pincement

    function commit() {
      h.down(first.x0, first.y0);
      mode = 'single';
    }

    function startPinch() {
      if (mode === 'single') h.cancel(); // le geste à un doigt est abandonné, sans clic final
      const ids = Array.from(touches.keys()).slice(0, 2);
      pair = ids;
      mode = 'pinch';
    }

    function settle() {
      if (touches.size === 0) {
        mode = 'idle';
        first = null;
        pair = null;
      }
    }

    return {
      down: function (id, x, y, t) {
        touches.set(id, { x: x, y: y });
        if (mode === 'idle') {
          mode = 'armed';
          first = { id: id, x0: x, y0: y, t0: t };
        } else if ((mode === 'armed' || mode === 'single') && touches.size >= 2) {
          startPinch();
        }
      },

      move: function (id, x, y, t) {
        if (!touches.has(id)) return;
        const previous = touches.get(id);
        touches.set(id, { x: x, y: y });
        if (mode === 'armed' && id === first.id) {
          if (t - first.t0 < armMs) return;
          commit();
          h.move(x, y);
        } else if (mode === 'single' && id === first.id) {
          h.move(x, y);
        } else if (mode === 'pinch' && pair.indexOf(id) >= 0) {
          const other = touches.get(pair[0] === id ? pair[1] : pair[0]);
          const step = pinchStep(previous, other, { x: x, y: y }, other);
          if (step.factor !== 1 || step.dx !== 0 || step.dy !== 0) h.pinch(step);
        }
      },

      up: function (id, x, y) {
        if (!touches.has(id)) return;
        touches.delete(id);
        if (mode === 'armed' && id === first.id) {
          // Toucher bref ou glissé rapide : le geste est rejoué d'un coup (clic, ou trait continu)
          commit();
          if (x !== first.x0 || y !== first.y0) h.move(x, y);
          h.up(x, y);
          mode = 'idle';
        } else if (mode === 'single' && id === first.id) {
          h.up(x, y);
          mode = 'idle';
        } else if (mode === 'pinch') {
          mode = 'done';
        }
        settle();
      },

      cancel: function (id) {
        if (!touches.has(id)) return;
        touches.delete(id);
        if (mode === 'single' && id === first.id) h.cancel();
        if (mode === 'armed' && id === first.id) mode = 'idle';
        if (mode === 'pinch') mode = 'done';
        settle();
      },

      mode: function () { return mode; },
      // Au moins un doigt posé : les gestes Safari (gesturechange) sont alors ignorés pour ne pas zoomer deux fois
      active: function () { return touches.size > 0; },
    };
  }

  /*
   * Appui long sur un bouton : onLongPress(id) après le délai. up() renvoie true s'il a eu lieu :
   * le clic qui suit doit alors être ignoré (l'appui long montre la légende, il n'agit pas).
   */
  function createLongPress(options) {
    const o = options || {};
    const setT = o.setTimeout;
    const clearT = o.clearTimeout;
    const delay = o.delay === undefined ? LONG_PRESS_MS : o.delay;
    let timer = null;
    let fired = false;

    function cancel() {
      if (timer !== null) clearT(timer);
      timer = null;
    }

    return {
      down: function (id) {
        cancel();
        fired = false;
        timer = setT(function () {
          timer = null;
          fired = true;
          o.onLongPress(id);
        }, delay);
      },
      up: function () {
        cancel();
        const was = fired;
        fired = false;
        return was;
      },
      cancel: function () {
        cancel();
        fired = false;
      },
    };
  }

  const api = {
    ARM_MS: ARM_MS,
    LONG_PRESS_MS: LONG_PRESS_MS,
    MIN_PINCH_DISTANCE: MIN_PINCH_DISTANCE,
    pinchStep: pinchStep,
    createTouchRouter: createTouchRouter,
    createLongPress: createLongPress,
  };

  root.Life = root.Life || {};
  root.Life.touch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
