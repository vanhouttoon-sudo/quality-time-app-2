// ═══════════════════════════════════════════════════════════════════
// QualityTime — Make my Day: regionale suggesties (laag 5)
// ═══════════════════════════════════════════════════════════════════
// PRIORITEIT (van hoog naar laag):
//   1. TIJDELIJKE LOKALE EVENEMENTEN — "nu of nooit": optochten, reuzen,
//      pop-ups, kortlopende exposities, festivals. Volgende week zijn ze
//      weg, dus die krijgen altijd voorrang (WEIGHT.temp).
//   2. Officiële regionale evenementen (vertrouwde bronnenlijst).
//   3. LEUKE VASTE ACTIVITEITEN — als terugval wanneer er niets tijdelijks
//      te vinden is: wekelijkse markten, een looprondje, enz. Zie de lijst
//      EVERGREEN hieronder: die kan je zelf gewoon uitbreiden.
//   4. Film / horeca.
//
// UiTdatabank is optioneel (betaald, €125/jaar) — Tavily is de gratis hoofdweg.
//
// VEREISTE environment variable in Netlify:
//   TAVILY_API_KEY        — gratis aan te vragen via tavily.com
// Optioneel:
//   UITDATABANK_API_KEY
// ═══════════════════════════════════════════════════════════════════

// Thuisbasis — Edegem. Alle horeca-zoekopdrachten draaien hier rond.
const HOME_CITY = 'Edegem';
const HOME_RADIUS_KM = 15;

// Gemeentes binnen ~15 km van Edegem. Edegem zelf staat er het vaakst in.
// Borgerhout en Hoboken zijn toegevoegd (o.a. de Reuzen in Borgerhout).
const REGIONS = [
  'Edegem', 'Edegem', 'Edegem',
  'Hove', 'Kontich', 'Mortsel', 'Wilrijk', 'Aartselaar', 'Boechout',
  'Berchem', 'Borsbeek', 'Wommelgem', 'Antwerpen centrum', 'Deurne', 'Zwijndrecht', 'Boom',
  'Borgerhout', 'Hoboken'
];
function randomRegion() {
  return REGIONS[Math.floor(Math.random() * REGIONS.length)];
}

// Zelfde vertrouwde bronnen als DEFAULT_BRONNEN in app.html (Instellingen
// > Bronnen). Hou deze lijst in sync als je daar iets wijzigt.
const TRUSTED_EVENT_DOMAINS = [
  'uitinvlaanderen.be', 'uitinantwerpen.be', 'antwerpen.be',
  'mortsel.be', 'edegem.be', 'hetpaleis.be', 'desingel.be',
  'sport.antwerpen.be', 'jogging.be', 'cycling.be',
  'gezinsbond.be', 'kmska.be', 'rivierenhof.be'
];

const CHAIN_DOMAINS = ['starbucks.com', 'exki.be', 'exki.com', 'lepainquotidien.com', 'points-de-vue.com'];

const UITDATABANK_KEY = process.env.UITDATABANK_API_KEY;
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// Prioriteitsgewicht — hoger = eerder als standaardsuggestie getoond.
// temp (tijdelijk lokaal evenement) staat bewust bovenaan.
const WEIGHT = { temp: 30, event: 20, hiddenEvent: 16, evergreen: 15, movie: 14, horeca: 12 };

// ── Herkenning van "tijdelijk / nu of nooit" ──────────────────────────
// Bewust enkel sterke signaalwoorden (geen losse woorden als "opening" of
// "expo", die komen in gewone pagina's te vaak voor).
const TEMP_RE = /\b(tijdelijk|tijdelijke|enkel (dit|deze|nog)|slechts|eenmalig|uitzonderlijk|laatste (dag|dagen|kans|weekend)|nog tot|loopt tot|tot en met|dit weekend|deze week|pop-?up|optocht|stoet|parade|reuzen|spektakel|kermis|lichtparcours|openluchtspektakel)\b/i;
function looksTemporary(text) {
  return TEMP_RE.test(String(text || ''));
}

