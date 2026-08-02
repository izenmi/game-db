import { Link, useNavigate } from "react-router-dom";
import type { GameGenerated, GamePlatform } from "../../types";
import { GameCover } from "./GameCover";

export const PLATFORM_LABEL: Record<GamePlatform, string> = { ps5: "PS5", switch: "Switch", switch2: "Switch2" };

export function PlatformBadges({ platforms }: { platforms: GamePlatform[] }) {
  return (
    <span className="platform-badge-row">
      {platforms.map((p) => (
        <span className={`platform-badge platform-badge--${p}`} key={p}>
          {PLATFORM_LABEL[p]}
        </span>
      ))}
    </span>
  );
}

/** Fuller card for the main game list page: cover thumbnail on the left, and a right-hand
 *  column (title/developer/publisher/release date + platform badges + clickable genre tags).
 *  The whole card navigates to the game page on click (including the empty space below the
 *  tags), so it's a div rather than an <a> — nesting the genre tags' own <Link>s inside an outer
 *  <a> isn't valid HTML. Genre tag clicks stop propagation so they go to the genre page instead
 *  of the game page. */
export function GameCard({ game }: { game: GameGenerated }) {
  const navigate = useNavigate();
  const goToGame = () => navigate(`/games/${game.id}`);

  return (
    <div
      className="game-card"
      role="link"
      tabIndex={0}
      onClick={goToGame}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToGame();
        }
      }}
    >
      <GameCover title={game.title} coverUrl={game.coverUrl} size="sm" />
      <div className="game-card__content">
        <div className="game-card__title">{game.title}</div>
        <div className="game-card__meta">
          {game.developerNames.join("・")} / {game.publisherName} / {game.releaseDate}
        </div>
        <PlatformBadges platforms={game.platforms} />
        {game.awardSummaries.length > 0 && (
          <div className="game-card__awards">
            {game.awardSummaries.slice(0, 2).map((a, i) => (
              <span className="chip award-chip" key={`${a.awardId}-${a.year}-${i}`}>
                {a.awardName} {a.result}
              </span>
            ))}
          </div>
        )}
        {game.genreIds.length > 0 && (
          <div className="chip-row">
            {game.genreIds.map((genreId, i) => (
              <Link className="chip" to={`/genres/${genreId}`} key={genreId} onClick={(e) => e.stopPropagation()}>
                {game.genreNames[i]}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
