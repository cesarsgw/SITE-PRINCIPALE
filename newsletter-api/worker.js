// API d'inscription à la newsletter MGC — Cloudflare Worker.
// Le navigateur envoie { email, consent, lang, website, elapsed } ; ce Worker appelle l'API Brevo
// avec la clé stockée en secret (jamais exposée au navigateur) et déclenche le double opt-in.
//
// API Brevo utilisée (https://api.brevo.com/v3, en-tête « api-key ») :
//   GET  /contacts/{email}                   → contact déjà inscrit à la liste ?
//   POST /contacts/doubleOptinConfirmation   → envoi de l'email de confirmation (201 créé / 204 mis à jour)
//
// Variables (Cloudflare → Worker → Settings → Variables and Secrets) :
//   BREVO_API_KEY            secret — clé API Brevo
//   BREVO_LIST_ID            id numérique de la liste « Newsletter MGC »
//   BREVO_DOI_TEMPLATE_ID    id du modèle d'email de confirmation (tag « optin »)
//   BREVO_DOI_TEMPLATE_ID_EN facultatif — modèle anglais (sinon modèle FR)
//   DOI_REDIRECT_URL         page affichée après clic sur le lien de confirmation
//   DOI_REDIRECT_URL_EN      facultatif — version anglaise
//   ALLOWED_ORIGINS          origines autorisées, séparées par des virgules

const BREVO_API = 'https://api.brevo.com/v3';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = 2048;
const MIN_FILL_MS = 2500; // soumission plus rapide qu'un humain → robot

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : null;
}

function reply(origin, status, body) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

function brevo(env, path, init = {}) {
  return fetch(BREVO_API + path, {
    ...init,
    headers: { 'api-key': env.BREVO_API_KEY, 'accept': 'application/json', 'content-type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
}

function config(env, lang) {
  const listId = Number(env.BREVO_LIST_ID);
  const templateId = Number((lang === 'en' && env.BREVO_DOI_TEMPLATE_ID_EN) || env.BREVO_DOI_TEMPLATE_ID);
  const redirectionUrl = (lang === 'en' && env.DOI_REDIRECT_URL_EN) || env.DOI_REDIRECT_URL;
  const ok = env.BREVO_API_KEY && Number.isInteger(listId) && listId > 0
    && Number.isInteger(templateId) && templateId > 0 && /^https:\/\//.test(redirectionUrl || '');
  return ok ? { listId, templateId, redirectionUrl } : null;
}

async function subscribe(request, env, origin) {
  if ((request.headers.get('content-type') || '').split(';')[0].trim() !== 'application/json') {
    return reply(origin, 415, { status: 'error' });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return reply(origin, 413, { status: 'error' });

  let data;
  try { data = JSON.parse(raw); } catch { return reply(origin, 400, { status: 'error' }); }
  if (!data || typeof data !== 'object') return reply(origin, 400, { status: 'error' });

  // Pot de miel / remplissage instantané : on ne fait rien, sans le signaler au robot.
  if ((typeof data.website === 'string' && data.website !== '') || !(Number(data.elapsed) >= MIN_FILL_MS)) {
    return reply(origin, 200, { status: 'pending' });
  }

  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return reply(origin, 400, { status: 'invalid_email' });
  if (data.consent !== true) return reply(origin, 400, { status: 'consent_required' });

  const lang = data.lang === 'en' ? 'en' : 'fr';
  const cfg = config(env, lang);
  if (!cfg) {
    console.error('newsletter: configuration incomplète (variables Brevo manquantes)');
    return reply(origin, 503, { status: 'error' });
  }

  try {
    // 1. Déjà inscrit à la liste ?
    const found = await brevo(env, '/contacts/' + encodeURIComponent(email));
    if (found.status === 200) {
      const contact = await found.json();
      if (Array.isArray(contact.listIds) && contact.listIds.includes(cfg.listId) && contact.emailBlacklisted !== true) {
        return reply(origin, 200, { status: 'already_subscribed' });
      }
    } else if (found.status !== 404) {
      console.error('newsletter: Brevo GET contact', found.status, await found.text());
      return reply(origin, 502, { status: 'error' });
    }

    // 2. Double opt-in : Brevo envoie l'email de confirmation ; l'ajout à la liste n'a lieu qu'après le clic.
    const doi = await brevo(env, '/contacts/doubleOptinConfirmation', {
      method: 'POST',
      body: JSON.stringify({ email, includeListIds: [cfg.listId], templateId: cfg.templateId, redirectionUrl: cfg.redirectionUrl }),
    });
    if (doi.status === 201 || doi.status === 204) return reply(origin, 200, { status: 'pending' });

    const detail = await doi.text();
    console.error('newsletter: Brevo DOI', doi.status, detail);
    if (doi.status === 400 && /email/i.test(detail)) return reply(origin, 400, { status: 'invalid_email' });
    return reply(origin, 502, { status: 'error' });
  } catch (err) {
    console.error('newsletter: appel Brevo impossible', err && err.name);
    return reply(origin, 502, { status: 'error' });
  }
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return reply(null, 403, { status: 'forbidden' });

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }
    if (request.method !== 'POST') return reply(origin, 405, { status: 'error' });
    return subscribe(request, env, origin);
  },
};
