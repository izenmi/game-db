import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getGenre } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { GameCard, PLATFORM_LABEL } from "../common/GameCard";
import { matchesKeyword, genreOptionsOf } from "../common/useGameFilter";
import { BASE_PATH, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import type { GamePlatform } from "../../types";
import { GameGrid } from "../common/GameGrid";
import { useCoverView } from "../common/useCoverView";

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
  const { coverView, toggle } = useCoverView();
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
  const q = params.get("q") ?? "";
  // このページ自身のジャンルは全作品が持っていて絞り込みにならないので選択肢から外す
  const other = params.get("genre") ?? "";
  const platform = params.get("platform") ?? "";
  const sort = params.get("sort") ?? "release-desc";

  const options = useMemo(
    () => genreOptionsOf(state.status === "ready" ? state.data?.games : undefined, id),
    [state, id],
  );

  const filtered = useMemo(() => {
    if (state.status !== "ready" || !state.data) return [];
    const keyword = q.trim().toLowerCase();
    return state.data.games.filter((g) => {
      if (!matchesKeyword(g, keyword)) return false;
      if (other && !g.genreIds.includes(other)) return false;
      if (platform && !g.platforms.includes(platform as GamePlatform)) return false;
      return true;
    });
  }, [state, platform, q, other]);

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

  const hasActiveFilters = Boolean(q || other || platform);

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
            <input
              type="search"
              value={q}
              placeholder="タイトル・作者で絞り込み"
              aria-label="タイトル・作者で絞り込み"
              onChange={(e) => updateParam("q", e.target.value)}
            />
            {options.length > 0 && (
              <select value={other} onChange={(e) => updateParam("genre", e.target.value)}>
                <option value="">他のジャンルで絞り込み</option>
                {options.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
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
            {toggle}
          </div>
          {sorted.length === 0 && <EmptyState />}
          <GameGrid games={sorted} coverView={coverView} />
        </>
      )}
    </div>
  );
}
