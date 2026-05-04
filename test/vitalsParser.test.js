const assert = require('assert');
const { parseVitals } = require('../services/chatService');

exports.tests = [
  {
    name: 'parses a full vitals marker',
    fn: () => {
      const r = parseVitals('Patient stable.\n[Vitals: hr=90, bp=120/80, rr=16, spo2=98, gcs=15]');
      assert.deepStrictEqual(r, { hr: 90, bp: '120/80', rr: 16, spo2: 98, gcs: 15 });
    },
  },
  {
    name: 'returns null when no marker',
    fn: () => assert.strictEqual(parseVitals('just chatting'), null),
  },
  {
    name: 'parses partial keys',
    fn: () => {
      assert.deepStrictEqual(parseVitals('[Vitals: spo2=99]'), { spo2: 99 });
    },
  },
];
