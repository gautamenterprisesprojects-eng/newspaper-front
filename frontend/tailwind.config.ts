import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0B0F19",
        surface: "#111827",
        surfaceElevated: "#1E293B",
        primary: {
          DEFAULT: "#4F46E5",
          hover: "#4338CA",
          light: "#818CF8",
        },
        emerald: {
          DEFAULT: "#10B981",
          light: "#34D399",
        },
        danger: "#EF4444",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-hind)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
