'use strict';
/* SQLite persistence (built into Node 22+). Collections are stored as JSON documents. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'bothelec.db'));
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (coll, id));
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
  const q = {
    all: db.prepare('SELECT data FROM docs WHERE coll = ?'),
    put: db.prepare('INSERT INTO docs (coll, id, data) VALUES (?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET data = excluded.data'),
    del: db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?'),
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'),
    kvSet: db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v'),
    sGet: db.prepare('SELECT user_id, expires FROM sessions WHERE token = ?'),
    sPut: db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)'),
    sDel: db.prepare('DELETE FROM sessions WHERE token = ?'),
    sDelUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    sPurge: db.prepare('DELETE FROM sessions WHERE expires < ?'),
  };
  return {
    raw: db,
    all: coll => q.all.all(coll).map(r => JSON.parse(r.data)),
    put: (coll, obj) => q.put.run(coll, String(obj.id), JSON.stringify(obj)),
    del: (coll, id) => q.del.run(coll, String(id)),
    kv: (k, def) => { const r = q.kvGet.get(k); return r ? JSON.parse(r.v) : def; },
    setKv: (k, v) => q.kvSet.run(k, JSON.stringify(v)),
    session: {
      get: t => { const r = q.sGet.get(t); return r && r.expires > Date.now() ? r.user_id : null; },
      create: (t, uid, ttl) => q.sPut.run(t, uid, Date.now() + ttl),
      del: t => q.sDel.run(t),
      delUser: uid => q.sDelUser.run(uid),
      purge: () => q.sPurge.run(Date.now()),
    },
    tx(fn) { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}

module.exports = { openDb };
