// ═══════════════════════════════════════════════════════════════════
// QualityTime — Vastgoed: aanvullende zoekbron (naast scrape-realestate.js)
// ═══════════════════════════════════════════════════════════════════
// scrape-realestate.js blijft de hoofdbron (en werkt goed voor ERA).
// Voor sites waar directe scraping faalt door bot-bescherming (Immoweb,
// Immoscoop, We Invest, De Huisleverancier) zoekt deze functie via
// Tavily i.p.v. de HTML rechtstreeks te parsen — dat komt vaak wél door
// waar een simpele scraper vastloopt.
//
// Geeft exact hetzelfde responsformaat terug als scrape-realestate.js
// ({listings:[...], status:{...}}), zodat de bestaande dedupe- en
// renderlogica in app.html ongewijzigd kan blijven — de twee bronnen
// worden gewoon samengevoegd vóór reDedupliceer() draait.
//
// EERLIJKHEID: prijs/kamers/tuin/oppervlakte worden met regex uit
// zoekresultaat-tekst gehaald — minder betrouwbaar dan een échte
// scraper die de structuur van de pagina zelf leest. Panden zonder
// herkenbare prijs worden overgeslagen (prijs is een verplicht,
// gefilterd veld in de app) — beter niets tonen dan een kapot bedrag.
//
// VEREISTE environment variable: TAVILY_API_KEY (dezelfde als voor
// Make my Day / mmd-suggestions.js).
// ═══════════════════════════════════════════════════════════════════

const TAVILY_KEY = process.env.TAVILY_API_KEY;

// Zelfde regiolijst als RE_REGIOS_BASE in app.html — gebruikt om een
// gevonden pand aan de juiste regio-filter te koppelen.
const REGIONS = ["Borgerhout","Mortsel","Edegem","Hove","Boechout","Berchem","Antwerpen","Deurne","Wilrijk","Kontich"];

// Bronnen waar scraping meestal faalt — Immoweb en Immoscoop staan
// vooraan omdat die voor jou het belangrijkst zijn.
const SITES = [
  { bron: 'Immoweb',   domain: 'immoweb.be',   maxResults: 20 },
  { bron: 'Immoscoop', domain: 'immoscoop.be', maxResults: 20 },
  { bron: 'We Invest', domain: 'weinvest.be',  maxResults: 10 },
  { bron: 'Hebbes',    domain: 'hebbes.be',    maxResults: 10 }
];

