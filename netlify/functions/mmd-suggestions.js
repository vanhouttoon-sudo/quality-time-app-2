// ═══════════════════════════════════════════════════════════════════
// QualityTime — Make my Day: regionale suggesties (laag 5)
// ═══════════════════════════════════════════════════════════════════
// CORRECTIE t.o.v. de eerste versie van dit bestand: de UiTdatabank
// Search API is NIET gratis — het Basic-plan kost €125/jaar. Dat is
// voor een gezinsapp niet de moeite voor deze ene functie. Daarom is
// UiTdatabank hier nu optioneel (blijft werken als je ooit toch een
// key koopt), en is Tavily de echte, gratis hoofdweg — met een aparte
// zoekopdracht die zich beperkt tot dezelfde vertrouwde regionale
// bronnen die al in je Instellingen > Bronnen staan (DEFAULT_BRONNEN
// in app.html): Uit in Vlaanderen, Uit in Antwerpen, Antwerpen.be,
// Het Paleis, deSingel, Gezinsbond, enz. Dat geeft dezelfde
// "evenement vóór terrasje"-prioriteit, zonder kost.
//
// VEREISTE environment variable in Netlify:
//   TAVILY_API_KEY        — gratis aan te vragen via tavily.com
// Optioneel (enkel als je ooit toch voor UiTdatabank betaalt):
//   UITDATABANK_API_KEY
// ═══════════════════════════════════════════════════════════════════

// Thuisbasis — Edegem. Alle horeca-zoekopdrachten draaien hier nu rond,
// niet meer willekeurig over een brede regio (dat zorgde net voor te
// generieke/te verre suggesties).
const HOME_CITY = 'Edegem';
const HOME_RADIUS_KM = 15;

// Gemeentes binnen ~15 km van Edegem — een binnenring (letterlijk vlak
// naast Edegem) die vaker voorkomt, plus een buitenring (tot ~15 km,
// inclusief Antwerpen-centrum en Deurne) voor meer variatie zonder de
// straal te overschrijden. Edegem zelf staat er nog het vaakst in.
const REGIONS = [
  'Edegem', 'Edegem', 'Edegem',
  'Hove', 'Kontich', 'Mortsel', 'Wilrijk', 'Aartselaar', 'Boechout',
  'Berchem', 'Borsbeek', 'Wommelgem', 'Antwerpen centrum', 'Deurne', 'Zwijndrecht', 'Boom'
];
function randomRegion() {
  return REGIONS[Math.floor(Math.random() * REGIONS.length)];
}

// Zelfde vertrouwde bronnen als DEFAULT_BRONNEN in app.html (Instellingen
// > Bronnen). Hou deze lijst in sync als je daar iets wijzigt — dit is
// een losse kopie omdat de Netlify-functie niet in de browser draait.
const TRUSTED_EVENT_DOMAINS = [
  'uitinvlaanderen.be', 'uitinantwerpen.be', 'antwerpen.be',
  'mortsel.be', 'edegem.be', 'hetpaleis.be', 'desingel.be',
  'sport.antwerpen.be', 'jogging.be', 'cycling.be',
  'gezinsbond.be', 'kmska.be', 'rivierenhof.be'
];

// Grote ketens uitsluiten waar mogelijk — het doel is net het tegenovergestelde
// van "de eerste de beste koffiezaak", dus deze proberen we uit de weg te gaan.
const CHAIN_DOMAINS = ['starbucks.com', 'exki.be', 'exki.com', 'lepainquotidien.com', 'points-de-vue.com'];

const UITDATABANK_KEY = process.env.UITDATABANK_API_KEY;
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// Prioriteitsgewicht — hoger = eerder als standaardsuggestie getoond.
// Events wegen bewust zwaarder dan horeca, op uitdrukkelijk verzoek:
// een evenement is tijdsgebonden en dus "nu of nooit", een terrasje
// staat er morgen ook nog.
const WEIGHT = { event: 20, hiddenEvent: 16, horeca: 12, movie: 14 };

// Variatie in het TYPE horeca-plek — telkens een andere invalshoek i.p.v.
// altijd "koffiebar" of "terrasje". Eén willekeurige invalshoek per
// generatie, zodat de suggesties tussen dagen echt verschillen.
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

