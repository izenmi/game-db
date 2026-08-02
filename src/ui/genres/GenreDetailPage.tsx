import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getGenre } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { GameCard, PLATFORM_LABEL } from "../common/GameCard";
import { BASE_PATH, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import type { GamePlatform } from "../../types";

const PLATFORM_OPTIONS: { value: GamePlatform; label: string }[] = [
  { value: "ps5", label: PLATFORM_LABEL.ps5 },
  { value: "switch", label: PLATFORM_LABEL.switch },
  { value: "switch2", label: PLATFORM_LABEL.switch2 },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "release-desc", label: "発売日が新しい順" },
  { value: "release-asc", label: "発売日が古い順" },
  { value: "kana", label: "五十音順" },
];

export function GenreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getGenre(id!), [id]);
  const genre = state.status === "ready" ? state.data : undefined;

  useSeo({
    title: genre?.name,
    description: genre
      ? `「${genre.name}」ジャンルのゲーム${genre.gameCount}本一覧。${genre.description ?? ""}`.trim()
      : undefined,
    jsonLd: genre
      ? breadcrumbJsonLd([
          { name: "ゲームDB", path: BASE_PATH },
          { name: "ジャンル一覧", path: `${BASE_PATH}genres` },
          { name: genre.name, path: `${BASE_PATH}genres/${id}` },
        ])
      : undefined,
  });

  const [params, setParams] = useSearchParams();
  const platform = params.get("platform") ?? "";
  const sort = params.get("sort") ?? "release-desc";

  const filtered = useMemo(() => {
    if (state.status !== "ready" || !state.data) return [];
    return state.data.games.filter((g) => {
      if (platform && !g.platforms.includes(platform as GamePlatform)) return false;
      return true;
    });
  }, [state, platform]);

  const sorted = useMemo(() => {
    if (sort === "release-asc") return [...filtered].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    if (sort === "release-desc") return [...filtered].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    if (sort === "kana") return [...filtered].sort((a, b) => a.titleKana.localeCompare(b.titleKana, "ja"));
    return filtered;
  }, [filtered, sort]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of ["platform", "sort"]) {
      next.delete(key);
    }
    setParams(next, { replace: true });
  }

  const hasActiveFilters = Boolean(platform);

  return (
    <div className="page">
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && !state.data && <EmptyState text="見つかりませんでした。" />}
      {state.status === "ready" && state.data && (
        <>
          <h1>{state.data.name}</h1>
          <p className="page-subtitle">{state.data.gameCount}本</p>
          {state.data.description && <p>{state.data.description}</p>}
          <div className="filter-row">
            <select value={platform} onChange={(e) => updateParam("platform", e.target.value)}>
              <option value="">対応機種で絞り込み</option>
              {PLATFORM_OPTIONS.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => updateParam("sort", e.target.value === "release-desc" ? "" : e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button type="button" className="filter-clear-btn" onClick={clearFilters}>
                フィルターをクリア
              </button>
            )}
          </div>
          {sorted.length === 0 && <EmptyState />}
          <div className="game-grid">
            {sorted.map((g) => (
              <GameCard game={g} key={g.id} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
