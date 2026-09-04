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
const STYLE_PROMPT = 'STYLE — THE SINGLE MOST IMPORTANT INSTRUCTION: this must look exactly like a hero still frame from a beloved Flemish Belgian daily television cooking show, in the unmistakable style of "Dagelijkse Kost" — push this identity as far as possible, make it unmissable and iconic, not a subtle hint. '
  + 'MOUTHWATERING FOOD STYLING, taken to the extreme: glistening, fresh-off-the-stove sheen on the food — visible glossy butter or oil sheen, perfectly caramelized and seared edges, vibrant fresh herbs that pop with color, every ingredient looking irresistibly appetizing, magazine-cover-worthy appetite appeal, but still completely homely and unpretentious. '
  + 'Bright, clean, high-key studio kitchen lighting — crisp, even, gorgeous daylight-balanced light exactly like a live television cooking broadcast, NOT moody, NOT dark, NOT dramatic restaurant lighting. '
  + 'Shot on a professional camera with a fast prime lens: tack-sharp, richly detailed focus on the food, creamy soft bokeh in the background, real editorial food-photography polish. '
  + 'Shot at a 45 degree three-quarter angle or true top-down flat lay, as if filmed for television, slightly above the dish. '
  + 'Setting: a real, lived-in Flemish home kitchen counter — a rustic wooden chopping board or a light granite/marble kitchen worktop, NOT a restaurant table, NOT a styled dining table. '
  + 'Simple, everyday white or cream ceramic plates and bowls exactly like a Belgian home kitchen, plain and unpretentious — absolutely not fine-dining porcelain, not designer tableware. '
  + 'Rich, layered signs of an active home kitchen just used: a wooden spoon or knife casually placed nearby, a light dusting of flour or herb confetti on the counter, a cutting board with fresh herbs just chopped, maybe a steaming pot slightly out of focus in the background. '
  + 'Warm, rich, honest color grading — warm ambers and creams pushed to full saturation on the food itself, natural and utterly appetizing, never neon, never cold, never washed out. '
  + 'Generous, hearty, unpretentious Flemish home-cooking portion — comfort food, not a small fine-dining serving. Simple fresh herb garnish only, never architectural or tweezer-plated. A visible wisp of steam rising if the dish is hot — make it look irresistibly fresh out of the pan. '
  + 'A few raw ingredients relevant to the dish scattered loosely and beautifully nearby, exactly as a home cook would leave them while plating (garlic clove, herb sprig, halved tomato). '
  + 'Mood: dagelijkse kost, warm, huiselijk, lekker, vlaams, antwerps, stimulerend, gezellig, eerlijk, onbewerkt, herkenbaar, uitnodigend, mondwaterend — this should feel completely familiar and utterly craveable to any Belgian who watches daily cooking shows on television. This should be a true visual gem — the kind of shot that makes people want to cook this exact dish tonight. '
  + 'STRICTLY AVOID: no people, no faces, no hands, no body parts, no chefs. No sushi or Asian plating unless the dish itself is genuinely Asian. No fine-dining or molecular gastronomy plating. No neon or cold color grading. No glossy magazine-perfect COMMERCIAL STUDIO look (this must feel like a real home kitchen, not an ad). No dark or moody restaurant lighting. '
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

    const prompt = `A still frame from a Flemish home-cooking television show, showing the finished dish "${name}"`
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
