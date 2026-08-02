import { getGenres } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState } from "../common/Status";
import { EntityList } from "../common/EntityList";
import { useSeo } from "../common/useSeo";

export function GenreListPage() {
  const state = useAsyncData(getGenres, []);

  useSeo({
    title: "ジャンル一覧",
    description:
      state.status === "ready" ? `${state.data.length}種類のジャンルからPS5/Switch/Switch2向けゲームを探せます。` : undefined,
  });

  return (
    <div className="page">
      <h1>ジャンル</h1>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <p className="page-subtitle">{state.data.length}件</p>
          <EntityList items={state.data} pathPrefix="/genres" />
        </>
      )}
    </div>
  );
}
