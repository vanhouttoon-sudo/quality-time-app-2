// netlify/functions/generate-recipe-image-openai.js
//
// Genereert een receptfoto via OpenAI's Images API (gpt-image-1) — hetzelfde
// soort beeldmodel dat ChatGPT gebruikt voor beeldgeneratie. Niet gratis,
// maar wel goedkoop: elk recept wordt maar ÉÉN keer gegenereerd (de app
// cachet het resultaat op het toestel zelf), dus de totale kost voor een
// volledige receptenbibliotheek blijft typisch onder de paar euro, eenmalig.
//
// ── OpenAI API-sleutel instellen ──
// 1. Ga naar https://platform.openai.com/api-keys
// 2. Log in / maak een account (LET OP: dit is apart van een ChatGPT-
//    abonnement — een Plus/Pro-abonnement geeft geen API-toegang)
// 3. Klik "Create new secret key", kopieer de sleutel
// 4. Voeg betaalgegevens toe bij "Billing" (verplicht voor de Images API,
//    ook al is de kost per recept minimaal)
// 5. Mogelijk vraagt OpenAI een "Organization Verification" voor je de
//    gpt-image-modellen mag gebruiken — volg de instructies op hun site
//    als dat verschijnt
// 6. Zet de sleutel in Netlify: Site settings → Environment variables →
//    voeg toe: OPENAI_API_KEY = <jouw sleutel>
// 7. Herdeploy zodat de nieuwe omgevingsvariabele meegenomen wordt
//
// Zonder deze sleutel geeft deze functie gewoon { image: null } terug — de
// app valt dan automatisch terug op de vaste noodfoto.

const OPENAI_MODEL = 'gpt-image-1';
const STYLE_PROMPT = 'Shot at a 45 degree three-quarter angle, slightly above the dish, shallow depth of field with a soft blurred background. '
  + 'Soft warm natural window light, diffused side light with gentle shadows, golden hour warmth, cozy inviting mood. '
  + 'Warm amber and honey color grading, muted terracotta and cream tones, slightly desaturated background with warm-boosted midtones on the food. '
  + 'Rustic wooden table surface with visible grain, a soft crumpled cloth napkin nearby (checkered red-and-white or simple stripes). '
  + 'Matte earthy stoneware or ceramic dish in cream, grey or soft terracotta tones, never glossy white porcelain. '
  + 'Generous homely portion, simple fresh herb garnish, optional wisp of steam if the dish is hot. '
  + 'A few scattered raw ingredients loosely placed nearby (fresh herb sprig, halved cherry tomato, garlic clove). '
  + 'Style: dagelijkse kost, warm, huiselijk, lekker, vlaams, antwerps, stimulerend, gezellig, eerlijk, onbewerkt. '
  + 'No people, no faces, no hands, no body parts. No sushi or Asian plating unless the dish itself is Asian. '
  + 'No fine-dining or molecular gastronomy plating. No neon or cold color grading. No glossy studio-perfect commercial look. '
  + 'Small, subtle text in the bottom right corner reading exactly "Tony\'s recipe book", like a photographer signature.';

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
    'Cache-Control': 'no-store',
  };

  try {
    const qs = event.queryStringParameters || {};

    const apiKey = process.env.OPENAI_API_KEY;

    // ── DIAGNOSEMODUS — ?debug=1 toont wat de functie ontvangt, zonder
    // OpenAI aan te roepen (en dus zonder kosten) ──
    if (qs.debug) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          heeftSleutel: !!apiKey,
          sleutelLengte: apiKey ? apiKey.length : 0,
          sleutelPreview: apiKey ? (apiKey.slice(0, 8) + '...' + apiKey.slice(-6)) : null,
        }),
      };
    }

    const name = qs.name;
    const ingredients = qs.ingredients || '';

    if (!name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Naam van het recept ontbreekt', image: null }) };
    }

    if (!apiKey) {
      return { statusCode: 200, headers, body: JSON.stringify({ image: null, reason: 'Geen OPENAI_API_KEY ingesteld in Netlify' }) };
    }

    const prompt = `Professional food photography of the Belgian home-cooked dish "${name}"`
      + (ingredients ? ` with ${ingredients}` : '')
      + `. ${STYLE_PROMPT}`;

    let res;
    try {
      res = await timeoutFetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            prompt: prompt,
            size: '1024x1024',
            quality: 'medium',
            n: 1,
          }),
        },
        25000
      );
    } catch (e) {
      return { statusCode: 200, headers, body: JSON.stringify({ image: null, reason: 'Timeout of netwerkfout: ' + String(e && e.message || e) }) };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { statusCode: 200, headers, body: JSON.stringify({ image: null, reason: 'OpenAI HTTP ' + res.status, detail: errText.slice(0, 400) }) };
    }

    const data = await res.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;

    if (!b64) {
      return { statusCode: 200, headers, body: JSON.stringify({ image: null, reason: 'Geen afbeelding in OpenAI-antwoord', raw: JSON.stringify(data).slice(0, 300) }) };
    }

    const dataUri = `data:image/png;base64,${b64}`;

    return { statusCode: 200, headers, body: JSON.stringify({ image: dataUri }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err && err.message || err), image: null }) };
  }
};
