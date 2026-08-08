#!/usr/bin/env node
/**
 * covers-cache.json の各ゲームに、楽天市場の**商品ページURL**を `rakutenItemUrl` として
 * 書き足す。購入リンクを検索ページではなく商品ページへ直リンクするために使う。
 *
 *   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=yyy node scripts/fetch-rakuten-links.mjs [--force] [--only=id1,id2]
 *
 * 姉妹サイト(ranobe-db/manga-db/mystery-db/tech-db)の同名スクリプトは書籍の ISBN で一意に
 * 引けるが、**ゲームには ISBN に相当する共通の商品コードが無い**ので、タイトル+対応機種で
 * 楽天市場を検索して当てるしかない。誤マッチのリスクが段違いに高いため、照合ロジックは
 * fetch-covers.mjs のものをそのまま読み込んで使う(攻略本・サントラ・グッズの除外、
 * 対応機種の一致確認、輸入版の減点)。ロジックを二重に持つと必ず片方が腐るため。
 *
 * すでに fetch-covers.mjs が楽天市場から表紙を取れているエントリは、その `itemUrl` が
 * まさに商品ページURLなので、検索し直さずそれを流用する(2026-08-08時点で128件)。
 *
 * **APIが返すアフィリエイトURLは使わない。** 姉妹サイトで実測したところ、リクエストに
 * affiliateId を付けてもアプリケーションに紐づく別アカウントのIDで組み立てられたURLが返る。
 * ここでも素の itemUrl だけを保存し、アフィリエイトIDでの包装はフロント側
 * (src/ui/common/GameCover.tsx の rakutenIchibaUrl)で行う。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public/data/source");
const CACHE_PATH = path.join(SRC, "covers-cache.json");
const REFERER_URL = "https://izenmi.github.io/game-db/";
const ORIGIN_URL = "https://izenmi.github.io";
const GAME_SOFTWARE_GENRE_ID = "101205";
const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;

const force = process.argv.includes("--force");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : undefined;

if (!APP_ID || !ACCESS_KEY) {
  console.error("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が必要です。");
  process.exit(1);
}

// fetch-covers.mjs の照合ロジックを再利用する。同ファイルは import 時に何も実行しない
// (副作用は main() の中だけ)ので、そのまま読み込める。
const covers = await import("./fetch-covers.mjs");
const { pickBestMatch, keywordCandidates } = covers;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 楽天市場APIが返す itemUrl には、アプリに紐づくアフィリエイト識別子 `rafcid` が
 * 付いてくることがある。**これはサイト運営者本人のIDではない**ので必ず落とす。
 * アフィリエイトIDでの包装はフロント側で行う。
 */
function stripAffiliate(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("rafcid");
    u.search = u.searchParams.toString();
    return u.toString();
  } catch {
    return url;
  }
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
  const url = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      // node の fetch は既定でタイムアウトしない。接続がハングするとジョブごと止まるため
      // 必ず打ち切る(姉妹サイトの同名スクリプトで実際に踏んだ)。
      res = await fetch(url, {
        headers: { Referer: REFERER_URL, Origin: ORIGIN_URL },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      if (attempt >= 2) return [];
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 429 && attempt < 4) {
      await sleep(10000 * (attempt + 1));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.errors) return [];
    return data.Items ?? [];
  }
}

const games = JSON.parse(readFileSync(path.join(SRC, "games.json"), "utf-8"));
const cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));

let reused = 0;
let ok = 0;
let miss = 0;
const targets = [];
for (const game of games) {
  if (only && !only.has(game.id)) continue;
  const entry = cache[game.id];
  if (!entry) continue;
  if (entry.rakutenItemUrl && !force) continue;
  // fetch-covers が楽天市場から表紙を取れている分は、その itemUrl がそのまま商品ページ。
  if (entry.source === "rakuten-ichiba" && entry.itemUrl?.includes("rakuten.co.jp")) {
    entry.rakutenItemUrl = entry.itemUrl;
    reused++;
    continue;
  }
  targets.push(game);
}
console.log(`既存の楽天itemUrlを流用: ${reused}件 / 検索対象: ${targets.length}件`);

for (const game of targets) {
  let hit;
  for (const keyword of keywordCandidates(game)) {
    const items = await searchRakuten(keyword);
    hit = pickBestMatch(items, game);
    if (hit) break;
    await sleep(Number(process.env.RL_SLEEP ?? 1200));
  }
  if (hit?.itemUrl) {
    cache[game.id].rakutenItemUrl = stripAffiliate(hit.itemUrl);
    ok++;
  } else {
    miss++;
  }
  if ((ok + miss) % 25 === 0) {
    console.log(`  ${ok + miss}/${targets.length} (ok=${ok} miss=${miss})`);
    writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
  }
  await sleep(Number(process.env.RL_SLEEP ?? 1200));
}
writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
console.log(`完了: 流用${reused}件 + 新規${ok}件に商品ページURLを保存、${miss}件は該当なし。`);
