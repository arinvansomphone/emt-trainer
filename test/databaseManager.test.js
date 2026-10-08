const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resetForTests, getDb } = require('../database/databaseManager');

exports.tests = [
  {
    name: 'DB_PATH env var sets the database file and creates its directory',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emt-db-'));
      const file = path.join(dir, 'nested', 'emt.db');
      const prev = process.env.DB_PATH;
      process.env.DB_PATH = file;
      try {
        resetForTests();
        getDb();
        assert.ok(fs.existsSync(file));
      } finally {
        resetForTests();
        if (prev === undefined) delete process.env.DB_PATH;
        else process.env.DB_PATH = prev;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];