// ── VASTE LEUKE ACTIVITEITEN (terugval als er niets tijdelijks is) ─────
// Zelf uit te breiden. Velden:
//   days    : weekdagen waarop het kan (0 = zondag ... 6 = zaterdag), of null = altijd
//   slot    : ochtend | middag | namiddag | avond
//   notFor  : dayTypes waarvoor het NIET voorgesteld wordt (bv. 'fam_time')
const EVERGREEN = [
  {
    title: 'Vogelenmarkt Antwerpen',
    sub: 'Elke zondag 8–13u (zomer tot 14u) · antiek, planten, kleding — sinds 2026 zonder dieren',
    days: [0], slot: 'ochtend', time: '10:00', icon: '🐦',
    mapsQuery: 'Vogelenmarkt Theaterplein Antwerpen',
    url: 'https://www.uitinvlaanderen.be/agenda/e/zondagse-vogelenmarkt/e02f4e51-0b42-4357-ad89-4a8e9b4d8798'
  },
  {
    title: 'Exotische markt op het Theaterplein',
    sub: 'Elke zaterdag 8–16u · verse producten en specialiteiten uit de hele wereld',
    days: [6], slot: 'ochtend', time: '10:30', icon: '🧺',
    mapsQuery: 'Theaterplein Antwerpen'
  },
  {
    title: 'Toertje lopen in het Rivierenhof',
    sub: 'Rustig looprondje door het groen in Deurne',
    days: null, slot: 'namiddag', time: '16:00', icon: '🏃',
    mapsQuery: 'Rivierenhof Deurne', notFor: ['fam_time']
  },
  {
    title: 'Loop- of wandelrondje rond Fort 5',
    sub: 'Vlak bij huis, in Edegem',
    days: null, slot: 'ochtend', time: '09:00', icon: '🏃',
    mapsQuery: 'Fort 5 Edegem', notFor: ['fam_time']
  }
];
function buildEvergreen(dateStr, dayType) {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return EVERGREEN
    .filter(function (e) {
      return (!e.days || e.days.indexOf(dow) > -1) && (e.notFor || []).indexOf(dayType) === -1;
    })
    .map(function (e) {
      return {
        title: e.title, sub: e.sub,
        source: 'web', category: 'activity', weight: WEIGHT.evergreen,
        timeSlot: e.slot, time: e.time,
        photoUrl: null, sourceUrl: e.url || null,
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.mapsQuery),
        icon: e.icon
      };
    });
}

// Variatie in het TYPE horeca-plek — telkens een andere invalshoek.
const HORECA_FLAVORS = {
  ochtend: [
    'een gespecialiseerde koffiebranderij', 'een verborgen theesalon',
    'een boekencafé', 'een ambachtelijke bakkerij met zitplaats',
    'een botanisch ontbijtcafé', 'een klein familiebedrijf-koffiehuis'
  ],
  middag: [
    'een verborgen lunchplekje', 'een foodmarkt of hallen met lokale kramen',
    'een tuincafé', 'een bijzonder broodjeszaak', 'een wijnbar met lichte lunch',
    'een authentiek buurtrestaurant'
  ],
  namiddag: [
    'een ambachtelijke ijssalon', 'een curiosaen-koffiehuis vol snuisterijen',
    'een patisserie met verrassend gebak', 'een rustig theehuis',
    'een chocolatier met proeverij'
  ],
  avond: [
    'een verborgen bistro', 'een authentiek buurtrestaurant',
    'een sfeervolle wijnbar met tapas', 'een familiezaak met een verrassende keuken',
    'een intiem eetcafé', 'een gezellig biercafé met een uitgebreide bierkaart',
    'een verrassend terras om een pintje te drinken'
  ]
};
function randomFlavor(slot) {
  var list = HORECA_FLAVORS[slot] || ['een leuke plek'];
  return list[Math.floor(Math.random() * list.length)];
}

