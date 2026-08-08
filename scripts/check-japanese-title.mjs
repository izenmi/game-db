#!/usr/bin/env node
/**
 * 英字のみのタイトルについて、IGDB に日本向けローカライズ名(game_localizations)があるかを調べる。
 *
 *   IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=yyy node scripts/check-japanese-title.mjs [--json out.json]
 *
 * **英語タイトルであること自体は誤りではない**。『ELDEN RING』『Ghost of Tsushima』のように
 * 英語表記のまま国内発売される作品が多数を占めるので、機械的にカタカナへ直してはいけない。
 * IGDB が「Japan リージョンのローカライズ名」を持っている場合だけ、公式の日本語表記が
 * 別にあると判断できる(『Pokémon Pokopia』→『ぽこ あ ポケモン』がこれで見つかった)。
 *
 * 名前検索は誤マッチするので、covers-cache に fetch-covers が確定させた IGDB slug がある
 * ものだけを対象にする。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public/data/source");
const CID = process.env.IGDB_CLIENT_ID;
const SECRET = process.env.IGDB_CLIENT_SECRET;
if (!CID || !SECRET) {
  console.error("IGDB_CLIENT_ID / IGDB_CLIENT_SECRET が必要です。");
  process.exit(1);
}
const outArg = process.argv.find((a) => a.startsWith("--json="));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const token = await fetch(
  `https://id.twitch.tv/oauth2/token?${new URLSearchParams({
    client_id: CID, client_secret: SECRET, grant_type: "client_credentials",
  })}`, { method: "POST" },
).then((r) => r.json()).then((j) => j.access_token);

async function igdb(endpoint, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": CID, Authorization: `Bearer ${token}`, Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429 && attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) return [];
    return res.json();
  }
}

const HAS_JA = /[ぁ-んァ-ヴ一-龥]/;
const games = JSON.parse(readFileSync(path.join(SRC, "games.json"), "utf-8"));
const covers = JSON.parse(readFileSync(path.join(SRC, "covers-cache.json"), "utf-8"));

const targets = [];
for (const g of games) {
  if (HAS_JA.test(g.title)) continue;
  const url = covers[g.id]?.source === "igdb" ? covers[g.id]?.itemUrl : undefined;
  const slug = url?.match(/\/games\/([^/?#]+)/)?.[1];
  if (slug) targets.push({ ...g, slug });
}
console.log(`対象 ${targets.length}件 (英字のみ かつ IGDB slug あり)`);

const found = [];
for (let i = 0; i < targets.length; i += 10) {
  const chunk = targets.slice(i, i + 10);
  const where = chunk.map((t) => `"${t.slug}"`).join(",");
  const rows = await igdb(
    "game_localizations",
    `fields name,game.slug,region.name; where game.slug = (${where}) & region.name = "Japan"; limit 200;`,
  );
  for (const r of rows) {
    const t = chunk.find((x) => x.slug === r.game?.slug);
    // ローカライズ名が英字のままなら、日本でも英語表記ということなので拾わない
    if (t && r.name && HAS_JA.test(r.name)) found.push({ id: t.id, title: t.title, jaTitle: r.name });
  }
  if ((i / 10) % 10 === 0) console.log(`  ${i}/${targets.length}`);
  await sleep(280);
}
console.log(`日本語のローカライズ名が見つかったもの: ${found.length}件`);
for (const f of found) console.log(`  ${f.title}  ->  ${f.jaTitle}`);
if (outArg) writeFileSync(outArg.slice("--json=".length), `${JSON.stringify(found, null, 1)}\n`);
