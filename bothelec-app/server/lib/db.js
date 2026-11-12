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
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS readings (meter TEXT NOT NULL, ts TEXT NOT NULL, value REAL NOT NULL, source TEXT, by TEXT, note TEXT, photo TEXT, PRIMARY KEY (meter, ts));`);
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
  const r = {
    put: db.prepare('INSERT INTO readings (meter, ts, value, source, by, note, photo) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (meter, ts) DO UPDATE SET value = excluded.value, source = excluded.source, by = excluded.by, note = excluded.note, photo = excluded.photo'),
    latest: db.prepare('SELECT * FROM readings WHERE meter = ? ORDER BY ts DESC LIMIT 1'),
    before: db.prepare('SELECT * FROM readings WHERE meter = ? AND ts <= ? ORDER BY ts DESC LIMIT 1'),
    after: db.prepare('SELECT * FROM readings WHERE meter = ? AND ts >= ? ORDER BY ts ASC LIMIT 1'),
    range: db.prepare('SELECT * FROM readings WHERE meter = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC LIMIT ?'),
    del: db.prepare('DELETE FROM readings WHERE meter = ? AND ts = ?'),
    rename: db.prepare('UPDATE readings SET meter = ? WHERE meter = ?'),
  };
  return {
    readings: {
      put: (m, ts, v, source, by, note, photo) => r.put.run(m, ts, v, source || '', by || '', note || '', photo || ''),
      latest: m => r.latest.get(m) || null,
      before: (m, ts) => r.before.get(m, ts) || null,
      after: (m, ts) => r.after.get(m, ts) || null,
      range: (m, from, to, limit = 5000) => r.range.all(m, from, to, limit),
      del: (m, ts) => r.del.run(m, ts),
      rename: (from, to) => r.rename.run(to, from),
    },
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