// Herkent overzichtsartikels ("Top 10 terrasjes...", "5 leukste cafés...")
// zodat we die niet als ÉÉN concrete zaak voorstellen.
// Herkent overzichtsartikels ("Top 10 terrasjes...", "5 leukste cafés...")
// én overzichts-/programmapagina's ("Wilrijkse Zomerkalender", "activiteiten-
// kalender", "programma") — dat zijn ook geen concrete, ene activiteit,
// maar een verzamelpagina van vele activiteiten. Beide worden geweerd
// zodat er telkens één concreet ding overblijft, geen verzamelpagina.
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

// Belgisch adrespatroon uit vrije tekst plukken: "Straatnaam 12, 2000 Antwerpen"
// of "Straatnaam 12A, 2018 Antwerpen". Best-effort — lukt niet altijd, en dan
// valt de kaart terug op naam + regio voor de Maps-link (zie fetchTavilyHoreca).
const ADDRESS_RE = /([A-ZÀ-Ý][\wÀ-ÿ'’.\- ]{2,40}\s\d{1,4}[a-zA-Z]?)\s*,?\s*(\d{4})\s+([A-ZÀ-Ý][\wÀ-ÿ\-\s]{2,25})/;
function extractAddress(text) {
  if (!text) return null;
  var m = String(text).match(ADDRESS_RE);
  if (!m) return null;
  return (m[1] + ', ' + m[2] + ' ' + m[3]).trim();
}

// ── Tavily: officiële regionale evenementen via de vertrouwde bronnenlijst ──
async function fetchTavilyOfficialEvents(dateStr, dayType) {
  if (!TAVILY_KEY) return [];
  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });
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
      return {
        title: name,
        sub: address ? ('📍 ' + address) : ((i === 0 && data.answer) ? data.answer.slice(0, 100) : ('Online gevonden' + (r.url ? ' · ' + new URL(r.url).hostname.replace('www.', '') : ''))),
        source: 'web', category: 'event', weight: WEIGHT.event,
        timeSlot: timeSlotForHour(fallbackHour), time: String(fallbackHour).padStart(2, '0') + ':00',
        photoUrl: images[i] || null, sourceUrl: r.url || null,
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address || (name + ', ' + HOME_CITY)),
        icon: '🎟️'
      };
    });
  } catch (e) {
    console.error('Tavily (officiële events) fout:', e.message);
    return [];
  }
}

// ── Tavily: bredere "verborgen parel"-zoektocht naar evenementen ──
// Dit is de kern van "een ijzersterke scan": geen beperking tot de
// officiële agenda's, maar een gerichte vraag naar iets verrassends —
// pop-ups, rommelmarkten, kleine optredens, tijdelijke exposities — die
// een mens niet zo snel zelf zou opzoeken. Krijgt een net iets lager
// gewicht dan de officiële bron (die is betrouwbaarder/actueler), maar
// nog altijd ruim boven horeca, want dit is precies waar de verrassing
// vandaan moet komen.
async function fetchTavilyHiddenGemEvent(dateStr, dayType, region) {
  if (!TAVILY_KEY) return [];
  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });
  const query = 'Wat zijn verrassende, minder bekende evenementen, pop-ups, markten, exposities of optredens rond ' + dateLabel
    + ' in of rond ' + region + '? Geen grote toeristische klassiekers, wel dingen die een lokale insider zou aanraden en die niet iedereen kent. Noem één specifieke, met naam genoemde activiteit — geen overzichtskalender of programmapagina met veel activiteiten samen.';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TAVILY_KEY },
      body: JSON.stringify({
        query: query, search_depth: 'advanced', max_results: 10,
        include_images: true, include_answer: true, time_range: 'month'
      })
    });
    if (!res.ok) { console.error('Tavily verborgen parel HTTP', res.status, await res.text()); return []; }
    const data = await res.json();
    const images = data.images || [];
    const picked = pickConcreteResult(data.results);
    return picked.slice(0, 4).map(function (r, i) {
      const fallbackHour = [11, 15, 17, 20][i] || 14;
      const name = cleanVenueTitle(r.title, 'Verrassing in de buurt');
      const address = extractAddress((r.content || '') + ' ' + (i === 0 ? (data.answer || '') : ''));
      return {
        title: name,
        sub: address ? ('📍 ' + address) : ((i === 0 && data.answer) ? data.answer.slice(0, 100) : ('Geheimtip · ' + (r.url ? new URL(r.url).hostname.replace('www.', '') : 'online gevonden'))),
        source: 'web', category: 'event', weight: WEIGHT.hiddenEvent,
        timeSlot: timeSlotForHour(fallbackHour), time: String(fallbackHour).padStart(2, '0') + ':00',
        photoUrl: images[i] || null, sourceUrl: r.url || null,
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address || (name + ', ' + region)),
        icon: '💎'
      };
    });
  } catch (e) {
    console.error('Tavily (verborgen parel) fout:', e.message);
    return [];
  }
}

