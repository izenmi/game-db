// One-off re-search helper for cover mismatches: usage:
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx node scripts/refetch-cover.mjs <gameId> "<keyword>"
// Writes/overwrites the single cache entry for <gameId> using a custom keyword instead of the
// title-derived one, then prints the top 5 candidates so the caller can eyeball matchedTitle.
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

async function searchRakuten(kw) {
  const params = new URLSearchParams({ applicationId: APP_ID, accessKey: ACCESS_KEY, keyword: kw, genreId: GAME_SOFTWARE_GENRE_ID, hits: "30", format: "json", formatVersion: "2" });
  const url = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`;
  const res = await fetch(url, { headers: { Referer: REFERER_URL, Origin: ORIGIN_URL } });
  const data = await res.json();
  if (!res.ok || data.errors) throw new Error(data.errors?.errorMessage || `HTTP ${res.status}`);
  return data.Items ?? [];
}

const games = JSON.parse(readFileSync(gamesPath, "utf-8"));
const game = games.find((g) => g.id === gameId);
if (!game) { console.error(`game not found: ${gameId}`); process.exit(1); }

const items = await searchRakuten(keyword);
const candidates = items.filter((it) => {
  const name = it.itemName ?? "";
  if (EXCLUDE_KEYWORDS.some((kw) => name.includes(kw))) return false;
  const img = it.mediumImageUrls?.[0] ?? "";
  return img && !img.includes("noimage");
}).slice(0, 5);

console.log(`--- candidates for ${gameId} (keyword: "${keyword}") ---`);
candidates.forEach((c, i) => console.log(`[${i}] ${c.itemName} | ${c.mediumImageUrls?.[0]}`));

if (candidates.length === 0) {
  console.log("no candidates found");
  process.exit(0);
}

if (process.env.DRY === "1") process.exit(0);

const pickIdx = Number(process.env.PICK ?? "0");
const best = candidates[pickIdx];
const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
const coverUrl = (best.mediumImageUrls?.[0] ?? "").replace(/\?_ex=\d+x\d+$/, "") || null;
const itemUrl = best.itemUrl ? best.itemUrl.split("?")[0] : undefined;
cache[gameId] = { title: game.title, matchedTitle: best.itemName, coverUrl, itemUrl, source: "rakuten-ichiba", resolvedAt: new Date().toISOString() };
const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(cachePath, JSON.stringify(sorted, null, 2) + "\n");
console.log(`updated cache[${gameId}] -> picked [${pickIdx}]`);
