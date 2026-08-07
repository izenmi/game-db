#!/usr/bin/env node
/**
 * IGDBから「本サイトの対応機種で出ていて、まだgames.jsonに無い」タイトルを人気順に列挙する。
 * 候補を人力で思いつく方式より当たり率が高く、DUPで捨てる無駄も出ない。
 *
 *   IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=yyy \
 *     node scripts/suggest-candidates.mjs [--offset 0] [--limit 500] [--min-follows 20] [--platform switch|ps5|switch2]
 *
 * 出力は1行1候補(verify-candidates.mjsと同じ並び)。
 *   <IGDB名> | <ps5,switch,switch2> | <発売日> | D:<開発> | P:<発売> | G:<IGDBジャンル>
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_ID = process.env.IGDB_CLIENT_ID;
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

const PLATFORM_IDS = { ps5: 167, switch: 130, switch2: 508 };
const PLATFORM_MAP = [
  ["Nintendo Switch 2", "switch2"],
  ["Nintendo Switch", "switch"],
  ["PlayStation 5", "ps5"],
];
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

async function igdb(token, endpoint, body, tries = 4) {
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
  "fields name,game_type,follows,total_rating_count,platforms.name,first_release_date," +
  "release_dates.date,release_dates.region,release_dates.platform.name," +
  "involved_companies.company.name,involved_companies.developer,involved_companies.publisher," +
  "genres.name;";

function sitePlatforms(game) {
  const names = (game.platforms || []).map((p) => p.name);
  const out = [];
  for (const [igdbName, key] of PLATFORM_MAP) {
    if (names.includes(igdbName) && !out.includes(key)) out.push(key);
  }
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
  return new Date(Math.min(...pool.map((r) => r.date)) * 1000)
    .toISOString()
    .slice(0, 10);
}

function companies(game, role) {
  return (game.involved_companies || [])
    .filter((c) => c[role] && c.company)
    .map((c) => c.company.name)
    .join(";");
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("IGDB_CLIENT_ID / IGDB_CLIENT_SECRET が必要です");
    process.exit(1);
  }
  const offset = Number(arg("offset", 0));
  const limit = Number(arg("limit", 300));
  const minCount = Number(arg("min-count", 5));
  const platform = arg("platform", null);

  const games = JSON.parse(
    readFileSync(resolve(ROOT, "public/data/source/games.json"), "utf8")
  );
  // 既存タイトルは正規化して弾く。日本語タイトルで登録していてもIGDB名が英語なので
  // 取りこぼすことがあるが、apply_batch.py が id 衝突で最終的に拾う
  const existing = new Set(games.map((g) => normalize(g.title)));

  const token = await getToken();
  const plats = platform
    ? [PLATFORM_IDS[platform]]
    : Object.values(PLATFORM_IDS);

  const out = [];
  const pageSize = 500;
  for (let off = offset; out.length < limit && off < offset + 5000; off += pageSize) {
    const body =
      FIELDS +
      `where platforms = (${plats.join(",")}) & total_rating_count >= ${minCount};` +
      `sort total_rating_count desc; limit ${pageSize}; offset ${off};`;
    const rows = await igdb(token, "games", body);
    if (!rows.length) break;
    for (const g of rows) {
      if (!ALLOWED_TYPES.has(g.game_type ?? 0)) continue;
      if (existing.has(normalize(g.name || ""))) continue;
      const p = sitePlatforms(g);
      if (!p.length) continue;
      out.push(
        `${g.name} | ${p.join(",")} | ${pickDate(g, p)} | D:${companies(g, "developer")} | P:${companies(g, "publisher")} | G:${(g.genres || []).map((x) => x.name).join(";")}`
      );
      if (out.length >= limit) break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(out.join("\n"));
  console.error(`suggest-candidates: ${out.length} 件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
