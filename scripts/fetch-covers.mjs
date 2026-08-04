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
// Usage:
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --force
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --retry-misses
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --only=elden-ring,mario-kart-world
//
// --force re-fetches everything, including entries that were corrected by hand after a mismatch,
// so prefer --retry-misses when retrying the unresolved games: it only touches entries whose
// coverUrl is null and leaves every resolved entry alone. (Historically, re-running the whole
// fetch re-introduced the same false matches that had just been cleaned out.)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(rootDir, "public", "data", "source");
const gamesPath = path.join(sourceDir, "games.json");
const cachePath = path.join(sourceDir, "covers-cache.json");

const REFERER_URL = "https://izenmi.github.io/game-db/";
const ORIGIN_URL = "https://izenmi.github.io";

const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
if (!APP_ID || !ACCESS_KEY) {
  console.error("RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY env vars are required (see the header comment in this file).");
  process.exit(1);
}

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
function normalize(title) {
  return title
    .normalize("NFKC")
    .replace(/[\s　・:：;；!?！？―—\-ー~〜～()（）「」『』【】〈〉《》〔〕"“”'’,、.。]/g, "")
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
function coreTitle(title) {
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
function detectPlatform(itemName) {
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

function pickBestMatch(items, game) {
  const target = normalize(game.title);
  const core = normalize(coreTitle(game.title));
  const declared = game.platforms ?? [];

  const usable = items.filter((it) => {
    const name = it.itemName ?? "";
    if (EXCLUDE_KEYWORDS.some((kw) => name.includes(kw))) return false;
    const img = it.mediumImageUrls?.[0] ?? "";
    if (!img || img.includes("noimage")) return false;
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
function keywordCandidates(game) {
  const core = coreTitle(game.title);
  const platformLabel = DECLARED_PLATFORM_PATTERNS.find((p) => (game.platforms ?? []).includes(p.id))?.label;
  const candidates = [game.title, core];
  if (platformLabel) candidates.push(`${core || game.title} ${platformLabel}`);
  return [...new Set(candidates.filter(Boolean).map(toSearchKeyword))];
}

function shouldSkip(game) {
  const cached = cache[game.id];
  if (!cached) return false;
  if (FORCE) return false;
  if (RETRY_MISSES) return Boolean(cached.coverUrl);
  return true;
}

/** Runs the keyword candidates in order and returns the first acceptable item. */
async function findItem(game) {
  for (const keyword of keywordCandidates(game)) {
    const items = await searchRakuten(keyword);
    await sleep(1100);
    const best = pickBestMatch(items, game);
    if (best) return best;
  }
  return undefined;
}

async function run() {
  const targets = games.filter((g) => (ONLY ? ONLY.includes(g.id) : true));
  let updated = 0;
  let skipped = 0;

  for (const game of targets) {
    if (shouldSkip(game)) {
      skipped++;
      continue;
    }
    try {
      const best = await findItem(game);
      if (best) {
        // mediumImageUrls are 128x128; strip the `_ex=Wxh` query suffix so the browser gets the
        // shop's original (usually larger) image instead of Rakuten's downscaled thumbnail.
        const coverUrl = (best.mediumImageUrls?.[0] ?? "").replace(/\?_ex=\d+x\d+$/, "") || null;
        // itemUrl embeds our applicationId as an affiliate-tracking query param
        // (`rafcid=wsc_i_is_<applicationId>`) — strip it before caching so the committed file
        // doesn't carry that identifier (ranobe-db/manga-db's covers-cache.json doesn't store
        // itemUrl at all for the same reason; kept here only as a manual-review aid).
        const itemUrl = best.itemUrl ? best.itemUrl.split("?")[0] : undefined;
        cache[game.id] = {
          title: game.title,
          matchedTitle: best.itemName,
          coverUrl,
          itemUrl,
          source: "rakuten-ichiba",
          resolvedAt: new Date().toISOString(),
        };
        // Flag the editions worth a second look in the review pass: an import listing means no
        // domestic package was found, so its art may be the foreign box.
        const tag = !coverUrl ? "no-cover" : isImportEdition(best.itemName ?? "") ? "ok-import" : "ok";
        console.log(`[${tag}] ${game.title} -> matched "${best.itemName}"`);
        updated++;
      } else {
        cache[game.id] = { title: game.title, coverUrl: null, resolvedAt: new Date().toISOString() };
        console.log(`[miss] ${game.title}: 該当商品が見つかりませんでした`);
      }
    } catch (err) {
      console.error(`[error] ${game.title}: ${err.message}`);
    }
    await sleep(1100);
  }

  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(cachePath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`完了: ${updated}件更新, ${skipped}件スキップ(既存キャッシュ)。 -> ${cachePath}`);
  console.log("反映前に必ずmatchedTitleを目視確認してください(誤マッチの可能性があります)。");
}

run();
