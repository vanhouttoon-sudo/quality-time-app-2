// ═══════════════════════════════════════════════════════════════════
// QualityTime — achtergrond-pushfunctie (Netlify Scheduled Function)
// ═══════════════════════════════════════════════════════════════════
// Draait automatisch elke 15 minuten (zie `config.schedule` onderaan).
// Netlify's gratis tier telt dit als ~2.880 aanroepen/maand — ruim
// binnen de 125.000 gratis function-invocations. Als dit eerder
// vastliep op de functielimiet, liep er waarschijnlijk een functie
// die vaker draaide (bv. elke minuut) of die bleef hangen/retryen.
//
// Werking: de app (waveformv3.html) stuurt bij elke instellingen-
// wijziging OneSignal-tags mee per toestel (oneSignalSyncTags()).
// Deze functie leest zelf geen toestellen uit — ze vraagt OneSignal
// simpelweg: "stuur een melding naar iedereen wiens tags matchen met
// het huidige kwartier". Dat is de OneSignal Filters-API en schaalt
// naar willekeurig veel toestellen zonder dat wij zelf iets bijhouden.
//
// VEREIST: een Netlify environment variable ONESIGNAL_REST_API_KEY
// (Site settings → Environment variables). Te vinden in OneSignal
// onder Settings ▸ Keys & IDs ▸ "REST API Key". NOOIT in de HTML/JS
// van de app zelf zetten — dat is publiek zichtbaar.
// ═══════════════════════════════════════════════════════════════════

const ONESIGNAL_APP_ID = 'b050e836-af04-491a-beeb-b1ac13a48359';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

// ── Afvalkalender 2026-2027 (zelfde data als WASTE_DATES in de app) ──
const WASTE_ICONS = {
  gft: { icon: '🌿', label: 'GFT' },
  hv:  { icon: '🗑️', label: 'Restafval' },
  pmd: { icon: '♻️', label: 'PMD' },
  pk:  { icon: '📦', label: 'Papier & karton' },
  tex: { icon: '👕', label: 'Textiel' },
  gv:  { icon: '🪣', label: 'Grofvuil' },
  sn:  { icon: '🌿', label: 'Snoeihout' },
  mrp: { icon: '🚚', label: 'Mobiel recyclagepark' },
  kb:  { icon: '🎄', label: 'Kerstboom' }
};
const WASTE_DATES = {
  gft:  ['2026-01-08','2026-01-15','2026-01-22','2026-01-29','2026-02-05','2026-02-12','2026-02-19','2026-02-26','2026-03-05','2026-03-12','2026-03-19','2026-03-26','2026-04-02','2026-04-09','2026-04-16','2026-04-23','2026-04-30','2026-05-07','2026-05-21','2026-05-28','2026-06-04','2026-06-11','2026-06-18','2026-06-25','2026-07-02','2026-07-09','2026-07-16','2026-07-23','2026-07-30','2026-08-06','2026-08-13','2026-08-20','2026-08-27','2026-09-03','2026-09-10','2026-09-17','2026-09-24','2026-10-01','2026-10-08','2026-10-15','2026-10-22','2026-10-29','2026-11-05','2026-11-12','2026-11-19','2026-11-26','2026-12-03','2026-12-10','2026-12-17','2026-12-24','2026-12-31'],
  hv:   ['2026-01-12','2026-01-26','2026-02-23','2026-03-23','2026-04-07','2026-04-20','2026-05-04','2026-05-18','2026-06-01','2026-06-15','2026-06-29','2026-07-13','2026-07-27','2026-08-10','2026-08-24','2026-09-07','2026-09-21','2026-10-05','2026-10-19','2026-11-02','2026-11-16','2026-11-30','2026-12-14','2026-12-28'],
  pmd:  ['2026-01-02','2026-01-16','2026-01-30','2026-02-13','2026-02-27','2026-03-13','2026-03-27','2026-04-10','2026-04-24','2026-05-08','2026-05-22','2026-06-05','2026-06-19','2026-07-03','2026-07-17','2026-07-31','2026-08-28','2026-09-11','2026-09-25','2026-10-09','2026-10-23','2026-11-06','2026-11-20','2026-12-04','2026-12-18'],
  pk:   ['2026-01-23','2026-02-20','2026-03-20','2026-04-17','2026-05-15','2026-06-12','2026-07-10','2026-08-07','2026-09-04','2026-10-02','2026-10-30','2026-12-28'],
  tex:  ['2026-01-16','2026-03-13','2026-05-15','2026-07-17','2026-09-11','2026-11-06'],
  gv:   ['2026-04-02','2026-06-04','2026-07-02','2026-07-30','2026-09-10','2026-09-24','2026-10-22','2026-10-29','2026-12-03','2026-12-24'],
  sn:   ['2026-02-10','2026-06-09','2026-10-13','2026-12-01'],
  mrp:  ['2026-02-10','2026-05-12','2026-08-04','2026-11-10'],
  kb:   ['2026-01-06']
};
function getWasteForDate(dateStr) {
  return Object.keys(WASTE_DATES).filter(k => WASTE_DATES[k].includes(dateStr));
}

