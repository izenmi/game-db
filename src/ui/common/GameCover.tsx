import { useState } from "react";
import type { GamePlatform } from "../../types";

const COVER_COLORS = ["blue", "pink", "mint", "yellow", "peach", "purple"] as const;

function colorFor(title: string): (typeof COVER_COLORS)[number] {
  let sum = 0;
  for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
  return COVER_COLORS[sum % COVER_COLORS.length];
}

/** Real package art when one was resolved, falling back to a generated placeholder (title on a
 *  pastel card) when absent or the image fails to load. No cover-fetch pipeline exists yet (see
 *  CLAUDE.md「既知の未着手事項」), so `coverUrl` is always undefined for now — every game renders
 *  the placeholder until that's built. We don't host package art ourselves regardless; that's
 *  copyrighted artwork, not a fact. */
export function GameCover({ title, coverUrl, size = "sm" }: { title: string; coverUrl?: string; size?: "sm" | "lg" }) {
  const [broken, setBroken] = useState(false);
  if (coverUrl && !broken) {
    return (
      <img
        className={`game-cover game-cover--${size} game-cover--image`}
        src={coverUrl}
        alt={title}
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className={`game-cover game-cover--${size} game-cover--${colorFor(title)}`}>
      <span className="game-cover__title">{title}</span>
    </div>
  );
}

const AMAZON_AFFILIATE_TAG = "izenmi-22";

const PLATFORM_LABEL: Record<GamePlatform, string> = { ps5: "PS5", switch: "Switch", switch2: "Switch2" };

/** Amazon search-results link — never a direct product page (see CLAUDE.md「購入リンクは検索URL
 *  形式のみ」, the same reasoning as ranobe-db/manga-db: we don't track per-SKU ASINs). Pass a
 *  platform to narrow the query to that version's listing, or omit it to search the title alone. */
export function amazonSearchUrl(title: string, platform?: GamePlatform): string {
  const query = platform ? `${title} ${PLATFORM_LABEL[platform]}` : title;
  const params = new URLSearchParams({ k: query, tag: AMAZON_AFFILIATE_TAG });
  return `https://www.amazon.co.jp/s?${params.toString()}`;
}
