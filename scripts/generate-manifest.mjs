// Reads public/data/source/*.json (hand-authored) and writes public/data/generated/*.json:
// denormalized, name-resolved data ready for direct rendering, plus reference-integrity
// checks so a typo'd id fails the build instead of silently rendering blank names.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(rootDir, "public", "data", "source");
const outDir = path.join(rootDir, "public", "data", "generated");

function readSource(name) {
  return JSON.parse(readFileSync(path.join(sourceDir, `${name}.json`), "utf-8"));
}

const games = readSource("games");
const companies = readSource("companies");
const genres = readSource("genres");
const series = readSource("series");
const awards = readSource("awards");

// Optional: built by `npm run fetch-covers` (scripts/fetch-covers.mjs), which resolves a
// package-art image URL per game via the Rakuten Ichiba item search API, then commits the
// result here so builds stay offline/deterministic. Absent entries just mean "no cover resolved
// yet" — coverUrl stays undefined and callers fall back to the placeholder.
const coversCachePath = path.join(sourceDir, "covers-cache.json");
const coversCache = existsSync(coversCachePath) ? JSON.parse(readFileSync(coversCachePath, "utf-8")) : {};

const PLATFORMS = new Set(["ps5", "switch", "switch2"]);

const companiesById = new Map(companies.map((c) => [c.id, c]));
const genresById = new Map(genres.map((g) => [g.id, g]));
const seriesById = new Map(series.map((s) => [s.id, s]));
const awardsById = new Map(awards.map((a) => [a.id, a]));

const errors = [];

function checkRef(map, id, kind, gameId) {
  if (!map.has(id)) errors.push(`game "${gameId}": unknown ${kind} id "${id}"`);
}

for (const g of games) {
  if (g.developerIds.length === 0) errors.push(`game "${g.id}": developerIds must have at least one entry`);
  if (g.platforms.length === 0) errors.push(`game "${g.id}": platforms must have at least one entry`);
  g.platforms.forEach((p) => {
    if (!PLATFORMS.has(p)) errors.push(`game "${g.id}": unknown platform "${p}"`);
  });
  g.developerIds.forEach((id) => checkRef(companiesById, id, "developer(company)", g.id));
  checkRef(companiesById, g.publisherId, "publisher(company)", g.id);
  g.genreIds.forEach((id) => checkRef(genresById, id, "genre", g.id));
  if (g.seriesId) checkRef(seriesById, g.seriesId, "series", g.id);
  (g.awardResults ?? []).forEach((r) => checkRef(awardsById, r.awardId, "award", g.id));
}

const gameIds = new Set();
for (const g of games) {
  if (gameIds.has(g.id)) errors.push(`duplicate game id "${g.id}"`);
  gameIds.add(g.id);
}
for (const [label, list] of [
  ["company", companies],
  ["genre", genres],
  ["series", series],
  ["award", awards],
]) {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.id)) errors.push(`duplicate ${label} id "${item.id}"`);
    seen.add(item.id);
  }
}

