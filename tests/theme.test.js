/*
 * Tests du thème : résolution, défilement et suivi du réglage du système.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const theme = (root.Life && root.Life.theme) || require('../src/theme.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  // matchMedia factice : on peut changer le réglage « sombre » du système
  function fakeMatchMedia(initialDark, legacy) {
    const query = { matches: initialDark, listeners: [] };
    if (legacy) query.addListener = function (fn) { query.listeners.push(fn); };
    else query.addEventListener = function (type, fn) { if (type === 'change') query.listeners.push(fn); };
    const fn = function (q) {
      assert.equal(q, '(prefers-color-scheme: dark)');
      return query;
    };
    fn.setDark = function (dark) {
      query.matches = dark;
      query.listeners.forEach(function (l) { l({ matches: dark }); });
    };
    return fn;
  }

  suite('Thème', function () {
    test('resolveTheme est juste pour les 6 combinaisons', function () {
      assert.equal(theme.resolveTheme('auto', false), 'light');
      assert.equal(theme.resolveTheme('auto', true), 'dark');
      assert.equal(theme.resolveTheme('light', false), 'light');
      assert.equal(theme.resolveTheme('light', true), 'light');
      assert.equal(theme.resolveTheme('dark', false), 'dark');
      assert.equal(theme.resolveTheme('dark', true), 'dark');
    });

    test('défilement Auto → Clair → Sombre → Auto, libellés français', function () {
      assert.equal(theme.nextTheme('auto'), 'light');
      assert.equal(theme.nextTheme('light'), 'dark');
      assert.equal(theme.nextTheme('dark'), 'auto');
      assert.deepEqual(theme.THEME_LABELS, { auto: 'Auto', light: 'Clair', dark: 'Sombre' });
      assert.ok(theme.isThemePreference('auto') && !theme.isThemePreference('violet'));
    });

    test('en mode Auto, un changement du réglage du système met à jour le thème', function () {
      const mm = fakeMatchMedia(false);
      const applied = [];
      const m = theme.createThemeManager({ matchMedia: mm, onChange: function (t) { applied.push(t); } });
      assert.deepEqual(applied, ['light'], 'thème appliqué à la création');
      mm.setDark(true);
      assert.deepEqual(applied, ['light', 'dark']);
      mm.setDark(false);
      assert.deepEqual(applied, ['light', 'dark', 'light']);
      assert.equal(m.applied(), 'light');
    });

    test('en mode Clair ou Sombre, le changement du système est ignoré', function () {
      const mm = fakeMatchMedia(false);
      const applied = [];
      const m = theme.createThemeManager({ matchMedia: mm, onChange: function (t) { applied.push(t); } });
      m.setPreference('dark');
      assert.deepEqual(applied, ['light', 'dark']);
      mm.setDark(false);
      mm.setDark(true);
      mm.setDark(false);
      assert.deepEqual(applied, ['light', 'dark'], 'Sombre reste sombre');
      m.setPreference('light');
      mm.setDark(true);
      assert.deepEqual(applied, ['light', 'dark', 'light'], 'Clair reste clair');
      m.setPreference('auto');
      assert.deepEqual(applied, ['light', 'dark', 'light', 'dark'], 'retour en Auto : suit de nouveau le système (sombre)');
    });

    test('ancienne API addListener (Safari) et préférence invalide', function () {
      const mm = fakeMatchMedia(true, true);
      const applied = [];
      const m = theme.createThemeManager({ matchMedia: mm, onChange: function (t) { applied.push(t); } });
      mm.setDark(false);
      assert.deepEqual(applied, ['dark', 'light']);
      m.setPreference('violet');
      assert.equal(m.preference(), 'auto');
      const none = theme.createThemeManager({ onChange: function (t) { applied.push(t); } });
      assert.equal(none.applied(), 'light', 'sans matchMedia : clair');
    });
  });
})(globalThis);
