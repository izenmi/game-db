import { Link } from "react-router-dom";
import type { GamePlatform, SeriesGenerated } from "../../types";
import { GameCover } from "../common/GameCover";
import { PlatformBadges } from "../common/GameCard";

const COVER_COUNT = 4;
const GENRE_COUNT = 4;
const DEVELOPER_COUNT = 2;
const PLATFORM_ORDER: GamePlatform[] = ["ps5", "switch", "switch2"];

/** シリーズ一覧のカード。名前と件数だけの行だと、そのシリーズが何のゲームなのか一覧から分からない。
 *  ゲーム一覧のカードと同じ密度になるよう、パッケージ画像・発売年の範囲・開発元・対応機種・
 *  ジャンルまで出す。
 *
 *  表示する値はすべて `series.games`(build時に発売日の昇順で入っている)から導出していて、
 *  シリーズ側に持たせた項目はない。作品を足せば画像も年も自動で更新される。 */
export function SeriesCard({ series }: { series: SeriesGenerated }) {
  const games = series.games;
  const from = games[0]?.releaseDate.slice(0, 4);
  const to = games[games.length - 1]?.releaseDate.slice(0, 4);

  // 開発元は第1作から順に(シリーズを立ち上げた開発元が先頭に来るようにする)
  const developers = [...new Set(games.flatMap((g) => g.developerNames))];
  const platforms = PLATFORM_ORDER.filter((p) => games.some((g) => g.platforms.includes(p)));

  const genreCounts = new Map<string, { name: string; n: number }>();
  for (const g of games) {
    g.genreIds.forEach((id, i) => {
      const e = genreCounts.get(id) ?? { name: g.genreNames[i] ?? id, n: 0 };
      e.n += 1;
      genreCounts.set(id, e);
    });
  }
  const genres = [...genreCounts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name, "ja"))
    .slice(0, GENRE_COUNT);

  return (
    <div className="series-card">
      <Link to={`/series/${series.id}`} className="game-card__cover-link" aria-label={series.name} />
      <div className="series-card__covers">
        {games.slice(0, COVER_COUNT).map((g) => (
          <GameCover title={g.title} coverUrl={g.coverUrl} size="sm" key={g.id} />
        ))}
      </div>
      <div className="series-card__content">
        <div className="series-card__title">
          {series.name}
          <span className="entity-list__count">{series.gameCount}本</span>
        </div>
        {from && (
          <div className="game-card__meta">
            {from === to ? `${from}年` : `${from}年〜${to}年`} / {developers.slice(0, DEVELOPER_COUNT).join("・")}
            {developers.length > DEVELOPER_COUNT && ` ほか${developers.length - DEVELOPER_COUNT}社`}
          </div>
        )}
        <PlatformBadges platforms={platforms} />
        {genres.length > 0 && (
          <div className="chip-row">
            {genres.map(([id, g]) => (
              <Link className="chip" to={`/genres/${id}`} key={id}>
                {g.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
