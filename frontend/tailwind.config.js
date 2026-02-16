/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,css}",
  ],
  safelist: [
    { pattern: /(bg|text|border|from|to)-(accent|theme)-(1|2|3|text|bg)(\/\d+)?/ },
  ],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      transitionDuration: {
        '250': '250ms',
      },
      colors: {
        primary: {
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
        },
        accent: {
          1: '#84934A',
          2: '#656D3F',
          3: '#492828',
        },
        dark: {
          1: '#000B58',
          2: '#003161',
          3: '#006A67',
          text: '#FDEB9E',
          800: '#003161',
          900: '#000B58',
          950: '#000610',
        },
      },
    },
  },
  plugins: [],
}
