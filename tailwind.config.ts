import type { Config } from "tailwindcss";

// Bratt Tree Design System tokens
// Source: bratt-tree-logo-guide-book.pdf (KickCharge brand book)
// Mirrors colors_and_type.css from the brand kit.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Core brand
        orange:     { DEFAULT: "#EB4C1B", warm: "#EC511B", hover: "#D43F12", press: "#B83410" },
        lime:       { DEFAULT: "#E9E71D" },
        green:      { DEFAULT: "#72BB32", dark: "#448629" },
        teal:       { DEFAULT: "#0096AA", mid: "#188CB2", navy: "#005679" },

        // Wood / neutrals
        bark:       { DEFAULT: "#26190E", deep: "#3D2B14" },
        wood:       { DEFAULT: "#7A4120", warm: "#A35817", light: "#CC813B" },
        rust:       "#6F3C30",
        clay:       "#8F6254",
        apricot:    "#ED8E42",
        sand:       { DEFAULT: "#BE9A64", light: "#DDC58A" },

        // Paper & surfaces
        cream:      "#FFF8EC",
        bone:       "#F5EDDB",
        paper:      { DEFAULT: "#FAF2DE", edge: "#E8DCC0" },
        ink:        "#1A0E05",

        // Semantic
        fg: {
          1: "#1A0E05",
          2: "#4A3826",
          3: "#7A6B55",
          inverse: "#FFF8EC",
        },
        status: {
          ahead:   "#448629",
          onpace:  "#72BB32",
          behind:  "#B83410",
          warn:    "#D89A12",
          neutral: "#7A6B55",
        },
      },
      fontFamily: {
        display:  ['"Rugfish"', '"Bagel Fat One"', '"Lilita One"', "system-ui", "sans-serif"],
        headline: ['"Nunito"', '"Helvetica Neue"', "system-ui", "sans-serif"],
        sans:     ['"Nunito"', '"Helvetica Neue"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        "1": "4px",
        "2": "8px",
        "3": "14px",
        "4": "22px",
        "badge": "32px",
        "card":  "18px",
      },
      boxShadow: {
        "sh-1": "0 1px 0 rgba(26,14,5,.06), 0 2px 6px rgba(26,14,5,.05)",
        "sh-2": "0 4px 14px rgba(26,14,5,.10), 0 1px 0 rgba(26,14,5,.04)",
        "sh-3": "0 14px 40px rgba(26,14,5,.16), 0 2px 6px rgba(26,14,5,.06)",
        "badge": "0 6px 0 rgba(26,14,5,.18), 0 16px 32px rgba(26,14,5,.22)",
        "keyline": "0 0 0 3px #1A0E05, 0 0 0 6px #E9E71D",
      },
      letterSpacing: {
        ribbon: "0.18em",
      },
      transitionTimingFunction: {
        "out-brand":   "cubic-bezier(.2,.7,.2,1)",
        "bounce-brand":"cubic-bezier(.34,1.56,.64,1)",
      },
    },
  },
  plugins: [],
};

export default config;
