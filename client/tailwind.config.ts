import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        saffron: {
          50: '#fff8f0',
          100: '#feeddb',
          200: '#fdd3b3',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        govBlue: {
          50: '#f0f5fa',
          100: '#e1ecf5',
          600: '#1e40af',
          700: '#1d4ed8',
          800: '#1e3a8a',
          900: '#0f172a',
        },
      },
    },
  },
  plugins: [],
};

export default config;
