// netlify/functions/generate-recipe-image.js
//
// Genereert een receptfoto via Google's Gemini 2.5 Flash Image ("Nano Banana").
// De gegenereerde foto wordt centraal opgeslagen in Netlify Blobs.
// Daardoor wordt een foto per receptnaam maar één keer gegenereerd en daarna
// door alle browsers/toestellen hergebruikt.

const { connectLambda, getStore } = require('@netlify/blobs');

const GEMINI_MODEL = 'gemini-2.5-flash-image';
const STORE_NAME = 'recipe-images';
const LOCK_TTL_MS = 2 * 60 * 1000;
const WAIT_FOR_IMAGE_MS = 30 * 1000;
const POLL_MS = 1000;

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function recipeKey(name) {
  const crypto = require('crypto');
  return 'recipe/' + crypto.createHash('sha256').update(String(name), 'utf8').digest('hex');
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
}

function imageResponse(buffer, mime) {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': mime || 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    isBase64Encoded: true,
    body: Buffer.from(buffer).toString('base64'),
  };
}

async function getImage(store, key) {
  const entry = await store.getWithMetadata(key, {
    type: 'arrayBuffer',
    consistency: 'strong'
  });

  if (!entry || !entry.data) return null;

  return {
    data: entry.data,
    mime: (entry.metadata && entry.metadata.contentType) || 'image/png',
  };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const name = (qs.name || '').trim();
    const ingredients = qs.ingredients || '';

    if (!name) {
      return jsonResponse(400, {
        error: 'Naam van het recept ontbreekt',
        image: null
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return jsonResponse(503, {
        image: null,
        reason: 'Geen GEMINI_API_KEY ingesteld in Netlify'
      });
    }

    connectLambda(event);

    const store = getStore({
      name: STORE_NAME,
      consistency: 'strong'
    });

    const key = recipeKey(name);

    // 1. Centrale cache:
    // bestaat de foto al, dan wordt Gemini helemaal niet aangeroepen.
    const cached = await getImage(store, key);

    if (cached) {
      return imageResponse(cached.data, cached.mime);
    }

    // 2. Eén centrale lock per recept.
    // Als meerdere browsers tegelijk dezelfde foto vragen,
    // mag slechts één request Gemini aanspreken.
    const lockKey = 'lock/' + key;
    const now = Date.now();

    const existingLock = await store.get(lockKey, {
      type: 'json',
      consistency: 'strong'
    });

    if (
      existingLock &&
      existingLock.startedAt &&
      (now - existingLock.startedAt) < LOCK_TTL_MS
    ) {
      // Iemand anders is deze foto aan het genereren.
      // Wacht even op het resultaat.
      const deadline = Date.now() + WAIT_FOR_IMAGE_MS;

      while (Date.now() < deadline) {
        await sleep(POLL_MS);

        const ready = await getImage(store, key);

        if (ready) {
          return imageResponse(ready.data, ready.mime);
        }
      }

      return jsonResponse(503, {
        image: null,
        reason: 'Foto wordt momenteel door een andere aanvraag gegenereerd; probeer later opnieuw.'
      });
    }

    // Oude/stale lock opruimen.
    if (existingLock) {
      try {
        await store.delete(lockKey);
      } catch (e) {}
    }

    // Probeer de lock te claimen.
    const lockResult = await store.setJSON(
      lockKey,
      { startedAt: now },
      { onlyIfNew: true }
    );

    if (!lockResult.modified) {
      // Een gelijktijdige request won de race.
      // Wacht op de centrale foto.
      const deadline = Date.now() + WAIT_FOR_IMAGE_MS;

      while (Date.now() < deadline) {
        await sleep(POLL_MS);

        const ready = await getImage(store, key);

        if (ready) {
          return imageResponse(ready.data, ready.mime);
        }
      }

      return jsonResponse(503, {
        image: null,
        reason: 'Foto wordt momenteel gegenereerd; probeer later opnieuw.'
      });
    }

    try {
      // Check nog één keer na het claimen van de lock.
      const cachedAfterLock = await getImage(store, key);

      if (cachedAfterLock) {
        return imageResponse(
          cachedAfterLock.data,
          cachedAfterLock.mime
        );
      }

      // Gemini-prompt.
      const prompt =
        `Fotografeer nauwkeurig het Belgische thuisgerecht dat letterlijk "${name}" heet — dit exacte gerecht, zoals het écht bereid en opgediend wordt, niet een andere keuken of interpretatie.`
        + (ingredients
          ? ` Ter info, enkele hoofdingrediënten: ${ingredients}.`
          : '')
        + ` ${STYLE_SUFFIX}`;

      let res;

      try {
        res = await timeoutFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                responseModalities: ['IMAGE']
              }
            }),
          },
          20000
        );
      } catch (e) {
        return jsonResponse(503, {
          image: null,
          reason:
            'Timeout of netwerkfout: ' +
            String(e && e.message || e)
        });
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');

        const status = res.status === 429 ? 429 : 503;

        return jsonResponse(status, {
          image: null,
          reason: 'Gemini HTTP ' + res.status,
          detail: errText.slice(0, 300)
        });
      }

      const data = await res.json();

      const candidate =
        data &&
        data.candidates &&
        data.candidates[0];

      const parts =
        (candidate &&
          candidate.content &&
          candidate.content.parts) ||
        [];

      const imgPart = parts.find(
        p => p.inlineData && p.inlineData.data
      );

      if (!imgPart) {
        return jsonResponse(503, {
          image: null,
          reason: 'Geen afbeelding in Gemini-antwoord',
          finishReason:
            candidate && candidate.finishReason
        });
      }

      const mime =
        imgPart.inlineData.mimeType ||
        'image/png';

      const imageBuffer = Buffer.from(
        imgPart.inlineData.data,
        'base64'
      );

      // 3. Centrale opslag.
      // Vanaf dit moment kost dit recept geen Gemini-call meer.
      const arrayBuffer = imageBuffer.buffer.slice(
        imageBuffer.byteOffset,
        imageBuffer.byteOffset +
          imageBuffer.byteLength
      );

      await store.set(key, arrayBuffer, {
        metadata: {
          contentType: mime,
          recipeName: name,
          generatedAt: new Date().toISOString(),
          model: GEMINI_MODEL,
        },
        onlyIfNew: true,
      });

      return imageResponse(
        imageBuffer,
        mime
      );

    } finally {
      // De foto staat nu centraal;
      // de lock mag weg.
      try {
        await store.delete(lockKey);
      } catch (e) {}
    }

  } catch (err) {
    return jsonResponse(500, {
      error: String(
        err && err.message || err
      ),
      image: null
    });
  }
};