const PRICE_RE = /€\s?(\d{1,3}(?:[.,]\d{3})+)/;
const ROOMS_RE = /(\d+)\s*(slaapkamers?|kamers?)/i;
const SURFACE_RE = /(\d{2,4})\s?m(?:²|2)\b/;
const ADDRESS_RE = /([A-ZÀ-Ý][\wÀ-ÿ'’.\- ]{2,40}\s\d{1,4}[a-zA-Z]?)\s*,?\s*(\d{4})?\s*([A-ZÀ-Ý][\wÀ-ÿ\-\s]{2,25})?/;

function extractPrice(text) {
  const m = String(text).match(PRICE_RE);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
  return (n && n > 20000 && n < 3000000) ? n : null; // sanity-check, geen absurde bedragen
}
function extractRooms(text) {
  const m = String(text).match(ROOMS_RE);
  return m ? parseInt(m[1], 10) : 2; // neutrale gok als niets gevonden wordt
}
function extractSurface(text) {
  const m = String(text).match(SURFACE_RE);
  return m ? parseInt(m[1], 10) : 0;
}
function extractGarden(text) {
  return /\btuin\b/i.test(text);
}

// Best-effort datumherkenning uit de zoektekst — GEEN garantie dat dit
// de exacte publicatiedatum is, enkel een poging waar de tekst het toelaat.
const MAANDEN = { januari:1,februari:2,maart:3,april:4,mei:5,juni:6,juli:7,augustus:8,september:9,oktober:10,november:11,december:12 };
function extractDate(text) {
  const t = String(text).toLowerCase();
  var m;
  if (/\bvandaag\b/.test(t)) return { date: new Date(), recognized: true };
  if (/\bgisteren\b/.test(t)) { const d = new Date(); d.setDate(d.getDate()-1); return { date: d, recognized: true }; }
  m = t.match(/(\d+)\s*dag(?:en)?\s*geleden/) || t.match(/sinds\s*(\d+)\s*dag/);
  if (m) { const d = new Date(); d.setDate(d.getDate() - parseInt(m[1], 10)); return { date: d, recognized: true }; }
  m = t.match(/(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(\d{4})?/);
  if (m) {
    const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    const d = new Date(year, MAANDEN[m[2]] - 1, parseInt(m[1], 10));
    if (!isNaN(d.getTime())) return { date: d, recognized: true };
  }
  return { date: new Date(), recognized: false }; // fallback: moment van vinden, niet de echte publicatiedatum
}

function extractRegion(text, requestedRegions) {
  const t = String(text);
  for (const r of requestedRegions) {
    if (new RegExp('\\b' + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(t)) return r;
  }
  return requestedRegions[0] || 'Antwerpen';
}
function extractAddress(text, fallbackTitle) {
  const m = String(text).match(ADDRESS_RE);
  if (m) return m[0].trim().slice(0, 60);
  return fallbackTitle ? fallbackTitle.slice(0, 60) : 'Adres onbekend';
}

async function searchSite(site, regios) {
  if (!TAVILY_KEY) return { listings: [], metDatum: 0 };
  const query = 'Te koop huis of appartement in ' + regios.join(', ') + ' — actuele aanbiedingen';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TAVILY_KEY },
      body: JSON.stringify({
        query: query,
        search_depth: 'advanced',
        max_results: site.maxResults,
        include_domains: [site.domain],
        time_range: 'week' // geeft recent doorzochte/geïndexeerde pagina's voorrang — geen garantie op "nieuwste listing", wel een bias richting verser
      })
    });
    if (!res.ok) { console.error('Tavily vastgoed HTTP (' + site.bron + ')', res.status, await res.text()); return { listings: [], metDatum: 0 }; }
    const data = await res.json();
    const listings = [];
    (data.results || []).forEach(function (r) {
      const text = (r.title || '') + ' ' + (r.content || '');
      const prijs = extractPrice(text);
      if (!prijs) return; // prijs is verplicht — zonder prijs geen bruikbare kaart
      const dateInfo = extractDate(text);
      listings.push({
        url: r.url,
        adres: extractAddress(r.content || '', r.title),
        regio: extractRegion(text, regios),
        bron: site.bron,
        kamers: extractRooms(text),
        tuin: extractGarden(text),
        opp: extractSurface(text),
        datum: dateInfo.date.toISOString(),
        _datumHerkend: dateInfo.recognized, // enkel voor sortering hieronder, niet getoond in de app
        prijs: prijs,
        score: 72, // neutrale score — geen betrouwbare basis voor een fijnere inschatting uit zoektekst
        gezien: false
      });
    });
    // Panden met een effectief herkende datum eerst, nieuwste bovenaan;
    // de rest (geen herkende datum) erna, in de volgorde die Tavily gaf.
    const metDatum = listings.filter(function (l) { return l._datumHerkend; });
    const zonderDatum = listings.filter(function (l) { return !l._datumHerkend; });
    metDatum.sort(function (a, b) { return new Date(b.datum) - new Date(a.datum); });
    const sorted = metDatum.concat(zonderDatum).map(function (l) { delete l._datumHerkend; return l; });
    return { listings: sorted, metDatum: metDatum.length };
  } catch (e) {
    console.error('Tavily vastgoed fout (' + site.bron + '):', e.message);
    return { listings: [], metDatum: 0 };
  }
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const regioParam = url.searchParams.get('regios') || REGIONS.join(',');
    const regios = regioParam.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    const results = await Promise.all(SITES.map(function (site) { return searchSite(site, regios); }));
    const listings = [].concat.apply([], results.map(function (r) { return r.listings; }));

    return new Response(JSON.stringify({
      ok: true,
      listings: listings,
      status: SITES.reduce(function (acc, s, i) {
        acc[s.bron] = { ok: true, count: results[i].listings.length, metDatum: results[i].metDatum };
        return acc;
      }, {})
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('search-realestate onverwachte fout:', e && e.stack || e);
    return new Response(JSON.stringify({ ok: false, error: (e && e.message) || String(e), listings: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Standaard bereikbaar op /.netlify/functions/search-realestate