// ── Zangles-schema (datum → lied + focus), afgeleid van DEFAULT_ZANG_PLAN ──
// Let op: als Toon of Janne het lessenpakket in de app aanpast (custom
// ZANG_PLAN i.p.v. het standaardschema), weet deze functie daar niets
// van — ze kent alleen dit standaardschema. Zie toelichting in de chat.
const ZANG_SCHEDULE = [{"date": "2026-08-17", "song": "Sam Cooke – You Send Me", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-08-19", "song": "Sam Cooke – You Send Me", "focus": "Resonantie + heldere klank"}, {"date": "2026-08-21", "song": "Sam Cooke – You Send Me", "focus": "Kracht + chest/mix"}, {"date": "2026-08-23", "song": "Sam Cooke – You Send Me", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-08-24", "song": "Ray Charles – Georgia on My Mind", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-08-26", "song": "Ray Charles – Georgia on My Mind", "focus": "Resonantie + heldere klank"}, {"date": "2026-08-28", "song": "Ray Charles – Georgia on My Mind", "focus": "Kracht + chest/mix"}, {"date": "2026-08-30", "song": "Ray Charles – Georgia on My Mind", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-08-31", "song": "Sam Cooke – Bring It On Home to Me", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-09-02", "song": "Sam Cooke – Bring It On Home to Me", "focus": "Resonantie + heldere klank"}, {"date": "2026-09-04", "song": "Sam Cooke – Bring It On Home to Me", "focus": "Kracht + chest/mix"}, {"date": "2026-09-06", "song": "Sam Cooke – Bring It On Home to Me", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-09-07", "song": "Otis Redding – That's How Strong My Love Is", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-09-09", "song": "Otis Redding – That's How Strong My Love Is", "focus": "Resonantie + heldere klank"}, {"date": "2026-09-11", "song": "Otis Redding – That's How Strong My Love Is", "focus": "Kracht + chest/mix"}, {"date": "2026-09-13", "song": "Otis Redding – That's How Strong My Love Is", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-09-14", "song": "Percy Sledge – When a Man Loves a Woman", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-09-16", "song": "Percy Sledge – When a Man Loves a Woman", "focus": "Resonantie + heldere klank"}, {"date": "2026-09-18", "song": "Percy Sledge – When a Man Loves a Woman", "focus": "Kracht + chest/mix"}, {"date": "2026-09-20", "song": "Percy Sledge – When a Man Loves a Woman", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-09-21", "song": "Ben E. King – Stand by Me", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-09-23", "song": "Ben E. King – Stand by Me", "focus": "Resonantie + heldere klank"}, {"date": "2026-09-25", "song": "Ben E. King – Stand by Me", "focus": "Kracht + chest/mix"}, {"date": "2026-09-27", "song": "Ben E. King – Stand by Me", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-09-28", "song": "Ray Charles – You Don't Know Me", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-09-30", "song": "Ray Charles – You Don't Know Me", "focus": "Resonantie + heldere klank"}, {"date": "2026-10-02", "song": "Ray Charles – You Don't Know Me", "focus": "Kracht + chest/mix"}, {"date": "2026-10-04", "song": "Ray Charles – You Don't Know Me", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-10-05", "song": "Otis Redding – I've Been Loving You Too Long", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-10-07", "song": "Otis Redding – I've Been Loving You Too Long", "focus": "Resonantie + heldere klank"}, {"date": "2026-10-09", "song": "Otis Redding – I've Been Loving You Too Long", "focus": "Kracht + chest/mix"}, {"date": "2026-10-11", "song": "Otis Redding – I've Been Loving You Too Long", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-10-12", "song": "Sam Cooke – A Change Is Gonna Come", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-10-14", "song": "Sam Cooke – A Change Is Gonna Come", "focus": "Resonantie + heldere klank"}, {"date": "2026-10-16", "song": "Sam Cooke – A Change Is Gonna Come", "focus": "Kracht + chest/mix"}, {"date": "2026-10-18", "song": "Sam Cooke – A Change Is Gonna Come", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-10-19", "song": "Solomon Burke – Cry to Me", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-10-21", "song": "Solomon Burke – Cry to Me", "focus": "Resonantie + heldere klank"}, {"date": "2026-10-23", "song": "Solomon Burke – Cry to Me", "focus": "Kracht + chest/mix"}, {"date": "2026-10-25", "song": "Solomon Burke – Cry to Me", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-10-26", "song": "Wilson Pickett – In the Midnight Hour", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-10-28", "song": "Wilson Pickett – In the Midnight Hour", "focus": "Resonantie + heldere klank"}, {"date": "2026-10-30", "song": "Wilson Pickett – In the Midnight Hour", "focus": "Kracht + chest/mix"}, {"date": "2026-11-01", "song": "Wilson Pickett – In the Midnight Hour", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-11-02", "song": "Otis Redding – Try a Little Tenderness", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-11-04", "song": "Otis Redding – Try a Little Tenderness", "focus": "Resonantie + heldere klank"}, {"date": "2026-11-06", "song": "Otis Redding – Try a Little Tenderness", "focus": "Kracht + chest/mix"}, {"date": "2026-11-08", "song": "Otis Redding – Try a Little Tenderness", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-11-09", "song": "Aretha Franklin – I Never Loved a Man (The Way I Love You)", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-11-11", "song": "Aretha Franklin – I Never Loved a Man (The Way I Love You)", "focus": "Resonantie + heldere klank"}, {"date": "2026-11-13", "song": "Aretha Franklin – I Never Loved a Man (The Way I Love You)", "focus": "Kracht + chest/mix"}, {"date": "2026-11-15", "song": "Aretha Franklin – I Never Loved a Man (The Way I Love You)", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-11-16", "song": "Ray Charles – I Got a Woman", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-11-18", "song": "Ray Charles – I Got a Woman", "focus": "Resonantie + heldere klank"}, {"date": "2026-11-20", "song": "Ray Charles – I Got a Woman", "focus": "Kracht + chest/mix"}, {"date": "2026-11-22", "song": "Ray Charles – I Got a Woman", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-11-23", "song": "Bill Withers – Ain't No Sunshine", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-11-25", "song": "Bill Withers – Ain't No Sunshine", "focus": "Resonantie + heldere klank"}, {"date": "2026-11-27", "song": "Bill Withers – Ain't No Sunshine", "focus": "Kracht + chest/mix"}, {"date": "2026-11-29", "song": "Bill Withers – Ain't No Sunshine", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-11-30", "song": "Al Green – Let's Stay Together", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-12-02", "song": "Al Green – Let's Stay Together", "focus": "Resonantie + heldere klank"}, {"date": "2026-12-04", "song": "Al Green – Let's Stay Together", "focus": "Kracht + chest/mix"}, {"date": "2026-12-06", "song": "Al Green – Let's Stay Together", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-12-07", "song": "Otis Redding – Sittin' on the Dock of the Bay", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-12-09", "song": "Otis Redding – Sittin' on the Dock of the Bay", "focus": "Resonantie + heldere klank"}, {"date": "2026-12-11", "song": "Otis Redding – Sittin' on the Dock of the Bay", "focus": "Kracht + chest/mix"}, {"date": "2026-12-13", "song": "Otis Redding – Sittin' on the Dock of the Bay", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-12-14", "song": "Etta James – I'd Rather Go Blind", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-12-16", "song": "Etta James – I'd Rather Go Blind", "focus": "Resonantie + heldere klank"}, {"date": "2026-12-18", "song": "Etta James – I'd Rather Go Blind", "focus": "Kracht + chest/mix"}, {"date": "2026-12-20", "song": "Etta James – I'd Rather Go Blind", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-12-21", "song": "Wilson Pickett – 634-5789", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-12-23", "song": "Wilson Pickett – 634-5789", "focus": "Resonantie + heldere klank"}, {"date": "2026-12-25", "song": "Wilson Pickett – 634-5789", "focus": "Kracht + chest/mix"}, {"date": "2026-12-27", "song": "Wilson Pickett – 634-5789", "focus": "Dynamiek + transfer naar song"}, {"date": "2026-12-28", "song": "Sam & Dave – Hold On, I'm Comin'", "focus": "Coördinatie + toonvastheid"}, {"date": "2026-12-30", "song": "Sam & Dave – Hold On, I'm Comin'", "focus": "Resonantie + heldere klank"}, {"date": "2027-01-01", "song": "Sam & Dave – Hold On, I'm Comin'", "focus": "Kracht + chest/mix"}, {"date": "2027-01-03", "song": "Sam & Dave – Hold On, I'm Comin'", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-01-04", "song": "Percy Sledge – Warm and Tender Love", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-01-06", "song": "Percy Sledge – Warm and Tender Love", "focus": "Resonantie + heldere klank"}, {"date": "2027-01-08", "song": "Percy Sledge – Warm and Tender Love", "focus": "Kracht + chest/mix"}, {"date": "2027-01-10", "song": "Percy Sledge – Warm and Tender Love", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-01-11", "song": "Joe Cocker – Feeling Alright", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-01-13", "song": "Joe Cocker – Feeling Alright", "focus": "Resonantie + heldere klank"}, {"date": "2027-01-15", "song": "Joe Cocker – Feeling Alright", "focus": "Kracht + chest/mix"}, {"date": "2027-01-17", "song": "Joe Cocker – Feeling Alright", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-01-18", "song": "Creedence Clearwater Revival – Have You Ever Seen the Rain", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-01-20", "song": "Creedence Clearwater Revival – Have You Ever Seen the Rain", "focus": "Resonantie + heldere klank"}, {"date": "2027-01-22", "song": "Creedence Clearwater Revival – Have You Ever Seen the Rain", "focus": "Kracht + chest/mix"}, {"date": "2027-01-24", "song": "Creedence Clearwater Revival – Have You Ever Seen the Rain", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-01-25", "song": "Creedence Clearwater Revival – Long as I Can See the Light", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-01-27", "song": "Creedence Clearwater Revival – Long as I Can See the Light", "focus": "Resonantie + heldere klank"}, {"date": "2027-01-29", "song": "Creedence Clearwater Revival – Long as I Can See the Light", "focus": "Kracht + chest/mix"}, {"date": "2027-01-31", "song": "Creedence Clearwater Revival – Long as I Can See the Light", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-02-01", "song": "Joe Cocker – You Are So Beautiful", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-02-03", "song": "Joe Cocker – You Are So Beautiful", "focus": "Resonantie + heldere klank"}, {"date": "2027-02-05", "song": "Joe Cocker – You Are So Beautiful", "focus": "Kracht + chest/mix"}, {"date": "2027-02-07", "song": "Joe Cocker – You Are So Beautiful", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-02-08", "song": "Ray Charles – What'd I Say", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-02-10", "song": "Ray Charles – What'd I Say", "focus": "Resonantie + heldere klank"}, {"date": "2027-02-12", "song": "Ray Charles – What'd I Say", "focus": "Kracht + chest/mix"}, {"date": "2027-02-14", "song": "Ray Charles – What'd I Say", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-02-15", "song": "Otis Redding – Hard to Handle", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-02-17", "song": "Otis Redding – Hard to Handle", "focus": "Resonantie + heldere klank"}, {"date": "2027-02-19", "song": "Otis Redding – Hard to Handle", "focus": "Kracht + chest/mix"}, {"date": "2027-02-21", "song": "Otis Redding – Hard to Handle", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-02-22", "song": "Wilson Pickett – Mustang Sally", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-02-24", "song": "Wilson Pickett – Mustang Sally", "focus": "Resonantie + heldere klank"}, {"date": "2027-02-26", "song": "Wilson Pickett – Mustang Sally", "focus": "Kracht + chest/mix"}, {"date": "2027-02-28", "song": "Wilson Pickett – Mustang Sally", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-03-01", "song": "Sam Cooke – Wonderful World", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-03-03", "song": "Sam Cooke – Wonderful World", "focus": "Resonantie + heldere klank"}, {"date": "2027-03-05", "song": "Sam Cooke – Wonderful World", "focus": "Kracht + chest/mix"}, {"date": "2027-03-07", "song": "Sam Cooke – Wonderful World", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-03-08", "song": "Bobby Womack – If You Think You're Groovy", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-03-10", "song": "Bobby Womack – If You Think You're Groovy", "focus": "Resonantie + heldere klank"}, {"date": "2027-03-12", "song": "Bobby Womack – If You Think You're Groovy", "focus": "Kracht + chest/mix"}, {"date": "2027-03-14", "song": "Bobby Womack – If You Think You're Groovy", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-03-15", "song": "Aretha Franklin – Chain of Fools", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-03-17", "song": "Aretha Franklin – Chain of Fools", "focus": "Resonantie + heldere klank"}, {"date": "2027-03-19", "song": "Aretha Franklin – Chain of Fools", "focus": "Kracht + chest/mix"}, {"date": "2027-03-21", "song": "Aretha Franklin – Chain of Fools", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-03-22", "song": "Bill Withers – Lean on Me", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-03-24", "song": "Bill Withers – Lean on Me", "focus": "Resonantie + heldere klank"}, {"date": "2027-03-26", "song": "Bill Withers – Lean on Me", "focus": "Kracht + chest/mix"}, {"date": "2027-03-28", "song": "Bill Withers – Lean on Me", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-03-29", "song": "Al Green – Tired of Being Alone", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-03-31", "song": "Al Green – Tired of Being Alone", "focus": "Resonantie + heldere klank"}, {"date": "2027-04-02", "song": "Al Green – Tired of Being Alone", "focus": "Kracht + chest/mix"}, {"date": "2027-04-04", "song": "Al Green – Tired of Being Alone", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-04-05", "song": "Joe Cocker – The Letter", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-04-07", "song": "Joe Cocker – The Letter", "focus": "Resonantie + heldere klank"}, {"date": "2027-04-09", "song": "Joe Cocker – The Letter", "focus": "Kracht + chest/mix"}, {"date": "2027-04-11", "song": "Joe Cocker – The Letter", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-04-12", "song": "Creedence Clearwater Revival – Who'll Stop the Rain", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-04-14", "song": "Creedence Clearwater Revival – Who'll Stop the Rain", "focus": "Resonantie + heldere klank"}, {"date": "2027-04-16", "song": "Creedence Clearwater Revival – Who'll Stop the Rain", "focus": "Kracht + chest/mix"}, {"date": "2027-04-18", "song": "Creedence Clearwater Revival – Who'll Stop the Rain", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-04-19", "song": "Screamin' Jay Hawkins – I Put a Spell on You", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-04-21", "song": "Screamin' Jay Hawkins – I Put a Spell on You", "focus": "Resonantie + heldere klank"}, {"date": "2027-04-23", "song": "Screamin' Jay Hawkins – I Put a Spell on You", "focus": "Kracht + chest/mix"}, {"date": "2027-04-25", "song": "Screamin' Jay Hawkins – I Put a Spell on You", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-04-26", "song": "Solomon Burke – Everybody Needs Somebody to Love", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-04-28", "song": "Solomon Burke – Everybody Needs Somebody to Love", "focus": "Resonantie + heldere klank"}, {"date": "2027-04-30", "song": "Solomon Burke – Everybody Needs Somebody to Love", "focus": "Kracht + chest/mix"}, {"date": "2027-05-02", "song": "Solomon Burke – Everybody Needs Somebody to Love", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-05-03", "song": "Otis Redding – Fa-Fa-Fa-Fa-Fa (Sad Song)", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-05-05", "song": "Otis Redding – Fa-Fa-Fa-Fa-Fa (Sad Song)", "focus": "Resonantie + heldere klank"}, {"date": "2027-05-07", "song": "Otis Redding – Fa-Fa-Fa-Fa-Fa (Sad Song)", "focus": "Kracht + chest/mix"}, {"date": "2027-05-09", "song": "Otis Redding – Fa-Fa-Fa-Fa-Fa (Sad Song)", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-05-10", "song": "Ray Charles – Unchain My Heart", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-05-12", "song": "Ray Charles – Unchain My Heart", "focus": "Resonantie + heldere klank"}, {"date": "2027-05-14", "song": "Ray Charles – Unchain My Heart", "focus": "Kracht + chest/mix"}, {"date": "2027-05-16", "song": "Ray Charles – Unchain My Heart", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-05-17", "song": "Joe Cocker – Delta Lady", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-05-19", "song": "Joe Cocker – Delta Lady", "focus": "Resonantie + heldere klank"}, {"date": "2027-05-21", "song": "Joe Cocker – Delta Lady", "focus": "Kracht + chest/mix"}, {"date": "2027-05-23", "song": "Joe Cocker – Delta Lady", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-05-24", "song": "Wilson Pickett – Land of 1000 Dances", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-05-26", "song": "Wilson Pickett – Land of 1000 Dances", "focus": "Resonantie + heldere klank"}, {"date": "2027-05-28", "song": "Wilson Pickett – Land of 1000 Dances", "focus": "Kracht + chest/mix"}, {"date": "2027-05-30", "song": "Wilson Pickett – Land of 1000 Dances", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-05-31", "song": "Aretha Franklin – Think", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-06-02", "song": "Aretha Franklin – Think", "focus": "Resonantie + heldere klank"}, {"date": "2027-06-04", "song": "Aretha Franklin – Think", "focus": "Kracht + chest/mix"}, {"date": "2027-06-06", "song": "Aretha Franklin – Think", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-06-07", "song": "Otis Redding – Respect", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-06-09", "song": "Otis Redding – Respect", "focus": "Resonantie + heldere klank"}, {"date": "2027-06-11", "song": "Otis Redding – Respect", "focus": "Kracht + chest/mix"}, {"date": "2027-06-13", "song": "Otis Redding – Respect", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-06-14", "song": "Sam & Dave – Soul Man", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-06-16", "song": "Sam & Dave – Soul Man", "focus": "Resonantie + heldere klank"}, {"date": "2027-06-18", "song": "Sam & Dave – Soul Man", "focus": "Kracht + chest/mix"}, {"date": "2027-06-20", "song": "Sam & Dave – Soul Man", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-06-21", "song": "Ray Charles – Mess Around", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-06-23", "song": "Ray Charles – Mess Around", "focus": "Resonantie + heldere klank"}, {"date": "2027-06-25", "song": "Ray Charles – Mess Around", "focus": "Kracht + chest/mix"}, {"date": "2027-06-27", "song": "Ray Charles – Mess Around", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-06-28", "song": "Joe Cocker – With a Little Help from My Friends", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-06-30", "song": "Joe Cocker – With a Little Help from My Friends", "focus": "Resonantie + heldere klank"}, {"date": "2027-07-02", "song": "Joe Cocker – With a Little Help from My Friends", "focus": "Kracht + chest/mix"}, {"date": "2027-07-04", "song": "Joe Cocker – With a Little Help from My Friends", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-07-05", "song": "Screamin' Jay Hawkins – Constipation Blues", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-07-07", "song": "Screamin' Jay Hawkins – Constipation Blues", "focus": "Resonantie + heldere klank"}, {"date": "2027-07-09", "song": "Screamin' Jay Hawkins – Constipation Blues", "focus": "Kracht + chest/mix"}, {"date": "2027-07-11", "song": "Screamin' Jay Hawkins – Constipation Blues", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-07-12", "song": "Creedence Clearwater Revival – Born on the Bayou", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-07-14", "song": "Creedence Clearwater Revival – Born on the Bayou", "focus": "Resonantie + heldere klank"}, {"date": "2027-07-16", "song": "Creedence Clearwater Revival – Born on the Bayou", "focus": "Kracht + chest/mix"}, {"date": "2027-07-18", "song": "Creedence Clearwater Revival – Born on the Bayou", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-07-19", "song": "Otis Redding – I've Got Dreams to Remember", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-07-21", "song": "Otis Redding – I've Got Dreams to Remember", "focus": "Resonantie + heldere klank"}, {"date": "2027-07-23", "song": "Otis Redding – I've Got Dreams to Remember", "focus": "Kracht + chest/mix"}, {"date": "2027-07-25", "song": "Otis Redding – I've Got Dreams to Remember", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-07-26", "song": "Joe Cocker – You Can Leave Your Hat On", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-07-28", "song": "Joe Cocker – You Can Leave Your Hat On", "focus": "Resonantie + heldere klank"}, {"date": "2027-07-30", "song": "Joe Cocker – You Can Leave Your Hat On", "focus": "Kracht + chest/mix"}, {"date": "2027-08-01", "song": "Joe Cocker – You Can Leave Your Hat On", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-08-02", "song": "Aretha Franklin – Rock Steady", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-08-04", "song": "Aretha Franklin – Rock Steady", "focus": "Resonantie + heldere klank"}, {"date": "2027-08-06", "song": "Aretha Franklin – Rock Steady", "focus": "Kracht + chest/mix"}, {"date": "2027-08-08", "song": "Aretha Franklin – Rock Steady", "focus": "Dynamiek + transfer naar song"}, {"date": "2027-08-09", "song": "Otis Redding – Try a Little Tenderness – live", "focus": "Coördinatie + toonvastheid"}, {"date": "2027-08-11", "song": "Otis Redding – Try a Little Tenderness – live", "focus": "Resonantie + heldere klank"}, {"date": "2027-08-13", "song": "Otis Redding – Try a Little Tenderness – live", "focus": "Kracht + chest/mix"}, {"date": "2027-08-15", "song": "Otis Redding – Try a Little Tenderness – live", "focus": "Dynamiek + transfer naar song"}];

// ── Trainingsstart, voor weeknummer-berekening (zelfde als START in de app) ──
const TRAINING_START = new Date(Date.UTC(2026, 5, 15)); // 15 juni 2026

// ── Belgische lokale tijd ophalen, ongeacht serverklok ──
function belgianNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short'
  }).formatToParts(now);
  const get = t => parts.find(p => p.type === t).value;
  const y = get('year'), mo = get('month'), d = get('day');
  const hh = get('hour'), mi = get('minute');
  const weekdayShort = get('weekday'); // 'Sun','Mon',...
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateStr: `${y}-${mo}-${d}`,
    time: `${hh}:${mi}`,
    dow: dowMap[weekdayShort]
  };
}
function roundToQuarterHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m;
  total = Math.round(total / 15) * 15;
  total = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function getDayType(dateStr) {
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  if (dow === 2) return 'run-short'; // dinsdag = 8km
  if (dow === 0) return 'run-long';  // zondag = 12km
  if (dow === 6) return 'rest';      // zaterdag = rust
  return 'train';                    // ma, wo, do, vr
}
function getWeekNum(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const diffDays = Math.floor((d - TRAINING_START) / 86400000);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

// ── OneSignal notificatie versturen op basis van tag-filters ──
async function sendPush(filters, title, body, tagId) {
  if (!ONESIGNAL_REST_API_KEY) {
    console.error('ONESIGNAL_REST_API_KEY ontbreekt — kan geen push versturen.');
    return { skipped: true, reason: 'no-api-key' };
  }
  const res = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      filters,
      headings: { en: title, nl: title },
      contents: { en: body, nl: body },
      web_push_topic: tagId
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`OneSignal fout (${tagId}):`, res.status, json);
  } else {
    console.log(`Push verstuurd (${tagId}):`, json.id || json);
  }
  return json;
}

