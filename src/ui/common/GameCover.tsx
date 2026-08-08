import { useState } from "react";
import type { GamePlatform } from "../../types";

const COVER_COLORS = ["blue", "pink", "mint", "yellow", "peach", "purple"] as const;

function colorFor(title: string): (typeof COVER_COLORS)[number] {
  let sum = 0;
  for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
  return COVER_COLORS[sum % COVER_COLORS.length];
}

/** Real package art when one was resolved, falling back to a generated placeholder (title on a
 *  pastel card) when absent or the image fails to load. `coverUrl` comes from
 *  covers-cache.json via scripts/fetch-covers.mjs; titles with no retail listing and no IGDB
 *  entry keep the placeholder. We don't host package art ourselves; that's copyrighted artwork,
 *  not a fact. */
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

/** 楽天アフィリエイトID(affiliate.rakuten.co.jp で発行される4ブロックの文字列)。
 *  アフィリエイトIDは公開前提の識別子なのでフロントに直書きしてよい(楽天ウェブサービスの
 *  accessKey とは別物。あちらは秘匿情報なので絶対にここへ置かない)。 */
const RAKUTEN_AFFILIATE_ID = "563a399e.14e18d72.563a399f.79fc1b6e";

/** 楽天市場への購入リンク。scripts/fetch-rakuten-links.mjs が covers-cache に保存した
 *  商品ページURL(rakutenItemUrl)があればそこへ直リンクし、無ければタイトル+機種の検索URLに落とす。
 *
 *  姉妹サイト(書籍)は ISBN で商品を一意に引けるが、ゲームには相当する共通コードが無いため
 *  検索フォールバックが必要になる。RAKUTEN_AFFILIATE_ID があればアフィリエイトリンクで包む。 */
export function rakutenIchibaUrl(title: string, platform?: GamePlatform, itemUrl?: string): string {
  const query = platform ? `${title} ${PLATFORM_LABEL[platform]}` : title;
  const target = itemUrl ?? `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(query)}/`;
  if (!RAKUTEN_AFFILIATE_ID) return target;
  const encoded = encodeURIComponent(target);
  return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encoded}&m=${encoded}`;
}
