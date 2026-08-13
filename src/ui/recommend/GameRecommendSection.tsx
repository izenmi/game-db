import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getGames } from "../../data/manifest";
import type { GameGenerated } from "../../types";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { matchesKeyword } from "../common/useGameFilter";
import { useCoverView } from "../common/useCoverView";
import { RECOMMEND_COUNT, RecommendGrid, tieBreakKey } from "./RecommendPage";

const MAX_SEEDS = 3;
const CANDIDATE_COUNT = 20;
// ビルド側 relatedIdsFor(scripts/generate-manifest.mjs)と同じ値。片方だけ変えないこと。
const SAME_DEVELOPER_BONUS = 0.15;

/** スコアに使うタグ。ビルド側 `tagsOf()` と同じくジャンルを使う。 */
function visibleThemes(g: GameGenerated): string[] {
  return g.genreIds;
}

/** 各シード作品との類似度を**個別に計算して算術平均**する。
 *
 *  1シードあたりの式はビルド側 relatedIdsFor と同じ: ジャンルIDFコサイン + 同開発元+0.15
 *  (別の式を新造しない — 同じサイトで「似ている」の定義が2つあると詳細ページの並びと
 *  食い違う)。シードが1件のとき、作品詳細の「この作品が好きなら」と同じ順位になるのはこのため。
 *
 *  ジャンルベクトルを合算してから1回でコサインを取る方式にしないのは、開発元ボーナスの意味が
 *  崩れる(どのシードと同開発元なのかが混ざる)のと、1件時にビルド側と食い違うため。
 *  N と df を games.json 全件から数えるとビルド側・テーマ起点と完全に同じIDFになる。 */
function scoreBySeeds(games: GameGenerated[], seeds: GameGenerated[]) {
  const n = games.length;
  const themesOf = new Map(games.map((w) => [w.id, visibleThemes(w)]));
  const df = new Map<string, number>();
  for (const g of games) for (const t of themesOf.get(g.id)!) df.set(t, (df.get(t) ?? 0) + 1);
  const idf2 = new Map([...df].map(([t, d]) => [t, Math.log(n / d) ** 2]));
  const normOf = (w: GameGenerated) =>
    Math.sqrt(themesOf.get(w.id)!.reduce((sum, t) => sum + (idf2.get(t) ?? 0), 0));

  const seedData = seeds.map((s) => ({
    themes: new Set(themesOf.get(s.id) ?? visibleThemes(s)),
    norm: normOf(s),
    developers: new Set(s.developerIds),
  }));
  const seedIds = new Set(seeds.map((s) => s.id));
  // ビルド側 relatedIdsFor と同じく、**シードと同じシリーズのゲームは除外する**。
  // ゲーム詳細にはシリーズ節が別にあるので、ここで続編・リメイクを並べても同じ一覧の
  // 繰り返しになり、この枠の目的である「毛色の違うゲーム」が押し出される。
  const seedSeries = new Set(seeds.map((s) => s.seriesId).filter(Boolean));

  const scored: { work: GameGenerated; score: number }[] = [];
  for (const w of games) {
    if (seedIds.has(w.id)) continue;
    if (w.seriesId && seedSeries.has(w.seriesId)) continue;
    const workNorm = normOf(w);
    let total = 0;
    for (const sd of seedData) {
      let dot = 0;
      for (const t of themesOf.get(w.id)!) if (sd.themes.has(t)) dot += idf2.get(t) ?? 0;
      let score = sd.norm > 0 && workNorm > 0 ? dot / (sd.norm * workNorm) : 0;
      if (w.developerIds.some((id) => sd.developers.has(id))) score += SAME_DEVELOPER_BONUS;
      total += score;
    }
    const score = total / seedData.length;
    if (score > 0) scored.push({ work: w, score });
  }
  return scored;
}

/** ゲーム起点のおすすめ(`?games=<id>,<id>,<id>`)。
 *
 *  データは games.json だけを使う。専用索引(recommend-index.json)は読まないし拡張もしない —
 *  タイトル・読み・開発元idまで足すと索引が数倍に膨れる一方、主要導線(作品詳細の
 *  「この作品が好きなら」からの遷移)では games.json が取得済みキャッシュから返り追加転送ゼロ。
 *  このモードはタブ操作か共有URLでしか開かれないので、プリレンダーが見る素の /recommend
 *  (ジャンル起点)には games.json のフェッチも「読み込み中」も発生しない。 */