export default async (req) => {
  const { dateStr, time, dow } = belgianNow();
  const currentTime = roundToQuarterHour(time);
  const results = [];

  // Let op: elk meldingstype gebruikt hier ÉÉN tag waarvan de waarde ofwel
  // 'off' is (uitgeschakeld) ofwel het effectieve tijdstip zelf (bv. '07:30').
  // Dit matcht het schema in oneSignalSyncTags() in de app — nodig om
  // binnen OneSignal's gratis-plan limiet van 6 Data Tags te blijven.

  // ── 1. Training ──
  {
    const filters = [
      { field: 'tag', key: 'notifTraining', relation: '=', value: currentTime }
    ];
    const type = getDayType(dateStr);
    const body = type === 'train'
      ? '💪 Trainingsdag — je programma staat klaar in de app.'
      : type === 'run-short' ? '🏃 Vandaag: 8km loop — succes!'
      : type === 'run-long'  ? '🏃 Vandaag: 12km lange duurloop!'
      : '😴 Rustdag vandaag — herstel en geniet.';
    results.push(await sendPush(filters, 'QualityTime · Training', body, 'training-dag'));
  }

  // ── 2. Avondmaaltijd ──
  {
    const filters = [
      { field: 'tag', key: 'notifMaaltijd', relation: '=', value: currentTime }
    ];
    results.push(await sendPush(
      filters,
      'QualityTime · Avondmaaltijd',
      '🍽️ Tijd om te koken — bekijk het menu van vanavond in de app.',
      'maaltijd-dag'
    ));
  }

  // ── 3. Weekoverzicht (enkel zondag) ──
  if (dow === 0) {
    const filters = [
      { field: 'tag', key: 'notifWeek', relation: '=', value: currentTime }
    ];
    const wk = getWeekNum(dateStr);
    results.push(await sendPush(
      filters,
      `QualityTime · Week ${wk + 1}`,
      '📅 Nieuwe week, nieuwe kansen. Je trainingsschema staat klaar!',
      'weekoverzicht'
    ));
  }

  // ── 4. Afval — avond (morgen buiten zetten) ──
  {
    const tomorrow = addDaysStr(dateStr, 1);
    const tomorrowWaste = getWasteForDate(tomorrow);
    if (tomorrowWaste.length > 0) {
      const filters = [
        { field: 'tag', key: 'notifAfvalEvening', relation: '=', value: currentTime }
      ];
      const fracs = tomorrowWaste.map(t => `${WASTE_ICONS[t].icon} ${WASTE_ICONS[t].label}`).join(', ');
      results.push(await sendPush(
        filters,
        '🗑️ Morgen afval!',
        `Vergeet niet: ${fracs} — zet voor 6:00 buiten.`,
        'afval-morgen'
      ));
    }
  }

  // ── 5. Afval — ochtend (vandaag opgehaald) ──
  {
    const todayWaste = getWasteForDate(dateStr);
    if (todayWaste.length > 0) {
      const filters = [
        { field: 'tag', key: 'notifAfvalMorning', relation: '=', value: currentTime }
      ];
      const fracs = todayWaste.map(t => `${WASTE_ICONS[t].icon} ${WASTE_ICONS[t].label}`).join(', ');
      results.push(await sendPush(
        filters,
        '🗑️ Vandaag afval!',
        `${fracs} wordt vandaag opgehaald — zet buiten!`,
        'afval-vandaag'
      ));
    }
  }

  // ── 6. Zangles (enkel op lesdagen uit het standaardschema) ──
  {
    const session = ZANG_SCHEDULE.find(p => p.date === dateStr);
    if (session) {
      const filters = [
        { field: 'tag', key: 'notifZangles', relation: '=', value: currentTime }
      ];
      results.push(await sendPush(
        filters,
        'QualityTime · Zangles',
        `🎤 Vanavond: ${session.focus} — ${session.song}`,
        'zangles-dag'
      ));
    }
  }

  return new Response(JSON.stringify({ ok: true, dateStr, currentTime, dow, results }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {
  schedule: '*/15 * * * *'
};
