import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bratt Tree brand palette - placeholder values.
        // Refine these once we pull official tokens from www.bratttree.com.
        brand: {
          primary: "#1F5C3A",   // deep forest green (placeholder)
          accent:  "#F2B71C",   // warm yellow accent (placeholder)
          dark:    "#1A1A1A",
          light:   "#F7F7F2",
        },
        status: {
          onPace:  "#16A34A",
          behind:  "#DC2626",
          warn:    "#D97706",
          neutral: "#6B7280",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans:    ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