if (errors.length > 0) {
  console.error("generate-manifest: reference integrity errors:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// ---- related works ("このゲームが好きなら") ----
// Cosine similarity over IDF-weighted genre tags, plus a bonus for sharing a developer.
// IDF matters because the tag vocabulary is deliberately small and reused (see CLAUDE.md
// 「ジャンルタグの方針」): a tag carried by hundreds of games says almost nothing about similarity,
// while a rare one is highly informative. Weighting every shared tag equally would just
// surface the most generic games on every page.
const RELATED_COUNT = 6;
const SAME_DEVELOPER_BONUS = 0.15;

const gamesById = new Map(games.map((x) => [x.id, x]));

const tagsOf = (x) => x.genreIds;

const tagDocFreq = new Map();
for (const x of games) {
  for (const t of tagsOf(x)) tagDocFreq.set(t, (tagDocFreq.get(t) ?? 0) + 1);
}
// A tag carried by every game gets idf 0 and drops out of the scoring entirely.
const tagIdf = new Map([...tagDocFreq].map(([t, df]) => [t, Math.log(games.length / df)]));

const tagNorm = new Map(
  games.map((x) => {
    let sumSquares = 0;
    for (const t of tagsOf(x)) sumSquares += tagIdf.get(t) ** 2;
    return [x.id, Math.sqrt(sumSquares)];
  }),
);

const tagToItems = new Map();
for (const x of games) {
  for (const t of tagsOf(x)) {
    if (!tagToItems.has(t)) tagToItems.set(t, []);
    tagToItems.get(t).push(x);
  }
}

function relatedIdsFor(item) {
  // Games from the same series are deliberately excluded: the detail page already lists the whole
  // series in its own section, so recommending them here would just repeat that list and crowd out
  // the genuinely different games this slot exists to surface.
  const sameSeries = (other) => Boolean(item.seriesId) && other.seriesId === item.seriesId;

  // Accumulate the dot product only over games that share at least one tag, rather than
  // scanning all N games for each of N games.
  const dotProducts = new Map();
  for (const t of tagsOf(item)) {
    const weight = tagIdf.get(t) ** 2;
    if (weight === 0) continue;
    for (const other of tagToItems.get(t)) {
      if (other.id === item.id || sameSeries(other)) continue;
      dotProducts.set(other.id, (dotProducts.get(other.id) ?? 0) + weight);
    }
  }

  const ownDevelopers = new Set(item.developerIds);

  // Same-developer games are a strong recommendation even with no tag overlap, so seed them in.
  for (const other of games) {
    if (other.id === item.id || dotProducts.has(other.id) || sameSeries(other)) continue;
    if (other.developerIds.some((id) => ownDevelopers.has(id))) dotProducts.set(other.id, 0);
  }

  const ownNorm = tagNorm.get(item.id);
  const scored = [];
  for (const [otherId, dot] of dotProducts) {
    const other = gamesById.get(otherId);
    const otherNorm = tagNorm.get(otherId);
    let score = ownNorm > 0 && otherNorm > 0 ? dot / (ownNorm * otherNorm) : 0;
    if (other.developerIds.some((id) => ownDevelopers.has(id))) score += SAME_DEVELOPER_BONUS;
    if (score > 0) scored.push({ id: otherId, score });
  }

  // Tie-break by id so the output (and therefore the prerendered HTML) is stable across builds.
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, RELATED_COUNT).map((s) => s.id);
}

const relatedById = new Map(games.map((x) => [x.id, relatedIdsFor(x)]));

// ---- generated/games.json ----
// あらすじ・出典メモ・updatedAt はここに入れない(ゲーム詳細ページでしか使わないのに
// games.json の大きな割合を占める)。詳細ページ用は game-texts.json に分ける。
const gamesGenerated = games.map(({ synopsis, sourceNote, updatedAt, ...g }) => ({
  relatedGameIds: relatedById.get(g.id),
  ...g,
  developerNames: g.developerIds.map((id) => companiesById.get(id).name),
  publisherName: companiesById.get(g.publisherId).name,
  genreNames: g.genreIds.map((id) => genresById.get(id).name),
  seriesName: g.seriesId ? seriesById.get(g.seriesId).name : undefined,
  awardSummaries: (g.awardResults ?? []).map((r) => ({
    awardId: r.awardId,
    awardName: awardsById.get(r.awardId).name,
    year: r.year,
    result: r.result,
  })),
  coverUrl: coversCache[g.id]?.coverUrl ?? undefined,
  rakutenItemUrl: coversCache[g.id]?.rakutenItemUrl ?? undefined,
}));

// 相互参照リスト(会社・ジャンル・シリーズの各詳細ページ)はゲームを**idの配列**で持ち、
// 表示側は games.json(取得済みキャッシュ)から引き直して GameCard を描く。
// ゲームをフル展開して埋め込むと1本が複数のリストに重複して入り、genres.json が gzip 865KB・
// companies.json が 700KB あった(2026-08-12に是正)。
const idsByReleaseDate = (list) =>
  [...list].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate)).map((g) => g.id);

