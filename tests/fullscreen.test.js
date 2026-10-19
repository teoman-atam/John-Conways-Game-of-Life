/*
 * Tests du plein écran, sur un document factice.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const fullscreen = (root.Life && root.Life.fullscreen) || require('../src/fullscreen.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  // Promesse factice synchrone : le test peut vérifier le résultat sans attendre
  function settled(ok) {
    return {
      then: function (onOk, onErr) {
        if (ok) { if (onOk) onOk(); } else if (onErr) onErr(new TypeError('Permissions check failed'));
      },
    };
  }

  // Document factice ; mode : 'standard', 'webkit', 'none', 'reject' ou 'throw'
  function fakeDocument(mode) {
    const listeners = {};
    const calls = [];
    const doc = {
      fullscreenElement: null,
      webkitFullscreenElement: null,
      addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      dispatch: function (type) { (listeners[type] || []).forEach(function (fn) { fn({ type: type }); }); },
      calls: calls,
    };
    const el = {};
    if (mode === 'standard' || mode === 'reject' || mode === 'throw') {
      el.requestFullscreen = function () {
        calls.push('requestFullscreen');
        if (mode === 'throw') throw new TypeError('refusé');
        if (mode === 'reject') return settled(false);
        doc.fullscreenElement = el;
        doc.dispatch('fullscreenchange');
        return settled(true);
      };
      doc.exitFullscreen = function () {
        calls.push('exitFullscreen');
        doc.fullscreenElement = null;
        doc.dispatch('fullscreenchange');
        return settled(true);
      };
    }
    if (mode === 'webkit') {
      el.webkitRequestFullscreen = function () {
        calls.push('webkitRequestFullscreen');
        doc.webkitFullscreenElement = el;
        doc.dispatch('webkitfullscreenchange');
      };
      doc.webkitExitFullscreen = function () {
        calls.push('webkitExitFullscreen');
        doc.webkitFullscreenElement = null;
        doc.dispatch('webkitfullscreenchange');
      };
    }
    doc.documentElement = el;
    return doc;
  }

  function setup(mode) {
    const doc = fakeDocument(mode);
    const log = { changes: [], messages: [] };
    const fs = fullscreen.createFullscreen(doc, {
      onChange: function (active) { log.changes.push(active); },
      onMessage: function (text) { log.messages.push(text); },
    });
    return { doc: doc, fs: fs, log: log };
  }

  suite('Plein écran', function () {
    test('la bascule appelle requestFullscreen sur toute l\'application, puis exitFullscreen', function () {
      const e = setup('standard');
      e.fs.toggle();
      assert.deepEqual(e.doc.calls, ['requestFullscreen']);
      assert.equal(e.fs.isActive(), true);
      e.fs.toggle();
      assert.deepEqual(e.doc.calls, ['requestFullscreen', 'exitFullscreen']);
      assert.deepEqual(e.log.changes, [true, false], 'l\'état suit fullscreenchange');
      assert.deepEqual(e.log.messages, []);
    });

    test('repli webkit quand l\'API standard est absente (Safari)', function () {
      const e = setup('webkit');
      e.fs.toggle();
      e.fs.toggle();
      assert.deepEqual(e.doc.calls, ['webkitRequestFullscreen', 'webkitExitFullscreen']);
      assert.deepEqual(e.log.changes, [true, false]);
    });

    test('une promesse rejetée ou une exception produit un message, sans plantage', function () {
      const r = setup('reject');
      r.fs.toggle();
      assert.deepEqual(r.log.messages, ['Le plein écran a été refusé par le navigateur.']);
      assert.equal(r.fs.isActive(), false);
      const t = setup('throw');
      t.fs.toggle();
      assert.equal(t.log.messages.length, 1);
      const n = setup('none');
      n.fs.toggle();
      assert.ok(/pas pris en charge/.test(n.log.messages[0]));
      const err = setup('standard');
      err.doc.dispatch('fullscreenerror');
      assert.equal(err.log.messages.length, 1, 'événement fullscreenerror');
    });

    test('une sortie externe (Échap, navigateur) met à jour l\'état', function () {
      const e = setup('standard');
      e.fs.toggle();
      // Le navigateur sort du plein écran sans passer par l'application
      e.doc.fullscreenElement = null;
      e.doc.dispatch('fullscreenchange');
      assert.equal(e.fs.isActive(), false);
      assert.deepEqual(e.log.changes, [true, false]);
      e.fs.toggle();
      assert.deepEqual(e.doc.calls, ['requestFullscreen', 'requestFullscreen'], 'nouvelle entrée, pas une sortie');
      const w = setup('webkit');
      w.fs.toggle();
      w.doc.webkitFullscreenElement = null;
      w.doc.dispatch('webkitfullscreenchange');
      assert.deepEqual(w.log.changes, [true, false]);
    });
  });
})(globalThis);
