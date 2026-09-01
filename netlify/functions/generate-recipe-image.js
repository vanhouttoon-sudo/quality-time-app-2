// netlify/functions/generate-recipe-image.js
//
// Genereert een receptfoto via Google's Gemini 2.5 Flash Image ("Nano Banana")
// — gratis (tot 500 afbeeldingen/dag, geen kredietkaart nodig) en met
// ingebouwde contentfilters, in tegenstelling tot het eerder gebruikte
// ongemodereerde Pollinations/flux-model dat onvoorspelbare en ongepaste
// beelden kon genereren.
//
// ── Gratis API-sleutel instellen ──
// 1. Ga naar https://aistudio.google.com/apikey (gratis Google-account volstaat)
// 2. Klik "Create API key" — geen kredietkaart nodig
// 3. Zet die sleutel in Netlify: Site settings → Environment variables →
//    voeg toe: GEMINI_API_KEY = <jouw sleutel>
// 4. Herdeploy zodat de nieuwe omgevingsvariabele meegenomen wordt
//
// Zonder deze sleutel geeft deze functie gewoon { image: null } terug — de
// app valt dan automatisch terug op de bestaande, veilige fotoketen
// (bronfoto → Unsplash → Foodish → vaste noodfoto).

const GEMINI_MODEL = 'gemini-2.5-flash-image';
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
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
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
    const candidate = data && data.candidates && data.candidates[0];
    const parts = (candidate && candidate.content && candidate.content.parts) || [];
    const imgPart = parts.find(p => p.inlineData && p.inlineData.data);

    if (!imgPart) {
      // Mogelijk geblokkeerd door Gemini's eigen veiligheidsfilters, of geen
      // afbeelding teruggekregen — geeft netjes null terug, geen crash.
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ image: null, reason: 'Geen afbeelding in Gemini-antwoord', finishReason: candidate && candidate.finishReason }),
      };
    }

    const mime = imgPart.inlineData.mimeType || 'image/png';
    const dataUri = `data:${mime};base64,${imgPart.inlineData.data}`;

    return { statusCode: 200, headers, body: JSON.stringify({ image: dataUri }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err && err.message || err), image: null }) };
  }
};