function timeSlotForHour(h) {
  if (h < 11) return 'ochtend';
  if (h < 14) return 'middag';
  if (h < 18) return 'namiddag';
  return 'avond';
}

// Herkent overzichtsartikels en programmapagina's — die zijn geen concrete,
// enkele activiteit en worden geweerd.
const LISTICLE_RE = /\b(top\s*\d+|de\s*\d+\s|beste\s*\d+|\d+\s*(beste|leukste|leuke|toffe|terrassen|terrasjes|caf[ée]s|restaurants|adressen|plekjes|plekken|tips|zaken)|(zomer|winter|lente|herfst|jaar|activiteiten|evenementen)?kalender|programma(boekje)?|activiteitenaanbod|overzicht(spagina)?|wat\s*te\s*doen\s*in)\b/i;

function pickConcreteResult(results) {
  results = results || [];
  var clean = results.filter(function (r) { return !LISTICLE_RE.test(r.title || ''); });
  return clean.length ? clean : results;
}

function cleanVenueTitle(rawTitle, fallback) {
  if (!rawTitle) return fallback;
  var t = rawTitle.split(/[|\-–·]/)[0].trim();
  return t.length > 2 ? t.slice(0, 45) : fallback;
}

// Belgisch adrespatroon uit vrije tekst plukken. Best-effort.
const ADDRESS_RE = /([A-ZÀ-Ý][\wÀ-ÿ'’.\- ]{2,40}\s\d{1,4}[a-zA-Z]?)\s*,?\s*(\d{4})\s+([A-ZÀ-Ý][\wÀ-ÿ\-\s]{2,25})/;
function extractAddress(text) {
  if (!text) return null;
  var m = String(text).match(ADDRESS_RE);
  if (!m) return null;
  return (m[1] + ', ' + m[2] + ' ' + m[3]).trim();
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d;
}
function fmtDate(d) {
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });
}

// ── Tavily: officiële regionale evenementen via de vertrouwde bronnenlijst ──
async function fetchTavilyOfficialEvents(dateStr, dayType) {
  if (!TAVILY_KEY) return [];
  const dateLabel = fmtDate(new Date(dateStr + 'T12:00:00'));
  const query = dayType === 'fam_time'
    ? 'Welke evenementen, activiteiten of familie-uitjes zijn er specifiek op ' + dateLabel + ' in en rond ' + HOME_CITY + '? Noem één concrete, met naam genoemde activiteit met datum en locatie — geen overzichtskalender of programmapagina, wel het specifieke evenement zelf.'
    : 'Welke evenementen of activiteiten vinden er specifiek plaats op ' + dateLabel + ' in en rond ' + HOME_CITY + '? Noem één concrete, met naam genoemde activiteit met datum en locatie — geen overzichtskalender of programmapagina, wel het specifieke evenement zelf.';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TAVILY_KEY },
      body: JSON.stringify({
        query: query,
        search_depth: 'advanced',
        max_results: 10,
        include_images: true,
        include_answer: true,
        time_range: 'month',
        include_domains: TRUSTED_EVENT_DOMAINS
      })
    });
    if (!res.ok) { console.error('Tavily officiële events HTTP', res.status, await res.text()); return []; }
    const data = await res.json();
    const images = data.images || [];
    const picked = pickConcreteResult(data.results);
    return picked.slice(0, 5).map(function (r, i) {
      const fallbackHour = [10, 11, 14, 16, 19][i] || 14;
      const name = cleanVenueTitle(r.title, 'Evenement in de buurt');
      const address = extractAddress((r.content || '') + ' ' + (i === 0 ? (data.answer || '') : ''));
      const temp = looksTemporary((r.title || '') + ' ' + (r.content || ''));
      return {
        title: name,
        sub: address ? ('📍 ' + address) : ((i === 0 && data.answer) ? data.answer.slice(0, 100) : ('Online gevonden' + (r.url ? ' · ' + new URL(r.url).hostname.replace('www.', '') : ''))),
        source: 'web', category: 'event', temporary: temp,
        weight: temp ? WEIGHT.temp : WEIGHT.event,
        timeSlot: timeSlotForHour(fallbackHour), time: String(fallbackHour).padStart(2, '0') + ':00',
        photoUrl: images[i] || null, sourceUrl: r.url || null,
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address || (name + ', ' + HOME_CITY)),
        icon: temp ? '⏳' : '🎟️'
      };
    });
  } catch (e) {
    console.error('Tavily (officiële events) fout:', e.message);
    return [];
  }
}

