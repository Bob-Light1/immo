import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1A3C6E",
          dark: "#13294B",
        },
        brand: {
          DEFAULT: "#E8821E",
          soft: "#F4A340",
        },
      },
    },
  },
  plugins: [],
};

export default config;
