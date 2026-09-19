/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#f0f7f2", 100: "#dcece0", 200: "#bad9c2", 300: "#8dbf9b", 400: "#5fa075",
          500: "#3f8259", 600: "#2f6947", 700: "#27553a", 800: "#214430", 900: "#16301f", 950: "#0c1c12",
        },
        sand: { 50: "#fbf9f4", 100: "#f5f0e4", 200: "#ebe2cd", 300: "#dccfae", 400: "#c9b587" },
        clay: { 400: "#d98a5b", 500: "#c56f3d", 600: "#a85630" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,48,31,.06), 0 8px 24px -12px rgba(22,48,31,.18)",
      },
    },
  },
  plugins: [],
};
