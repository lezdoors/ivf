/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        sand: '#F9F8F6',
        espresso: '#2C2A29',
        taupe: {
          400: '#A79E93',
          500: '#8B8178',
          600: '#6B6259',
        },
        terracotta: {
          50: '#F6ECE6',
          100: '#F0DED4',
          400: '#C98868',
          500: '#B8735A',
          600: '#9C5D47',
        },
        line: '#EAE5DD',
      },
    },
  },
  plugins: [],
};
