import motionPlugin from './tailwind/motionPlugin.js';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Valores definidos en src/index.css (tema oscuro y claro)
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          hover: 'rgb(var(--c-surface-2) / <alpha-value>)',
          2: 'rgb(var(--c-surface-2) / <alpha-value>)',
          3: 'rgb(var(--c-surface-3) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--c-border) / <alpha-value>)',
          light: 'rgb(var(--c-border-light) / <alpha-value>)',
          active: 'rgb(var(--c-border-active) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--c-text) / <alpha-value>)',
          primary: 'rgb(var(--c-text) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
          dim: 'rgb(var(--c-text-dim) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          hover: 'rgb(var(--c-primary-hover) / <alpha-value>)',
          light: 'rgb(var(--c-primary-light) / <alpha-value>)',
          soft: 'rgb(var(--c-primary) / 0.15)',
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
          soft: 'rgb(var(--c-accent) / 0.15)',
        },
        success: {
          DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
          soft: 'rgb(var(--c-success) / 0.15)',
        },
        warning: {
          DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
          soft: 'rgb(var(--c-warning) / 0.15)',
        },
        danger: {
          DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
          soft: 'rgb(var(--c-danger) / 0.15)',
        },
      },
      fontFamily: {
        serif: ['Newsreader', 'Fraunces', 'Georgia', 'serif'],
        brand: ['Newsreader', 'Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'Geist', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'morph-radius': { '0%, 100%': { borderRadius: '6%' }, '50%': { borderRadius: '50%' } },
        'morph-rotate': { '0%': { transform: 'rotate(0deg)' }, '25%': { transform: 'rotate(90deg)' }, '50%': { transform: 'rotate(180deg)' }, '75%': { transform: 'rotate(270deg)' }, '100%': { transform: 'rotate(360deg)' } },
      },
      animation: {
        // Morphing Square: los dos movimientos corren a la par y se repiten sin cortes
        'morph-square': 'morph-radius 2.5s ease-in-out infinite, morph-rotate 2.5s ease-in-out infinite',
      },
      borderRadius: {
        xl: '12px',
        lg: '10px',
        md: '8px',
        sm: '6px',
      },
    },
  },
  plugins: [motionPlugin],
};
