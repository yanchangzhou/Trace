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
        // Warm Productivity Palette
        background: {
          light: '#F7F5F2',  // Starbucks Cream
          dark: '#121212',   // Deep charcoal
        },
        card: {
          light: '#FFFFFF',
          dark: '#1E1E1E',
        },
        surface: {
          light: '#FEFEFE',
          dark: '#252525',
        },
        border: {
          light: '#E8E6E3',
          dark: '#2A2A2A',
        },
        text: {
          primary: {
            light: '#1A1A1A',
            dark: '#F5F5F5',
          },
          secondary: {
            light: '#6B6B6B',
            dark: '#A0A0A0',
          },
          tertiary: {
            light: '#9B9B9B',
            dark: '#707070',
          },
        },
        accent: {
          warm: '#D4A574',    // Warm gold
          cool: '#7B9EA8',    // Soft teal
          primary: '#2D5F7E', // Deep blue
        },
        icon: {
          inactive: '#A09E9B', // Soft desaturated grey for collapsed icons
          active: '#D4A574',   // Warm gold for active state
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
