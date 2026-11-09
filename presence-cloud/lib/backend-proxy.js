const HOP_BY_HOP = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','host','content-length']);

module.exports = async function backendProxy(req, res) {
  const origin = process.env.PRESENCE_BACKEND_URL;
  if (!origin) return res.status(503).json({ error: 'The persistent Presence Cloud backend is not configured.' });
  let base;
  try { base = new URL(origin); } catch { return res.status(500).json({ error: 'PRESENCE_BACKEND_URL must be an absolute HTTPS URL.' }); }
  if (base.protocol !== 'https:' && process.env.NODE_ENV === 'production') return res.status(500).json({ error: 'PRESENCE_BACKEND_URL must use HTTPS.' });

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(name.toLowerCase()) || value == null) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
  }
  headers.set('x-forwarded-host', req.headers.host || '');
  headers.set('x-forwarded-proto', req.headers['x-forwarded-proto'] || 'https');
  const requestUrl = req.url || '/';
  const backendPath = requestUrl.replace(/^\/api\/auth(?=\/|\?|$)/, '/auth');
  const target = new URL(backendPath, base);
  const method = req.method || 'GET';
  const init = { method, headers, redirect: 'manual' };
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length) init.body = Buffer.concat(chunks);
  }

  try {
    const upstream = await fetch(target, init);
    res.statusCode = upstream.status;
    for (const name of ['content-type','cache-control','location','content-security-policy','referrer-policy','x-frame-options','x-content-type-options']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    const cookies = upstream.headers.getSetCookie?.() || [];
    if (cookies.length) res.setHeader('set-cookie', cookies);
    res.setHeader('cache-control', 'no-store');
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.end(payload);
  } catch (error) {
    console.error('Presence backend proxy failed:', error.message);
    res.status(502).json({ error: 'Could not reach the persistent Presence Cloud backend.' });
  }
};

