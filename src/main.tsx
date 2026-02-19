import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "./i18n";
import "./index.css";
import "@mdxeditor/editor/style.css";
import "react-toastify/dist/ReactToastify.css";
import { toast } from "react-toastify";
import { registerSW } from "virtual:pwa-register";
import { ThemedToastContainer } from "./components/themed-toast-container";
import { hideNativeLaunchScreen } from "./lib/launch-screen";
import { setupNativeOAuthListener } from "./lib/native-oauth";
import { restorePersistedQueryCache, setupPersistedQueryCache } from "./lib/query-cache-persistence";
import { queryClient } from "./lib/query-client";
import { ThemeProvider } from "./lib/theme";
import { router } from "./router";

void setupNativeOAuthListener();
restorePersistedQueryCache(queryClient);

const stopPersistedQueryCache = setupPersistedQueryCache(queryClient);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopPersistedQueryCache();
  });
}

const hideBootstrapOverlay = () => {
  if (typeof document === "undefined") return;
  const overlay = document.getElementById("bootstrap-overlay");
  if (!overlay) return;
  overlay.classList.add("bootstrap-overlay--hide");
  window.setTimeout(() => {
    overlay.remove();
  }, 260);
};

const revealAfterFirstRender = () => {
  hideBootstrapOverlay();
  void hideNativeLaunchScreen();
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
        <ThemedToastContainer />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

if (typeof window !== "undefined") {
  const fallbackTimer = window.setTimeout(() => {
    revealAfterFirstRender();
  }, 2500);

  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      window.clearTimeout(fallbackTimer);
      revealAfterFirstRender();
    }, 40);
  });
}

if ("serviceWorker" in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  let updateToastShown = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (updateToastShown) return;
    updateToastShown = true;
    toast.success("App wurde aktualisiert.");
  });

  let updateSW: (reload?: boolean) => void = () => {};
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast.info("Update verfügbar. Bitte App neu laden.");
    },
    onRegisteredSW() {
      if (!hadController) return;
      updateSW();
    }
  });
}
