import { getCompanies } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState } from "../common/Status";
import { EntityList } from "../common/EntityList";
import { useSeo } from "../common/useSeo";

export function CompanyListPage() {
  const state = useAsyncData(getCompanies, []);

  useSeo({
    title: "会社一覧",
    description:
      state.status === "ready"
        ? `ゲーム開発元・発売元${state.data.length}社の一覧。五十音順に探せます。`
        : undefined,
  });

  return (
    <div className="page">
      <h1>会社一覧</h1>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <p className="page-subtitle">{state.data.length}件</p>
          <EntityList items={state.data} pathPrefix="/companies" />
        </>
      )}
    </div>
  );
}
