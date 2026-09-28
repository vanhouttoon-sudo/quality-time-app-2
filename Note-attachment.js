// netlify/functions/note-attachment.js
//
// Slaat bijlagen op in Netlify Blobs (ingebouwde opslag van Netlify) en geeft
// ze terug. Gebruikt voor bijlagen bij notities én voor de opnames in Zanglessen.
//
//   POST   → bestand als binaire inhoud in de body; naam in de header X-Filename
//   GET    → ?key=...   haalt een bestand op
//   DELETE → ?key=...   verwijdert een bestand
//
// Dit is het MODERNE functieformaat (export default + Request/Response), net als
// send-notifications.js. In dat formaat wordt Netlify Blobs automatisch
// geconfigureerd. De vorige versie gebruikte het oudere Lambda-formaat zonder
// connectLambda(event) aan te roepen, waardoor elke aanroep crashte.
//
// VEREIST: een package.json in de hoofdmap van de repo met de dependency
// "@netlify/blobs" (zie meegeleverd package.json), zodat Netlify die installeert.
//
// Limiet: Netlify-functies accepteren max ~6 MB per aanvraag, dus houden we
// ~5 MB per bestand aan.

import { getStore } from '@netlify/blobs';

const MAX_BYTES = 5.5 * 1024 * 1024;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default async (req) => {
  try {
    const store = getStore('note-attachments');
    const url = new URL(req.url);

    if (req.method === 'POST') {
      let filename = 'bestand';
      try { filename = decodeURIComponent(req.headers.get('x-filename') || 'bestand'); } catch (e) {}
      const mimetype = req.headers.get('content-type') || 'application/octet-stream';
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ ok: false, error: 'Leeg bestand ontvangen' }, 400);
      if (buf.byteLength > MAX_BYTES) return json({ ok: false, error: 'Bestand is groter dan ~5 MB' }, 413);
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName;
      await store.set(key, buf, { metadata: { filename: filename, mimetype: mimetype, size: buf.byteLength } });
      return json({ ok: true, key: key, filename: filename, mimetype: mimetype, size: buf.byteLength });
    }

    if (req.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) return new Response('key ontbreekt', { status: 400 });
      const entry = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!entry) return new Response('Bijlage niet gevonden', { status: 404 });
      const meta = entry.metadata || {};
      return new Response(entry.data, {
        status: 200,
        headers: {
          'Content-Type': meta.mimetype || 'application/octet-stream',
          'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(meta.filename || key),
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    }

    if (req.method === 'DELETE') {
      const key = url.searchParams.get('key');
      if (!key) return json({ ok: false, error: 'key ontbreekt' }, 400);
      await store.delete(key);
      return json({ ok: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    return json({ ok: false, error: (e && e.message) || 'onbekende fout' }, 500);
  }
};
