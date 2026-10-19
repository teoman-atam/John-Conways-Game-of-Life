/*
 * Mini-exécuteur de tests écrit à la main, commun au navigateur et à Node.
 * Les fichiers de tests appellent suite() et test() ; run() exécute tout.
 */
(function (root) {
  'use strict';

  const registered = [];
  let currentSuite = '';

  function suite(name, body) {
    const previous = currentSuite;
    currentSuite = name;
    try {
      body();
    } finally {
      currentSuite = previous;
    }
  }

  function test(name, fn) {
    registered.push({ suite: currentSuite, name: name, fn: fn });
  }

  class AssertionError extends Error {}

  function format(value) {
    if (value instanceof Set) return 'Set(' + JSON.stringify(Array.from(value).sort()) + ')';
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  function fail(message, detail) {
    throw new AssertionError(message + (detail ? ' — ' + detail : ''));
  }

  function deepEqualValues(a, b) {
    if (Object.is(a, b)) return true;
    if (a instanceof Set || b instanceof Set) {
      if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
      for (const v of a) if (!b.has(v)) return false;
      return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqualValues(a[i], b[i])) return false;
      return true;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (const k of ka) if (!deepEqualValues(a[k], b[k])) return false;
      return true;
    }
    return false;
  }

  const assert = {
    ok: function (value, message) {
      if (!value) fail(message || 'valeur fausse', format(value));
    },
    equal: function (actual, expected, message) {
      if (!Object.is(actual, expected)) {
        fail(message || 'valeurs différentes', 'obtenu ' + format(actual) + ', attendu ' + format(expected));
      }
    },
    notEqual: function (actual, unexpected, message) {
      if (Object.is(actual, unexpected)) fail(message || 'valeurs identiques', format(actual));
    },
    near: function (actual, expected, epsilon, message) {
      if (!(Math.abs(actual - expected) <= epsilon)) {
        fail(message || 'écart trop grand', 'obtenu ' + actual + ', attendu ' + expected + ' ± ' + epsilon);
      }
    },
    deepEqual: function (actual, expected, message) {
      if (!deepEqualValues(actual, expected)) {
        fail(message || 'structures différentes', 'obtenu ' + format(actual) + ', attendu ' + format(expected));
      }
    },
    notDeepEqual: function (actual, unexpected, message) {
      if (deepEqualValues(actual, unexpected)) fail(message || 'structures identiques', format(actual));
    },
    // Vérifie qu'une erreur est levée et que son message correspond au motif
    throws: function (fn, pattern, message) {
      let thrown = null;
      try {
        fn();
      } catch (err) {
        thrown = err;
      }
      if (!thrown) fail(message || 'aucune erreur levée');
      if (thrown instanceof AssertionError) throw thrown;
      if (pattern && !pattern.test(String(thrown.message))) {
        fail(message || 'message d\'erreur inattendu', '"' + thrown.message + '" ne correspond pas à ' + pattern);
      }
      return thrown;
    },
  };

  function run() {
    const results = [];
    for (const t of registered) {
      const started = Date.now();
      try {
        t.fn();
        results.push({ suite: t.suite, name: t.name, ok: true, ms: Date.now() - started });
      } catch (err) {
        results.push({
          suite: t.suite,
          name: t.name,
          ok: false,
          ms: Date.now() - started,
          error: err && err.message ? err.message : String(err),
        });
      }
    }
    const passed = results.filter(function (r) { return r.ok; }).length;
    return { total: results.length, passed: passed, failed: results.length - passed, results: results };
  }

  const api = { suite: suite, test: test, assert: assert, run: run };

  root.LifeTests = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