export function GameRecommendSection() {
  const [params, setParams] = useSearchParams();
  const { coverView, toggle } = useCoverView();
  const [q, setQ] = useState("");

  const gamesState = useAsyncData(getGames, []);
  const games = gamesState.status === "ready" ? gamesState.data : undefined;
  const byId = useMemo(() => new Map((games ?? []).map((g) => [g.id, g])), [games]);

  // 知らないidは黙って捨て、4つ目以降は切り捨てる(テーマ起点と同じ方針)。
  // URLへの正規化書き戻しはしない — games.json ロード前に「全部未知」と誤判定して
  // 共有URLを壊さないため。
  const seeds = useMemo(() => {
    const raw = (params.get("games") ?? "").split(",").filter(Boolean);
    return [...new Set(raw)]
      .map((id) => byId.get(id))
      .filter((w): w is GameGenerated => w !== undefined)
      .slice(0, MAX_SEEDS);
  }, [params, byId]);

  function setSeedIds(next: string[]) {
    const p = new URLSearchParams(params);
    if (next.length > 0) {
      p.set("games", next.join(","));
      p.delete("mode");
    } else {
      // 最後のシードを外してもゲーム起点タブに留まる(mode= が無いとテーマ起点に戻ってしまう)。
      p.delete("games");
      p.set("mode", "games");
    }
    setParams(p, { replace: true });
  }

  const keyword = q.trim().toLowerCase();
  const candidates = useMemo(() => {
    if (!games || !keyword) return [];
    const seedIds = new Set(seeds.map((s) => s.id));
    const prefix = (w: GameGenerated) =>
      w.title.toLowerCase().startsWith(keyword) || w.titleKana.startsWith(keyword) ? 0 : 1;
    return games
      .filter((w) => !seedIds.has(w.id) && matchesKeyword(w, keyword))
      .sort(
        (a, b) =>
          prefix(a) - prefix(b) ||
          tieBreakKey(b) - tieBreakKey(a) ||
          b.releaseDate.localeCompare(a.releaseDate) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, CANDIDATE_COUNT);
  }, [games, keyword, seeds]);

  const results = useMemo(() => {
    if (!games || seeds.length === 0) return [];
    return scoreBySeeds(games, seeds).sort(
      (a, b) =>
        b.score - a.score ||
        tieBreakKey(b.work) - tieBreakKey(a.work) ||
        b.work.awardSummaries.length - a.work.awardSummaries.length ||
        a.work.id.localeCompare(b.work.id),
    );
  }, [games, seeds]);

  const seedThemes = useMemo(
    () => new Set(seeds.flatMap((s) => visibleThemes(s))),
    [seeds],
  );
  const atLimit = seeds.length >= MAX_SEEDS;

  if (gamesState.status === "loading") return <Loading />;
  if (gamesState.status === "error") return <ErrorState error={gamesState.error} />;

  return (
    <>
      {seeds.length > 0 && (
        <div className="chip-row chip-row--lg theme-picker__selected">
          {seeds.map((s) => (
            <button
              type="button"
              className="chip chip--lg chip--on"
              key={s.id}
              aria-pressed
              onClick={() => setSeedIds(seeds.filter((x) => x.id !== s.id).map((x) => x.id))}
            >
              {s.title} ×
            </button>
          ))}
        </div>
      )}

      <div className="filter-row">
        <input
          type="search"
          value={q}
          placeholder="タイトル・開発元でゲームを検索"
          aria-label="タイトル・開発元でゲームを検索"
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="page-subtitle">
          {atLimit ? `上限の${MAX_SEEDS}本を選択中 — 外すと他を選べます` : `選択中 ${seeds.length} / ${MAX_SEEDS}`}
        </span>
        {seeds.length > 0 && (
          <button type="button" className="filter-clear-btn" onClick={() => setSeedIds([])}>
            選択をクリア
          </button>
        )}
      </div>

      {keyword && (
        <div className="work-picker">
          {candidates.map((w) => (
            <button
              type="button"
              className="work-picker__item"
              key={w.id}
              disabled={atLimit}
              onClick={() => {
                setSeedIds([...seeds.map((s) => s.id), w.id]);
                setQ("");
              }}
            >
              <span className="work-picker__title">{w.title}</span>
              <span className="work-picker__meta">
                {w.developerNames.join("・")} / {w.publisherName} / {w.releaseDate}
              </span>
            </button>
          ))}
          {candidates.length === 0 && <EmptyState text="該当するゲームがありません。" />}
        </div>
      )}

      {seeds.length === 0 && !keyword && <EmptyState text="ゲームを検索して選ぶとおすすめが表示されます。" />}

      {seeds.length > 0 && (
        <>
          <h2 className="home-section__heading font-display">おすすめ</h2>
          <div className="filter-row">
            <p className="page-subtitle">
              {Math.min(results.length, RECOMMEND_COUNT)}本
              {results.length > RECOMMEND_COUNT && ` / 候補${results.length}本`}
            </p>
            {toggle}
          </div>
          {results.length === 0 && <EmptyState />}
          <RecommendGrid
            entries={results.slice(0, RECOMMEND_COUNT).map((r) => ({
              work: r.work,
              score: r.score,
              matchedNames: visibleThemes(r.work)
                .map((t) => (seedThemes.has(t) ? r.work.genreNames[r.work.genreIds.indexOf(t)] : null))
                .filter((name): name is string => Boolean(name)),
            }))}
            coverView={coverView}
          />
          {results.length > 0 && (
            <p className="page-subtitle">
              一致度は、選んだゲームとゲームのジャンルの重なり具合(珍しいジャンルほど重く数えます)です。
              同じ開発元のゲームには加点しているため、100%を上限に丸めています。
            </p>
          )}
        </>
      )}
    </>
  );
}
