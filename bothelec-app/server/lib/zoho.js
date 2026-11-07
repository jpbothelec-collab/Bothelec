'use strict';
/* Zoho Books API client (v3). All Zoho-specific URLs and field names live in this file.
 *
 * Setup (see README → Zoho Books): create a "Self Client" in the Zoho API console for your data centre,
 * generate a refresh token with scope ZohoBooks.fullaccess.all, and set in .env:
 *   ZOHO_DC=com|eu|in|com.au|jp|ca|sa   ZOHO_CLIENT_ID  ZOHO_CLIENT_SECRET  ZOHO_REFRESH_TOKEN  ZOHO_ORG_ID
 * ZOHO_ACCOUNTS_URL / ZOHO_API_URL override the URLs (used by the tests). */

/* Zoho data centres. Canada uses the zohocloud.ca domain. */
const DCS = { com: 'United States / global (zoho.com)', eu: 'Europe (zoho.eu)', in: 'India (zoho.in)', 'com.au': 'Australia (zoho.com.au)', jp: 'Japan (zoho.jp)', ca: 'Canada (zohocloud.ca)', sa: 'Saudi Arabia (zoho.sa)' };
const domain = dc => (dc === 'ca' ? 'zohocloud.ca' : `zoho.${dc}`);
const accountsFor = dc => `https://accounts.${domain(dc)}`;
const SCOPE = 'ZohoBooks.fullaccess.all';

/* "Connect Zoho Books" button: build the consent URL, then swap the returned code for a refresh token. */
function authUrl({ dc, clientId, redirectUri, state }) {
  const q = new URLSearchParams({ scope: SCOPE, client_id: clientId, response_type: 'code', access_type: 'offline', prompt: 'consent', redirect_uri: redirectUri, state });
  return `${accountsFor(dc)}/oauth/v2/auth?${q}`;
}
async function exchangeCode({ accountsServer, clientId, clientSecret, redirectUri, code }) {
  const q = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
  const res = await fetch(`${accountsServer.replace(/\/$/, '')}/oauth/v2/token?${q}`, { method: 'POST', signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) throw new Error('Zoho did not return a refresh token: ' + (data.error || res.status) + '. Check the Client ID/Secret and the redirect URI registered in the Zoho API console.');
  return data; // { access_token, refresh_token, api_domain, expires_in }
}
async function revokeToken(accountsServer, refreshToken) {
  try { await fetch(`${accountsServer.replace(/\/$/, '')}/oauth/v2/token/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST', signal: AbortSignal.timeout(15000) }); } catch { /* best effort */ }
}

function createZohoClient(env) {
  const dc = (env.ZOHO_DC || 'com').replace(/^\./, '');
  const accountsUrl = (env.ZOHO_ACCOUNTS_URL || accountsFor(dc)).replace(/\/$/, '');
  const apiUrl = (env.ZOHO_API_URL || `https://www.zohoapis.${dc}/books/v3`).replace(/\/$/, '');
  const appUrl = (env.ZOHO_APP_URL || `https://books.${domain(dc)}`).replace(/\/$/, '');
  const org = env.ZOHO_ORG_ID || '';
  const hasToken = !!(env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN);
  const configured = hasToken && !!org;
  let token = null, tokenExp = 0;

  async function accessToken(force) {
    if (!force && token && Date.now() < tokenExp - 60e3) return token;
    const q = new URLSearchParams({ refresh_token: env.ZOHO_REFRESH_TOKEN, client_id: env.ZOHO_CLIENT_ID, client_secret: env.ZOHO_CLIENT_SECRET, grant_type: 'refresh_token' });
    const res = await fetch(`${accountsUrl}/oauth/v2/token?${q}`, { method: 'POST', signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error('Zoho sign-in failed: ' + (data.error || res.status) + ' (check ZOHO_DC, client id/secret and refresh token)');
    token = data.access_token; tokenExp = Date.now() + (+data.expires_in || 3600) * 1000;
    return token;
  }

  async function call(method, path, body, retried) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${apiUrl}${path}${sep}organization_id=${encodeURIComponent(org)}`, {
      method,
      headers: { Authorization: 'Zoho-oauthtoken ' + await accessToken(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 401 && !retried) { await accessToken(true); return call(method, path, body, true); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code !== undefined && data.code !== 0)) {
      const err = new Error(`Zoho Books ${res.status}: ${data.message || 'request failed'}`);
      err.retry = res.status === 429 || res.status >= 500;
      throw err;
    }
    return data;
  }

  return {
    configured, hasToken, dc, org, accountsUrl,
    async listOrgs() { const d = await call('GET', '/organizations'); return (d.organizations || []).map(o => ({ id: String(o.organization_id), name: o.name, currency: o.currency_code })); },
    invoiceUrl: id => `${appUrl}/app/${org}#/invoices/${id}`,
    contactUrl: id => `${appUrl}/app/${org}#/contacts/${id}`,
    async test() { const d = await call('GET', '/organizations'); const o = (d.organizations || []).find(x => String(x.organization_id) === String(org)); if (!o) throw new Error(`Connected, but organisation ${org} was not found on this account`); return { name: o.name, currency: o.currency_code }; },
    async findContact(name) { const d = await call('GET', `/contacts?contact_name=${encodeURIComponent(name)}`); return (d.contacts || []).find(c => c.contact_name === name) || null; },
    async createContact(payload) { const d = await call('POST', '/contacts', payload); return d.contact; },
    async updateContact(id, payload) { const d = await call('PUT', `/contacts/${id}`, payload); return d.contact; },
    async addContactPerson(payload) { const d = await call('POST', '/contacts/contactpersons', payload); return d.contact_person; },
    async findInvoiceByReference(ref) { const d = await call('GET', `/invoices?reference_number=${encodeURIComponent(ref)}`); return (d.invoices || []).find(i => i.reference_number === ref) || null; },
    async createInvoice(payload) { const d = await call('POST', '/invoices', payload); return d.invoice; },
  };
}

module.exports = { createZohoClient, authUrl, exchangeCode, revokeToken, DCS };
