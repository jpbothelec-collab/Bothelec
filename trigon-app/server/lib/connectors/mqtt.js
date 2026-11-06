'use strict';
/* MQTT subscriber. For 4G routers / gateways that publish BMS readings (e.g. Teltonika
 * "Modbus TCP/Serial → MQTT", Data to Server, Node-RED, many BMS gateways).
 *
 * Connector config: { type: "mqtt", url: "mqtt://broker:1883", username, password, topic: "trigon/B1/#",
 *   jsonMap: { "payloadKey": "zones.L1-W.temp", ... },        // JSON payload {key: value}
 *   points: [ { topic: "site/ahu2/status", path, jsonKey?, scale, map } ] }  // one topic per point
 * Payloads already shaped as { "values": { "<path>": value } } are applied as-is. */
const { transform } = require('../util');

function topicMatch(filter, topic) {
  const f = filter.split('/'), t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}
const getKey = (obj, key) => String(key).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function mapMessage(c, topic, payload) {
  const values = {};
  const text = payload.toString();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  if (json && typeof json === 'object' && json.values && typeof json.values === 'object') Object.assign(values, json.values);
  if (json && typeof json === 'object' && c.jsonMap) {
    for (const [k, p] of Object.entries(c.jsonMap)) { const v = getKey(json, k); if (v !== undefined) values[typeof p === 'string' ? p : p.path] = transform(typeof v === 'string' && !isNaN(v) ? +v : v, typeof p === 'string' ? {} : p); }
  }
  for (const pt of c.points || []) {
    if (!topicMatch(pt.topic, topic)) continue;
    let v = pt.jsonKey && json !== undefined ? getKey(json, pt.jsonKey) : (json !== undefined && typeof json !== 'object' ? json : text);
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(v)) v = +v;
    if (v !== undefined) values[pt.path] = transform(v, pt);
  }
  return values;
}

function start(building, ctx) {
  const c = building.connector;
  let mqtt;
  try { mqtt = require('mqtt'); } catch { ctx.status({ ok: false, error: 'mqtt package not installed' }); return { stop() {} }; }
  const client = mqtt.connect(c.url || process.env.MQTT_URL || 'mqtt://localhost:1883', {
    username: c.username || process.env.MQTT_USERNAME, password: c.password || process.env.MQTT_PASSWORD,
    reconnectPeriod: 5000, connectTimeout: 15000, clientId: `trigon-${building.id}-${Math.random().toString(16).slice(2, 8)}`,
  });
  const topics = [c.topic, ...(c.points || []).map(p => p.topic)].filter(Boolean);
  client.on('connect', () => { client.subscribe([...new Set(topics)], { qos: 1 }); ctx.status({ ok: true, error: null, detail: 'Subscribed: ' + [...new Set(topics)].join(', ') }); });
  client.on('error', e => ctx.status({ ok: false, error: e.message }));
  client.on('offline', () => ctx.status({ ok: false, error: 'Broker offline' }));
  client.on('message', (topic, payload) => {
    try { const v = mapMessage(c, topic, payload); if (Object.keys(v).length) ctx.apply(v); } catch (e) { ctx.status({ ok: false, error: 'Bad message: ' + e.message }); }
  });
  return { stop() { client.end(true); } };
}

module.exports = { start, mapMessage, topicMatch };
