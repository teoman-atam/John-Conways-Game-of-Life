/*
 * Lance sous Node les mêmes tests que tests/tests.html.
 * Pour garantir qu'il s'agit exactement des mêmes fichiers, la liste des scripts
 * est lue dans tests.html (balises <script src="…">), dans le même ordre.
 * Usage : node tests/run-node.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'tests.html'), 'utf8');
const sources = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), function (m) { return m[1]; });
if (sources.length === 0) {
  console.error('Aucun script trouvé dans tests/tests.html');
  process.exit(1);
}
for (const src of sources) require(path.resolve(__dirname, src));

const report = globalThis.LifeTests.run();
let lastSuite = null;
for (const r of report.results) {
  if (r.suite !== lastSuite) {
    console.log('\n' + r.suite);
    lastSuite = r.suite;
  }
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '\n      → ' + r.error));
}
console.log('\n' + report.total + ' tests exécutés, ' + report.passed + ' réussis, ' + report.failed + ' échoués.');
process.exitCode = report.failed === 0 ? 0 : 1;
