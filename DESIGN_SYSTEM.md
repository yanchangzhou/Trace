# Trace Design System
## "Warm Productivity" Aesthetic

Inspired by Starbucks' warm, inviting atmosphere and Google's clean, functional design.

---

## 🎨 Color Palette

### Light Mode
```css
Background: #F7F5F2  /* Starbucks Cream - warm, inviting base */
Card:       #FFFFFF  /* Pure white cards with soft shadows */
Surface:    #FEFEFE  /* Subtle surface variation */
Border:     #E8E6E3  /* Barely-there borders */
```

### Dark Mode
```css
Background: #121212  /* Deep charcoal, not pure black */
Card:       #1E1E1E  /* Elevated surfaces */
Surface:    #252525  /* Interactive surfaces */
Border:     #2A2A2A  /* Subtle separation */
```

### Text Hierarchy
```css
Primary:   #1A1A1A / #F5F5F5  /* Main content */
Secondary: #6B6B6B / #A0A0A0  /* Supporting text */
Tertiary:  #9B9B9B / #707070  /* Metadata, labels */
```

### Accent Colors
```css
Warm:    #D4A574  /* Warm gold - primary actions */
Cool:    #7B9EA8  /* Soft teal - secondary actions */
Primary: #2D5F7E  /* Deep blue - CTAs */
```

---

## 📐 Spacing & Layout

### Grid System
- **Source Rail**: 280px (collapsible to 64px)
- **Canvas**: Fluid, max-width 4xl (896px)
- **Title Bar**: 48px height
- **Padding**: 16px, 24px, 32px increments

### Border Radius (Squircle)
```css
sm:  16px  /* Small cards, buttons */
md:  24px  /* Default cards */
lg:  32px  /* Large containers */
```

---

## 🔤 Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
```

### Letter Spacing
```css
tracking-tighter: -0.02em  /* Premium, tight spacing */
tracking-tight:   -0.01em  /* Headings */
```

### Font Smoothing
```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

---

## 🌊 Shadows (Ambient)

### Light Mode
```css
ambient:    0 2px 16px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.02)
ambient-lg: 0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)
```

### Dark Mode
```css
ambient:    0 2px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2)
ambient-lg: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)
```

**Philosophy**: Soft, ambient shadows that suggest depth without harsh edges.

---

## 🎭 Animation

### Spring Configuration
```typescript
{
  type: 'spring',
  stiffness: 260,
  damping: 20
}
```

### Keyframes
```css
spring-in: Scale + translateY with spring easing
fade-in:   Simple opacity transition
```

### Usage
- **Entry animations**: 0.4s spring
- **Hover states**: 0.2s ease
- **Micro-interactions**: 0.15s ease

---

## 🧩 Component Patterns

### Source Rail Cards
- **Grid**: 2 columns when expanded
- **Aspect ratio**: 1:1 (square)
- **Hover**: Scale 1.03, translateY -2px
- **Shadow**: Ambient → Ambient-lg on hover

### Canvas Toolbar
- **Position**: Sticky, floating
- **Background**: Card with backdrop-blur
- **Buttons**: 32px × 32px, rounded-lg
- **Separator**: 1px divider between groups

### Title Bar
- **Height**: 48px
- **Drag region**: Full width except buttons
- **Controls**: Minimize, Maximize, Close
- **Style**: Translucent with backdrop blur

---

## 🎯 Design Principles

1. **Warmth over Sterility**
   - Use cream (#F7F5F2) instead of pure white
   - Soft shadows, no harsh borders
   - Warm accent colors

2. **Clarity over Complexity**
   - Generous whitespace
   - Clear visual hierarchy
   - Minimal UI chrome

3. **Delight in Details**
   - Spring animations (stiffness: 260, damping: 20)
   - Subtle hover states
   - Smooth transitions

4. **Functional Beauty**
   - Every element serves a purpose
   - Form follows function
   - No decoration for decoration's sake

---

## 🔧 Implementation

### Tailwind Classes
```tsx
// Card
className="bg-card-light dark:bg-card-dark rounded-squircle shadow-ambient"

// Button
className="px-6 py-2 rounded-squircle bg-accent-primary text-white"

// Text
className="text-text-primary-light dark:text-text-primary-dark tracking-tighter"
```

### Framer Motion
```tsx
<motion.div
  initial={{ y: 20, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
>
```

---

## 📱 Responsive Behavior

- **Desktop**: Full layout with Source Rail + Canvas
- **Tablet**: Collapsible Source Rail
- **Mobile**: Stack layout (future consideration)

---

## 🌓 Dark Mode

- Automatic system preference detection
- Manual toggle available
- All colors have dark mode variants
- Shadows adjusted for dark backgrounds

---

## ✨ Accessibility

- WCAG AA contrast ratios
- Keyboard navigation support
- Focus indicators
- Screen reader friendly
- Reduced motion support (future)

---

## 🎨 Inspiration Sources

- **Starbucks**: Warm color palette, card-based layouts
- **Google Docs**: Clean canvas, floating toolbar
- **Linear**: Smooth animations, modern UI
- **Notion**: Flexible content blocks
- **Arc Browser**: Sidebar navigation, squircle design
