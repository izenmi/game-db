import type { GameGenerated } from "../../types";
import { GameCard, GameCoverCard } from "./GameCard";
import { gridClassNameFor } from "./useCoverView";

/** 一覧のグリッド。表示モード(useCoverView)に応じてカードと表紙だけのカードを出し分ける。
 *  受賞結果のラベルを添えるアワード詳細ページだけは中身の構造が違うので、これを使わず
 *  `gridClassName` と GameCoverCard を直接組み合わせている。 */
export function GameGrid({ games, coverView }: { games: GameGenerated[]; coverView: boolean }) {
  return (
    <div className={gridClassNameFor(coverView)}>
      {games.map((w) =>
        coverView ? <GameCoverCard game={w} key={w.id} /> : <GameCard game={w} key={w.id} />,
      )}
    </div>
  );
}
