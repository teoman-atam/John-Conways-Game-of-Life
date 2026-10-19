/*
 * Tests du planificateur de sauvegarde, sur horloge factice.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const sched = (root.Life && root.Life.saveScheduler) || require('../src/saveScheduler.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  function setup() {
    const env = { now: 0, writes: [] };
    env.s = sched.createSaveScheduler({
      clock: function () { return env.now; },
      write: function () { env.writes.push(env.now); },
    });
    return env;
  }

  suite('Planificateur de sauvegarde', function () {
    test('constantes : 1 s en pause, 5 s pendant la simulation', function () {
      assert.equal(sched.SAVE_DEBOUNCE_MS, 1000);
      assert.equal(sched.SAVE_INTERVAL_MS, 5000);
    });

    test('en pause, plusieurs modifications en moins de 1 s ne produisent qu\'une écriture', function () {
      const e = setup();
      for (let t = 0; t <= 900; t += 100) {
        e.now = t;
        e.s.markDirty();
        e.s.tick(false);
      }
      assert.deepEqual(e.writes, [], 'pas d\'écriture tant que les modifications continuent');
      e.now = 1899;
      e.s.tick(false);
      assert.deepEqual(e.writes, []);
      e.now = 1900;
      e.s.tick(false);
      assert.deepEqual(e.writes, [1900], '1 s après la dernière modification');
      e.now = 5000;
      e.s.tick(false);
      assert.equal(e.writes.length, 1, 'rien de plus sans nouvelle modification');
    });

    test('pendant la simulation, au plus une écriture par période de 5 s', function () {
      const e = setup();
      for (let t = 0; t <= 20000; t += 16) {
        e.now = t;
        e.s.markDirty(); // une génération par image
        e.s.tick(true);
      }
      assert.ok(e.writes.length >= 4 && e.writes.length <= 5, e.writes.length + ' écritures');
      for (let i = 1; i < e.writes.length; i++) assert.ok(e.writes[i] - e.writes[i - 1] >= 5000, 'écart ' + (e.writes[i] - e.writes[i - 1]));
    });

    test('flush (pagehide, page cachée, mise en pause) force une écriture immédiate', function () {
      const e = setup();
      e.now = 100;
      e.s.markDirty();
      e.now = 150;
      assert.equal(e.s.flush(), true);
      assert.deepEqual(e.writes, [150]);
      assert.equal(e.s.flush(), false, 'rien à écrire');
      assert.equal(e.writes.length, 1);
      e.s.markDirty();
      e.s.clear();
      assert.equal(e.s.flush(), false, 'modification oubliée');
    });

    test('après une écriture pendant la simulation, une pause écrit tout de suite', function () {
      const e = setup();
      e.now = 0;
      e.s.markDirty();
      e.s.tick(true);
      e.now = 1200;
      e.s.markDirty();
      e.s.tick(true);
      assert.deepEqual(e.writes, [0]);
      e.s.flush();
      assert.deepEqual(e.writes, [0, 1200]);
      assert.throws(function () { sched.createSaveScheduler({}); }, /clock et write/);
    });
  });
})(globalThis);
