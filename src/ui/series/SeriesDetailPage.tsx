import { useParams } from "react-router-dom";
import { getSeries, getGamesByIds } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { BASE_PATH, SITE_URL, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import { GameGrid } from "../common/GameGrid";
import { useCoverView } from "../common/useCoverView";
import type { SeriesGenerated, GameGenerated } from "../../types";

function seriesJsonLd(id: string, s: SeriesGenerated, games: GameGenerated[]) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "VideoGameSeries",
      name: s.name,
      inLanguage: "ja",
      description: s.description,
      numberOfEpisodes: s.gameCount,
      hasPart: games.map((g) => ({
        "@type": "VideoGame",
        name: g.title,
        datePublished: g.releaseDate,
        url: `${SITE_URL}games/${g.id}`,
      })),
    },
    breadcrumbJsonLd([
      { name: "ゲームDB", path: BASE_PATH },
      { name: "シリーズ一覧", path: `${BASE_PATH}series` },
      { name: s.name, path: `${BASE_PATH}series/${id}` },
    ]),
  ];
}

export function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getSeries(id!), [id]);
  const { coverView, toggle } = useCoverView();
  const series = state.status === "ready" ? state.data : undefined;
  // ゲームの実データは games.json 側にある(SeriesGenerated は gameIds のみ)。
  const gamesState = useAsyncData(
    () => (series ? getGamesByIds(series.gameIds) : Promise.resolve([])),
    [series],
  );
  const seriesGames = gamesState.status === "ready" ? gamesState.data : [];

  useSeo({
    title: series?.name,
    description: series
      ? `「${series.name}」シリーズのゲーム${series.gameCount}本を発売順に一覧。${series.description}`
      : undefined,
    jsonLd: series ? seriesJsonLd(id!, series, seriesGames) : undefined,
  });

  return (
    <div className="page">
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && !state.data && <EmptyState text="見つかりませんでした。" />}
      {state.status === "ready" && state.data && (
        <>
          <h1>{state.data.name}</h1>
          <p className="page-subtitle">{state.data.gameCount}本(発売順)</p>
          <p>{state.data.description}</p>
          <div className="filter-row">{toggle}</div>
          {seriesGames.length === 0 && <EmptyState />}
          <GameGrid games={seriesGames} coverView={coverView} />
          <p className="source-note">{state.data.sourceNote}</p>
        </>
      )}
    </div>
  );
}
