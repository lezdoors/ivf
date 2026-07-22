/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // "Burano" register — fuchsia wall, viridian shutters, lace white.
        // Seeds FE77FE + 77DD77 refined to AA-verified tones (see git history
        // for the espresso/terracotta "quiet luxury" set this replaced).
        sand: '#FCF7FA',
        espresso: '#1E3B31',
        taupe: {
          400: '#7E948A',
          500: '#5C6E65',
          600: '#46564E',
        },
        terracotta: {
          50: '#FBEBF8',
          100: '#F7DCF3',
          400: '#D95FCB',
          500: '#B93AAC',
          600: '#9C2B91',
        },
        raspberry: {
          50: '#FAE9F3',
          100: '#F5D7E9',
          400: '#CC4FA9',
          500: '#B02D93',
          600: '#93267C',
        },
        sage: {
          50: '#EAF7EE',
          100: '#D8F0DE',
          400: '#77DD77',
          500: '#35804D',
          600: '#2E7044',
        },
        line: '#F0E3EC',
      },
    },
  },
  plugins: [],
};
