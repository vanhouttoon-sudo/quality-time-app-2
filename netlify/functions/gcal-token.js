// netlify/functions/gcal-token.js
//
// Wissel een Google OAuth "authorization code" om voor een access_token +
// refresh_token, en ververs later verlopen access_tokens met die refresh_token
// — zonder dat de gebruiker telkens opnieuw hoeft in te loggen.
//
// Dit stukje MOET server-side gebeuren: het vereist de geheime Client Secret,
// die nooit in de browser-code van een publieke single-file app mag staan.
//
// Vereist: environment variable GOOGLE_CLIENT_SECRET in Netlify
// (Google Cloud Console → Inloggegevens → je OAuth-client-ID → Client Secret).

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientSecret) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'GOOGLE_CLIENT_SECRET ontbreekt in de Netlify-omgevingsvariabelen' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { action, code, client_id, redirect_uri, refresh_token } = body;

    let params;
    if (action === 'exchange') {
      if (!code || !client_id || !redirect_uri) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'code, client_id en redirect_uri zijn verplicht' }) };
      }
      params = new URLSearchParams({
        code: code,
        client_id: client_id,
        client_secret: clientSecret,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      });
    } else if (action === 'refresh') {
      if (!refresh_token || !client_id) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'refresh_token en client_id zijn verplicht' }) };
      }
      params = new URLSearchParams({
        refresh_token: refresh_token,
        client_id: client_id,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      });
    } else {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Onbekende action (verwacht "exchange" of "refresh")' }) };
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ ok: false, error: data.error_description || data.error || ('Google gaf HTTP ' + res.status) }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        access_token: data.access_token,
        // refresh_token komt enkel mee bij de EERSTE exchange (met prompt=consent);
        // bij een refresh-aanvraag stuurt Google 'm normaal niet opnieuw mee.
        refresh_token: data.refresh_token || null,
        expires_in: data.expires_in
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: (e && e.message) || 'onbekende fout' }) };
  }
};