// ── Tavily: TIJDELIJKE lokale evenementen ("nu of nooit") ───────────────
// Dit is de hoofdzoektocht naar het type dat je het liefst hebt (zoals de
// Reuzen in Borgerhout): kortlopend, regionaal, van het moment. Geen
// beperking tot een vaste bronnenlijst, want zulke dingen staan vaak op
// nieuwssites of buurtpagina's. Twee gebieden apart: Antwerpen en de
// zuidrand rond Edegem. Resultaten met een duidelijk "tijdelijk"-signaal
// krijgen het zwaarste gewicht; de rest van deze zoektocht blijft als
// gewone verrassende tip (hiddenEvent).
async function fetchTavilyTemporaryEvents(dateStr, area, hourSeed) {
  if (!TAVILY_KEY) return [];
  const from = fmtDate(new Date(dateStr + 'T12:00:00'));
  const to = fmtDate(addDays(dateStr, 7));
  const query = 'Welke tijdelijke, eenmalige of kortlopende evenementen zijn er tussen ' + from + ' en ' + to + ' in ' + area + '? '
    + 'Denk aan optochten en reuzen, stoeten, pop-ups, festivals, lichtparcours, kermissen, gratis openluchtspektakels, '
    + 'of exposities en markten die binnenkort eindigen — dingen die volgende week niet meer te zien zijn. '
    + 'Noem één specifieke, met naam genoemde activiteit met datum en locatie — geen overzichtskalender of programmapagina.';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TAVILY_KEY },
      body: JSON.stringify({
        query: query, search_depth: 'advanced', max_results: 10,
        include_images: true, include_answer: true, time_range: 'month'
      })
    });
    if (!res.ok) { console.error('Tavily tijdelijke events HTTP', res.status, await res.text()); return []; }
    const data = await res.json();
    const images = data.images || [];
    const picked = pickConcreteResult(data.results);
    return picked.slice(0, 4).map(function (r, i) {
      const fallbackHour = [14, 11, 16, 19][(i + hourSeed) % 4];
      const name = cleanVenueTitle(r.title, 'Tijdelijk evenement in de buurt');
      const address = extractAddress((r.content || '') + ' ' + (i === 0 ? (data.answer || '') : ''));
      const temp = looksTemporary((r.title || '') + ' ' + (r.content || '') + ' ' + (i === 0 ? (data.answer || '') : ''));
      return {
        title: name,
        sub: address ? ('📍 ' + address) : ((i === 0 && data.answer) ? data.answer.slice(0, 100) : ('Geheimtip · ' + (r.url ? new URL(r.url).hostname.replace('www.', '') : 'online gevonden'))),
        source: 'web', category: 'event', temporary: temp,
        weight: temp ? WEIGHT.temp : WEIGHT.hiddenEvent,
        timeSlot: timeSlotForHour(fallbackHour), time: String(fallbackHour).padStart(2, '0') + ':00',
        photoUrl: images[i] || null, sourceUrl: r.url || null,
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address || (name + ', ' + area)),
        icon: temp ? '⏳' : '💎'
      };
    });
  } catch (e) {
    console.error('Tavily (tijdelijke events) fout:', e.message);
    return [];
  }
}

