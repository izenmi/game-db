import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TopNav } from "./ui/common/TopNav";
import { ScrollToTop } from "./ui/common/ScrollToTop";
import { HomePage } from "./ui/home/HomePage";
import { GameListPage } from "./ui/games/GameListPage";
import { GameDetailPage } from "./ui/games/GameDetailPage";
import { GenreListPage } from "./ui/genres/GenreListPage";
import { GenreDetailPage } from "./ui/genres/GenreDetailPage";
import { CompanyListPage } from "./ui/companies/CompanyListPage";
import { CompanyDetailPage } from "./ui/companies/CompanyDetailPage";
import { AwardListPage } from "./ui/awards/AwardListPage";
import { AwardDetailPage } from "./ui/awards/AwardDetailPage";
import { TimelinePage } from "./ui/timeline/TimelinePage";
import { CrossSearchPage } from "./ui/search/CrossSearchPage";
import { AboutPage } from "./ui/about/AboutPage";
import { NotFoundPage } from "./ui/common/NotFoundPage";
import { AffiliateNotice } from "./ui/common/AffiliateNotice";

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <TopNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/games" element={<GameListPage />} />
        <Route path="/games/:id" element={<GameDetailPage />} />
        <Route path="/genres" element={<GenreListPage />} />
        <Route path="/genres/:id" element={<GenreDetailPage />} />
        <Route path="/companies" element={<CompanyListPage />} />
        <Route path="/companies/:id" element={<CompanyDetailPage />} />
        <Route path="/awards" element={<AwardListPage />} />
        <Route path="/awards/:id" element={<AwardDetailPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/search" element={<CrossSearchPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <AffiliateNotice />
    </BrowserRouter>
  );
}
