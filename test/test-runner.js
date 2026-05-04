const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const files = fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js'));

let passed = 0;
let failed = 0;
const failures = [];

(async () => {
  for (const file of files) {
    const mod = require(path.join(testDir, file));
    const tests = mod.tests || [];
    for (const t of tests) {
      try {
        await t.fn();
        passed++;
        console.log(`  ✓ ${file} :: ${t.name}`);
      } catch (err) {
        failed++;
        failures.push({ file, name: t.name, err });
        console.log(`  ✗ ${file} :: ${t.name}`);
      }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) {
      console.log(`\n--- ${f.file} :: ${f.name} ---`);
      console.log(f.err.stack || f.err.message);
    }
    process.exit(1);
  }
})();
