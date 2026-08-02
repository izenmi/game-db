import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { getGenres, getGames } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { GameCard, PLATFORM_LABEL } from "../common/GameCard";
import { useSeo } from "../common/useSeo";
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

const PAGE_SIZE = 50;

/** Numbered page list with "…" collapsing for large totals, e.g. [1,2,3,"…",710].
 *  Always keeps a 3-page window around the current page plus the first/last page pinned;
 *  collapses to a plain 1..totalPages list when everything already fits without gaps. */
function getPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  const windowSize = 3;
  if (totalPages <= windowSize + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  let start: number;
  if (page <= windowSize) {
    start = 1;
  } else if (page > totalPages - windowSize) {
    start = totalPages - windowSize + 1;
  } else {
    start = page - 1;
  }
  const end = start + windowSize - 1;

  const items: (number | "ellipsis")[] = [];
  if (start > 1) {
    items.push(1);
    if (start > 2) items.push("ellipsis");
  }
  for (let n = start; n <= end; n++) items.push(n);
  if (end < totalPages) {
    if (end < totalPages - 1) items.push("ellipsis");
    items.push(totalPages);
  }
  return items;
}

function Pager({ page, totalPages, onGoToPage }: { page: number; totalPages: number; onGoToPage: (page: number) => void }) {
  return (
    <div className="pager">
      <button type="button" className="pager__prev" disabled={page <= 1} onClick={() => onGoToPage(page - 1)}>
        ← 前へ
      </button>
      <ol className="pager__pages">
        {getPageNumbers(page, totalPages).map((item, i) =>
          item === "ellipsis" ? (
            <li className="pager__ellipsis" key={`ellipsis-${i}`} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={item === page ? "pager__page pager__page--active" : "pager__page"}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onGoToPage(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>
      <button type="button" className="pager__next" disabled={page >= totalPages} onClick={() => onGoToPage(page + 1)}>
        次へ →
      </button>
    </div>
  );
}

export function GameListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const genreId = params.get("genre") ?? "";
  const platform = params.get("platform") ?? "";
  const sort = params.get("sort") ?? "release-desc";
  const pageParam = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const gamesState = useAsyncData(getGames, []);
  const genresState = useAsyncData(getGenres, []);

  useSeo({
    title: "ゲーム一覧",
    description:
      gamesState.status === "ready"
        ? `PS5/Switch/Switch2向けゲーム${gamesState.data.length}本を対応機種・ジャンル・発売日などから検索・絞り込みできます。`
        : undefined,
  });

  const filtered = useMemo(() => {
    if (gamesState.status !== "ready") return [];
    const keyword = q.trim().toLowerCase();
    return gamesState.data.filter((g) => {
      if (keyword) {
        const haystack = `${g.title}${g.titleKana}${g.developerNames.join("")}${g.publisherName}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (genreId && !g.genreIds.includes(genreId)) return false;
      if (platform && !g.platforms.includes(platform as GamePlatform)) return false;
      return true;
    });
  }, [gamesState, q, genreId, platform]);

  const sorted = useMemo(() => {
    if (sort === "release-asc") return [...filtered].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    if (sort === "release-desc") return [...filtered].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    if (sort === "kana") return [...filtered].sort((a, b) => a.titleKana.localeCompare(b.titleKana, "ja"));
    return filtered;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(pageParam, totalPages);
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setParams(next, { replace: true });
    window.scrollTo(0, 0);
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of ["q", "genre", "platform", "page"]) {
      next.delete(key);
    }
    setParams(next, { replace: true });
  }

  const hasActiveFilters = Boolean(q || genreId || platform);

  return (
    <div className="page">
      <h1>ゲーム一覧</h1>
      <input
        className="search-box"
        type="search"
        placeholder="タイトル・開発元・発売元で検索"
        value={q}
        onChange={(e) => updateParam("q", e.target.value)}
      />
      <div className="filter-row">
        <select value={platform} onChange={(e) => updateParam("platform", e.target.value)}>
          <option value="">対応機種で絞り込み</option>
          {PLATFORM_OPTIONS.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {genresState.status === "ready" && (
          <select value={genreId} onChange={(e) => updateParam("genre", e.target.value)}>
            <option value="">ジャンルで絞り込み</option>
            {genresState.data.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
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

      {gamesState.status === "loading" && <Loading />}
      {gamesState.status === "error" && <ErrorState error={gamesState.error} />}
      {gamesState.status === "ready" && (
        <>
          <p className="page-subtitle">
            {filtered.length}件{totalPages > 1 && `(${page} / ${totalPages}ページ)`}
          </p>
          {filtered.length === 0 && <EmptyState />}
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onGoToPage={goToPage} />}
          <div className="game-grid">
            {pageItems.map((g) => (
              <GameCard game={g} key={g.id} />
            ))}
          </div>
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onGoToPage={goToPage} />}
        </>
      )}
    </div>
  );
}
