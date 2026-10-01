// netlify/functions/event-reminders.js
//
// Houdt een lijst bij van geplande herinneringen voor eigen (lokale) afspraken,
// in Netlify Blobs. De achtergrondfunctie (send-notifications.js) leest deze
// lijst elke 15 minuten en stuurt een melding wanneer een afspraak begint, en
// om 23:00 een extra melding voor urgente afspraken die dan nog niet zijn
// afgevinkt.
//
//   POST   → body { id, date, time, title, urgent, done } — aanmaken/bijwerken
//   DELETE → ?id=...                                       — verwijderen
//   GET    → geeft alle herinneringen terug (gebruikt door send-notifications.js)
//
// Geen API-key nodig — gebruikt enkel Netlify Blobs, net als note-attachment.js.

import { getStore } from '@netlify/blobs';

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

export default async (req) => {
  try {
    const store = getStore('event-reminders');
    const url = new URL(req.url);

    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch(e) { return json({ ok:false, error:'ongeldige JSON' }, 400); }
      if (!body || !body.id || !body.date || !body.time || !body.title) {
        return json({ ok:false, error:'id, date, time en title zijn verplicht' }, 400);
      }
      const item = {
        id: String(body.id), date: String(body.date), time: String(body.time),
        title: String(body.title).slice(0, 120),
        urgent: !!body.urgent, done: !!body.done
      };
      await store.setJSON(item.id, item);
      return json({ ok:true });
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ ok:false, error:'id ontbreekt' }, 400);
      await store.delete(id);
      return json({ ok:true });
    }

    if (req.method === 'GET') {
      const list = await store.list();
      const items = [];
      for (const b of list.blobs) {
        try { const v = await store.get(b.key, { type: 'json' }); if (v) items.push(v); } catch(e) {}
      }
      return json({ ok:true, items });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    return json({ ok:false, error:(e && e.message) || 'onbekende fout' }, 500);
  }
};
