import type {
  AwardGenerated,
  CompanyGenerated,
  Counts,
  GameGenerated,
  GenreGenerated,
} from "../types";

function dataUrl(relativePath: string): string {
  return `${import.meta.env.BASE_URL}data/generated/${relativePath}`;
}

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(file: string): Promise<T> {
  let pending = cache.get(file) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(dataUrl(file)).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
      return res.json() as Promise<T>;
    });
    cache.set(file, pending);
  }
  return pending;
}

export const getGames = () => fetchJson<GameGenerated[]>("games.json");
export const getCompanies = () => fetchJson<CompanyGenerated[]>("companies.json");
export const getGenres = () => fetchJson<GenreGenerated[]>("genres.json");
export const getAwards = () => fetchJson<AwardGenerated[]>("awards.json");
export const getCounts = () => fetchJson<Counts>("counts.json");

export async function getGame(gameId: string): Promise<GameGenerated | undefined> {
  const games = await getGames();
  return games.find((g) => g.id === gameId);
}

export async function getCompany(companyId: string): Promise<CompanyGenerated | undefined> {
  const companies = await getCompanies();
  return companies.find((c) => c.id === companyId);
}

export async function getGenre(genreId: string): Promise<GenreGenerated | undefined> {
  const genres = await getGenres();
  return genres.find((g) => g.id === genreId);
}

export async function getAward(awardId: string): Promise<AwardGenerated | undefined> {
  const awards = await getAwards();
  return awards.find((a) => a.id === awardId);
}
