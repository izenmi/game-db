import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCounts } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState } from "../common/Status";
import { SITE_NAME, SITE_URL, useSeo } from "../common/useSeo";

const BADGES: { key: keyof Awaited<ReturnType<typeof getCounts>>; label: string; to: string; color: string }[] = [
  { key: "games", label: "ゲーム", to: "/games", color: "blue" },
  { key: "genres", label: "ジャンル", to: "/genres", color: "mint" },
  { key: "companies", label: "会社", to: "/companies", color: "pink" },
  { key: "awards", label: "アワード", to: "/awards", color: "peach" },
];

export function HomePage() {
  const state = useAsyncData(getCounts, []);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

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
          このページは次に遊ぶ作品を選ぶために作成しました。次に遊びたいジャンルなどで検索してお使いください。
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

      <p className="source-note">
        本サイトの記述はWikipedia日本語版等の公開情報を参考に独自にまとめたものです。詳しくは
        <Link to="/about">このサイトについて</Link>
        をご覧ください。
      </p>
    </div>
  );
}
