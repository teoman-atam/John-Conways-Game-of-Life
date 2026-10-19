/*
 * Tests de la détection d'extinction, de stabilité et d'oscillation.
 */
(function (root) {
  'use strict';

  const T = root.LifeTests || require('./harness.js');
  const engine = (root.Life && root.Life.engine) || require('../src/engine.js');
  const patterns = (root.Life && root.Life.patterns) || require('../src/patterns.js');
  const detection = (root.Life && root.Life.detection) || require('../src/detection.js');
  const suite = T.suite, test = T.test, assert = T.assert;

  // Fait évoluer un motif et renvoie le résultat de détection de chaque génération (index 1 à n)
  function run(start, generations, options) {
    const d = detection.createDetector(options);
    d.push(start);
    const results = [null];
    let cells = start;
    for (let g = 1; g <= generations; g++) {
      cells = engine.nextGeneration(cells);
      results.push(d.observe(cells));
    }
    return results;
  }

  const PENTADECATHLON = engine.fromMatrix([
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    [1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
  ]);

  suite('Détection — états connus', function () {
    test('une grille vide signale une extinction', function () {
      const d = detection.createDetector();
      d.push(new Set(['0,0']));
      assert.deepEqual(d.observe(new Set()), { kind: 'extinct', period: 0 });
      assert.deepEqual(run(new Set(['0,0']), 1)[1], { kind: 'extinct', period: 0 }, 'cellule isolée qui meurt');
    });

    test('un bloc signale un état stable dès la génération 1', function () {
      assert.deepEqual(run(patterns.cells('block'), 1)[1], { kind: 'stable', period: 1 });
    });

    test('un clignotant signale la période 2', function () {
      const r = run(patterns.cells('blinker'), 2);
      assert.equal(r[1], null, 'rien à la génération 1');
      assert.deepEqual(r[2], { kind: 'oscillator', period: 2 });
    });

    test('un pulsar signale la période 3', function () {
      const r = run(patterns.cells('pulsar'), 3);
      assert.equal(r[1], null);
      assert.equal(r[2], null);
      assert.deepEqual(r[3], { kind: 'oscillator', period: 3 });
    });

    test('un pentadécathlon signale la période 15', function () {
      const r = run(PENTADECATHLON, 15);
      for (let g = 1; g < 15; g++) assert.equal(r[g], null, 'génération ' + g);
      assert.deepEqual(r[15], { kind: 'oscillator', period: 15 });
    });

    test('un planeur n\'est jamais détecté sur 200 générations', function () {
      const r = run(patterns.cells('glider'), 200);
      assert.ok(r.every(function (x) { return x === null; }));
    });

    test('un canon de Gosper n\'est jamais détecté sur 240 générations', function () {
      const r = run(patterns.cells('gosper-gun'), 240);
      assert.ok(r.every(function (x) { return x === null; }));
    });
  });

  suite('Détection — robustesse', function () {
    test('une empreinte injectée constante ne produit aucun faux positif', function () {
      const constant = { fingerprint: function () { return 'toujours la même'; } };
      const glider = run(patterns.cells('glider'), 200, constant);
      assert.ok(glider.every(function (x) { return x === null; }), 'planeur : rien');
      const blinker = run(patterns.cells('blinker'), 2, constant);
      assert.deepEqual(blinker[2], { kind: 'oscillator', period: 2 }, 'la comparaison exacte confirme le vrai cas');
    });

    test('un oscillateur de période supérieure à 30 n\'est pas signalé', function () {
      // Suite artificielle de 31 états distincts qui se répète (période 31)
      const states = [];
      for (let i = 0; i < 31; i++) states.push(new Set([i + ',0', '0,' + (i + 1)]));
      const d = detection.createDetector();
      d.push(states[0]);
      for (let g = 1; g <= 93; g++) assert.equal(d.observe(states[g % 31]), null, 'génération ' + g);
      assert.equal(detection.PERIOD_MAX, 30);
      // Témoin : la même suite de période 30 est bien détectée
      const d30 = detection.createDetector();
      d30.push(states[0]);
      let found = null;
      for (let g = 1; g <= 30 && !found; g++) found = d30.observe(states[g % 30]);
      assert.deepEqual(found, { kind: 'oscillator', period: 30 });
    });

    test('empreinte indépendante de l\'ordre d\'insertion', function () {
      const a = new Set(['1,2', '-3,4', '5,-6']);
      const b = new Set(['5,-6', '1,2', '-3,4']);
      assert.equal(detection.fingerprint(a), detection.fingerprint(b));
      assert.notEqual(detection.fingerprint(a), detection.fingerprint(new Set(['1,2', '-3,4', '5,-7'])));
      assert.ok(detection.sameCells(a, b));
    });

    test('messages : extinction, état stable, oscillateur', function () {
      assert.equal(detection.describe({ kind: 'extinct', period: 0 }, 7), 'Population éteinte à la génération 7');
      assert.equal(detection.describe({ kind: 'stable', period: 1 }, 1), 'État stable à la génération 1');
      assert.equal(detection.describe({ kind: 'oscillator', period: 3 }, 12), 'Oscillateur de période 3 à la génération 12');
      assert.equal(detection.describe({ kind: 'stable', period: 1 }, 12345), 'État stable à la génération 12\u00a0345');
    });
  });
})(globalThis);
