// Resolves a package-art image URL per game via the Rakuten Ichiba item search API
// (IchibaItem/Search, genreId 101205 = テレビゲーム) and caches the result in
// public/data/source/covers-cache.json (committed, read by generate-manifest.mjs). Not run on
// every build — run manually with `npm run fetch-covers` when adding new games or retrying
// misses.
//
// Unlike ranobe-db/manga-db (Rakuten Books API, ISBN-keyed, book-specific catalog), games.json
// has no equivalent unique catalog id to search by, and Rakuten Ichiba is a general marketplace
// (not games-specific), so false positives are a much bigger risk here: strategy guides,
// soundtrack CDs, plushies/goods, and used-game listings with placeholder images can all match a
// title keyword. This script filters by genreId=101205 and excludes item names containing known
// non-package-art keywords (see EXCLUDE_KEYWORDS), but every match should still be spot-checked
// via `matchedTitle` before trusting it, same as the honto.jp manual-fallback rule in
// ranobe-db/CLAUDE.md.
//
// Requires a Rakuten Web Service app — free, instant self-serve (no sales-history approval like
// Amazon PA-API): register at https://webservice.rakuten.co.jp/, create an app with
// "アプリケーションURL" set to this site's URL (https://izenmi.github.io/game-db/), and copy its
// "アプリケーションID" and "アクセスキー". Pass them via env vars; never commit them. Rakuten's
// app registration is per-site (the URL is checked), so the ranobe-db/manga-db keys cannot be
// reused here — this needs its own new app.
//
// Ported from ranobe-db/manga-db 2026-08-04 (those two gained a BOOK☆WALKER fallback tier, which
// does not apply here — BOOK☆WALKER is a bookstore and doesn't sell games — but the matching work
// does): NFKC-based normalization, progressively looser search keywords, and --retry-misses.
//
// The game-specific addition is platform awareness. The single most common manual fix in this
// project's history has been "right game, wrong console" — Xbox / PS4 / Vita / import editions
// getting cached for a title this site only lists on ps5/switch/switch2 (21 such fixes in one
// round alone, see CLAUDE.md). pickBestMatch now rejects any item that names a platform outside
// the game's declared `platforms`, prefers items that name one of the declared platforms, and
// deprioritizes import editions — and the declared platform is appended to the search keyword as
// a fallback, which is exactly what refetch-cover.mjs was being driven by hand to do.
//
// Two sources are tried in order (2026-08-04):
//
//   1. IGDB (api.igdb.com/v4) — a games database rather than a store, so an entry *is* the game:
//      portrait box art (t_cover_big is 264x352, matching this site's 92x131 / 160x228 slots),
//      identified by platform, with none of a marketplace's noise — no shop name in the title, no
//      used/import/download-code variants, no season pass or bundle standing in for the game. It
//      also carries the download-only and indie titles a shop listing can never cover (F-ZERO 99,
//      Marvel Rivals, Brawlhalla, Jusant, TOEM...). Auth is a Twitch client-credentials token;
//      register a free app at dev.twitch.tv and pass IGDB_CLIENT_ID / IGDB_CLIENT_SECRET.
//   2. Rakuten Ichiba (IchibaItem/Search) — the fallback, and still a necessary one: it has the
//      Japanese retail package for titles IGDB only indexes under an English name this site's
//      Japanese title can't be matched against.
//
// Nintendo's own search API (search.nintendo.jp/nintendo_soft/search.json) and the PlayStation
// Store both work without credentials and would cover roughly 45 of the remaining titles, but
// their artwork is 1920x1080 / 1024x1024 — landscape or square key art, which gets badly cropped
// in a portrait cover slot. They're the fallback plan if IGDB's coverage disappoints; see
// CLAUDE.md before spending time re-deriving that.
//
// Usage (either credential pair may be omitted to run just the other tier):
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=xxx \
//     npm run fetch-covers
//   ... npm run fetch-covers -- --force
//   ... npm run fetch-covers -- --retry-misses
//   ... npm run fetch-covers -- --only=elden-ring,mario-kart-world
//
// --force re-fetches everything, including entries that were corrected by hand after a mismatch,
// so prefer --retry-misses when retrying the unresolved games: it only touches entries whose
// coverUrl is null and leaves every resolved entry alone. (Historically, re-running the whole
// fetch re-introduced the same false matches that had just been cleaned out.)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath , pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(rootDir, "public", "data", "source");
const gamesPath = path.join(sourceDir, "games.json");
const cachePath = path.join(sourceDir, "covers-cache.json");

