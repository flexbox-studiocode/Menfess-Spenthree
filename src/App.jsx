import { Route, Routes } from "react-router-dom";
import "./App.css";
import AppLayout from "./components/AppLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import WritePage from "./pages/WritePage.jsx";
import ReviewPage from "./pages/ReviewPage.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import DetailPage from "./pages/DetailPage.jsx";
import GuidePage from "./pages/GuidePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="write" element={<WritePage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="status" element={<StatusPage />} />
        <Route path="menfess/:id" element={<DetailPage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
