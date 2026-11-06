'use strict';
/* Outbound notifications: SMS (BulkSMS / Teltonika router / GSM modem) and email (Gmail / SMTP).
 * Every message goes through a persistent outbox with retries, so a provider outage does not lose alerts. */
const { nowIso, rid, normalizePhone, log } = require('./util');

/* GSM 03.38 safe text: SMS through modems/routers is sent as 7-bit text. */
const gsmSafe = s => String(s).replace(/\s?°/g, ' deg').replace(/[–—]/g, '-').replace(/[·•]/g, '-').replace(/→/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåÆæßÉÄÖÑÜ§¿äöñüà]/g, '');

/* ---------------- SMS providers ---------------- */
function bulkSms(env) {
  const base = (env.BULKSMS_URL || 'https://api.bulksms.com/v1').replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${env.BULKSMS_TOKEN_ID}:${env.BULKSMS_TOKEN_SECRET}`).toString('base64');
  return {
    name: 'BulkSMS',
    configured: !!(env.BULKSMS_TOKEN_ID && env.BULKSMS_TOKEN_SECRET),
    detail: env.BULKSMS_FROM ? `Sender ID ${env.BULKSMS_FROM}` : 'Shared sender number',
    async send(to, text) {
      const msg = { to, body: text };
      if (env.BULKSMS_FROM) msg.from = env.BULKSMS_FROM;
      if (env.BULKSMS_ROUTING) msg.routingGroup = env.BULKSMS_ROUTING;
      const res = await fetch(`${base}/messages?auto-unicode=true&longMessageMaxParts=6`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify([msg]),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`BulkSMS HTTP ${res.status}: ${body.slice(0, 200)}`);
      let data; try { data = JSON.parse(body); } catch { data = []; }
      const m = Array.isArray(data) ? data[0] : data;
      return { providerId: m && m.id, status: m && m.status && m.status.type };
    },
  };
}

/* Teltonika RUT/TRB routers: Services → Mobile Utilities → SMS Gateway → "Post/Get" must be enabled. */
function teltonika(env) {
  return {
    name: 'Teltonika router SMS',
    configured: !!(env.TELTONIKA_URL && env.TELTONIKA_USER),
    detail: env.TELTONIKA_URL || '',
    async send(to, text) {
      const u = new URL('/cgi-bin/sms_send', env.TELTONIKA_URL);
      u.searchParams.set('username', env.TELTONIKA_USER);
      u.searchParams.set('password', env.TELTONIKA_PASS || '');
      u.searchParams.set('number', to.replace(/^\+/, '00'));
      u.searchParams.set('text', gsmSafe(text));
      const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
      const body = (await res.text()).trim();
      if (!res.ok || /error|fail|denied/i.test(body)) throw new Error(`Router replied ${res.status}: ${body.slice(0, 200)}`);
      return { providerId: body.slice(0, 60) };
    },
  };
}

/* USB/serial GSM modem with a SIM, driven with AT commands. Needs the optional "serialport" package
 * and the server running on the machine the modem is plugged into. `openPort` is injectable for tests. */
function gsmModem(env, openPort) {
  let port = null, buf = '', waiter = null, chain = Promise.resolve();
  const open = async () => {
    if (port) return port;
    if (openPort) port = await openPort();
    else {
      let SerialPort;
      try { ({ SerialPort } = require('serialport')); } catch { throw new Error('GSM modem needs the serialport package: npm install serialport'); }
      port = new SerialPort({ path: env.GSM_PORT || '/dev/ttyUSB0', baudRate: +(env.GSM_BAUD || 115200) });
      await new Promise((res, rej) => port.on('open', res).on('error', rej));
    }
    port.on('data', d => { buf += d.toString('latin1'); if (waiter) waiter(); });
    port.on('close', () => { port = null; });
    port.on('error', () => { port = null; });
    return port;
  };
  const cmd = (p, data, expect, ms = 10000) => new Promise((resolve, reject) => {
    buf = '';
    const t = setTimeout(() => { waiter = null; reject(new Error(`Modem timeout waiting for ${expect} (got ${JSON.stringify(buf.trim()).slice(0, 80)})`)); }, ms);
    waiter = () => {
      if (/\r\n(\+CMS |\+CME )?ERROR/.test(buf) || buf.startsWith('ERROR')) { clearTimeout(t); waiter = null; reject(new Error('Modem error: ' + buf.trim().slice(0, 120))); }
      else if (buf.includes(expect)) { clearTimeout(t); waiter = null; resolve(buf); }
    };
    p.write(data);
  });
  return {
    name: 'GSM modem',
    configured: !!(env.GSM_PORT || openPort),
    detail: env.GSM_PORT || '',
    send(to, text) {
      const job = chain.then(async () => {
        const p = await open();
        await cmd(p, 'AT\r', 'OK');
        await cmd(p, 'AT+CMGF=1\r', 'OK');
        await cmd(p, `AT+CMGS="${to}"\r`, '>');
        const r = await cmd(p, gsmSafe(text).slice(0, 1500) + '\x1A', 'OK', 60000);
        const m = /\+CMGS:\s*(\d+)/.exec(r);
        return { providerId: m ? 'CMGS ' + m[1] : 'sent' };
      });
      chain = job.catch(() => {});
      return job;
    },
  };
}

function logSms() {
  return { name: 'Log only (no SMS sent)', configured: false, detail: 'Set SMS_PROVIDER to send real SMS', async send(to, text) { log('[sms:log]', to, text); return { providerId: 'log' }; } };
}

function smsProvider(env, opts = {}) {
  switch ((env.SMS_PROVIDER || 'log').toLowerCase()) {
    case 'bulksms': return bulkSms(env);
    case 'teltonika': return teltonika(env);
    case 'gsm': return gsmModem(env, opts.openPort);
    default: return logSms();
  }
}

/* ---------------- Email ---------------- */
function emailProvider(env) {
  const kind = (env.EMAIL_PROVIDER || (env.GMAIL_USER ? 'gmail' : 'log')).toLowerCase();
  if (kind === 'log') {
    return { name: 'Log only (no email sent)', configured: false, detail: 'Set EMAIL_PROVIDER=gmail to send email', async send(m) { log('[email:log]', m.to, m.subject); return { providerId: 'log' }; }, verify: async () => true };
  }
  const nodemailer = require('nodemailer');
  const opts = kind === 'gmail'
    ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: (env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '') } }
    : { host: env.SMTP_HOST, port: +(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined, tls: env.SMTP_INSECURE_TLS === 'true' ? { rejectUnauthorized: false } : undefined };
  const transport = nodemailer.createTransport({ ...opts, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000 });
  const from = env.EMAIL_FROM || (env.GMAIL_USER ? `Bothelec Aircon Solutions <${env.GMAIL_USER}>` : env.SMTP_USER);
  return {
    name: kind === 'gmail' ? 'Gmail' : 'SMTP',
    configured: kind === 'gmail' ? !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD) : !!env.SMTP_HOST,
    detail: from || '',
    async send(m) {
      const info = await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments, replyTo: env.EMAIL_REPLY_TO || undefined });
      return { providerId: info.messageId };
    },
    verify: () => transport.verify(),
  };
}

/* ---------------- Outbox ---------------- */
const RETRY_MS = [60e3, 5 * 60e3, 15 * 60e3];
const MAX_ATTEMPTS = 4;
const KEEP = 1000;

function createNotifier({ db, env, onStatus, openPort }) {
  const sms = smsProvider(env, { openPort });
  const email = emailProvider(env);
  let outbox = db.all('outbox').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let busy = false;

  function enqueue(msg) {
    const m = { id: rid(9), createdAt: nowIso(), attempts: 0, status: 'queued', nextAt: 0, error: null, ...msg };
    if (m.channel === 'sms') {
      m.to = normalizePhone(m.to);
      if (!m.to) { m.status = 'failed'; m.error = 'Invalid phone number: ' + msg.to; }
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.to || '')) { m.status = 'failed'; m.error = 'Invalid email address: ' + msg.to; }
    outbox.unshift(m);
    db.put('outbox', m);
    if (outbox.length > KEEP) outbox.splice(KEEP).forEach(x => db.del('outbox', x.id));
    setImmediate(work);
    return m;
  }
  async function deliver(m) {
    m.attempts++;
    try {
      const r = m.channel === 'sms' ? await sms.send(m.to, m.text) : await email.send(m);
      Object.assign(m, { status: 'sent', sentAt: nowIso(), providerId: r.providerId || null, error: null });
    } catch (e) {
      m.error = String((e && e.message) || e).slice(0, 300);
      if (m.attempts >= MAX_ATTEMPTS) m.status = 'failed';
      else m.nextAt = Date.now() + RETRY_MS[m.attempts - 1];
      log(`[notify] ${m.channel} to ${m.to} attempt ${m.attempts} failed: ${m.error}`);
    }
    db.put('outbox', m);
    if (onStatus) try { onStatus(m); } catch (e) { log('[notify] onStatus', e); }
  }
  async function work() {
    if (busy) return;
    busy = true;
    try {
      const due = outbox.filter(m => m.status === 'queued' && m.nextAt <= Date.now()).reverse();
      for (const m of due) await deliver(m);
    } finally { busy = false; }
  }
  const timer = setInterval(work, 5000);
  timer.unref();

  return {
    enqueue,
    work,
    list: (n = 100) => outbox.slice(0, n),
    retry(id) { const m = outbox.find(x => x.id === id); if (m && m.status === 'failed') { m.status = 'queued'; m.attempts = 0; m.nextAt = 0; db.put('outbox', m); setImmediate(work); } return m; },
    status: () => ({
      sms: { provider: sms.name, configured: sms.configured, detail: sms.detail },
      email: { provider: email.name, configured: email.configured, detail: email.detail },
      queued: outbox.filter(m => m.status === 'queued').length,
      failed24h: outbox.filter(m => m.status === 'failed' && Date.now() - new Date(m.createdAt) < 864e5).length,
    }),
    verifyEmail: () => email.verify(),
    stop: () => clearInterval(timer),
  };
}

module.exports = { createNotifier, smsProvider, emailProvider, gsmSafe };
