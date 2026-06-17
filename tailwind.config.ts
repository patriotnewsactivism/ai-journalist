import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          dark: "#0a0a0f",
          panel: "#111118",
          card: "#16161f",
          border: "#252535",
          accent: "#e8b84b",
          red: "#cc2936",
          blue: "#1a6bff",
          text: "#e8e8f0",
          muted: "#6b6b85",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["'Playfair Display'", "Georgia", "serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "recording": "recording 1.2s ease-in-out infinite",
        "avatar-breathe": "avatarBreathe 4s ease-in-out infinite",
        "lips-move": "lipsMove 0.15s ease-in-out infinite",
        "scan": "scan 2s linear infinite",
      },
      keyframes: {
        recording: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.15)", opacity: "0.7" },
        },
        avatarBreathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
        lipsMove: {
          "0%, 100%": { transform: "scaleY(1)" },
          "50%": { transform: "scaleY(0.4)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
