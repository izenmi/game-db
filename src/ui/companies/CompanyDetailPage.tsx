import { useParams } from "react-router-dom";
import { getCompany } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { GameCard } from "../common/GameCard";
import { BASE_PATH, breadcrumbJsonLd, useSeo } from "../common/useSeo";

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getCompany(id!), [id]);
  const company = state.status === "ready" ? state.data : undefined;

  useSeo({
    title: company?.name,
    description: company
      ? `会社「${company.name}」の関連ゲーム${company.gameCount}本一覧。${company.description}`.slice(0, 160)
      : undefined,
    jsonLd: company
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: company.name,
            ...(company.description && { description: company.description }),
            ...(company.externalLinks.wikipediaUrl && { sameAs: [company.externalLinks.wikipediaUrl] }),
          },
          breadcrumbJsonLd([
            { name: "ゲームDB", path: BASE_PATH },
            { name: "会社一覧", path: `${BASE_PATH}companies` },
            { name: company.name, path: `${BASE_PATH}companies/${id}` },
          ]),
        ]
      : undefined,
  });

  const developerGames = company?.games.filter((e) => e.roles.includes("developer")) ?? [];
  const publisherGames = company?.games.filter((e) => e.roles.includes("publisher")) ?? [];

  return (
    <div className="page">
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && !state.data && <EmptyState text="見つかりませんでした。" />}
      {state.status === "ready" && state.data && (
        <>
          <h1>{state.data.name}</h1>
          <p className="page-subtitle">{state.data.gameCount}本</p>
          {state.data.description && <p>{state.data.description}</p>}
          {state.data.externalLinks.wikipediaUrl && (
            <p>
              <a href={state.data.externalLinks.wikipediaUrl} target="_blank" rel="noreferrer">
                Wikipediaで見る
              </a>
            </p>
          )}

          {developerGames.length > 0 && (
            <>
              <h2>開発作品</h2>
              <div className="game-grid">
                {developerGames.map((e) => (
                  <GameCard game={e.game} key={e.game.id} />
                ))}
              </div>
            </>
          )}

          {publisherGames.length > 0 && (
            <>
              <h2>発売作品</h2>
              <div className="game-grid">
                {publisherGames.map((e) => (
                  <GameCard game={e.game} key={e.game.id} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
