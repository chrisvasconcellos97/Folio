// Personal "off the clock" feed — soccer news (free RSS) + live/upcoming
// scores (API-Football). Server-side so it sidesteps corporate proxies and
// keeps the API key off the client. Everything is cached and wrapped so a
// failure NEVER breaks Home — the card just shows whatever it could get.
//
// Env: API_FOOTBALL_KEY (optional). Without it, the card is news-only.
// Registered in scripts/test-api-imports.js.

// ── interests config ─────────────────────────────────────────────────────
// RSS feeds (free, no key). Several candidates; failures are skipped.
var FEEDS = [
  { topic: "Man United", url: "https://www.theguardian.com/football/manchester-united/rss" },
  { topic: "Brazil",     url: "https://www.theguardian.com/football/brazil/rss" },
  { topic: "USMNT",      url: "https://www.theguardian.com/football/usa/rss" },
  { topic: "World Cup",  url: "https://www.theguardian.com/football/world-cup-2026/rss" },
  { topic: "World Cup",  url: "https://www.theguardian.com/football/worldcup/rss" },
];

// Teams to follow for scores. ids resolved at runtime by name (cached) so we
// don't ship guessed API-Football ids. `national` disambiguates club vs country.
var TEAMS = [
  { key: "Man United", search: "manchester united", national: false },
  { key: "Brazil",     search: "brazil",            national: true  },
  { key: "USMNT",      search: "usa",               national: true  },
];

var AF_BASE = "https://v3.football.api-sports.io";

// ── tiny in-memory cache (per warm serverless instance) ───────────────────
var _cache = { at: 0, ttl: 0, payload: null };
var _teamIds = null; // resolved once per warm instance

function now() { return Date.now(); }

async function fetchWithTimeout(url, opts, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms || 7000);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
  } finally {
    clearTimeout(t);
  }
}

function decode(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .trim();
}

// Parse the first N <item>s out of an RSS feed without a dependency.
function parseRss(xml, topic, limit) {
  var out = [];
  var items = xml.split(/<item[ >]/i).slice(1);
  for (var i = 0; i < items.length && out.length < (limit || 3); i++) {
    var block = items[i];
    var tm = block.match(/<title>([\s\S]*?)<\/title>/i);
    var lm = block.match(/<link>([\s\S]*?)<\/link>/i);
    var pm = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    var title = tm ? decode(tm[1]) : "";
    if (!title) continue;
    out.push({
      topic: topic,
      title: title,
      link: lm ? decode(lm[1]) : "",
      published: pm ? pm[1].trim() : null,
    });
  }
  return out;
}

async function getNews() {
  var all = [];
  var seenTopics = {};
  for (var i = 0; i < FEEDS.length; i++) {
    var f = FEEDS[i];
    // For World Cup we list two candidate URLs — once one yields items, skip the other.
    if (seenTopics[f.topic] && f.topic === "World Cup") continue;
    try {
      var r = await fetchWithTimeout(f.url, { headers: { "User-Agent": "FoliosBot/1.0" } }, 6000);
      if (!r.ok) continue;
      var xml = await r.text();
      var items = parseRss(xml, f.topic, 3);
      if (items.length) { seenTopics[f.topic] = true; all = all.concat(items); }
    } catch (_) { /* skip this feed */ }
  }
  // Newest first, cap the list.
  all.sort(function (a, b) {
    var ta = a.published ? new Date(a.published).getTime() : 0;
    var tb = b.published ? new Date(b.published).getTime() : 0;
    return tb - ta;
  });
  return all.slice(0, 6);
}

// ── scores via API-Football ───────────────────────────────────────────────
function afHeaders(key) { return { "x-apisports-key": key }; }

async function afGet(path, key) {
  var r = await fetchWithTimeout(AF_BASE + path, { headers: afHeaders(key) }, 7000);
  if (!r.ok) throw new Error("api-football " + r.status);
  var j = await r.json();
  return (j && j.response) || [];
}

async function resolveTeamIds(key) {
  if (_teamIds) return _teamIds;
  var ids = {};
  for (var i = 0; i < TEAMS.length; i++) {
    var t = TEAMS[i];
    try {
      var res = await afGet("/teams?search=" + encodeURIComponent(t.search), key);
      var match = res.find(function (row) {
        return row && row.team && !!row.team.national === !!t.national;
      }) || res[0];
      if (match && match.team) ids[t.key] = match.team.id;
    } catch (_) { /* leave unresolved */ }
  }
  _teamIds = ids;
  return ids;
}

function mapFixture(fx, teamKey) {
  var st = (fx.fixture && fx.fixture.status) || {};
  var short = st.short || "NS";
  var live = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].indexOf(short) !== -1;
  var done = ["FT", "AET", "PEN"].indexOf(short) !== -1;
  return {
    team: teamKey,
    status: live ? "live" : (done ? "final" : "upcoming"),
    minute: st.elapsed || null,
    home: fx.teams && fx.teams.home ? fx.teams.home.name : "",
    away: fx.teams && fx.teams.away ? fx.teams.away.name : "",
    homeGoals: fx.goals ? fx.goals.home : null,
    awayGoals: fx.goals ? fx.goals.away : null,
    kickoff: fx.fixture ? fx.fixture.date : null,
    league: fx.league ? fx.league.name : "",
  };
}

async function getScores(key) {
  var ids = await resolveTeamIds(key);
  var idToKey = {};
  Object.keys(ids).forEach(function (k) { idToKey[ids[k]] = k; });
  var matches = [];
  var liveTeamIds = {};

  // One call for every live match globally; keep the ones we follow.
  try {
    var liveRes = await afGet("/fixtures?live=all", key);
    liveRes.forEach(function (fx) {
      var hid = fx.teams && fx.teams.home && fx.teams.home.id;
      var aid = fx.teams && fx.teams.away && fx.teams.away.id;
      var key2 = idToKey[hid] || idToKey[aid];
      if (key2) { matches.push(mapFixture(fx, key2)); liveTeamIds[ids[key2]] = true; }
    });
  } catch (_) { /* no live data */ }

  // Next fixture for teams that aren't live right now.
  for (var k = 0; k < TEAMS.length; k++) {
    var tk = TEAMS[k].key;
    var id = ids[tk];
    if (!id || liveTeamIds[id]) continue;
    try {
      var nx = await afGet("/fixtures?team=" + id + "&next=1", key);
      if (nx[0]) matches.push(mapFixture(nx[0], tk));
    } catch (_) { /* skip */ }
  }

  return { matches: matches, anyLive: Object.keys(liveTeamIds).length > 0 };
}

// ── handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Serve cache when fresh.
  if (_cache.payload && now() - _cache.at < _cache.ttl) {
    return res.status(200).json(_cache.payload);
  }

  var key = process.env.API_FOOTBALL_KEY || null;
  var news = [];
  var scores = { matches: [], anyLive: false };

  try { news = await getNews(); } catch (_) { news = []; }
  if (key) {
    try { scores = await getScores(key); } catch (_) { scores = { matches: [], anyLive: false }; }
  }

  var payload = { news: news, matches: scores.matches, hasScores: !!key, generatedAt: new Date().toISOString() };

  // Cache: short when a followed team is live so scores tick; long otherwise.
  _cache = { at: now(), ttl: scores.anyLive ? 120000 : 30 * 60000, payload: payload };

  return res.status(200).json(payload);
}