const REFERER_URL = "https://izenmi.github.io/game-db/";
const ORIGIN_URL = "https://izenmi.github.io";

// Each tier has its own credentials and either can be skipped, so neither is fatal on its own —
// running with only one set configured is a useful way to top up from just that source.
const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const RAKUTEN_ENABLED = Boolean(APP_ID && ACCESS_KEY);
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const IGDB_ENABLED = Boolean(IGDB_CLIENT_ID && IGDB_CLIENT_SECRET);
if (!RAKUTEN_ENABLED && !IGDB_ENABLED) {
  console.error(
    "RAKUTEN_APP_ID/RAKUTEN_ACCESS_KEY か IGDB_CLIENT_ID/IGDB_CLIENT_SECRET のどちらかは必要です (see the header comment in this file).",
  );
  process.exit(1);
}
if (!RAKUTEN_ENABLED) console.warn("RAKUTEN_* が未設定のため楽天市場をスキップし IGDB のみで解決します。");
if (!IGDB_ENABLED) console.warn("IGDB_* が未設定のため IGDB フォールバックをスキップします。");

const GAME_SOFTWARE_GENRE_ID = "101205"; // テレビゲーム, confirmed via ranking.rakuten.co.jp/*/101205/

const games = JSON.parse(readFileSync(gamesPath, "utf-8"));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf-8")) : {};

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const RETRY_MISSES = args.includes("--retry-misses");
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length).split(",") : undefined;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// NFKC folds the fullwidth/halfwidth variants that Rakuten sellers mix freely (ＰＳ５ vs PS5,
// （） vs ()). The explicit class then drops punctuation that differs between our titles and a
// shop's item name — including the wave dash U+301C 〜, which NFKC does NOT fold into U+FF5E.
export function normalize(title) {
  return title
    .normalize("NFKC")
    // "&" is in the list because compilation titles disagree about it constantly: this site has
    // 幻想水滸伝I・II / ドラゴンクエストI＆II / バテン・カイトスI&II where the shops have I&II,
    // I＆II and I&II respectively.
    .replace(/[\s　・:：;；!?！？―—\-ー~〜～()（）「」『』【】〈〉《》〔〕"“”'’,、.。&＆]/g, "")
    .toLowerCase();
}

// The part of a title a shop is likely to put in an item name: everything before a parenthesised
// or wave-dashed suffix.
//
// Note this deliberately does NOT split on ":" the way ranobe-db/manga-db's coreTitle does. In a
// game title the text after the colon is usually what identifies the specific entry, not
// decoration, so cutting there leaves the bare franchise name and matches the wrong game —
// 「Metal: Hellsinger」→「METAL GEAR SOLID」, 「Hollow Knight: Silksong」→「Hollow Knight」,
// 「Dying Light: The Beast」→「Dying Light 2」, 「グランブルーファンタジー ヴァーサス: ライジング」
// →無印「ヴァーサス」 were all produced this way.
export function coreTitle(title) {
  return title.split(/[~〜～(（【]/)[0].replace(/[「」『』"“”]/g, "").trim();
}

/** The API rejects the whole keyword with "keyword is not valid" if any single
 *  whitespace-separated token is exactly 1 character (confirmed empirically 2026-08-02: "ザ"
 *  alone, or trailing "2" in "Spider-Man 2", or "ザ" in "...オブ ザ キングダム" all fail; the
 *  same title with that token dropped succeeds). Stripping such tokens still leaves enough of
 *  the title to match correctly in practice. */
function toSearchKeyword(title) {
  const kept = title.split(/[\s　]+/).filter((token) => token.length >= 2);
  return kept.join(" ") || title;
}

const EXCLUDE_KEYWORDS = [
  "攻略本",
  "ガイドブック",
  "設定資料集",
  "画集",
  "アートブック",
  "サウンドトラック",
  "サントラ",
  "フィギュア",
  "ぬいぐるみ",
  "アクリルスタンド",
  "アクスタ",
  "グッズ",
  "ストラップ",
  "Tシャツ",
  "パーカー",
  "保護フィルム",
  "ケース",
  "コントローラー",
  "コントローラ",
  "スキンシール",
  "攻略",
  "ステッカー",
];

// Item names that mention one of these are almost certainly a release for a console this site
// doesn't list, so they're rejected outright regardless of how well the title matches. This is
// the automated form of the "right game, wrong console" cleanup described in the header comment.
const FOREIGN_PLATFORM_PATTERNS = [
  { name: "PS4", re: /ps\s*4|playstation\s*4|プレイステーション\s*4/i },
  { name: "PS3", re: /ps\s*3|playstation\s*3/i },
  { name: "PS2/PS1", re: /ps\s*[12]\b|playstation\s*[12]\b/i },
  { name: "Xbox", re: /xbox/i },
  { name: "PS Vita", re: /ps\s*vita|psvita|ヴィータ/i },
  { name: "PSP", re: /\bpsp\b/i },
  { name: "3DS", re: /3ds/i },
  { name: "Wii U", re: /wii\s*u/i },
  { name: "Wii", re: /\bwii\b/i },
  { name: "GameCube", re: /gamecube|ゲームキューブ/i },
  { name: "SFC/FC", re: /スーパーファミコン|ファミコン/i },
  { name: "PC", re: /steam版|windows版|\bpc版\b/i },
];

// Checked longest-first so "Switch 2" is never read as plain "Switch".
const DECLARED_PLATFORM_PATTERNS = [
  { id: "switch2", re: /(nintendo\s*)?switch\s*2|スイッチ\s*2/i, label: "Switch2" },
  { id: "ps5", re: /ps\s*5|playstation\s*5|プレイステーション\s*5/i, label: "PS5" },
  { id: "switch", re: /(nintendo\s*)?switch|ニンテンドースイッチ|スイッチ/i, label: "Switch" },
];

/** The platform an item name advertises, or undefined when it doesn't mention one. */
export function detectPlatform(itemName) {
  return DECLARED_PLATFORM_PATTERNS.find((p) => p.re.test(itemName))?.id;
}

/** Import editions are usually the real game but with foreign-language packaging — last resort. */
function isImportEdition(itemName) {
  return /北米版|海外版|輸入版|アジア版|韓国版|欧州版|EU版/i.test(itemName);
}

// Shop item names bury the real product name under bracketed banners and boilerplate
// (【中古】, [Switch], 「PS5 ゲームソフト」, 「新品」, campaign blurbs). Strip that so the title can
// be required to appear at the *start* of what's left.
const LEADING_NOISE =
  /^(?:\s|　|【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)|＜[^＞]*＞|《[^》]*》|中古|新品|未使用|送料無料|即納|数量限定|ゲームソフト|ソフト|PS5|PlayStation\s*5|プレイステーション\s*5|プレステ5|Nintendo\s*Switch\s*2?|Switch\s*2?|ニンテンドースイッチ|スイッチ)+/i;

function itemNameCore(itemName) {
  let name = itemName;
  let previous;
  do {
    previous = name;
    name = name.replace(LEADING_NOISE, "");
  } while (name !== previous);
  return name;
}

/**
 * Short, generic titles ("INSIDE", "LIMBO") collide with unrelated products whenever a plain
 * substring test is used — that is how 「LIMBO」→「東方深秘録 〜 Urban Legend in Limbo.」 and
 * 「INSIDE」→「NBA Inside Drive 2004」 got cached. Requiring the title at the start of the
 * de-noised item name also rejects the wrong-entry-in-the-right-franchise matches that needed
 * manual cleanup before (Diablo II Resurrected→ディアブロIII, Dying Light: The Beast→ダイイング
 * ライト2, Metal: Hellsinger→METAL GEAR SOLID, Silksong→Hollow Knight). Only long titles, where an
 * accidental substring collision is implausible, may match anywhere in the name.
 */
function titleMatches(itemName, target, core) {
  const head = normalize(itemNameCore(itemName));
  if (head.startsWith(target) || (core.length >= 4 && head.startsWith(core))) return true;
  const whole = normalize(itemName);
  return target.length >= 12 && whole.includes(target);
}

async function searchRakuten(keyword) {
  const params = new URLSearchParams({
    applicationId: APP_ID,
    accessKey: ACCESS_KEY,
    keyword,
    genreId: GAME_SOFTWARE_GENRE_ID,
    hits: "30",
    format: "json",
    formatVersion: "2",
  });
  // Rakuten migrated Ichiba item search to this new gateway (UUID applicationId + `pk_`-prefixed
  // accessKey, distinct from the legacy `app.rakuten.co.jp/services/api/...` credential format
  // ranobe-db/manga-db's Books API script still uses). Confirmed empirically 2026-08-02: the
  // legacy host 404s for this endpoint, and this one 403s with
  // REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING without the Referer header below. With
  // formatVersion=2 the top-level array key is `Items` (capital I) and each entry is a flat
  // object (no `.Item` wrapper, `mediumImageUrls` is an array of plain strings) — also confirmed
  // empirically, since the API's own docs describe a lowercase `items` shape that doesn't match
  // what this endpoint actually returns.
  const url = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`;
  // Rakuten answers 429 when a long batch runs (or when a sister site's fetch-covers runs at the
  // same time on the same app credentials). Backing off once or twice keeps a run from dropping
  // entries — a thrown error leaves the game unresolved until the next --retry-misses pass.
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { headers: { Referer: REFERER_URL, Origin: ORIGIN_URL } });
    if (res.status !== 429 || attempt >= 2) break;
    await sleep(5000 * (attempt + 1));
  }
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(data.errors?.errorMessage || `HTTP ${res.status}`);
  }
  return data.Items ?? [];
}

export function pickBestMatch(items, game) {
  const target = normalize(game.title);
  const core = normalize(coreTitle(game.title));
  const declared = game.platforms ?? [];

  const usable = items.filter((it) => {
    const name = it.itemName ?? "";
    if (EXCLUDE_KEYWORDS.some((kw) => name.includes(kw))) return false;
    const img = it.mediumImageUrls?.[0] ?? "";
    // 店舗ごとに綴りが違う。楽天ブックスは noimage_01.gif、ブックオフ系は r_noimg.gif。
    if (!img || /no[-_]?im(?:age|g)|now[-_]?printing/i.test(img)) return false;
    // A release for a console this site doesn't list is the wrong package art even when the
    // title matches perfectly.
    if (FOREIGN_PLATFORM_PATTERNS.some((p) => p.re.test(name))) return false;
    const mentioned = detectPlatform(name);
    if (mentioned && !declared.includes(mentioned)) return false;
    return titleMatches(name, target, core);
  });

  // Prefer an item that explicitly names one of the game's own platforms, then a domestic retail
  // package (import editions show foreign-language art, download listings often show a store icon
  // rather than the box), then a full-title match over a core-title one. Ichiba's default
  // relevance order breaks ties.
  const score = (it) => {
    const name = it.itemName ?? "";
    return (
      (declared.includes(detectPlatform(name)) ? 0 : 1) * 8 +
      (isImportEdition(name) ? 1 : 0) * 4 +
      (/ダウンロード版|ＤＬ版|DL版/i.test(name) ? 1 : 0) * 2 +
      (normalize(name).includes(target) ? 0 : 1)
    );
  };
  return usable.sort((a, b) => score(a) - score(b))[0];
}

// Progressively looser keywords: the full title, then the part before any subtitle, then the
// title plus a declared platform name (the manual refetch-cover.mjs recipe for wrong-console
// matches). toSearchKeyword() is applied to each because of the 1-character-token API quirk.
export function keywordCandidates(game) {
  const core = coreTitle(game.title);
  const platformLabel = DECLARED_PLATFORM_PATTERNS.find((p) => (game.platforms ?? []).includes(p.id))?.label;
  const candidates = [game.title, core];
  if (platformLabel) candidates.push(`${core || game.title} ${platformLabel}`);
  return [...new Set(candidates.filter(Boolean).map(toSearchKeyword))];
}

// --- IGDB tier ---------------------------------------------------------------------------
//
// Rakuten Ichiba only knows about things a shop stocks, so a download-only or indie title simply
// isn't there (F-ZERO 99, Marvel Rivals, Brawlhalla, Jusant, TOEM...). IGDB is a games database
// rather than a store, so it carries those, and its cover art is portrait box art (t_cover_big is
// 264x352) which matches this site's cover slots.

const IGDB_PLATFORM_NAMES = {
  ps5: ["PlayStation 5"],
  switch: ["Nintendo Switch"],
  switch2: ["Nintendo Switch 2"],
};

// IGDB `game_type`: 0 main_game, 1 dlc_addon, 2 expansion, 3 bundle, 4 standalone_expansion,
// 5 mod, 6 episode, 7 season, 8 remake, 9 remaster, 10 expanded_game, 11 port, 13 pack.
// This site lists games, so add-ons and bundles must never stand in for one — without this filter
// 「あつまれ どうぶつの森」 resolved to the Happy Home Paradise expansion, 「仁王」 to the Dragon of
// the North DLC, 「ゼノブレイド3」 to Future Redeemed and 「ポケットモンスター ソード・シールド」
// to the Double Pack. Remakes/remasters/ports stay because several entries here are exactly that
// (ゼノブレイド ディフィニティブ・エディション, 大神 絶景版, 真・女神転生III HD REMASTER).
const IGDB_ACCEPTED_GAME_TYPES = new Set([0, 8, 9, 10, 11]);

let igdbToken;

/** Client-credentials token from Twitch (IGDB's auth provider). Fetched once per run. */
async function igdbAuthorize() {
  if (igdbToken) return igdbToken;
  const params = new URLSearchParams({
    client_id: IGDB_CLIENT_ID,
    client_secret: IGDB_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`IGDB auth failed: ${data.message || data.error || `HTTP ${res.status}`}`);
  }
  igdbToken = data.access_token;
  return igdbToken;
}

async function igdbQuery(endpoint, body) {
  const token = await igdbAuthorize();
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": IGDB_CLIENT_ID, Authorization: `Bearer ${token}`, Accept: "application/json" },
    body,
  });
  if (res.status === 429) {
    await sleep(2000);
    return igdbQuery(endpoint, body);
  }
  if (!res.ok) throw new Error(`IGDB HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

async function searchIgdb(keyword) {
  return igdbQuery(
    "games",
    `search "${keyword.replace(/"/g, " ")}"; fields name, alternative_names.name, cover.image_id, platforms.name, game_type, url; where cover != null; limit 10;`,
  );
}

/**
 * Japanese-titled games can't be found through the normal search: IGDB's `name` is the English
 * title and `alternative_names` rarely carries a Japanese one (「パルワールド」 and 「トーエム」
 * both returned zero hits). Region-specific names live on their own endpoint instead, where the
 * nested `game` gives the cover and platforms directly.
 */
async function searchIgdbLocalizations(keyword) {
  const rows = await igdbQuery(
    "game_localizations",
    `fields name, game.name, game.alternative_names.name, game.cover.image_id, game.platforms.name, game.game_type, game.url; where name ~ *"${keyword.replace(/"/g, " ")}"* & game.cover != null; limit 10;`,
  );
  return rows.filter((r) => r.game).map((r) => ({ ...r.game, localizedName: r.name }));
}

/**
 * True when `name` is our title with a number tacked on — i.e. the sequel, not the game. Prefix
 * matching alone accepted 「仁王」→「Nioh 3」 and 「Amanda the Adventurer」→「Amanda the
 * Adventurer 2」. Titles that genuinely carry the number (ブラスフェマス2, ゼノブレイド2) are
 * unaffected, because then the digit is part of `target` too.
 */
function isSequelOf(name, target) {
  const n = normalize(name);
  return n.startsWith(target) && /^\d/.test(n.slice(target.length));
}

function igdbNamesOf(item) {
  return [item.name, item.localizedName, ...(item.alternative_names ?? []).map((a) => a.name)].filter(Boolean);
}

function pickBestIgdbMatch(items, game) {
  const target = normalize(game.title);
  const core = normalize(coreTitle(game.title));
  const wanted = (game.platforms ?? []).flatMap((p) => IGDB_PLATFORM_NAMES[p] ?? []);
  const usable = items.filter((it) => {
    if (!it.cover?.image_id) return false;
    if (!IGDB_ACCEPTED_GAME_TYPES.has(it.game_type ?? 0)) return false;
    // Platform check next: it's the cheapest way to reject the wrong entry in a franchise.
    const platforms = (it.platforms ?? []).map((p) => p.name);
    if (!platforms.some((name) => wanted.includes(name))) return false;
    return igdbNamesOf(it).some((name) => titleMatches(name, target, core) && !isSequelOf(name, target));
  });
  // Prefix matching alone picks up sequels and special editions whose name merely starts with
  // ours — 「Amanda the Adventurer」→「Amanda the Adventurer 2」, 「Sea of Thieves」→「Sea of
  // Thieves: Custom Seas - Season 20」, 「ゼルダの伝説 夢をみる島」→「Link's Awakening - Artbook
  // Set」. Rank the base game first, then the shortest name: within one franchise on one platform
  // the shortest name is the plain edition, so Collector's / Digital Deluxe / Premium variants
  // lose to it without needing a keyword blocklist (which would wrongly reject the entries whose
  // real title is an edition, e.g. ゼノブレイド ディフィニティブ・エディション).
  // Rank by how much longer the *matching* name is than our title, then by the English name's
  // length. Comparing the matching name matters because a special edition is usually reached
  // through a localized name that spells the edition out (「…ラグナロク デジタルデラックス
  // エディション アップグレード」), so it scores far worse than a plain-named base entry.
  // (Ranking main_game ahead of remake/port instead would be wrong: 「ゼルダの伝説 夢をみる島」's
  // Switch release is a remake while the Artbook Set bundle is a main_game.)
  const excess = (it) => {
    const lengths = igdbNamesOf(it)
      .filter((name) => titleMatches(name, target, core))
      .map((name) => Math.abs(normalize(name).length - target.length));
    return lengths.length ? Math.min(...lengths) : Number.MAX_SAFE_INTEGER;
  };
  return usable.sort(
    (a, b) => excess(a) - excess(b) || normalize(a.name ?? "").length - normalize(b.name ?? "").length,
  )[0];
}

function shouldSkip(game) {
  const cached = cache[game.id];
  if (!cached) return false;
  if (FORCE) return false;
  if (RETRY_MISSES) return Boolean(cached.coverUrl);
  return true;
}

/** IGDB's documented cover template. Verified before caching, same as the noimage guard. */
function igdbCoverUrl(imageId) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`;
}

// Reads the body rather than trusting content-length: images.igdb.com serves over HTTP/2 without
// that header, so a length-based check rejects every (perfectly good) cover.
async function servesRealImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return false;
    return (await res.arrayBuffer()).byteLength > 2000;
  } catch {
    return false;
  }
}

async function tryRakuten(game) {
  for (const keyword of RAKUTEN_ENABLED ? keywordCandidates(game) : []) {
    const items = await searchRakuten(keyword);
    await sleep(1100);
    const best = pickBestMatch(items, game);
    if (best) {
      // mediumImageUrls are 128x128; strip the `_ex=Wxh` query suffix so the browser gets the
      // shop's original (usually larger) image instead of Rakuten's downscaled thumbnail.
      const coverUrl = (best.mediumImageUrls?.[0] ?? "").replace(/\?_ex=\d+x\d+$/, "") || null;
      // itemUrl embeds our applicationId as an affiliate-tracking query param
      // (`rafcid=wsc_i_is_<applicationId>`) — strip it before caching so the committed file
      // doesn't carry that identifier (ranobe-db/manga-db's covers-cache.json doesn't store
      // itemUrl at all for the same reason; kept here only as a manual-review aid).
      const itemUrl = best.itemUrl ? best.itemUrl.split("?")[0] : undefined;
      // Flag the editions worth a second look in the review pass: an import listing means no
      // domestic package was found, so its art may be the foreign box.
      const tag = !coverUrl ? "no-cover" : isImportEdition(best.itemName ?? "") ? "ok-import" : "ok";
      console.log(`[${tag}] ${game.title} -> matched "${best.itemName}"`);
      return {
        title: game.title,
        matchedTitle: best.itemName,
        coverUrl,
        itemUrl,
        source: "rakuten-ichiba",
        resolvedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

async function tryIgdb(game) {
  // The platform-name filter in pickBestIgdbMatch already covers what the keyword's platform
  // suffix does for Rakuten, so only the title-derived keywords are worth spending here.
  const igdbKeywords = IGDB_ENABLED ? [...new Set([game.title, coreTitle(game.title)])] : [];
  const igdbLookups = [
    ...igdbKeywords.map((k) => () => searchIgdb(k)),
    ...igdbKeywords.map((k) => () => searchIgdbLocalizations(k)),
  ];
  // Gather every lookup's candidates before choosing, rather than taking the first lookup that
  // returns anything. The base game and its special editions often surface from *different*
  // lookups — the English search finds "Persona 3 Reload" while only the Digital Deluxe Edition
  // has a Japanese localization record — so stopping early handed the ranking a single bad
  // option instead of a choice.
  const seen = new Map();
  for (const lookup of igdbLookups) {
    for (const item of await lookup()) if (item.id && !seen.has(item.id)) seen.set(item.id, item);
    await sleep(300);
  }

  const best = pickBestIgdbMatch([...seen.values()], game);
  if (!best) return null;
  const coverUrl = igdbCoverUrl(best.cover.image_id);
  if (!(await servesRealImage(coverUrl))) {
    console.log(`[skip-igdb] ${game.title}: ${coverUrl} が実画像を返しませんでした`);
    return null;
  }
  console.log(`[ok-igdb] ${game.title} -> matched "${best.name}" (${(best.platforms ?? []).map((p) => p.name).join("/")})`);
  return {
    title: game.title,
    matchedTitle: best.name,
    coverUrl,
    itemUrl: best.url,
    source: "igdb",
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * IGDB first, Rakuten as the fallback. IGDB is a games database rather than a shop, so its entry
 * for a title is the game itself — a portrait cover, correctly identified by platform, with no
 * shop-name noise, no used/import/download-code variants and no risk of a season pass or a
 * bundle standing in for the game. Rakuten still earns its place as the fallback: it has the
 * Japanese retail package for titles IGDB indexes only under an English name we can't match.
 */
async function resolveGame(game) {
  return (await tryIgdb(game)) ?? (await tryRakuten(game));
}


/**
 * 解決できなかったときのキャッシュ更新。
 *
 * 前のエントリがあるなら、分かっていること(ISBN・購入リンク・手書き注記・すでに持っている
 * 表紙)はそのまま残し、「いつ試したか」だけを更新する。今回分かったのは「見つからなかった」
 * ことだけで、前に分かっていたことが嘘になったわけではない。
 * 全部を null の雛形で上書きすると、手で直した判断が再取得のたびに消える。
 */
function keepWhatWeKnew(previous, fallback) {
  if (!previous) return fallback;
  return { ...previous, resolvedAt: new Date().toISOString() };
}

/** 自動取得が成功したときも、手書きの注記だけは引き継ぐ。 */
function withNote(previous, entry) {
  return previous?.note && !entry.note ? { ...entry, note: previous.note } : entry;
}

async function run() {
  const targets = games.filter((g) => (ONLY ? ONLY.includes(g.id) : true));
  let updated = 0;
  let skipped = 0;
  let kept = 0;

  for (const game of targets) {
    if (shouldSkip(game)) {
      skipped++;
      continue;
    }
    try {
      const entry = await resolveGame(game);
      if (entry) {
        cache[game.id] = withNote(cache[game.id], entry);
        updated++;
      } else if (cache[game.id]?.coverUrl) {
        // A failed re-resolve must never throw away a cover we already had. This is what made
        // --force destructive: a re-run that missed replaced a good (often hand-corrected) entry
        // with a null stub, which is how the same false matches kept coming back after cleanup.
        console.log(`[keep] ${game.title}: 今回は解決できなかったため既存の表紙を維持します`);
        kept++;
      } else {
        cache[game.id] = keepWhatWeKnew(cache[game.id], { title: game.title, coverUrl: null, resolvedAt: new Date().toISOString() });
        console.log(`[miss] ${game.title}: IGDB・楽天市場のいずれにも該当が見つかりませんでした`);
      }
    } catch (err) {
      console.error(`[error] ${game.title}: ${err.message}`);
    }
  }

  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(cachePath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`完了: ${updated}件更新, ${kept}件は既存維持, ${skipped}件スキップ(既存キャッシュ)。 -> ${cachePath}`);
  console.log("反映前に必ずmatchedTitleを目視確認してください(誤マッチの可能性があります)。");
}

// 直接実行されたときだけ処理を走らせる。fetch-rakuten-links.mjs が照合ロジック
// (pickBestMatch / keywordCandidates)を再利用するために import するため、
// import しただけで走ってしまわないようにガードしている。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
