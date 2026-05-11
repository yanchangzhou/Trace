import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm Productivity Palette — light uses CSS vars for consistency, dark uses them for theming
        background: {
          light: 'rgb(var(--tw-bg-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--tw-bg-dark-rgb) / <alpha-value>)',
        },
        card: {
          light: 'rgb(var(--tw-card-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--tw-card-dark-rgb) / <alpha-value>)',
        },
        surface: {
          light: 'rgb(var(--tw-surface-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--tw-surface-dark-rgb) / <alpha-value>)',
        },
        border: {
          light: 'rgb(var(--tw-border-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--tw-border-dark-rgb) / <alpha-value>)',
        },
        text: {
          primary: {
            light: 'rgb(var(--tw-text-primary-light-rgb) / <alpha-value>)',
            dark: 'rgb(var(--tw-text-primary-dark-rgb) / <alpha-value>)',
          },
          secondary: {
            light: 'rgb(var(--tw-text-secondary-light-rgb) / <alpha-value>)',
            dark: 'rgb(var(--tw-text-secondary-dark-rgb) / <alpha-value>)',
          },
          tertiary: {
            light: 'rgb(var(--tw-text-tertiary-light-rgb) / <alpha-value>)',
            dark: 'rgb(var(--tw-text-tertiary-dark-rgb) / <alpha-value>)',
          },
        },
        accent: {
          warm: 'rgb(var(--tw-accent-warm-rgb) / <alpha-value>)',
          cool: 'rgb(var(--tw-accent-cool-rgb) / <alpha-value>)',
          primary: 'rgb(var(--tw-accent-primary-rgb) / <alpha-value>)',
        },
        icon: {
          inactive: 'rgb(var(--tw-icon-inactive-rgb) / <alpha-value>)',
          active: 'rgb(var(--tw-icon-active-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      letterSpacing: {
        tighter: '-0.02em',
        tight: '-0.01em',
      },
      borderRadius: {
        'squircle': '24px',      // Super-ellipse radius
        'squircle-sm': '16px',
        'squircle-lg': '32px',
      },
      boxShadow: {
        'ambient': '0 2px 16px rgba(0, 0, 0, 0.04), 0 1px 4px rgba(0, 0, 0, 0.02)',
        'ambient-lg': '0 8px 32px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03)',
        'ambient-dark': '0 2px 16px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2)',
        'ambient-lg-dark': '0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'spring-in': 'spring-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        'spring-in': {
          '0%': { 
            opacity: '0',
            transform: 'scale(0.95) translateY(10px)',
          },
          '100%': { 
            opacity: '1',
            transform: 'scale(1) translateY(0)',
          },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
