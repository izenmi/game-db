import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { GameGenerated, GamePlatform } from "../../types";

/**
 * ゲームリストを持つページ(テーマ詳細・原作者/作画家/出版社/レーベル詳細・アワード詳細)で
 * 共通に使う絞り込み。作品一覧ページ(WorkListPage)と同じ操作感を、詳細ページにも出すためのもの。
 *
 * 絞り込み条件はURLのクエリパラメータに持つので、絞った状態のまま共有・ブックマークできるし、
 * ブラウザの戻るでひとつ前の条件に戻れる。詳細ページごとに useState を置くとこれが崩れる。
 *
 * WorkListPage 側は「テーマ」「レーベル」など、そのページでしか意味のない条件も持つため
 * 統合していない。ここに置くのは**どの詳細ページでも意味がある条件だけ**にしている。
 */

const PLATFORM_OPTIONS: { value: GamePlatform; label: string }[] = [
  { value: "ps5", label: "PS5" },
  { value: "switch", label: "Switch" },
  { value: "switch2", label: "Switch 2" },
];

const SORT_OPTIONS = [
  { value: "release-desc", label: "発売日が新しい順" },
  { value: "release-asc", label: "発売日が古い順" },
  { value: "kana", label: "五十音順" },
];

/** タイトル・読み・制作者名のいずれかにキーワードが含まれるか。
 *  制作者名のフィールド名はサイトごとに違う(原作者/作画家、著者/イラストレーター等)ので、
 *  存在するものだけを拾う。姉妹サイトへ同じフックを移植できるようにするため。 */
export function matchesKeyword(w: GameGenerated, keyword: string) {
  if (!keyword) return true;
  const w2 = w as unknown as Record<string, unknown>;
  const names = ["developerNames", "publisherName"]
    .flatMap((k) => (Array.isArray(w2[k]) ? (w2[k] as string[]) : typeof w2[k] === "string" ? [w2[k] as string] : []));
  return `${w.title}${w.titleKana}${names.join("")}`.toLowerCase().includes(keyword);
}

/**
 * 作品リストに実際に付いているジャンルだけを、件数の多い順に並べて返す。
 * genres.json 全体から作ると、選んでも0件になる選択肢がずらりと並ぶ。
 * `exclude` はジャンル詳細ページ用で、そのページ自身のジャンルを選択肢から外す(全作品が持つので意味がない)。
 */
export function genreOptionsOf(works: GameGenerated[] | undefined, exclude?: string) {
  const counts = new Map<string, { label: string; n: number }>();
  for (const w of works ?? []) {
    w.genreIds.forEach((id, i) => {
      if (id === exclude) return;
      const e = counts.get(id) ?? { label: w.genreNames[i] ?? id, n: 0 };
      e.n += 1;
      counts.set(id, e);
    });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label, "ja"))
    .map(([value, e]) => ({ value, label: `${e.label}(${e.n})` }));
}

export function useGameFilter(games: GameGenerated[] | undefined, defaultSort = "release-desc") {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const platform = params.get("platform") ?? "";

  const genre = params.get("genre") ?? "";
  const sort = params.get("sort") ?? defaultSort;
  const options = useMemo(() => genreOptionsOf(games), [games]);

  const filtered = useMemo(() => {
    if (!games) return [];
    const keyword = q.trim().toLowerCase();
    return games.filter((w) => {
      if (!matchesKeyword(w, keyword)) return false;
      if (platform && !w.platforms.includes(platform as GamePlatform)) return false;
      if (genre && !w.genreIds.includes(genre)) return false;
      return true;
    });
  }, [games, q, platform, genre]);

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
    next.delete("page");
    setParams(next, { replace: true });
  }

  const hasActiveFilters = Boolean(q || platform || genre);

  const controls = (
    <div className="filter-row">
      <input
        type="search"
        value={q}
        placeholder="タイトル・開発元で絞り込み"
        aria-label="タイトル・開発元で絞り込み"
        onChange={(e) => updateParam("q", e.target.value)}
      />
      <select value={platform} onChange={(e) => updateParam("platform", e.target.value)}>
        <option value="">対応機種で絞り込み</option>
        {PLATFORM_OPTIONS.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {options.length > 0 && (
        <select value={genre} onChange={(e) => updateParam("genre", e.target.value)}>
          <option value="">ジャンルで絞り込み</option>
          {options.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <select
        value={sort}
        onChange={(e) => updateParam("sort", e.target.value === defaultSort ? "" : e.target.value)}
      >
        {SORT_OPTIONS.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hasActiveFilters && (
        <button
          type="button"
          className="filter-clear-btn"
          onClick={() => {
            const next = new URLSearchParams(params);
            ["q", "platform", "genre"].forEach((k) => next.delete(k));
            setParams(next, { replace: true });
          }}
        >
          フィルターをクリア
        </button>
      )}
    </div>
  );

  return { filtered, sorted, controls, hasActiveFilters };
}
