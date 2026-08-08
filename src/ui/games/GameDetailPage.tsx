import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { getGame, getGames } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { GameCover, amazonSearchUrl, rakutenBooksUrl } from "../common/GameCover";
import { GameCard, PlatformBadges } from "../common/GameCard";
import { BASE_PATH, DEFAULT_OG_IMAGE, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import type { GameGenerated } from "../../types";

function gameJsonLd(id: string, g: GameGenerated) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: g.title,
      inLanguage: "ja",
      author: g.developerNames.map((name) => ({ "@type": "Organization", name })),
      publisher: { "@type": "Organization", name: g.publisherName },
      datePublished: g.releaseDate,
      genre: g.genreNames,
      gamePlatform: g.platforms.map((p) => ({ ps5: "PlayStation 5", switch: "Nintendo Switch", switch2: "Nintendo Switch 2" })[p]),
      description: g.synopsis,
      ...(g.coverUrl && { image: g.coverUrl }),
      ...(g.awardSummaries.length > 0 && {
        award: g.awardSummaries.map((a) => `${a.awardName} ${a.result}(${a.year})`),
      }),
    },
    breadcrumbJsonLd([
      { name: "ゲームDB", path: BASE_PATH },
      { name: "ゲーム一覧", path: `${BASE_PATH}games` },
      { name: g.title, path: `${BASE_PATH}games/${id}` },
    ]),
  ];
}

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getGame(id!), [id]);
  const game = state.status === "ready" ? state.data : undefined;

  // getGames() resolves from the same cached games.json that getGame() above already pulled,
  // so this costs no extra request.
  const allGamesState = useAsyncData(getGames, []);
  const relatedGames = useMemo(() => {
    if (allGamesState.status !== "ready" || !game?.relatedGameIds) return [];
    const byId = new Map(allGamesState.data.map((x) => [x.id, x]));
    return game.relatedGameIds
      .map((relatedId) => byId.get(relatedId))
      .filter((x): x is GameGenerated => Boolean(x));
  }, [allGamesState, game]);

  useSeo({
    title: game?.title,
    description: game
      ? `${game.title}(${game.developerNames.join("・")}/${game.publisherName})の対応機種・発売日・受賞歴・ジャンルをまとめて紹介。${game.synopsis.slice(0, 60)}…`
      : undefined,
    image: game?.coverUrl ?? DEFAULT_OG_IMAGE,
    jsonLd: game ? gameJsonLd(id!, game) : undefined,
  });

  return (
    <div className="page">
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && !state.data && <EmptyState text="見つかりませんでした。" />}
      {state.status === "ready" && state.data && (
        <>
          <div className="game-detail__hero">
            <div className="game-detail__hero-cover">
              <GameCover title={state.data.title} coverUrl={state.data.coverUrl} size="lg" />
              {state.data.platforms.map((platform) => (
                <a
                  className="cover-link"
                  href={amazonSearchUrl(state.data!.title, platform)}
                  target="_blank"
                  rel="noreferrer"
                  key={platform}
                >
                  {{ ps5: "PS5", switch: "Switch", switch2: "Switch2" }[platform]}版をAmazonで購入
                </a>
              ))}
              <a
                className="cover-link"
                href={rakutenBooksUrl(state.data.title)}
                target="_blank"
                rel="noreferrer"
              >
                楽天ブックスで購入
              </a>
            </div>
            <div className="game-card__body">
              <h1>{state.data.title}</h1>
              <p className="page-subtitle">
                {state.data.developerIds.map((developerId, i) => (
                  <span key={developerId}>
                    {i > 0 && "・"}
                    <Link to={`/companies/${developerId}`}>{state.data!.developerNames[i]}</Link>
                  </span>
                ))}
                {" (開発) / "}
                <Link to={`/companies/${state.data.publisherId}`}>{state.data.publisherName}</Link>
                {" (発売)"}
              </p>
              <p className="page-subtitle">発売日: {state.data.releaseDate}</p>
              <PlatformBadges platforms={state.data.platforms} />

              {state.data.genreNames.length > 0 && (
                <div className="chip-row">
                  {state.data.genreIds.map((genreId, i) => (
                    <Link className="chip" to={`/genres/${genreId}`} key={genreId}>
                      {state.data!.genreNames[i]}
                    </Link>
                  ))}
                </div>
              )}

              {state.data.awardSummaries.length > 0 && (
                <div className="chip-row">
                  {state.data.awardSummaries.map((a, i) => (
                    <Link className="chip award-chip" to={`/awards/${a.awardId}`} key={`${a.awardId}-${a.year}-${i}`}>
                      {a.awardName} {a.result}({a.year})
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p>{state.data.synopsis}</p>

          {state.data.externalLinks.officialUrl && (
            <p>
              <a href={state.data.externalLinks.officialUrl} target="_blank" rel="noreferrer">
                公式サイト
              </a>
              {state.data.externalLinks.wikipediaUrl && " / "}
              {state.data.externalLinks.wikipediaUrl && (
                <a href={state.data.externalLinks.wikipediaUrl} target="_blank" rel="noreferrer">
                  Wikipediaで見る
                </a>
              )}
            </p>
          )}
          {!state.data.externalLinks.officialUrl && state.data.externalLinks.wikipediaUrl && (
            <p>
              <a href={state.data.externalLinks.wikipediaUrl} target="_blank" rel="noreferrer">
                Wikipediaで見る
              </a>
            </p>
          )}

          {relatedGames.length > 0 && (
            <div className="home-section">
              <h2 className="home-section__heading font-display">このゲームが好きなら</h2>
              <div className="game-grid">
                {relatedGames.map((related) => (
                  <GameCard key={related.id} game={related} />
                ))}
              </div>
            </div>
          )}

          <p className="source-note">{state.data.sourceNote}</p>
        </>
      )}
    </div>
  );
}
