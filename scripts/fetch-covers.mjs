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
// Usage:
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --force
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --only=elden-ring,mario-kart-world
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
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length).split(",") : undefined;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(title) {
  return title.replace(/[\s　・:：!?！？―—\-ー()（）「」『』]/g, "").toLowerCase();
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
];

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
  const res = await fetch(url, { headers: { Referer: REFERER_URL, Origin: ORIGIN_URL } });
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(data.errors?.errorMessage || `HTTP ${res.status}`);
  }
  return data.Items ?? [];
}

function pickBestMatch(items, game) {
  const target = normalize(game.title);
  return items.find((it) => {
    const name = it.itemName ?? "";
    if (EXCLUDE_KEYWORDS.some((kw) => name.includes(kw))) return false;
    const img = it.mediumImageUrls?.[0] ?? "";
    if (!img || img.includes("noimage")) return false;
    return normalize(name).includes(target);
  });
}

async function run() {
  const targets = games.filter((g) => (ONLY ? ONLY.includes(g.id) : true));
  let updated = 0;
  let skipped = 0;

  for (const game of targets) {
    if (!FORCE && cache[game.id]) {
      skipped++;
      continue;
    }
    try {
      const items = await searchRakuten(toSearchKeyword(game.title));
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
        cache[game.id] = {
          title: game.title,
          matchedTitle: best.itemName,
          coverUrl,
          itemUrl,
          source: "rakuten-ichiba",
          resolvedAt: new Date().toISOString(),
        };
        console.log(`[${coverUrl ? "ok" : "no-cover"}] ${game.title} -> matched "${best.itemName}"`);
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
