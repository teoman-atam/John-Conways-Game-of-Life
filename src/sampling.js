/*
 * Série des populations (une valeur par génération depuis le compteur 0) et sa réduction
 * à une largeur en pixels pour le graphique.
 */
(function (root) {
  'use strict';

  // Nombre maximal de générations enregistrées pour le graphique
  const SERIES_MAX = 1000000;

  /*
   * Réduit une série à au plus `width` tranches. Chaque tranche garde le minimum et le
   * maximum de ses points, pour que les pics restent visibles. Renvoie { min, max, count }.
   */
  function downsample(series, width) {
    const n = series.length;
    const buckets = Math.max(0, Math.min(n, Math.floor(width)));
    const min = new Array(buckets);
    const max = new Array(buckets);
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor(b * n / buckets);
      const to = Math.floor((b + 1) * n / buckets);
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = from; i < to; i++) {
        const v = series[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min[b] = lo;
      max[b] = hi;
    }
    return { min: min, max: max, count: buckets };
  }

  /*
   * Série bornée de populations. push renvoie false quand la limite est atteinte :
   * l'enregistrement s'arrête et truncated passe à true.
   */
  function createSeries(limit) {
    const cap = limit === undefined ? SERIES_MAX : limit;
    let data = new Uint32Array(Math.min(cap, 1024));
    let length = 0;
    let maxValue = 0;
    let truncated = false;

    function push(value) {
      if (length >= cap) {
        truncated = true;
        return false;
      }
      if (length === data.length) {
        const grown = new Uint32Array(Math.min(cap, data.length * 2));
        grown.set(data);
        data = grown;
      }
      data[length++] = value;
      if (value > maxValue) maxValue = value;
      return true;
    }

    function pop() {
      if (length === 0) return undefined;
      const value = data[--length];
      if (value === maxValue) {
        maxValue = 0;
        for (let i = 0; i < length; i++) if (data[i] > maxValue) maxValue = data[i];
      }
      return value;
    }

    // Vide la série et la fait repartir de la population au compteur 0
    function reset(first) {
      length = 0;
      maxValue = 0;
      truncated = false;
      if (first !== undefined) push(first);
    }

    return {
      push: push,
      pop: pop,
      reset: reset,
      length: function () { return length; },
      max: function () { return maxValue; },
      last: function () { return length ? data[length - 1] : undefined; },
      truncated: function () { return truncated; },
      // Vue en lecture seule sur les valeurs enregistrées
      values: function () { return data.subarray(0, length); },
    };
  }

  const api = { SERIES_MAX: SERIES_MAX, downsample: downsample, createSeries: createSeries };

  root.Life = root.Life || {};
  root.Life.sampling = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
