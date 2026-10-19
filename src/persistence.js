/*
 * Sauvegarde locale : sérialisation en JSON versionné et relecture validée.
 * Les cellules sont encodées en RLE (src/rle.js) ; le coin haut gauche de leur boîte
 * englobante est stocké à part pour conserver les coordonnées absolues.
 * deserialize ne lève jamais d'exception : toute anomalie donne { ok: false, error }.
 *
 *   { schemaVersion: 1, savedAt, cells: { originX, originY, rle },
 *     camera: { centerX, centerY, cellSize },
 *     settings: { speed, density, jumpCount, theme, ageColors, autoPause, chartVisible, panelCollapsed,
 *                 minimapVisible (facultatif) } }
 *
 * Champ facultatif ajouté sans changer schemaVersion : settings.minimapVisible. Absent (sauvegarde
 * plus ancienne), il prend sa valeur par défaut ; il est passé et relu à part, dans `optional`,
 * pour que `settings` garde exactement les mêmes champs qu'avant.
 */
(function (root) {
  'use strict';

  const engine = (root.Life && root.Life.engine) || require('./engine.js');
  const camera = (root.Life && root.Life.camera) || require('./camera.js');
  const transform = (root.Life && root.Life.transform) || require('./transform.js');
  const rle = (root.Life && root.Life.rle) || require('./rle.js');
  const theme = (root.Life && root.Life.theme) || require('./theme.js');

  const SCHEMA_VERSION = 1;
  // Clé unique et préfixée : le stockage local est partagé par toutes les pages ouvertes en file://
  const STORAGE_KEY = 'jeu-de-la-vie:sauvegarde';

  const BOOLEAN_SETTINGS = ['ageColors', 'autoPause', 'chartVisible', 'panelCollapsed'];
  // Réglages facultatifs (booléens) et leur valeur quand ils sont absents
  const OPTIONAL_DEFAULTS = { minimapVisible: true };

  // Ajoute à settings les réglages facultatifs fournis (booléens seulement)
  function addOptional(settings, optional) {
    if (!optional) return settings;
    for (const name of Object.keys(OPTIONAL_DEFAULTS)) {
      if (typeof optional[name] === 'boolean') settings[name] = optional[name];
    }
    return settings;
  }

  // state : { cells, camera: { centerX, centerY, cellSize }, settings, savedAt, optional (facultatif) }
  function serialize(state) {
    const shape = transform.shapeFromCells(state.cells);
    const box = engine.boundingBox(state.cells);
    const s = state.settings;
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      savedAt: typeof state.savedAt === 'number' ? state.savedAt : null,
      cells: { originX: box ? box.minX : 0, originY: box ? box.minY : 0, rle: rle.write(shape) },
      camera: { centerX: state.camera.centerX, centerY: state.camera.centerY, cellSize: state.camera.cellSize },
      settings: addOptional({
        speed: s.speed,
        density: s.density,
        jumpCount: s.jumpCount,
        theme: s.theme,
        ageColors: s.ageColors,
        autoPause: s.autoPause,
        chartVisible: s.chartVisible,
        panelCollapsed: s.panelCollapsed,
      }, state.optional),
    });
  }

  function failure(message) {
    return { ok: false, error: message };
  }

  /*
   * Relit une sauvegarde. limits : { maxCells, minSpeed, maxSpeed, minDensity, maxDensity, minJump, maxJump }.
   * Renvoie { ok: true, value: { cells, camera, settings, savedAt, optional } } ou { ok: false, error }.
   */
  function deserialize(text, limits) {
    const L = limits || {};
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return failure('JSON invalide');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return failure('objet JSON attendu');
    if (data.schemaVersion !== SCHEMA_VERSION) {
      return failure('version de format inconnue (' + JSON.stringify(data.schemaVersion) + ', attendu ' + SCHEMA_VERSION + ')');
    }
    for (const part of ['cells', 'camera', 'settings']) {
      if (!data[part] || typeof data[part] !== 'object') return failure('champ manquant : ' + part);
    }

    // Réglages
    const s = data.settings;
    const integers = [
      ['speed', L.minSpeed, L.maxSpeed],
      ['density', L.minDensity, L.maxDensity],
      ['jumpCount', L.minJump, L.maxJump],
    ];
    for (const spec of integers) {
      const v = s[spec[0]];
      if (v === undefined) return failure('champ manquant : settings.' + spec[0]);
      if (!Number.isInteger(v) || v < spec[1] || v > spec[2]) {
        return failure('champ hors bornes : settings.' + spec[0] + ' = ' + JSON.stringify(v) +
          ' (attendu de ' + spec[1] + ' à ' + spec[2] + ')');
      }
    }
    if (s.theme === undefined) return failure('champ manquant : settings.theme');
    if (!theme.isThemePreference(s.theme)) return failure('champ hors bornes : settings.theme = ' + JSON.stringify(s.theme));
    for (const name of BOOLEAN_SETTINGS) {
      if (s[name] === undefined) return failure('champ manquant : settings.' + name);
      if (typeof s[name] !== 'boolean') return failure('champ invalide : settings.' + name + ' doit valoir true ou false');
    }
    // Réglages facultatifs : absents, valeur par défaut ; présents, booléens comme les autres
    const optional = {};
    for (const name of Object.keys(OPTIONAL_DEFAULTS)) {
      if (s[name] !== undefined && typeof s[name] !== 'boolean') {
        return failure('champ invalide : settings.' + name + ' doit valoir true ou false');
      }
      optional[name] = s[name] === undefined ? OPTIONAL_DEFAULTS[name] : s[name];
    }

    // Caméra
    const c = data.camera;
    for (const name of ['centerX', 'centerY', 'cellSize']) {
      if (c[name] === undefined) return failure('champ manquant : camera.' + name);
      if (typeof c[name] !== 'number' || !Number.isFinite(c[name])) return failure('champ invalide : camera.' + name);
    }
    if (Math.abs(c.centerX) > Number.MAX_SAFE_INTEGER || Math.abs(c.centerY) > Number.MAX_SAFE_INTEGER) {
      return failure('champ hors bornes : centre de la caméra');
    }
    if (c.cellSize < camera.MIN_CELL_SIZE || c.cellSize > camera.MAX_CELL_SIZE) {
      return failure('champ hors bornes : camera.cellSize = ' + c.cellSize + ' (attendu de ' + camera.MIN_CELL_SIZE +
        ' à ' + camera.MAX_CELL_SIZE + ')');
    }

    // Cellules
    const cells = data.cells;
    for (const name of ['originX', 'originY', 'rle']) {
      if (cells[name] === undefined) return failure('champ manquant : cells.' + name);
    }
    if (!Number.isSafeInteger(cells.originX) || !Number.isSafeInteger(cells.originY)) {
      return failure('champ invalide : origine des cellules');
    }
    if (typeof cells.rle !== 'string') return failure('champ invalide : cells.rle');
    let restored;
    try {
      const shape = rle.parse(cells.rle, { maxCells: L.maxCells });
      restored = transform.placeShape(shape, cells.originX, cells.originY);
    } catch (err) {
      return failure('cellules : ' + err.message);
    }

    return {
      ok: true,
      value: {
        cells: restored,
        camera: { centerX: c.centerX, centerY: c.centerY, cellSize: c.cellSize },
        settings: {
          speed: s.speed,
          density: s.density,
          jumpCount: s.jumpCount,
          theme: s.theme,
          ageColors: s.ageColors,
          autoPause: s.autoPause,
          chartVisible: s.chartVisible,
          panelCollapsed: s.panelCollapsed,
        },
        savedAt: typeof data.savedAt === 'number' ? data.savedAt : null,
        optional: optional,
      },
    };
  }

  /*
   * Réglages facultatifs d'une sauvegarde déjà validée par deserialize, sans relire les cellules.
   * Toute anomalie donne les valeurs par défaut ; ne lève jamais d'exception.
   */
  function readOptional(text) {
    const out = Object.assign({}, OPTIONAL_DEFAULTS);
    try {
      const s = JSON.parse(text).settings;
      for (const name of Object.keys(OPTIONAL_DEFAULTS)) {
        if (s && typeof s[name] === 'boolean') out[name] = s[name];
      }
    } catch (err) {
      // texte illisible : valeurs par défaut
    }
    return out;
  }

  // Écrit des réglages facultatifs dans le texte d'une sauvegarde ; null si ce n'en est pas une
  function writeOptional(text, optional) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return null;
    }
    if (!data || typeof data !== 'object' || !data.settings || typeof data.settings !== 'object') return null;
    addOptional(data.settings, optional);
    return JSON.stringify(data);
  }

  /*
   * Stockage qui complète chaque sauvegarde écrite sous la clé avec les réglages facultatifs
   * courants (provider() → { minimapVisible }). Lecture et suppression sont inchangées ; les
   * erreurs du stockage (quota, accès refusé) remontent telles quelles à l'appelant.
   */
  function withOptionalSettings(storage, provider, key) {
    const saveKey = key || STORAGE_KEY;
    return {
      getItem: function (k) { return storage.getItem(k); },
      setItem: function (k, v) {
        const text = k === saveKey ? writeOptional(v, provider()) : null;
        storage.setItem(k, text === null ? v : text);
      },
      removeItem: function (k) { storage.removeItem(k); },
    };
  }

  const api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    OPTIONAL_DEFAULTS: OPTIONAL_DEFAULTS,
    serialize: serialize,
    deserialize: deserialize,
    readOptional: readOptional,
    writeOptional: writeOptional,
    withOptionalSettings: withOptionalSettings,
  };

  root.Life = root.Life || {};
  root.Life.persistence = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
