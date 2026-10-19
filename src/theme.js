/*
 * Thème de l'interface : préférence « auto », « light » ou « dark ».
 * En « auto », le thème suit le réglage du système, y compris s'il change pendant
 * que la page est ouverte. matchMedia est injecté : aucun accès direct au DOM.
 */
(function (root) {
  'use strict';

  const THEME_PREFERENCES = ['auto', 'light', 'dark'];
  const THEME_LABELS = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };
  const DARK_QUERY = '(prefers-color-scheme: dark)';

  function isThemePreference(value) {
    return THEME_PREFERENCES.indexOf(value) >= 0;
  }

  // Thème réellement appliqué : "light" ou "dark"
  function resolveTheme(preference, systemPrefersDark) {
    if (preference === 'light') return 'light';
    if (preference === 'dark') return 'dark';
    return systemPrefersDark ? 'dark' : 'light';
  }

  // Ordre de défilement : Auto → Clair → Sombre → Auto
  function nextTheme(preference) {
    const i = THEME_PREFERENCES.indexOf(preference);
    return THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length];
  }

  /*
   * Suit la préférence et le réglage du système ; onChange(theme) est appelé
   * à la création puis à chaque changement du thème appliqué.
   */
  function createThemeManager(options) {
    const opts = options || {};
    const onChange = opts.onChange || function () {};
    const query = typeof opts.matchMedia === 'function' ? opts.matchMedia(DARK_QUERY) : null;
    let preference = 'auto';
    let applied = null;

    function update() {
      const next = resolveTheme(preference, !!(query && query.matches));
      if (next === applied) return;
      applied = next;
      onChange(next);
    }

    if (query) {
      if (query.addEventListener) query.addEventListener('change', update);
      else if (query.addListener) query.addListener(update);
    }
    update();

    return {
      setPreference: function (value) {
        preference = isThemePreference(value) ? value : 'auto';
        update();
      },
      preference: function () { return preference; },
      applied: function () { return applied; },
    };
  }

  const api = {
    THEME_PREFERENCES: THEME_PREFERENCES,
    THEME_LABELS: THEME_LABELS,
    isThemePreference: isThemePreference,
    resolveTheme: resolveTheme,
    nextTheme: nextTheme,
    createThemeManager: createThemeManager,
  };

  root.Life = root.Life || {};
  root.Life.theme = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
