#!/usr/bin/env node
/**
 * games.json の各タイトルが日本語ローカライズされているかを IGDB の language_supports で判定する。
 *
 *   IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=yyy node scripts/check-japanese.mjs [--json out.json]
 *
 * このサイトは日本語で遊べるゲームだけを収録する(2026-08-08にユーザーと合意)。
 * **タイトルが英語表記かどうかでは判定できない**。『ELDEN RING』『Ghost of Tsushima』のように
 * 英語タイトルのまま国内販売されている作品が全体の6割を占めるため、見た目で切ると主要作が消える。
 *
 * 判定は3値で返す:
 *   ja      … language_supports に Japanese がある(Interface/Subtitles/Audio のいずれか)
 *   no-ja   … language_supports はあるが Japanese が無い → 収録対象外
 *   unknown … IGDB に language_supports 自体が無い → 自動削除はせず人間が判断する
 *
 * unknown を「日本語なし」と同一視してはいけない。IGDBの言語データは網羅的ではなく、
 * 国内流通している作品でも未登録のことがある。
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
const outPath = outArg ? outArg.slice("--json=".length) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token;
async function authorize() {
  if (token) return token;
  const url =
    "https://id.twitch.tv/oauth2/token?" +
    new URLSearchParams({ client_id: CID, client_secret: SECRET, grant_type: "client_credentials" });
  const res = await fetch(url, { method: "POST" });
  token = (await res.json()).access_token;
  return token;
}

async function igdb(endpoint, body) {
  const t = await authorize();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": CID, Authorization: `Bearer ${t}`, Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) return [];
    return res.json();
  }
}

function normalize(s) {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/[\s　・:：!！?？〜~\-—–ー、。,.'’"“”()（）\[\]【】]/g, "")
    .toLowerCase();
}

/** covers-cache に IGDB 由来の itemUrl(= /games/<slug>)があれば、その slug で直接引く。
 *  **名前検索は誤マッチする**: 実測で『Returnal』→別ゲーム "Return or No Return"、
 *  『Demon\'s Souls』→1987年の同名別作品を拾った。slug は fetch-covers が確定させた
 *  対応関係なので、こちらを最優先にする。 */
async function judgeBySlug(slug) {
  const games = await igdb(
    "games",
    `fields name,language_supports.language.name; where slug = "${slug}"; limit 1;`,
  );
  if (!games[0]) return null;
  const supports = games[0].language_supports ?? [];
  if (supports.length === 0) return { verdict: "unknown", reason: "IGDBに言語情報なし", igdb: games[0].name };
  const ja = supports.some((s) => (s.language?.name ?? "") === "Japanese");
  return { verdict: ja ? "ja" : "no-ja", igdb: games[0].name, langs: supports.length };
}

/** slug が無いときのフォールバック。名前検索は誤マッチしうるので、
 *  **正規化した名前が完全一致した候補しか採らない**(部分一致では判定しない)。 */
async function judge(title) {
  const esc = title.replace(/"/g, '\\"');
  let games = await igdb(
    "games",
    `fields name,language_supports.language.name; search "${esc}"; limit 8;`,
  );
  let hit = games.find((g) => normalize(g.name) === normalize(title));
  if (!hit) {
    const loc = await igdb(
      "game_localizations",
      `fields name,game.name,game.language_supports.language.name; where name ~ *"${esc}"*; limit 8;`,
    );
    hit = loc.find((l) => normalize(l.name) === normalize(title))?.game;
  }
  if (!hit) return { verdict: "unknown", reason: "IGDBで名前が完全一致せず" };
  const supports = hit.language_supports ?? [];
  if (supports.length === 0) return { verdict: "unknown", reason: "IGDBに言語情報なし", igdb: hit.name };
  const ja = supports.some((s) => (s.language?.name ?? "") === "Japanese");
  return { verdict: ja ? "ja" : "no-ja", igdb: hit.name, langs: supports.length };
}

const games = JSON.parse(readFileSync(path.join(SRC, "games.json"), "utf-8"));
const covers = JSON.parse(readFileSync(path.join(SRC, "covers-cache.json"), "utf-8"));
const results = [];
let i = 0;
for (const g of games) {
  const url = covers[g.id]?.source === "igdb" ? covers[g.id]?.itemUrl : undefined;
  const slug = url?.match(/\/games\/([^/?#]+)/)?.[1];
  const r = (slug ? await judgeBySlug(slug) : null) ?? (await judge(g.title));
  results.push({ id: g.id, title: g.title, ...r });
  i++;
  if (i % 50 === 0) console.log(`  ${i}/${games.length}`);
  await sleep(280); // IGDBは4リクエスト/秒
}
const by = (v) => results.filter((r) => r.verdict === v);
console.log(`日本語あり ${by("ja").length} / 日本語なし ${by("no-ja").length} / 不明 ${by("unknown").length}`);
if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`-> ${outPath}`);
}
