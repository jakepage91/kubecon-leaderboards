/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      animation: {
        "glow-pulse": "glow-pulse 1s ease-in-out infinite alternate",
      },
      keyframes: {
        "glow-pulse": {
          "0%": { boxShadow: "0 0 8px 2px rgba(255, 215, 0, 0.4)" },
          "100%": { boxShadow: "0 0 20px 6px rgba(255, 215, 0, 0.8)" },
        },
      },
    },
  },
  plugins: [],
};
