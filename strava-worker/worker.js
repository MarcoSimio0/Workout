// Worker di Cloudflare che collega l'app Scheda Palestra a Strava.
// Custodisce il "Client Secret" di Strava, che non può stare in una pagina pubblica,
// e inoltra a Strava solo le richieste che servono all'app (sola lettura delle attività).
//
// Variabili da impostare nel worker (Settings → Variables and Secrets):
//   STRAVA_CLIENT_ID      tipo Text    il Client ID dell'app Strava
//   STRAVA_CLIENT_SECRET  tipo Secret  il Client Secret dell'app Strava

// Indirizzi da cui l'app può usare il worker.
const ORIGINI = ['https://marcosimio0.github.io', 'http://localhost:8765'];

export default {
  async fetch(request, env) {
    const origine = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINI.includes(origine) ? origine : ORIGINI[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const risposta = (corpo, stato = 200) => new Response(
      typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
      { status: stato, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } }
    );
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Aprendo l'indirizzo del worker nel browser si controlla che sia configurato.
    if (url.pathname === '/') {
      return risposta({
        funziona: true,
        clientId: Boolean(env.STRAVA_CLIENT_ID),
        clientSecret: Boolean(env.STRAVA_CLIENT_SECRET)
      });
    }
    if (url.pathname === '/config') return risposta({ client_id: env.STRAVA_CLIENT_ID || '' });

    if (!ORIGINI.includes(origine)) return risposta({ errore: 'Origine non consentita' }, 403);

    if (url.pathname === '/token' && request.method === 'POST') {
      const corpo = await request.json().catch(() => ({}));
      const parametri = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET });
      if (corpo.code) {
        parametri.set('code', corpo.code);
        parametri.set('grant_type', 'authorization_code');
      } else if (corpo.refresh_token) {
        parametri.set('refresh_token', corpo.refresh_token);
        parametri.set('grant_type', 'refresh_token');
      } else {
        return risposta({ errore: 'Manca code o refresh_token' }, 400);
      }
      const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: parametri });
      return risposta(await r.text(), r.status);
    }

    // Solo l'elenco delle attività e il dettaglio di una attività.
    const percorso = url.pathname.replace(/^\/api/, '');
    if (request.method === 'GET' && url.pathname.startsWith('/api/') && /^\/(athlete\/activities|activities\/\d+)$/.test(percorso)) {
      const r = await fetch('https://www.strava.com/api/v3' + percorso + url.search, {
        headers: { Authorization: request.headers.get('Authorization') || '' }
      });
      return risposta(await r.text(), r.status);
    }

    return risposta({ errore: 'Percorso sconosciuto' }, 404);
  }
};
