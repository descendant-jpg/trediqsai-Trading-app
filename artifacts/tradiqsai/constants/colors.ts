/**
 * TradiQs AI — semantic design tokens.
 *
 * Strict palette for the gamified trading terminal:
 * - Terminal Black background, panel surfaces, Electric Cyan AI accent,
 *   Neon Purple pro tier, Muted Mint (buy/profit), Muted Crimson (sell/loss).
 *
 * The app is dark-only by design; both schemes resolve to the same tokens.
 */

const palette = {
  // Legacy aliases (kept for backward compatibility)
  text: '#FFFFFF',
  tint: '#00F0FF',

  // Core surfaces
  background: '#0A0B0E',
  foreground: '#FFFFFF',

  // Cards / elevated surfaces
  card: '#16181D',
  cardForeground: '#FFFFFF',

  // Primary action color (AI accent — Electric Cyan)
  primary: '#00F0FF',
  primaryForeground: '#0A0B0E',

  // Secondary / less-emphasis interactive surfaces (Pro tier — Neon Purple)
  secondary: '#B026FF',
  secondaryForeground: '#FFFFFF',

  // Muted / subdued elements (dividers, timestamps, placeholders)
  muted: '#16181D',
  mutedForeground: '#8A8D93',

  // Accent highlights
  accent: '#00F0FF',
  accentForeground: '#0A0B0E',

  // Destructive actions / losses (Muted Crimson)
  destructive: '#E54B4B',
  destructiveForeground: '#FFFFFF',

  // Success / buys / profits (Muted Mint)
  success: '#2ECA8B',
  successForeground: '#0A0B0E',

  // Borders and input outlines
  border: '#22252A',
  input: '#22252A',
};

const colors = {
  light: palette,
  dark: palette,

  // Border radius (in px) for cards, buttons, inputs, and modals.
  radius: 16,
};

export default colors;
