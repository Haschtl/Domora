import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5f4",
          100: "#d7e8e5",
          200: "#b2d5cf",
          300: "#86bfb6",
          400: "#4ea89c",
          500: "#1f8a7f",
          600: "#177468",
          700: "#125e55",
          800: "#0f4b45",
          900: "#0b3b37"
        }
      },
      boxShadow: {
        card: "0 14px 30px -20px rgba(15, 113, 104, 0.45)"
      }
    }
  },
  plugins: []
} satisfies Config;
