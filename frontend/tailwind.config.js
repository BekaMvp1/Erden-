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
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
      },
      borderRadius: {
        card: '24px',
        chip: '999px',
        btn: '16px',
      },
      boxShadow: {
        outer: '0 18px 60px rgba(0,0,0,.55)',
        soft: 'inset 0 1px 0 rgba(255,255,255,.04), inset 0 -20px 60px rgba(0,0,0,.6)',
        neon: '0 0 0 1px rgba(107,175,0,.3), 0 0 20px rgba(107,175,0,.1)',
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
        neon: {
          bg: 'var(--bg)',
          bg2: 'var(--bg2)',
          surface: 'var(--surface)',
          surface2: 'var(--surface2)',
          text: 'var(--text)',
          muted: 'var(--muted)',
          border: 'var(--border)',
          accent: 'var(--accent)',
          accent2: 'var(--accent2)',
          danger: 'var(--danger)',
          warn: 'var(--warn)',
          success: 'var(--success)',
        },
        primary: {
          400: 'var(--color-primary-400)',
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
