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
import { queryClient } from "./lib/query-client";
import { ThemeProvider } from "./lib/theme";
import { router } from "./router";

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
