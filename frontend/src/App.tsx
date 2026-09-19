import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import RegisterAnimal from "./pages/RegisterAnimal";
import AnimalDetailPage from "./pages/AnimalDetail";
import Transfers from "./pages/Transfers";
import Record from "./pages/Record";
import Release from "./pages/Release";
import Verify from "./pages/Verify";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="register" element={<RegisterAnimal />} />
        <Route path="animals/:id" element={<AnimalDetailPage />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="record" element={<Record />} />
        <Route path="release" element={<Release />} />
        <Route path="verify" element={<Verify />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<div className="card p-8 text-center">Page not found.</div>} />
      </Route>
    </Routes>
  );
}
