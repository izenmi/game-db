import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/games", label: "ゲーム一覧" },
  { to: "/genres", label: "ジャンル" },
  { to: "/companies", label: "会社" },
  { to: "/awards", label: "アワード" },
];

export function TopNav() {
  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <NavLink to="/" className="top-nav__title font-display">
          ゲームDB
        </NavLink>
        <ul className="top-nav__links">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
