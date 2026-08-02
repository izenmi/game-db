import { Link } from "react-router-dom";

export interface EntityListItem {
  id: string;
  name: string;
  gameCount: number;
}

/** Shared "name + count" list used by companies/genres/awards — mirrors jsfdb's single-page,
 *  no-pagination list style (e.g. "任天堂 12"). */
export function EntityList({ items, pathPrefix }: { items: EntityListItem[]; pathPrefix: string }) {
  return (
    <ul className="entity-list">
      {items.map((item) => (
        <li className="entity-list__item" key={item.id}>
          <Link to={`${pathPrefix}/${item.id}`}>
            <span>{item.name}</span>
            <span className="entity-list__count">{item.gameCount}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