// ---- generated/companies.json ----
// A company can be both developer and publisher of the same game (common for first-party
// Nintendo titles), so this can't use a simple groupBy-per-role — each company's game list
// tags every game with the role(s) that company played on it.
function buildCompanyList(companyList, gameList) {
  const entriesByCompanyId = new Map();
  function addRole(companyId, game, role) {
    if (!entriesByCompanyId.has(companyId)) entriesByCompanyId.set(companyId, new Map());
    const gameMap = entriesByCompanyId.get(companyId);
    if (!gameMap.has(game.id)) gameMap.set(game.id, { game, roles: [] });
    gameMap.get(game.id).roles.push(role);
  }
  for (const g of gameList) {
    g.developerIds.forEach((id) => addRole(id, g, "developer"));
    addRole(g.publisherId, g, "publisher");
  }
  return companyList
    .map((c) => {
      const gameMap = entriesByCompanyId.get(c.id) ?? new Map();
      const games = [...gameMap.values()]
        .map((e) => ({ gameId: e.game.id, releaseDate: e.game.releaseDate, roles: e.roles }))
        .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
        .map(({ gameId, roles }) => ({ gameId, roles }));
      return {
        id: c.id,
        name: c.name,
        nameKana: c.nameKana,
        parentCompany: c.parentCompany,
        description: c.description,
        foundedYear: c.foundedYear,
        externalLinks: c.externalLinks,
        sourceNote: c.sourceNote,
        updatedAt: c.updatedAt,
        gameCount: games.length,
        games,
      };
    })
    .sort((a, b) => a.nameKana.localeCompare(b.nameKana, "ja"));
}

const companiesGenerated = buildCompanyList(companies, games);

function groupGamesBy(idsOf) {
  const map = new Map();
  for (const g of games) {
    for (const id of idsOf(g)) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(g);
    }
  }
  return map;
}

// ---- generated/genres.json ----
const gamesByGenre = groupGamesBy((g) => g.genreIds);
const genresGenerated = genres
  .map((genre) => {
    const theirGames = gamesByGenre.get(genre.id) ?? [];
    return {
      ...genre,
      gameCount: theirGames.length,
      gameIds: idsByReleaseDate(theirGames),
    };
  })
  .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "ja"));

// ---- generated/series.json ----
// 1作品は最大1シリーズなのでgroupGamesByの単数版。並びは発売日昇順(= シリーズ内の発売順)。
const gamesBySeries = groupGamesBy((g) => (g.seriesId ? [g.seriesId] : []));
const seriesGenerated = series
  .map((s) => {
    const theirGames = gamesBySeries.get(s.id) ?? [];
    return {
      ...s,
      gameCount: theirGames.length,
      gameIds: idsByReleaseDate(theirGames),
    };
  })
  // 収録本数の多いシリーズほど見たい情報なので件数の降順。同数は五十音順で並びを安定させる。
  .sort((a, b) => b.gameCount - a.gameCount || a.nameKana.localeCompare(b.nameKana, "ja"));

// ---- generated/recommend-index.json ----
// 「好みからおすすめ」(/recommend)専用の軽量索引。ジャンル選択チップとスコア計算に必要な分だけ。
// genres.json / games.json を選択前に読ませないためにこれがある。
// **読み手は /recommend だけ。ページを消すならこの生成も消すこと**(横断検索を消したとき、
// 専用の search-index.json が読み手のいないまま残りかけた)。
const recommendTagIds = new Set(genres.map((t) => t.id));
const recommendIndex = {
  tags: genresGenerated
    .filter((t) => t.gameCount > 0 && recommendTagIds.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, count: t.gameCount }))
    // チップは件数の多い順に並べる
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja")),
  items: games.map((x) => ({
    id: x.id,
    tagIds: x.genreIds.filter((t) => recommendTagIds.has(t)),
  })),
};

// ---- generated/game-texts.json ----
// ゲーム詳細ページだけが読む長文(あらすじ・出典メモ)。キーはゲームid。
const gameTexts = Object.fromEntries(
  games.map((g) => [g.id, { synopsis: g.synopsis, sourceNote: g.sourceNote }]),
);

// ---- generated/awards.json ----
// 受賞歴の result は「2013年版 国内編 第1位」「大賞」「第5位」のような自由文なので、
// 並べ替え用の順位をここで一度だけ取り出す。順位を持たない賞(大賞・特別賞など)は
// 大賞系を先頭、それ以外を末尾に置く。
function rankOf(result) {
  const m = /第\s*(\d+)\s*位/.exec(result ?? "");
  if (m) return Number(m[1]);
  if (/大賞|1位|第一位/.test(result ?? "")) return 0;
  return 900;
}

