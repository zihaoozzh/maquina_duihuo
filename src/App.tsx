import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import { useLang } from "./lib/i18n";

const ScanPage = lazy(() => import("./pages/ScanPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const DocsPage = lazy(() => import("./pages/DocsPage"));
const DocDetailPage = lazy(() => import("./pages/DocDetailPage"));
const CatalogPage = lazy(() => import("./pages/CatalogPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

export default function App() {
  useLang(); // volver a pintar al cambiar de idioma
  return (
    <Layout>
      <Suspense fallback={<div className="p-8 text-center text-slate-500">…</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/escanear" element={<ScanPage />} />
          <Route path="/subir" element={<UploadPage />} />
          <Route path="/albaranes" element={<DocsPage />} />
          <Route path="/albaranes/:id" element={<DocDetailPage />} />
          <Route path="/productos" element={<CatalogPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
