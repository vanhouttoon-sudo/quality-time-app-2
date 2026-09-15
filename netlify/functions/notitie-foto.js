// netlify/functions/notitie-foto.js
//
// Geeft, op basis van een zoekterm (?query=...), één kwalitatieve, realistische
// Unsplash-foto terug met ÉÉN duidelijk onderwerp — belangrijk omdat de foto
// klein wordt getoond (als rond notitie-icoon), dus een drukke/volle foto met
// veel elementen werkt daar niet.
//
// Vereist: environment variable UNSPLASH_ACCESS_KEY in Netlify
// (Site settings → Environment variables), met je eigen gratis Unsplash API-key
// van https://unsplash.com/developers (gratis tier: 50 aanvragen/uur).

exports.handler = async function (event) {
  try {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'UNSPLASH_ACCESS_KEY ontbreekt in de Netlify-omgevingsvariabelen' })
      };
    }

    const rawQuery = (event.queryStringParameters && event.queryStringParameters.query) || 'minimal single object';

    // Verrijk de zoekterm zodat Unsplash bij voorkeur rustige, realistische
    // foto's met één duidelijk, geïsoleerd onderwerp teruggeeft, geen drukke
    // scènes met veel elementen door elkaar.
    const enrichedQuery = rawQuery + ' minimal single subject realistic photography';

    const url = 'https://api.unsplash.com/photos/random'
      + '?query=' + encodeURIComponent(enrichedQuery)
      + '&orientation=squarish'
      + '&content_filter=high'
      + '&count=1';

    const res = await fetch(url, {
      headers: { Authorization: 'Client-ID ' + apiKey }
    });

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ ok: false, error: 'Unsplash HTTP ' + res.status }) };
    }

    const data = await res.json();
    const photo = Array.isArray(data) ? data[0] : data;

    if (!photo || !photo.urls) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Geen passende foto gevonden' }) };
    }

    // Klein, vierkant bijgesneden formaat — precies wat we nodig hebben voor
    // een notitie-icoon, geen onnodig grote afbeelding downloaden.
    const photoUrl = photo.urls.raw + '&w=160&h=160&fit=crop&q=80';

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        url: photoUrl,
        // Unsplash vereist in hun API-richtlijnen een verwijzing naar de
        // fotograaf + Unsplash zelf bij gebruik via de API (los van hun
        // algemene downloadlicentie, die geen bronvermelding verplicht).
        credit: photo.user ? (photo.user.name || '') : '',
        creditUrl: photo.links ? photo.links.html : ''
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: (e && e.message) || 'onbekende fout' }) };
  }
};
