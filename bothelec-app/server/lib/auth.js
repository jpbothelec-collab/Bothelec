'use strict';
const crypto = require('node:crypto');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return 'scrypt$' + salt.toString('base64') + '$' + hash.toString('base64');
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, s, h] = stored.split('$');
  const hash = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 64);
  const exp = Buffer.from(h, 'base64');
  return exp.length === hash.length && crypto.timingSafeEqual(exp, hash);
}

/* Roles: admin (everything), desk (service desk staff), tech (field technician), client (building owner/manager). */
const ROLES = ['admin', 'desk', 'tech', 'client'];
const isStaff = u => u && (u.role === 'admin' || u.role === 'desk');

/** Can this user see/act on a building? */
function canBuilding(u, bid) {
  if (!u) return false;
  if (u.role === 'client') return (u.buildings || []).includes(bid);
  return true;
}
function canJob(u, job) {
  if (!u || !job) return false;
  if (isStaff(u)) return true;
  if (u.role === 'tech') return job.tech === u.techId;
  return canBuilding(u, job.building);
}

/* Simple in-memory login rate limit: 10 attempts / 15 min per IP+email. */
const attempts = new Map();
function rateLimited(key) {
  const now = Date.now(), win = 15 * 60e3;
  const a = (attempts.get(key) || []).filter(t => now - t < win);
  a.push(now); attempts.set(key, a);
  return a.length > 10;
}

module.exports = { hashPassword, verifyPassword, ROLES, isStaff, canBuilding, canJob, rateLimited };
