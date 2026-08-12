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
        // Unread signal. Deliberately not the brand orange — the badge sits on
        // top of brand-coloured chrome and has to read as "something is waiting"
        // rather than as decoration. The count is rendered at 10px, so it is
        // held to the 4.5:1 body-text bar: this crimson carries white at 4.7:1,
        // where the usual red-500 reaches only 3.8:1.
        alert: {
          DEFAULT: "#E11D48",
        },
      },
    },
  },
  plugins: [],
};

export default config;