// ── UiTdatabank: optioneel, enkel actief als je ooit toch een betaalde key neemt ──
async function fetchUitdatabankEvents(dateStr, familyFriendly) {
  if (!UITDATABANK_KEY) return [];
  try {
    const q = `city:"${HOME_CITY}" AND availableTo:[${dateStr}T00:00:00Z TO ${dateStr}T23:59:59Z]`;
    const url = 'https://search.uitdatabank.be/offers/'
      + '?q=' + encodeURIComponent(q)
      + '&workflowStatus=APPROVED'
      + '&limit=15';
    const res = await fetch(url, {
      headers: { 'X-Api-Key': UITDATABANK_KEY, 'Accept': 'application/ld+json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data.member || data['hydra:member'] || []).map(function (ev) {
      const name = (ev.name && (ev.name.nl || Object.values(ev.name)[0])) || 'Evenement';
      const startHour = ev.startDate ? new Date(ev.startDate).getHours() : 14;
      const image = ev.image || (ev.mediaObject && ev.mediaObject[0] && ev.mediaObject[0].contentUrl) || null;
      const locationName = (ev.location && ev.location.name && (ev.location.name.nl || Object.values(ev.location.name)[0])) || '';
      return {
        title: name,
        sub: 'Online gevonden' + (locationName ? ' · ' + locationName : ''),
        source: 'web',
        category: 'event',
        weight: WEIGHT.event,
        timeSlot: timeSlotForHour(startHour),
        time: (ev.startDate ? new Date(ev.startDate) : new Date()).toTimeString().slice(0, 5),
        photoUrl: image,
        sourceUrl: ev.url || null,
        icon: '🎟️'
      };
    });
    return items;
  } catch (e) {
    console.error('UiTdatabank fout:', e.message);
    return [];
  }
}

// ── Tavily: aanvullende lokale horeca-suggestie, met foto ──
async function fetchTavilyHoreca(timeSlot, dayType) {
  if (!TAVILY_KEY) return [];
  const region = randomRegion();
  const flavor = timeSlot === 'namiddag' && dayType === 'fam_time' ? 'een leuke ijssalon' : randomFlavor(timeSlot);
  const query = 'Geef enkele concrete, met naam genoemde voorbeelden van ' + flavor + ' in ' + region
    + ', binnen ongeveer ' + HOME_RADIUS_KM + ' km van Edegem (provincie Antwerpen). '
    + 'Ik zoek geen grote keten, maar iets bijzonders en lokaals dat de meeste mensen niet meteen zouden kennen. '
    + 'Noem telkens de effectieve naam van de zaak én het adres of de straat waar die te vinden is.';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TAVILY_KEY
      },
      body: JSON.stringify({
        query: query,
        search_depth: 'advanced',
        max_results: 10,
        include_images: true,
        include_answer: true,
        exclude_domains: CHAIN_DOMAINS
      })
    });
    if (!res.ok) { console.error('Tavily horeca HTTP', res.status, await res.text()); return []; }
    const data = await res.json();
    const images = data.images || [];
    const picked = pickConcreteResult(data.results);
    return picked.slice(0, 5).map(function (r, i) {
      const name = cleanVenueTitle(r.title, 'Verrassend plekje in de buurt');
      const address = extractAddress((r.content || '') + ' ' + (i === 0 ? (data.answer || '') : ''));
      const mapsQuery = address ? (name + ', ' + address) : (name + ', ' + region);
      return {
        title: name,
        sub: address ? ('📍 ' + address) : ((i === 0 && data.answer) ? data.answer.slice(0, 100) : ('Online gevonden · ' + region)),
        source: 'web',
        category: 'horeca',
        weight: WEIGHT.horeca,
        timeSlot: timeSlot,
        photoUrl: images[i] || null,
        sourceUrl: r.url || null,
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapsQuery),
        icon: '📍'
      };
    });
  } catch (e) {
    console.error('Tavily fout:', e.message);
    return [];
  }
}

