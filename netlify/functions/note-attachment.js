// netlify/functions/note-attachment.js
//
// Slaat bijlagen bij notities op in Netlify Blobs (ingebouwde, gratis opslag van
// Netlify zelf — geen aparte database of API-key nodig, in tegenstelling tot de
// andere functies zoals notitie-foto.js).
//
// POST  → upload een bestand, geeft een key terug om het later op te vragen
// GET   → haal een bestand op via ?key=...
// DELETE → verwijder een bijlage via ?key=...
//
// Let op: Netlify-functies verwerken uploads synchroon; hou bijlagen bij voorkeur
// onder ~4-5 MB (grotere bestanden vereisen een andere upload-strategie).

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const store = getStore('note-attachments');

  try {
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { filename, mimetype, dataBase64 } = body;
      if (!filename || !dataBase64) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'filename en dataBase64 zijn verplicht' }) };
      }
      const buffer = Buffer.from(dataBase64, 'base64');
      // Ruwe limiet i.f.v. de synchrone Netlify-functie-omgeving
      if (buffer.length > 5 * 1024 * 1024) {
        return { statusCode: 413, body: JSON.stringify({ ok: false, error: 'Bestand is groter dan 5 MB — niet ondersteund via deze route.' }) };
      }
      var safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      var key = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName;
      await store.set(key, buffer, {
        metadata: { filename: String(filename), mimetype: mimetype || 'application/octet-stream', size: buffer.length }
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, key: key, filename: filename, mimetype: mimetype || 'application/octet-stream', size: buffer.length })
      };
    }

    if (event.httpMethod === 'GET') {
      var qKey = event.queryStringParameters && event.queryStringParameters.key;
      if (!qKey) return { statusCode: 400, body: 'key ontbreekt' };
      var entry = await store.getWithMetadata(qKey, { type: 'arrayBuffer' });
      if (!entry) return { statusCode: 404, body: 'Bijlage niet gevonden' };
      var meta = entry.metadata || {};
      return {
        statusCode: 200,
        headers: {
          'Content-Type': meta.mimetype || 'application/octet-stream',
          'Content-Disposition': 'inline; filename="' + (meta.filename || qKey) + '"',
          'Cache-Control': 'public, max-age=31536000, immutable'
        },
        body: Buffer.from(entry.data).toString('base64'),
        isBase64Encoded: true
      };
    }

    if (event.httpMethod === 'DELETE') {
      var dKey = event.queryStringParameters && event.queryStringParameters.key;
      if (!dKey) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'key ontbreekt' }) };
      await store.delete(dKey);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: (e && e.message) || 'onbekende fout' }) };
  }
};
