import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version?: string };
const resolveGitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
};
const gitHash = resolveGitHash();
const appVersion = `${packageJson.version ?? "0.1.0"}${gitHash ? `+${gitHash}` : ""}`;

const normalizeBasePath = (value: string) => {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
};

const detectBasePath = () => {
  const explicitBase = process.env.VITE_BASE_PATH;
  if (explicitBase && explicitBase.trim().length > 0) {
    return normalizeBasePath(explicitBase.trim());
  }

  const isGithubPages = process.env.GITHUB_PAGES === "true";
  if (!isGithubPages) return "/";

  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return repoName ? `/${repoName}/` : "/";
};

const basePath = detectBasePath();

export default defineConfig({
  base: basePath,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tsparticles/")) return "vendor-particles";
          if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "vendor-charts";
          if (id.includes("react-markdown") || id.includes("remark-gfm")) return "vendor-markdown";
          if (id.includes("@supabase/supabase-js")) return "vendor-supabase";
          return undefined;
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Domora",
        short_name: "Domora",
        description: "WG Management mit Einkaufen, Aufgaben und Finanzen",
        theme_color: "#0f766e",
        background_color: "#f8fafc",
        display: "standalone",
        scope: basePath,
        start_url: basePath,
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,json}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ]
});
