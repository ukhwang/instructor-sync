// Supabase Kong 대체: /auth/v1 → GoTrue, /rest/v1 → PostgREST. apikey 검증 포함.
import http from 'http';
const ANON = process.env.ANON_KEY, SERVICE = process.env.SERVICE_ROLE_KEY;
const routes = [['/auth/v1', Number(process.env.AUTH_PORT ?? 9999)], ['/rest/v1', Number(process.env.REST_PORT ?? 3001)]];
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'});
    return res.end();
  }
  const route = routes.find(([p]) => req.url.startsWith(p + '/') || req.url === p || req.url.startsWith(p + '?'));
  if (!route) { res.writeHead(404); return res.end('no route'); }
  const apikey = req.headers['apikey'] ?? new URL(req.url, 'http://x').searchParams.get('apikey');
  if (apikey !== ANON && apikey !== SERVICE) { res.writeHead(401, {'content-type':'application/json'}); return res.end('{"message":"Invalid API key"}'); }
  const path = req.url.slice(route[0].length) || '/';
  const headers = { ...req.headers, host: `127.0.0.1:${route[1]}` };
  if (!headers.authorization) headers.authorization = `Bearer ${apikey}`;
  const up = http.request({ host: '127.0.0.1', port: route[1], method: req.method, path, headers }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, 'access-control-allow-origin': '*' });
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(Number(process.env.GATEWAY_PORT ?? 54321), '127.0.0.1', () => console.log('gateway up'));
