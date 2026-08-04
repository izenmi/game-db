// One-off re-search helper for cover mismatches and for titles whose wording differs from the
// store's. Writes/overwrites the single cache entry for <gameId> using a custom keyword instead
// of the title-derived one, printing the top 5 candidates so the caller can eyeball matchedTitle.
//
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx node scripts/refetch-cover.mjs <gameId> "<keyword>"
//   IGDB=1 IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=xxx node scripts/refetch-cover.mjs <gameId> "<keyword>"
//   DRY=1 ...    list candidates without writing
//   PICK=2 ...   take candidate [2] instead of [0]
//
// The IGDB mode exists because this site's titles are Japanese while IGDB indexes games under
// their English names and often has no Japanese localization record — 「ピザタワー」/「カセット
// ビースト」/「チェインドエコーズ」 are all there as Pizza Tower / Cassette Beasts / Chained
// Echoes, and none of them has a retail listing Rakuten could find.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(rootDir, "public", "data", "source");
const cachePath = path.join(sourceDir, "covers-cache.json");
const gamesPath = path.join(sourceDir, "games.json");

const REFERER_URL = "https://izenmi.github.io/game-db/";
const ORIGIN_URL = "https://izenmi.github.io";
const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const GAME_SOFTWARE_GENRE_ID = "101205";

const [gameId, keyword] = process.argv.slice(2);
if (!gameId || !keyword) {
  console.error("usage: node scripts/refetch-cover.mjs <gameId> \"<keyword>\"");
  process.exit(1);
}

const EXCLUDE_KEYWORDS = ["攻略本","ガイドブック","設定資料集","画集","アートブック","サウンドトラック","サントラ","フィギュア","ぬいぐるみ","アクリルスタンド","アクスタ","グッズ","ストラップ","Tシャツ","パーカー","保護フィルム","ケース","コントローラー","コントローラ","スキンシール","攻略","ステッカー"];

/** Same 1-character-token guard as fetch-covers.mjs: the API rejects the whole keyword otherwise
 *  ("Blasphemous 2" and "ドラゴンクエストXI ... S" both fail without this). */
function toSearchKeyword(title) {
  const kept = title.split(/[\s　]+/).filter((token) => token.length >= 2);
  return kept.join(" ") || title;
}

async function searchRakuten(keyword) {
  const kw = toSearchKeyword(keyword);
  const params = new URLSearchParams({ applicationId: APP_ID, accessKey: ACCESS_KEY, keyword: kw, genreId: GAME_SOFTWARE_GENRE_ID, hits: "30", format: "json", formatVersion: "2" });
  const url = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`;
  const res = await fetch(url, { headers: { Referer: REFERER_URL, Origin: ORIGIN_URL } });
  const data = await res.json();
  if (!res.ok || data.errors) throw new Error(data.errors?.errorMessage || `HTTP ${res.status}`);
  return data.Items ?? [];
}

// Platform names as IGDB spells them, so a candidate for the wrong console can still be rejected
// here the same way fetch-covers.mjs does it.
const IGDB_PLATFORM_NAMES = { ps5: ["PlayStation 5"], switch: ["Nintendo Switch"], switch2: ["Nintendo Switch 2"] };

async function searchIgdb(keyword, game) {
  const params = new URLSearchParams({
    client_id: process.env.IGDB_CLIENT_ID,
    client_secret: process.env.IGDB_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const auth = await (await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST" })).json();
  if (!auth.access_token) throw new Error(`IGDB auth failed: ${auth.message || auth.error}`);
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": process.env.IGDB_CLIENT_ID, Authorization: `Bearer ${auth.access_token}` },
    body: `search "${keyword.replace(/"/g, " ")}"; fields name, cover.image_id, platforms.name, url; where cover != null; limit 10;`,
  });
  if (!res.ok) throw new Error(`IGDB HTTP ${res.status}`);
  const wanted = (game.platforms ?? []).flatMap((p) => IGDB_PLATFORM_NAMES[p] ?? []);
  return (await res.json())
    .filter((it) => it.cover?.image_id && (it.platforms ?? []).some((p) => wanted.includes(p.name)))
    .map((it) => ({
      matchedTitle: it.name,
      coverUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${it.cover.image_id}.jpg`,
      itemUrl: it.url,
      source: "igdb",
      detail: (it.platforms ?? []).map((p) => p.name).join("/"),
    }));
}

async function searchRakutenCandidates(keyword) {
  const items = await searchRakuten(keyword);
  return items
    .filter((it) => {
      const name = it.itemName ?? "";
      if (EXCLUDE_KEYWORDS.some((kw) => name.includes(kw))) return false;
      const img = it.mediumImageUrls?.[0] ?? "";
      return img && !img.includes("noimage");
    })
    .map((it) => ({
      matchedTitle: it.itemName,
      coverUrl: (it.mediumImageUrls?.[0] ?? "").replace(/\?_ex=\d+x\d+$/, "") || null,
      itemUrl: it.itemUrl ? it.itemUrl.split("?")[0] : undefined,
      source: "rakuten-ichiba",
      detail: "",
    }));
}

const games = JSON.parse(readFileSync(gamesPath, "utf-8"));
const game = games.find((g) => g.id === gameId);
if (!game) { console.error(`game not found: ${gameId}`); process.exit(1); }

const useIgdb = process.env.IGDB === "1";
const candidates = (useIgdb ? await searchIgdb(keyword, game) : await searchRakutenCandidates(keyword)).slice(0, 5);

console.log(`--- candidates for ${gameId} (${useIgdb ? "IGDB" : "Rakuten"}, keyword: "${keyword}") ---`);
candidates.forEach((c, i) => console.log(`[${i}] ${c.matchedTitle} ${c.detail ? `(${c.detail})` : ""} | ${c.coverUrl}`));

if (candidates.length === 0) {
  console.log("no candidates found");
  process.exit(0);
}

if (process.env.DRY === "1") process.exit(0);

const pickIdx = Number(process.env.PICK ?? "0");
const best = candidates[pickIdx];
const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
cache[gameId] = {
  title: game.title,
  matchedTitle: best.matchedTitle,
  coverUrl: best.coverUrl,
  itemUrl: best.itemUrl,
  source: best.source,
  resolvedAt: new Date().toISOString(),
};
const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(cachePath, JSON.stringify(sorted, null, 2) + "\n");
console.log(`updated cache[${gameId}] -> picked [${pickIdx}]`);
