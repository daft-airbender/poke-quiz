// Turns a Pokémon's two colors (accent first, from data/pokemon-palettes.json) into the app's CSS color tokens.
// Pure functions, no DOM: test/themeColors.test.js checks every palette for readable contrast.
//
//   --accent       the Pokémon's main color, used as a fill (buttons, progress bar, toggles). Mid-tone
//                  colors that neither white nor dark text can read on are darkened slightly.
//   --accent-text  near-black if it reads on --accent, else white
//   --accent-ink   the main color darkened (light mode) or lightened (dark mode) until it's readable
//                  as text or a border on cards and backgrounds (brand, links, selected outlines)
//   --accent-soft  the second color, faded almost into the card: selected-item backgrounds
//   --bg           the page background, faintly tinted with the second color

// Base surfaces before any theme tint, per color scheme (styles.css's card and text; --bg is themed).
export const SURFACES = {
  light: { card: '#ffffff', bg: '#f3f4f8', text: '#1d1f27' },
  dark: { card: '#1e2129', bg: '#14161c', text: '#eceef3' },
};

const DARK_TEXT = '#14161c';
const WHITE = '#ffffff';
// WCAG AA for normal text.
export const MIN_CONTRAST = 4.5;

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

// Relative luminance and contrast ratio, as defined by WCAG 2.
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// a weighted toward b: amount 0 = a, 1 = b.
function mix(a, b, amount) {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  return toHex(ra.map((c, i) => c + (rb[i] - c) * amount));
}

// Step toward black (or white) until the color reaches MIN_CONTRAST against every given surface.
function readableOn(color, surfaces, towardWhite) {
  const target = towardWhite ? WHITE : '#000000';
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, target, step / 20);
    if (surfaces.every((surface) => contrast(candidate, surface) >= MIN_CONTRAST)) return candidate;
  }
  return target;
}

// The fill color and the text color to put on it. Dark text if it reads, else white, darkening the fill
// just enough when even white falls short (mid-tone reds and oranges like Charizard's).
function fillWithText(color) {
  if (contrast(color, DARK_TEXT) >= MIN_CONTRAST) return { fill: color, text: DARK_TEXT };
  return { fill: readableOn(color, [WHITE], false), text: WHITE };
}

// CSS variables for one palette in one color scheme ('light' | 'dark').
export function themeVariables(colors, scheme) {
  const { card, bg } = SURFACES[scheme];
  const [main, second] = colors;
  const dark = scheme === 'dark';
  const { fill: accent, text: accentText } = fillWithText(main);

  const soft = mix(second, card, dark ? 0.78 : 0.85);
  const tintedBg = mix(second, bg, dark ? 0.9 : 0.88);
  return {
    '--accent': accent,
    '--accent-text': accentText,
    '--accent-ink': readableOn(main, [card, tintedBg, soft], dark),
    '--accent-soft': soft,
    '--bg': tintedBg,
  };
}
