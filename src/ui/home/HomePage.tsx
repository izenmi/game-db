import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCounts, getGenres, getGames } from "../../data/manifest";
import type { GameGenerated } from "../../types";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { GameCard } from "../common/GameCard";
import { colorForYear } from "../common/yearColor";
import { SITE_NAME, SITE_URL, useSeo } from "../common/useSeo";

const BADGES: { key: keyof Awaited<ReturnType<typeof getCounts>>; label: string; to: string; color: string }[] = [
  { key: "games", label: "ゲーム", to: "/games", color: "blue" },
  { key: "genres", label: "ジャンル", to: "/genres", color: "mint" },
  { key: "companies", label: "会社", to: "/companies", color: "pink" },
  { key: "awards", label: "アワード", to: "/awards", color: "peach" },
];

const PICKUP_COUNT = 6;
const SPOTLIGHT_COUNT = 6;
const POPULAR_GENRE_COUNT = 12;

const SISTER_SITES = [
  {
    key: "ranobe",
    name: "らのべDB",
    url: "https://izenmi.github.io/ranobe-db/",
    tagline: "ライトノベル作品を著者・イラストレーター・出版社・受賞歴・テーマから探せるデータベース",
  },
  {
    key: "manga",
    name: "まんがDB",
    url: "https://izenmi.github.io/manga-db/",
    tagline: "コミック作品を原作者・作画家・レーベル・受賞歴・テーマから探せるデータベース",
  },
] as const;

/** Returns up to `count` elements from `games` in random order, without mutating the input. */
function pickRandomGames(games: GameGenerated[], count: number): GameGenerated[] {
  const pool = [...games];
  const result: GameGenerated[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool[idx] = pool[pool.length - 1];
    pool.pop();
  }
  return result;
}

interface RecentAward {
  gameId: string;
  gameTitle: string;
  awardId: string;
  awardName: string;
  year: number;
  result: string;
}

function flattenRecentAwards(games: GameGenerated[], count: number): RecentAward[] {
  const flattened: RecentAward[] = games.flatMap((g) =>
    g.awardSummaries.map((a) => ({ ...a, gameId: g.id, gameTitle: g.title }))
  );
  flattened.sort((a, b) => b.year - a.year);
  return flattened.slice(0, count);
}

export function HomePage() {
  const state = useAsyncData(getCounts, []);
  const gamesState = useAsyncData(getGames, []);
  const genresState = useAsyncData(getGenres, []);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const pickupGames = useMemo(
    () => (gamesState.status === "ready" ? pickRandomGames(gamesState.data, PICKUP_COUNT) : []),
    [gamesState]
  );
  const recentAwards = useMemo(
    () => (gamesState.status === "ready" ? flattenRecentAwards(gamesState.data, SPOTLIGHT_COUNT) : []),
    [gamesState]
  );
  const popularGenres = useMemo(
    () =>
      genresState.status === "ready"
        ? [...genresState.data].sort((a, b) => b.gameCount - a.gameCount).slice(0, POPULAR_GENRE_COUNT)
        : [],
    [genresState]
  );

  useSeo({
    description:
      state.status === "ready"
        ? `PS5/Switch/Switch2向けゲーム${state.data.games}本を対応機種・開発元/発売元・受賞歴・ジャンルから検索できるファンデータベース。`
        : undefined,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}games?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/games?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="page">
      <div className="home-hero">
        <h1 className="font-display">ゲームDB</h1>
        <p className="page-subtitle">PS5/Switch/Switch2向けゲームを対応機種・開発元/発売元・受賞歴・ジャンルから探せるデータベース</p>
        <p className="home-intro">
          遊びたいゲーム探しに使えるデータベースです。ジャンル・会社・対応機種などで絞り込めます。
        </p>
      </div>

      <form onSubmit={handleSearch}>
        <input
          className="search-box"
          type="search"
          placeholder="タイトル・開発元・発売元で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>

      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <div className="count-badges">
          {BADGES.map((badge) => (
            <Link className={`count-badge count-badge--${badge.color}`} to={badge.to} key={badge.key}>
              <span className="count-badge__number">{state.data[badge.key]}</span>
              <span className="count-badge__label">{badge.label}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="home-section">
        <h2 className="home-section__heading font-display">ピックアップゲーム</h2>
        {gamesState.status === "loading" && <Loading />}
        {gamesState.status === "error" && <ErrorState error={gamesState.error} />}
        {gamesState.status === "ready" && (
          <>
            <div className="game-grid">
              {pickupGames.map((g) => (
                <GameCard game={g} key={g.id} />
              ))}
            </div>
            <Link className="home-section__more" to="/games">
              ゲーム一覧を見る →
            </Link>
          </>
        )}
      </div>

      <div className="home-section">
        <h2 className="home-section__heading font-display">受賞作スポットライト</h2>
        {gamesState.status === "loading" && <Loading />}
        {gamesState.status === "error" && <ErrorState error={gamesState.error} />}
        {gamesState.status === "ready" && recentAwards.length === 0 && (
          <EmptyState text="登録されている受賞歴はまだありません。" />
        )}
        {gamesState.status === "ready" && recentAwards.length > 0 && (
          <>
            <ul className="winner-list">
              {recentAwards.map((a) => (
                <li key={`${a.gameId}-${a.awardId}-${a.year}`}>
                  <span className={`winner-year winner-year--${colorForYear(a.year)}`}>{a.year}</span>
                  <Link className="home-award-name" to={`/awards/${a.awardId}`}>
                    {a.awardName}
                  </Link>
                  <span className="entity-list__count"> ― </span>
                  <Link to={`/games/${a.gameId}`}>{a.gameTitle}</Link>
                  <span className="entity-list__count"> ({a.result})</span>
                </li>
              ))}
            </ul>
            <Link className="home-section__more" to="/awards">
              受賞歴一覧を見る →
            </Link>
          </>
        )}
      </div>

      <div className="home-section">
        <h2 className="home-section__heading font-display">人気ジャンル</h2>
        {genresState.status === "loading" && <Loading />}
        {genresState.status === "error" && <ErrorState error={genresState.error} />}
        {genresState.status === "ready" && (
          <>
            <div className="chip-row chip-row--lg">
              {popularGenres.map((g) => (
                <Link className="chip chip--lg" to={`/games?genre=${g.id}`} key={g.id}>
                  {g.name} <span className="entity-list__count">{g.gameCount}</span>
                </Link>
              ))}
            </div>
            <Link className="home-section__more" to="/genres">
              ジャンル一覧を見る →
            </Link>
          </>
        )}
      </div>

      <div className="home-section">
        <h2 className="home-section__heading font-display">姉妹サイト</h2>
        <div className="sister-site-cards">
          {SISTER_SITES.map((site) => (
            <a className={`sister-site-card sister-site-card--${site.key}`} href={site.url} key={site.key}>
              <span className="sister-site-card__name font-display">{site.name}</span>
              <span className="sister-site-card__desc">{site.tagline}</span>
            </a>
          ))}
        </div>
      </div>

      <p className="source-note">
        本サイトの記述はWikipedia日本語版等の公開情報を参考に独自にまとめたものです。詳しくは
        <Link to="/about">このサイトについて</Link>
        をご覧ください。
      </p>
    </div>
  );
}
