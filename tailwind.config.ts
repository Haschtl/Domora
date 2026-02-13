import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effcfa",
          100: "#ccf8f1",
          200: "#99f0e3",
          300: "#5de3d1",
          400: "#24ceb8",
          500: "#0fae9b",
          600: "#0d8d80",
          700: "#0f7168",
          800: "#115a54",
          900: "#124b46"
        }
      },
      boxShadow: {
        card: "0 14px 30px -20px rgba(15, 113, 104, 0.45)"
      }
    }
  },
  plugins: []
} satisfies Config;
