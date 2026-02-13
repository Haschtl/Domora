import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "./i18n";
import "./index.css";
import "react-toastify/dist/ReactToastify.css";
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
