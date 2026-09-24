// netlify/functions/tv-now-playing.js
//
// Haalt via een live websearch (Tavily — dezelfde dienst als bij Make My Day)
// op wat er NU (en eventueel straks) te zien is op een Vlaamse tv-zender.
// Geen vaste EPG-API — dit is bewust een "best effort" via webzoekopdracht,
// gericht op betrouwbare tv-gids-bronnen (VRT MAX, tvgids.nl, mijn-tv-gids.be).
//
// Vereist: environment variable TAVILY_API_KEY (staat al in je Netlify-project
// voor Make My Day, dus normaal niets extra te doen).

exports.handler = async function (event) {
  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'TAVILY_API_KEY ontbreekt in de Netlify-omgevingsvariabelen' }) };
    }

    const channel = (event.queryStringParameters && event.queryStringParameters.channel) || '';
    if (!channel) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Parameter "channel" ontbreekt' }) };
    }

    const now = new Date();
    const tijdLabel = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const query = `tv gids ${channel} wat is er nu te zien om ${tijdLabel} en wat komt er straks`;

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        include_answer: true,
        include_domains: ['vrt.be', 'tvgids.nl', 'mijn-tv-gids.be'],
        max_results: 3
      })
    });

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ ok: false, error: 'Tavily HTTP ' + res.status }) };
    }

    const data = await res.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        answer: data.answer || null,
        sources: (data.results || []).slice(0, 2).map(function (r) { return { title: r.title, url: r.url }; })
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: (e && e.message) || 'onbekende fout' }) };
  }
};
