#!/usr/bin/env node
/**
 * 候補タイトルをIGDBで一括照合し、実在・対応機種・発売日・開発/発売元を1行にまとめて出力する。
 *
 *   IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=yyy node scripts/verify-candidates.mjs candidates.txt
 *
 * candidates.txt は1行1候補。`検索キーワード` のみ、または `検索キーワード|自サイトでの日本語タイトル`。
 * 出力は1候補1行の固定フォーマット(トークン節約のため)。
 *   OK   <kw> => <IGDB名> | <ps5,switch,switch2> | <発売日> | D:<開発> | P:<発売> | G:<IGDBジャンル>
 *   NG   <kw> => 対応機種に該当なし / 該当エントリなし
 * さらに、自サイトのgames.jsonにタイトルが酷似するものがあれば DUP 行を先に出す。
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_ID = process.env.IGDB_CLIENT_ID;
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

const PLATFORM_MAP = [
  ["Nintendo Switch 2", "switch2"],
  ["Nintendo Switch", "switch"],
  ["PlayStation 5", "ps5"],
];
// 本編/リメイク/リマスター/拡張収録版/移植 のみ採用(DLC・バンドルを除外)
const ALLOWED_TYPES = new Set([0, 8, 9, 10, 11]);

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[　\s]/g, "")
    .replace(/[:：\-‐‑–—・･,.'’"”!！?？&＆＋+()（）\[\]【】~〜_/]/g, "")
    .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

async function getToken() {
  const url = `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function igdb(token, endpoint, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": CLIENT_ID,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body,
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${await res.text()}`);
    return res.json();
  }
  return [];
}

const FIELDS =
  "fields name,game_type,platforms.name,first_release_date," +
  "release_dates.date,release_dates.region,release_dates.platform.name," +
  "involved_companies.company.name,involved_companies.developer,involved_companies.publisher," +
  "genres.name;";

function sitePlatforms(game) {
  const names = (game.platforms || []).map((p) => p.name);
  const out = [];
  for (const [igdbName, key] of PLATFORM_MAP) {
    if (names.includes(igdbName) && !out.includes(key)) out.push(key);
  }
  // "Nintendo Switch 2" は "Nintendo Switch" を includes しないので誤検出しない
  return out;
}

function pickDate(game, plats) {
  const wanted = new Set(
    PLATFORM_MAP.filter(([, k]) => plats.includes(k)).map(([n]) => n)
  );
  const rds = (game.release_dates || []).filter(
    (r) => r.date && r.platform && wanted.has(r.platform.name)
  );
  const jp = rds.filter((r) => r.region === 5);
  const pool = jp.length ? jp : rds;
  if (!pool.length) {
    return game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10)
      : "?";
  }
  const min = Math.min(...pool.map((r) => r.date));
  return new Date(min * 1000).toISOString().slice(0, 10);
}

function companies(game, role) {
  return (game.involved_companies || [])
    .filter((c) => c[role] && c.company)
    .map((c) => c.company.name)
    .join(";");
}

function score(kw, game) {
  const a = normalize(kw);
  const b = normalize(game.name || "");
  if (a === b) return 0;
  if (b.startsWith(a) || a.startsWith(b)) return Math.abs(a.length - b.length);
  if (b.includes(a) || a.includes(b)) return Math.abs(a.length - b.length) + 20;
  return 100 + Math.abs(a.length - b.length);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: verify-candidates.mjs <candidates.txt>");
    process.exit(1);
  }
  const lines = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const games = JSON.parse(
    readFileSync(resolve(ROOT, "public/data/source/games.json"), "utf8")
  );
  const existing = new Map(games.map((g) => [normalize(g.title), g.title]));

  const token = await getToken();

  for (const line of lines) {
    const [kw, jaTitle] = line.split("|").map((s) => s && s.trim());
    const dupKey = normalize(jaTitle || kw);
    if (existing.has(dupKey)) {
      console.log(`DUP  ${kw} => 既存「${existing.get(dupKey)}」`);
      continue;
    }

    let results = [];
    try {
      results = await igdb(token, "games", `search "${kw.replace(/"/g, "")}"; ${FIELDS} limit 12;`);
    } catch (e) {
      console.log(`ERR  ${kw} => ${e.message.slice(0, 80)}`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 300));

    const cands = results
      .filter((g) => ALLOWED_TYPES.has(g.game_type ?? 0))
      .map((g) => ({ g, plats: sitePlatforms(g) }))
      .filter((x) => x.plats.length > 0)
      .sort((a, b) => score(kw, a.g) - score(kw, b.g));

    if (!cands.length) {
      const any = results.length
        ? `該当機種なし(候補: ${results.slice(0, 2).map((g) => g.name).join(", ")})`
        : "IGDBに該当エントリなし";
      console.log(`NG   ${kw} => ${any}`);
      continue;
    }
    const { g, plats } = cands[0];
    const genres = (g.genres || []).map((x) => x.name).join(";");
    console.log(
      `OK   ${kw} => ${g.name} | ${plats.join(",")} | ${pickDate(g, plats)} | D:${companies(g, "developer")} | P:${companies(g, "publisher")} | G:${genres}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