const winnersByAward = new Map();
for (const g of games) {
  for (const r of g.awardResults ?? []) {
    if (!winnersByAward.has(r.awardId)) winnersByAward.set(r.awardId, []);
    winnersByAward.get(r.awardId).push({ gameId: g.id, gameTitle: g.title, year: r.year, result: r.result, rank: rankOf(r.result) });
  }
}
const awardsGenerated = awards
  .map((a) => {
    // 年の降順 → 部門(result から順位表記を除いた部分)→ 順位の昇順。
    const section = (r) => (r.result ?? "").replace(/第\s*\d+\s*位.*$/, "").trim();
    const winners = (winnersByAward.get(a.id) ?? []).sort(
      (x, y) =>
        y.year - x.year ||
        section(x).localeCompare(section(y), "ja") ||
        x.rank - y.rank ||
        (x.workTitle ?? x.gameTitle ?? "").localeCompare(y.workTitle ?? y.gameTitle ?? "", "ja"),
    );
    return { ...a, gameCount: winners.length, winners };
  })
  // 受賞作の多い賞ほど見たい情報なので件数の降順。同数は名前順で並びを安定させる。
  .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "ja"));

// ---- generated/counts.json ----
const counts = {
  games: games.length,
  companies: companies.length,
  genres: genres.length,
  series: series.length,
  awards: awards.length,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "games.json"), JSON.stringify(gamesGenerated), "utf-8");
writeFileSync(path.join(outDir, "companies.json"), JSON.stringify(companiesGenerated), "utf-8");
writeFileSync(path.join(outDir, "genres.json"), JSON.stringify(genresGenerated), "utf-8");
writeFileSync(path.join(outDir, "series.json"), JSON.stringify(seriesGenerated), "utf-8");
writeFileSync(path.join(outDir, "awards.json"), JSON.stringify(awardsGenerated), "utf-8");
writeFileSync(path.join(outDir, "recommend-index.json"), JSON.stringify(recommendIndex), "utf-8");
writeFileSync(path.join(outDir, "game-texts.json"), JSON.stringify(gameTexts), "utf-8");
writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(counts), "utf-8");

console.log(`generate-manifest: wrote ${games.length} games, ${companies.length} companies, ${genres.length} genres, ${series.length} series, ${awards.length} awards`);


// ---- sitemap.xml ----
// Lives at the site root (not data/generated/) so it's served at /game-db/sitemap.xml, but is
// just as deterministically derived from public/data/source/*.json — see the .gitignore note.
const SITE_URL = "https://izenmi.github.io/game-db";
const today = new Date().toISOString().slice(0, 10);

function urlEntry(loc, lastmod) {
  return `  <url>\n    <loc>${SITE_URL}${loc}</loc>\n    <lastmod>${lastmod ?? today}</lastmod>\n  </url>`;
}

const sitemapEntries = [
  urlEntry("/"),
  urlEntry("/games"),
  ...games.map((g) => urlEntry(`/games/${g.id}`, g.updatedAt?.slice(0, 10))),
  urlEntry("/genres"),
  urlEntry("/recommend"),
  ...genres.map((genre) => urlEntry(`/genres/${genre.id}`)),
  urlEntry("/companies"),
  ...companies.map((c) => urlEntry(`/companies/${c.id}`, c.updatedAt?.slice(0, 10))),
  urlEntry("/series"),
  ...series.map((s) => urlEntry(`/series/${s.id}`, s.updatedAt?.slice(0, 10))),
  urlEntry("/awards"),
  ...awards.map((a) => urlEntry(`/awards/${a.id}`, a.updatedAt?.slice(0, 10))),
  urlEntry("/about"),
];

const sitemapXml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join("\n")}\n</urlset>\n`;

writeFileSync(path.join(rootDir, "public", "sitemap.xml"), sitemapXml, "utf-8");
console.log(`generate-manifest: wrote sitemap.xml with ${sitemapEntries.length} URLs`);
