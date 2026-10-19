/*
 * Plein écran de toute l'application, avec l'API standard ou, en repli, l'API webkit
 * de Safari. Le document est injecté : testable sans navigateur.
 * L'état suit les événements fullscreenchange / webkitfullscreenchange, quelle que soit
 * la façon de sortir (bouton, Échap, menu du navigateur).
 */
(function (root) {
  'use strict';

  const REFUSED = 'Le plein écran a été refusé par le navigateur.';

  // handlers : { onChange(active), onMessage(text) }
  function createFullscreen(doc, handlers) {
    const h = handlers || {};
    const onChange = h.onChange || function () {};
    const onMessage = h.onMessage || function () {};
    const el = doc.documentElement;

    function isActive() {
      return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
    }

    /*
     * Plein écran possible ? Les indicateurs fullscreenEnabled / webkitFullscreenEnabled font foi
     * quand le navigateur les fournit (faux sur iPhone) ; sinon, présence des méthodes d'entrée.
     */
    function isSupported() {
      if (typeof doc.fullscreenEnabled === 'boolean' || typeof doc.webkitFullscreenEnabled === 'boolean') {
        return doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;
      }
      return !!(el.requestFullscreen || el.webkitRequestFullscreen);
    }

    function refused() {
      onMessage(REFUSED);
    }

    // Appel protégé : exception immédiate ou promesse rejetée donnent un message, jamais un plantage
    function call(fn, target) {
      try {
        const result = fn.call(target);
        if (result && typeof result.then === 'function') result.then(null, refused);
      } catch (err) {
        refused();
      }
    }

    function enter() {
      if (el.requestFullscreen) call(el.requestFullscreen, el);
      else if (el.webkitRequestFullscreen) call(el.webkitRequestFullscreen, el);
      else onMessage('Le plein écran n\'est pas pris en charge par ce navigateur.');
    }

    function exit() {
      if (doc.exitFullscreen) call(doc.exitFullscreen, doc);
      else if (doc.webkitExitFullscreen) call(doc.webkitExitFullscreen, doc);
    }

    function sync() {
      onChange(isActive());
    }

    doc.addEventListener('fullscreenchange', sync);
    doc.addEventListener('webkitfullscreenchange', sync);
    doc.addEventListener('fullscreenerror', refused);
    doc.addEventListener('webkitfullscreenerror', refused);

    return {
      // Une seconde activation fait sortir du plein écran
      toggle: function () {
        if (isActive()) exit();
        else enter();
      },
      isActive: isActive,
      isSupported: isSupported,
    };
  }

  const api = { createFullscreen: createFullscreen };

  root.Life = root.Life || {};
  root.Life.fullscreen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
