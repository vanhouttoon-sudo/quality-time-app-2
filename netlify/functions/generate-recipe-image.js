// netlify/functions/generate-recipe-image.js
//
// Genereert een receptfoto via Google's Gemini "Nano Banana 2"
// (gemini-3.1-flash-image) — gratis en met ingebouwde contentfilters.
//
// BELANGRIJKE UPDATE: dit gebruikt nu Google's actuele "Interactions API"
// (/v1beta/interactions), niet meer het oudere /generateContent-eindpunt.
// Het vorige model (gemini-2.5-flash-image) is intussen door Google zelf
// als "legacy" bestempeld — dat verklaarde de aanhoudende 429-foutmeldingen,
// zelfs met een vers account: een verouderd model via een verouderd
// eindpunt loopt via een zwaar afgeknepen pad.
//
// ── Gratis API-sleutel instellen ──
// 1. Ga naar https://aistudio.google.com/apikey (gratis Google-account volstaat)
// 2. Klik "Create API key" — geen kredietkaart nodig
// 3. Zet die sleutel in Netlify: Site settings → Environment variables →
//    voeg toe: GEMINI_API_KEY = <jouw sleutel>
// 4. Herdeploy zodat de nieuwe omgevingsvariabele meegenomen wordt
//
// Zonder deze sleutel geeft deze functie gewoon { image: null } terug — de
// app valt dan automatisch terug op de vaste noodfoto.

const GEMINI_MODEL = 'gemini-3.1-flash-image'; // "Nano Banana 2" — actueel aanbevolen model
const STYLE_SUFFIX = 'Stijl: dagelijkse kost, warm, huiselijk, lekker, vlaams, antwerps, stimulerend. '
  + 'Professionele foodfotografie, bovenaanzicht op een bord of in een kom, natuurlijk licht, gewone Belgische thuiskeuken-presentatie — geen sushi, geen Aziatische rolletjes, geen fine-dining plating, geen decoratieve kunstjes. '
  + 'Toon uitsluitend het gerecht zelf — geen mensen, geen gezichten, geen personen in beeld. '
  + 'Voeg helemaal onderaan de afbeelding, klein en subtiel (bv. rechtsonder, lichte tekst met een licht schaduwtje zodat het leesbaar blijft op de foto), de tekst "Tony\'s recipe book" toe als een fotograaf-signatuur — laat deze tekst exact zo, correct gespeld en leesbaar in de afbeelding verschijnen.';

function timeoutFetch(url, options, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .finally(() => clearTimeout(t));
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400',
  };

  try {
    const qs = event.queryStringParameters || {};
    const name = qs.name;
    const ingredients = qs.ingredients || '';

    if (!name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Naam van het recept ontbreekt', image: null }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, headers, body: JSON.stringify({ image: null, reason: 'Geen GEMINI_API_KEY ingesteld in Netlify' }) };
    }

    const prompt = `Fotografeer nauwkeurig het Belgische thuisgerecht dat letterlijk "${name}" heet — dit exacte gerecht, zoals het écht bereid en opgediend wordt, niet een andere keuken of interpretatie.`
      + (ingredients ? ` Ter info, enkele hoofdingrediënten: ${ingredients}.` : '')
      + ` ${STYLE_SUFFIX}`;

    let res;
    try {
      res = await timeoutFetch(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            model: GEMINI_MODEL,
            input: prompt,
            response_format: { type: 'image', aspect_ratio: '4:3' },
          }),
        },
        20000
      );
    } catch (e) {
      return { statusCode: 200, headers, body: JSON.stringify({ image: null, reason: 'Timeout of netwerkfout: ' + String(e && e.message || e) }) };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { statusCode: 200, headers, body: JSON.stringify({ image: null, reason: 'Gemini HTTP ' + res.status, detail: errText.slice(0, 300) }) };
    }

    const data = await res.json();

    // Voorkeur: de convenience-property output_image (nieuwe Interactions API)
    let imgData = data && data.output_image && data.output_image.data;
    let mime = (data && data.output_image && data.output_image.mime_type) || 'image/png';

    // Terugval: handmatig door de steps lopen als output_image leeg is
    // (bv. bij interleaved tekst+beeld-antwoorden)
    if (!imgData && data && Array.isArray(data.steps)) {
      for (const step of data.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          const imgBlock = step.content.find(b => b.type === 'image' && b.data);
          if (imgBlock) {
            imgData = imgBlock.data;
            mime = imgBlock.mime_type || mime;
            break;
          }
        }
      }
    }

    if (!imgData) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ image: null, reason: 'Geen afbeelding in Gemini-antwoord', raw: JSON.stringify(data).slice(0, 300) }),
      };
    }

    const dataUri = `data:${mime};base64,${imgData}`;

    return { statusCode: 200, headers, body: JSON.stringify({ image: dataUri }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err && err.message || err), image: null }) };
  }
};
