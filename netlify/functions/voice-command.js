// netlify/functions/voice-command.js
//
// Zet een gesproken (of getypte) opdracht om in een gestructureerd commando.
//   POST  application/json   { text, now }   -> enkel begrijpen
//   POST  audio/*  (blob)    header X-Now    -> eerst transcriberen (Whisper), dan begrijpen
// Antwoord: { ok, transcript, command }
// Vereist env var OPENAI_API_KEY (staat al ingesteld voor de receptafbeeldingen).

const DAGEN = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];

function extFor(type) {
  if (/mp4|m4a|aac/.test(type)) return 'm4a';
  if (/ogg/.test(type)) return 'ogg';
  if (/wav/.test(type)) return 'wav';
  if (/mpeg|mp3/.test(type)) return 'mp3';
  return 'webm';
}

async function transcribe(buf, type, key) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: type }), 'opname.' + extFor(type));
  form.append('model', 'whisper-1');
  form.append('language', 'nl');
  form.append('prompt', 'Afspraak, notitie, morgen, overmorgen, volgende week, tandarts, nucleair, schuif, verwijder.');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form
  });
  if (!r.ok) throw new Error('Transcriptie mislukt (' + r.status + ')');
  const j = await r.json();
  return (j.text || '').trim();
}

async function understand(text, nowIso, key) {
  const now = new Date(nowIso || Date.now());
  const pad = n => String(n).padStart(2, '0');
  // nowIso komt van de telefoon in lokale tijd, bv. 2026-10-08T16:33
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(nowIso || '');
  const todayStr = m ? m[1] + '-' + m[2] + '-' + m[3] : now.toISOString().slice(0, 10);
  const timeStr = m ? m[4] + ':' + m[5] : pad(now.getHours()) + ':' + pad(now.getMinutes());
  const dow = DAGEN[new Date(todayStr + 'T12:00:00').getDay()];

  const system =
    'Je zet Nederlandstalige (Vlaamse) gesproken opdrachten voor een agenda-app om naar JSON. ' +
    'Vandaag is ' + dow + ' ' + todayStr + ', het is nu ' + timeStr + '. ' +
    'Reken relatieve data ("morgen", "overmorgen", "vrijdag", "volgende week maandag") om naar YYYY-MM-DD; ' +
    'een weekdag zonder meer = eerstvolgende die dag in de toekomst. Tijden naar 24u HH:MM ("2 uur \'s middags" = 14:00, "half drie" = 14:30 of 02:30 naar context, "19u30" = 19:30). ' +
    'Antwoord met ENKEL een JSON-object met deze velden:\n' +
    '{"action":"create|shift|delete|urgent|done|done_all|query|note|training|waste|zang|unknown",' +
    '"title":"korte nette titel met hoofdletter (bij create)",' +
    '"date":"YYYY-MM-DD (create: datum afspraak; query: datum waarover gevraagd wordt)",' +
    '"start":"HH:MM of leeg","allDay":true/false,' +
    '"location":"plaats of leeg",' +
    '"target":"kernwoorden van de bestaande afspraak waarover het gaat (shift/delete/urgent)",' +
    '"targetDate":"YYYY-MM-DD van die bestaande afspraak indien genoemd, anders leeg",' +
    '"newDate":"YYYY-MM-DD waarheen verschuiven (shift); leeg = één dag later",' +
    '"newStart":"HH:MM nieuwe tijd bij shift indien genoemd, anders leeg",' +
    '"undo":"true als de afspraak juist NIET meer afgevinkt moet zijn (done), anders false",' +
    '"scope":"week of day (waste: vraag over een hele week of één dag)",' +
    '"noteText":"inhoud van de notitie (note)",' +
    '"noteTitle":"korte titel notitie (note)"}\n' +
    'Acties: create = afspraak aanmaken; shift = afspraak verplaatsen/uitstellen ("verplaats naar morgen" = newDate is morgen, "een dag uitstellen" = newDate leeg); delete = afspraak verwijderen; ' +
    'urgent = afspraak als nucleair/urgent/belangrijk markeren; query = vragen wat er op de agenda staat; ' +
    'note = notitie toevoegen; done = afspraak/taak afvinken ("vink tandarts af", "tandarts is gedaan"); done_all = alle afspraken van een dag afvinken (date); training = vragen wat de training van een dag is (date); waste = vragen welk afval buiten moet / opgehaald wordt (scope week als er over "deze week"/"volgende week" gevraagd wordt, date = een dag in die week, anders vandaag); zang = zangles openen/activeren; unknown = niet begrepen. Zonder datum bij create: vandaag. Zonder tijd en niet expliciet "hele dag": allDay=false en start leeg.';

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: text }]
    })
  });
  if (!r.ok) throw new Error('Begrijpen mislukt (' + r.status + ')');
  const j = await r.json();
  const raw = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return JSON.parse(raw || '{}');
}

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json' }
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Enkel POST' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(500, { ok: false, error: 'OPENAI_API_KEY ontbreekt in Netlify' });

  try {
    const type = (req.headers.get('content-type') || '').toLowerCase();
    let transcript = '';
    let nowIso = '';
    if (type.indexOf('application/json') === 0) {
      const body = await req.json();
      transcript = String(body.text || '').trim();
      nowIso = body.now || '';
    } else {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json(400, { ok: false, error: 'Lege opname' });
      nowIso = req.headers.get('x-now') || '';
      transcript = await transcribe(buf, type || 'audio/webm', key);
    }
    if (!transcript) return json(200, { ok: true, transcript: '', command: { action: 'unknown' } });
    const command = await understand(transcript, nowIso, key);
    return json(200, { ok: true, transcript, command });
  } catch (e) {
    return json(500, { ok: false, error: (e && e.message) || 'Onbekende fout' });
  }
};
