/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        un: {
          blue: '#009edb',
          'blue-dark': '#003d7a',
          grey: '#4a5568',
          'grey-light': '#718096',
          'grey-lighter': '#e2e8f0',
          slate: '#334155',
          'slate-light': '#64748b',
        },
      },
    },
  },
  plugins: [],
};
