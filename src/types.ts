// ---- source data (public/data/source/*.json, hand-authored, committed) ----

export interface ExternalLinks {
  wikipediaUrl?: string;
  officialUrl?: string;
}

export interface AwardResult {
  awardId: string;
  year: number;
  result: string; // free text: "大賞" / "Game of the Year" / "ノミネート" など
}

export type GamePlatform = "ps5" | "switch" | "switch2";

export interface GameSource {
  id: string;
  title: string;
  titleKana: string;
  /** 開発元。共同開発を許容するため配列。最低1件(generate-manifest.mjsが空配列をエラーにする)。 */
  developerIds: string[];
  /** 発売元(国内正規販売元)。開発元と同一企業でもよい(companies.jsonの同一idを両方に指定)。 */
  publisherId: string;
  /** 対応機種。最低1件。 */
  platforms: GamePlatform[];
  genreIds: string[];
  /** 国内における初回発売日(YYYY-MM-DD)。複数機種で発売日が異なる場合は最も早い日付を採用し、
   *  機種別の発売日差はsourceNoteに書く。 */
  releaseDate: string;
  synopsis: string;
  awardResults?: AwardResult[];
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

/** 開発元・発売元は同一のテーブルを参照する(著者/イラストレーターのような「人物のロール別分割」
 *  ではなく、どちらも「会社」という同一種類のエンティティのため、単一ファイルで表現する)。 */
export interface CompanySource {
  id: string;
  name: string;
  nameKana: string;
  parentCompany?: string;
  description: string;
  foundedYear?: number;
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

export interface GenreSource {
  id: string;
  name: string;
  description?: string;
}

export interface AwardSource {
  id: string;
  name: string;
  organizer: string;
  description: string;
  firstYear?: number;
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

// ---- generated data (public/data/generated/*.json, built by scripts/generate-manifest.mjs) ----

/** Denormalized game: source fields plus resolved names for direct rendering. */
export interface GameGenerated extends GameSource {
  developerNames: string[];
  publisherName: string;
  genreNames: string[];
  awardSummaries: { awardId: string; awardName: string; year: number; result: string }[];
  /** Reserved for future package-art support (see CLAUDE.md「既知の未着手事項」). Always
   *  undefined for now — no cover-fetch pipeline exists yet, callers must render the placeholder. */
  coverUrl?: string;
  /** 楽天市場の商品ページURL(scripts/fetch-rakuten-links.mjs が covers-cache に保存する)。 */
  rakutenItemUrl?: string;
  /** Ids of similar games, best first, computed at build time by generate-manifest.mjs.
   *  Only present in generated/games.json — the copies embedded in the cross-reference lists
   *  omit it to keep those files small. */
  relatedGameIds?: string[];
}

/** A company's role on a given game. Arrayed because the same company can be both
 *  developer and publisher of the same title (common for first-party Nintendo titles). */
export type CompanyRole = "developer" | "publisher";

export interface CompanyGameEntry {
  game: GameGenerated;
  roles: CompanyRole[];
}

/** Unlike ranobe-db's PersonOrPublisherGenerated (which needs a `kind` discriminator because
 *  authors/illustrators/publishers are three separate source files), companies.json is a single
 *  file referenced by both developerIds and publisherId, so no kind split is needed here — a
 *  company's games list simply tags each game with the role(s) it played. */
export interface CompanyGenerated extends CompanySource {
  gameCount: number;
  games: CompanyGameEntry[];
}

export interface GenreGenerated extends GenreSource {
  gameCount: number;
  games: GameGenerated[];
}

export interface AwardWinner {
  gameId: string;
  gameTitle: string;
  year: number;
  result: string;
  /** 並べ替え用に result から取り出した順位。順位表記がないものは大賞系=0 / その他=900。 */
  rank: number;
}

export interface AwardGenerated extends AwardSource {
  gameCount: number;
  winners: AwardWinner[];
}

export interface Counts {
  games: number;
  companies: number;
  genres: number;
  awards: number;
}
