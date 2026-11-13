import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { startSync } from "./lib/sync";
import { getLang } from "./lib/i18n";
import "./index.css";

registerSW({ immediate: true });

// Pedir almacenamiento persistente para que el navegador no borre los albaranes guardados
navigator.storage?.persist?.().catch(() => {});

document.documentElement.lang = getLang() === "zh" ? "zh-CN" : "es";
startSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