// ── UiTdatabank: optioneel, enkel actief als je ooit toch een betaalde key neemt ──
async function fetchUitdatabankEvents(dateStr, familyFriendly) {
  if (!UITDATABANK_KEY) return [];
  try {
    // TODO bij eerste echte test: de exacte querysyntax (q vs. losse
    // parameters) bevestigen aan de hand van de echte respons —
    // zie docs.publiq.be/docs/uitdatabank/search-api voor de meest
    // actuele parameterlijst. Deze query is gebaseerd op het publieke
    // "Advanced queries"-patroon (city:, dateRange in q).
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
      const desc = (ev.description && (ev.description.nl || Object.values(ev.description)[0])) || '';
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
    // Bij Fam Time: alleen events tonen die niet expliciet 18+/niet-kindvriendelijk zijn.
    // UiTdatabank heeft geen simpel "kindvriendelijk"-vlag; we filteren voorzichtig op
    // labels indien aanwezig, en laten anders alles staan (geen valse zekerheid opdringen).
    return items;
  } catch (e) {
    console.error('UiTdatabank fout:', e.message);
    return [];
  }
}

// ── Tavily: aanvullende lokale horeca-suggestie, met foto ──
// Elke oproep kiest een willekeurige regio (Antwerpen + Zuidrand) én een
// willekeurige invalshoek (zie HORECA_FLAVORS) — dat is wat de suggesties
// écht doet variëren tussen generaties, in plaats van steeds dezelfde
// "koffiebar in Antwerpen"-vraag te herhalen.
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
      // Google Maps-link op basis van naam + adres (of anders naam + regio) —
      // zo is er altijd een concrete, aanklikbare locatie, ook zonder exact adres.
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

// Betrouwbare Belgische bioscoopsites — geen algemene "wat is er te zien"-
// vraag (die geeft vaak oude/verlopen releases), maar expliciet gericht op
// de huidige of komende week, beperkt tot bronnen die altijd actuele
// speellijsten tonen.
const CINEMA_DOMAINS = ['kinepolis.be', 'cinenews.be', 'cartoons.be'];
async function fetchTavilyNewMovie(dateStr) {
  if (!TAVILY_KEY) return [];
  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });
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
    const hiddenGemRegion = randomRegion();

    const [officialEvents, hiddenEvents, uitdatabankEvents, newMovies, ochtendHoreca, middagHoreca, namiddagHoreca, avondHoreca] = await Promise.all([
      fetchTavilyOfficialEvents(dateStr, dayType),
      fetchTavilyHiddenGemEvent(dateStr, dayType, hiddenGemRegion),
      fetchUitdatabankEvents(dateStr, dayType === 'fam_time'),
      fetchTavilyNewMovie(dateStr),
      fetchTavilyHoreca('ochtend', dayType),
      fetchTavilyHoreca('middag', dayType),
      fetchTavilyHoreca('namiddag', dayType),
      fetchTavilyHoreca('avond', dayType)
    ]);

    const horeca = [].concat(ochtendHoreca, middagHoreca, namiddagHoreca, avondHoreca);
    const all = [].concat(officialEvents, hiddenEvents, uitdatabankEvents, newMovies, horeca);

    const byPart = { ochtend: [], middag: [], namiddag: [], avond: [] };
    all.forEach(function (item) {
      if (byPart[item.timeSlot]) byPart[item.timeSlot].push(item);
    });
    // Events eerst binnen elk dagdeel — hoogste weight bovenaan.
    Object.keys(byPart).forEach(function (k) {
      byPart[k].sort(function (a, b) { return b.weight - a.weight; });
    });

    return new Response(JSON.stringify({
      ok: true, date: dateStr, parts: byPart,
      debug: { hasTavilyKey: !!TAVILY_KEY, hasUitdatabankKey: !!UITDATABANK_KEY }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    // Vangnet: een onverwachte fout crasht nu niet meer stil naar een kale
    // 500 — de echte foutmelding komt mee terug, zichtbaar in de app en
    // in de Netlify function-logs.
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
// (zelfde patroon als ics-proxy.js en send-notifications.js).
