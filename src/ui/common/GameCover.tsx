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

/** ISBN-13(978始まり)をISBN-10へ変換する。書籍のAmazon ASINはISBN-10と一致するので、
 *  これで商品ページへ直リンクできる。979始まり(ISBN-10が存在しない)は undefined を返す。 */
function isbn13to10(isbn13?: string): string | undefined {
  if (!isbn13) return undefined;
  const d = isbn13.replace(/[^0-9Xx]/g, "");
  if (d.length !== 13 || !d.startsWith("978")) return undefined;
  const core = d.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

/** 楽天ブックスへの購入リンク。ISBNがあればISBN検索(その本に直行する)、なければタイトル+著者検索。
 *  RAKUTEN_AFFILIATE_ID が設定されていれば hb.afl.rakuten.co.jp のアフィリエイトリンクで包む。 */
export function rakutenBooksUrl(title: string, extra?: string, isbn?: string, itemUrl?: string): string {
  // 商品ページURL(scripts/fetch-rakuten-links.mjs が covers-cache に保存したもの)があれば直リンク。
  // 無ければISBN検索 → タイトル+著者検索の順に落とす。
  const target =
    itemUrl ??
    `https://books.rakuten.co.jp/search?sitem=${encodeURIComponent(
      isbn ? isbn.replace(/[^0-9Xx]/g, "") : extra ? `${title} ${extra}` : title,
    )}`;
  if (!RAKUTEN_AFFILIATE_ID) return target;
  const encoded = encodeURIComponent(target);
  return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encoded}&m=${encoded}`;
}
