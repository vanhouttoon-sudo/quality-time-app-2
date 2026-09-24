// netlify/functions/tv-epg.js
//
// Haalt een gratis, publiek XMLTV-programmagids-bestand op (gezipt), pakt het
// server-side uit en filtert het tot enkel de Vlaamse zenders die we nodig
// hebben — geeft een compacte tijdlijn (starttijd + titel per programma) per
// zender terug, klaar om als horizontale tijdlijn te tonen.
//
// Bron: open-epg.com (lichtste, volledig gevulde gratis Belgische XMLTV-file)
// met epgshare01 als aanvulling voor zenders die in de eerste ontbreken.
// Beide bronnen zijn vrij te gebruiken IPTV-EPG-aggregators, geen account
// of API-key nodig.
//
// BELANGRIJKE BEPERKING: Sporza en de Play-zenders (Play 4-7) staan NIET
// bevestigd in deze gratis bronnen (enkel VRT 1/Eén, VRT Canvas, Ketnet,
// VTM, VTM 2-4 zijn bevestigd gevuld). Voor zenders zonder data geeft deze
// functie gewoon een lege lijst terug — de app valt dan terug op de
// "nu bezig"-zoekopdracht (tv-now-playing.js) voor die specifieke zender.

const zlib = require('zlib');

const SOURCES = [
  'https://www.open-epg.com/files/belgium.xml.gz',
  'https://epgshare01.online/epgshare01/epg_ripper_BE2.xml.gz'
];

// Herkenning via de weergavenaam in de XMLTV-zenderlijst, niet via een vast
// ID — want die ID's verschillen per bron en veranderen soms (Eén → VRT 1).
const CHANNEL_MATCHERS = {
  een:    [/^vrt\s*1$/i, /^e[eé]n$/i],
  canvas: [/^vrt\s*canvas$/i, /^canvas$/i],
  ketnet: [/^ketnet$/i],
  sporza: [/^sporza$/i],
  vtm:    [/^vtm$/i],
  vtm2:   [/^vtm\s*2$/i],
  vtm3:   [/^vtm\s*3$/i],
  vtm4:   [/^vtm\s*4$/i],
  play4:  [/^play\s*4$/i],
  play5:  [/^play\s*(5|fictie)$/i],
  play6:  [/^play\s*6$/i],
  play7:  [/^play\s*7$/i],
};

function matchOurKey(displayName) {
  var name = (displayName || '').trim();
  for (var key in CHANNEL_MATCHERS) {
    var patterns = CHANNEL_MATCHERS[key];
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(name)) return key;
    }
  }
  return null;
}

async function fetchAndParse(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const xml = zlib.gunzipSync(buf).toString('utf8');

  // 1) Zender-ID -> onze eigen sleutel, via de weergavenaam
  const idToKey = {};
  const chanRe = /<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g;
  let m;
  while ((m = chanRe.exec(xml))) {
    const id = m[1];
    const inner = m[2];
    const nameMatch = /<display-name[^>]*>([^<]+)<\/display-name>/.exec(inner);
    if (!nameMatch) continue;
    const key = matchOurKey(nameMatch[1]);
    if (key && !idToKey[id]) idToKey[id] = key;
  }

  // 2) Programma's voor die zenders eruit filteren
  const result = {};
  const progRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  while ((m = progRe.exec(xml))) {
    const attrs = m[1];
    const inner = m[2];
    const chanIdMatch = /channel="([^"]+)"/.exec(attrs);
    if (!chanIdMatch) continue;
    const key = idToKey[chanIdMatch[1]];
    if (!key) continue;
    const startMatch = /start="([^"]+)"/.exec(attrs);
    const stopMatch = /stop="([^"]+)"/.exec(attrs);
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/.exec(inner);
    if (!startMatch || !titleMatch) continue;
    if (!result[key]) result[key] = [];
    result[key].push({ start: startMatch[1], stop: stopMatch ? stopMatch[1] : '', title: titleMatch[1] });
  }
  return result;
}

exports.handler = async function () {
  try {
    let merged = {};
    for (const url of SOURCES) {
      try {
        const parsed = await fetchAndParse(url);
        for (const key in parsed) {
          if (!merged[key] || merged[key].length === 0) merged[key] = parsed[key];
        }
      } catch (e) {
        // Deze bron faalde — ga door naar de volgende, geef pas op het einde op
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, channels: merged, ts: Date.now() })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: (e && e.message) || 'onbekende fout' }) };
  }
};