const CINEMA_DOMAINS = ['kinepolis.be', 'cinenews.be', 'cartoons.be'];
async function fetchTavilyNewMovie(dateStr) {
  if (!TAVILY_KEY) return [];
  const dateLabel = fmtDate(new Date(dateStr + 'T12:00:00'));
  const query = 'Welke nieuwe film is deze week uitgebracht in de bioscoop in België, te zien rond ' + dateLabel
    + ' in of nabij Antwerpen/Edegem? Noem de exacte titel van de film en in welke bioscoop die draait.';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TAVILY_KEY },
      body: JSON.stringify({
        query: query,
        search_depth: 'advanced',
        max_results: 8,
        include_images: true,
        include_answer: true,
        time_range: 'week',
        include_domains: CINEMA_DOMAINS
      })
    });
    if (!res.ok) { console.error('Tavily film HTTP', res.status, await res.text()); return []; }
    const data = await res.json();
    const images = data.images || [];
    const picked = pickConcreteResult(data.results);
    return picked.slice(0, 3).map(function (r, i) {
      const name = cleanVenueTitle(r.title, 'Film in de bioscoop');
      return {
        title: name,
        sub: (i === 0 && data.answer) ? data.answer.slice(0, 100) : 'Online gevonden · nu in de bioscoop',
        source: 'web',
        category: 'movie',
        weight: WEIGHT.movie,
        timeSlot: 'avond',
        time: '20:00',
        photoUrl: images[i] || null,
        sourceUrl: r.url || null,
        icon: '🎬'
      };
    });
  } catch (e) {
    console.error('Tavily film fout:', e.message);
    return [];
  }
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const dateStr = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const dayType = url.searchParams.get('dayType') || 'me_time';

    const AREA_CITY = 'Antwerpen (de stad en districten zoals Borgerhout, Berchem, Deurne en Hoboken)';
    const AREA_SOUTH = 'de zuidrand rond ' + HOME_CITY + ' (Mortsel, Hove, Kontich, Wilrijk, Boechout)';

    const [officialEvents, tempCity, tempSouth, uitdatabankEvents, newMovies, ochtendHoreca, middagHoreca, namiddagHoreca, avondHoreca] = await Promise.all([
      fetchTavilyOfficialEvents(dateStr, dayType),
      fetchTavilyTemporaryEvents(dateStr, AREA_CITY, 0),
      fetchTavilyTemporaryEvents(dateStr, AREA_SOUTH, 2),
      fetchUitdatabankEvents(dateStr, dayType === 'fam_time'),
      fetchTavilyNewMovie(dateStr),
      fetchTavilyHoreca('ochtend', dayType),
      fetchTavilyHoreca('middag', dayType),
      fetchTavilyHoreca('namiddag', dayType),
      fetchTavilyHoreca('avond', dayType)
    ]);

    const evergreen = buildEvergreen(dateStr, dayType);
    const horeca = [].concat(ochtendHoreca, middagHoreca, namiddagHoreca, avondHoreca);
    const all = [].concat(officialEvents, tempCity, tempSouth, uitdatabankEvents, evergreen, newMovies, horeca);

    const byPart = { ochtend: [], middag: [], namiddag: [], avond: [] };
    all.forEach(function (item) {
      if (byPart[item.timeSlot]) byPart[item.timeSlot].push(item);
    });
    // Binnen elk dagdeel: hoogste gewicht eerst (tijdelijke evenementen bovenaan).
    Object.keys(byPart).forEach(function (k) {
      byPart[k].sort(function (a, b) { return b.weight - a.weight; });
    });

    const tempCount = all.filter(function (i) { return i.temporary; }).length;

    return new Response(JSON.stringify({
      ok: true, date: dateStr, parts: byPart,
      debug: { hasTavilyKey: !!TAVILY_KEY, hasUitdatabankKey: !!UITDATABANK_KEY, tempCount: tempCount, evergreenCount: evergreen.length }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('mmd-suggestions onverwachte fout:', e && e.stack || e);
    return new Response(JSON.stringify({
      ok: false, error: (e && e.message) || String(e),
      parts: { ochtend: [], middag: [], namiddag: [], avond: [] }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Standaard bereikbaar op /.netlify/functions/mmd-suggestions
