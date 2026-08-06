import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getGames } from "../../data/manifest";
import type { GameGenerated } from "../../types";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { colorForYear } from "../common/yearColor";
import { useSeo } from "../common/useSeo";

interface YearGroup {
  year: number;
  works: GameGenerated[];
}

interface DecadeGroup {
  decade: number;
  years: YearGroup[];
  count: number;
}

/** Groups every game by 発売年 and then by decade. Games inside a year are ordered by their
 *  full releaseDate (games.json keeps the day, unlike the sister sites' year-only data). */
function groupByDecade(works: GameGenerated[]): DecadeGroup[] {
  const worksByYear = new Map<number, GameGenerated[]>();
  for (const work of works) {
    const bucket = worksByYear.get(Number(work.releaseDate.slice(0, 4)));
    if (bucket) bucket.push(work);
    else worksByYear.set(Number(work.releaseDate.slice(0, 4)), [work]);
  }

  const yearsByDecade = new Map<number, YearGroup[]>();
  for (const [year, yearWorks] of worksByYear) {
    const decade = Math.floor(year / 10) * 10;
    const group = {
      year,
      works: [...yearWorks].sort(
        (a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.title.localeCompare(b.title, "ja"),
      ),
    };
    const bucket = yearsByDecade.get(decade);
    if (bucket) bucket.push(group);
    else yearsByDecade.set(decade, [group]);
  }

  return [...yearsByDecade]
    .map(([decade, years]) => ({
      decade,
      years: years.sort((a, b) => a.year - b.year),
      count: years.reduce((total, y) => total + y.works.length, 0),
    }))
    .sort((a, b) => a.decade - b.decade);
}

export function TimelinePage() {
  const worksState = useAsyncData(getGames, []);
  const [newestFirst, setNewestFirst] = useState(false);

  const decades = useMemo(
    () => (worksState.status === "ready" ? groupByDecade(worksState.data) : []),
    [worksState],
  );

  const ordered = useMemo(() => {
    if (!newestFirst) return decades;
    return [...decades].reverse().map((d) => ({ ...d, years: [...d.years].reverse() }));
  }, [decades, newestFirst]);

  const total = decades.reduce((sum, d) => sum + d.count, 0);
  const firstYear = decades[0]?.years[0]?.year;
  const lastDecade = decades[decades.length - 1];
  const lastYear = lastDecade?.years[lastDecade.years.length - 1]?.year;

  useSeo({
    title: "年表",
    description:
      total > 0
        ? `PS5・Switch・Switch 2のゲーム${total}本を発売日順に並べた年表。${firstYear}年から${lastYear}年までの流れをまとめて見渡せます。`
        : undefined,
  });

  return (
    <div className="page">
      <h1>年表</h1>
      {worksState.status === "loading" && <Loading />}
      {worksState.status === "error" && <ErrorState error={worksState.error} />}
      {worksState.status === "ready" && total === 0 && <EmptyState text="ゲームがまだありません。" />}
      {worksState.status === "ready" && total > 0 && (
        <>
          <p className="page-subtitle">
            {firstYear}年〜{lastYear}年 / {total}本
          </p>

          <div className="chip-row">
            {decades.map((d) => (
              <a className="chip" href={`#decade-${d.decade}`} key={d.decade}>
                {d.decade}年代
                <span className="entity-list__count"> {d.count}</span>
              </a>
            ))}
          </div>

          <p>
            <button type="button" className="timeline-order" onClick={() => setNewestFirst((v) => !v)}>
              {newestFirst ? "古い順に並べ替え" : "新しい順に並べ替え"}
            </button>
          </p>

          {ordered.map((d) => (
            <section className="timeline-decade" id={`decade-${d.decade}`} key={d.decade}>
              <h2 className="timeline-decade__heading font-display">
                {d.decade}年代
                <span className="entity-list__count"> {d.count}本</span>
              </h2>
              {d.years.map((y) => (
                <div className="timeline-year" key={y.year}>
                  <div className="timeline-year__label">
                    <span className={`winner-year winner-year--${colorForYear(y.year)}`}>{y.year}</span>
                  </div>
                  <ul className="timeline-year__works">
                    {y.works.map((work) => (
                      <li key={work.id}>
                        <Link to={`/works/${work.id}`}>{work.title}</Link>
                        <span className="timeline-year__meta">{work.developerNames.join("・")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
