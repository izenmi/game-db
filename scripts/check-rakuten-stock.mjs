#!/usr/bin/env node
/**
 * 各タイトルが楽天市場(テレビゲーム)で国内版として売られているかを調べる。
 *
 *   RAKUTEN_APP_ID=xxx node scripts/check-rakuten-stock.mjs --json=out.json
 *
 * 「マイナーな作品は登録しない」方針(2026-08-08にユーザー合意)の判定材料。
 * **輸入版は国内発売の証拠にならない**ので、商品名に「輸入版」「輸入品」を含むヒットは数えない。
 */
import { readFileSync, writeFileSync } from "node:fs";
const APP = process.env.RAKUTEN_APP_ID;
const KEY = process.env.RAKUTEN_ACCESS_KEY;
if (!APP || !KEY) { console.error("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が必要です。"); process.exit(1); }
// 楽天の市場検索は新ゲートウェイ(openapi.rakuten.co.jp/ichibams/…)で、accessKey と
// Referer/Origin ヘッダが必須。旧 app.rakuten.co.jp のホストは 400/404 を返す(実測)。
const REFERER_URL = "https://izenmi.github.io/game-db/";
const ORIGIN_URL = "https://izenmi.github.io";
const outArg = process.argv.find((a) => a.startsWith("--json="));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IMPORT = /輸入版|輸入品|北米版|海外版|欧州版|アジア版/;

async function search(keyword) {
  const url = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?" +
    new URLSearchParams({ applicationId: APP, accessKey: KEY, keyword, genreId: "101205",
                          hits: "20", format: "json", formatVersion: "2" });
  for (let a = 0; ; a++) {
    let res;
    try { res = await fetch(url, { headers: { Referer: REFERER_URL, Origin: ORIGIN_URL }, signal: AbortSignal.timeout(20000) }); }
    catch { if (a < 3) { await sleep(3000 * (a + 1)); continue; } return null; }
    if ((res.status === 429 || res.status >= 500) && a < 4) { await sleep(5000 * (a + 1)); continue; }
    if (!res.ok) return null;
    const j = await res.json();
    return j.Items ?? [];
  }
}
/** 記号や版名を落として突き合わせ用にする。楽天の商品名は「【中古】PS4 タイトル名 …」の形。 */
const norm = (s) => (s ?? "").normalize("NFKC").toLowerCase()
  .replace(/[\s　・:：!！?？〜~\-—–ー、。,.'’"“”()（）[\]【】/／]/g, "");
/** 副題や版名を落とした中核部分。長いタイトルは前方一致で見る。 */
function core(title) {
  const n = norm(title);
  return n.length > 14 ? n.slice(0, 14) : n;
}

const games = JSON.parse(readFileSync("public/data/source/games.json", "utf-8"));
const out = [];
for (const [i, g] of games.entries()) {
  const items = await search(g.title);
  const domestic = (items ?? []).filter((it) => !IMPORT.test(it.itemName) && norm(it.itemName).includes(core(g.title)));
  out.push({ id: g.id, title: g.title, hits: items?.length ?? -1, domestic: domestic.length,
             sample: domestic.slice(0, 2).map((x) => x.itemName.slice(0, 60)) });
  if (i % 50 === 0) console.log(`  ${i}/${games.length}`);
  await sleep(1100); // 楽天は短時間の連続アクセスで429を返す
}
console.log(`国内版ヒット0件: ${out.filter((o) => o.domestic === 0).length}本 / 全${out.length}本`);
if (outArg) writeFileSync(outArg.slice("--json=".length), `${JSON.stringify(out, null, 1)}\n`);
