/*
 * Planificateur de la sauvegarde automatique, horloge injectée.
 * - En pause : écriture 1 s après la dernière modification (anti-rebond).
 * - Pendant la simulation ou un saut : au plus une écriture toutes les 5 s.
 * - flush() écrit tout de suite s'il reste une modification : mise en pause, pagehide,
 *   page cachée.
 */
(function (root) {
  'use strict';

  const SAVE_DEBOUNCE_MS = 1000;
  const SAVE_INTERVAL_MS = 5000;

  // options : { clock, write, debounceMs, intervalMs } ; write() effectue l'écriture
  function createSaveScheduler(options) {
    const opts = options || {};
    if (typeof opts.clock !== 'function' || typeof opts.write !== 'function') {
      throw new TypeError('createSaveScheduler : clock et write doivent être des fonctions');
    }
    const clock = opts.clock;
    const write = opts.write;
    const debounceMs = opts.debounceMs === undefined ? SAVE_DEBOUNCE_MS : opts.debounceMs;
    const intervalMs = opts.intervalMs === undefined ? SAVE_INTERVAL_MS : opts.intervalMs;
    let dirty = false;
    let lastChange = -Infinity;
    let lastWrite = -Infinity;

    function doWrite() {
      dirty = false;
      lastWrite = clock();
      write();
      return true;
    }

    return {
      // Signale une modification à sauvegarder
      markDirty: function () {
        dirty = true;
        lastChange = clock();
      },
      // À appeler régulièrement ; busy : simulation ou saut en cours. Renvoie true si une écriture a eu lieu
      tick: function (busy) {
        if (!dirty) return false;
        const now = clock();
        if (busy ? now - lastWrite >= intervalMs : now - lastChange >= debounceMs) return doWrite();
        return false;
      },
      // Écriture immédiate s'il reste une modification
      flush: function () {
        return dirty ? doWrite() : false;
      },
      // Oublie la modification en attente (après suppression de la sauvegarde, par exemple)
      clear: function () {
        dirty = false;
      },
      isDirty: function () { return dirty; },
    };
  }

  const api = {
    SAVE_DEBOUNCE_MS: SAVE_DEBOUNCE_MS,
    SAVE_INTERVAL_MS: SAVE_INTERVAL_MS,
    createSaveScheduler: createSaveScheduler,
  };

  root.Life = root.Life || {};
  root.Life.saveScheduler = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
