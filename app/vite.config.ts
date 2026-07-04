import { defineConfig } from 'vite';

// Vanilla-JS build → static bundle → Capacitor iOS wraps `dist/` in a WKWebView.
// The engine + genome + store layers are zero-dependency ES modules; nothing here
// needs a framework plugin.
export default defineConfig({
  base: './',                 // relative asset paths: works from file:// (WKWebView) and any host path
  // the app uses no PostCSS/Tailwind — stop Vite discovering the PARENT repo's
  // postcss.config.js/tailwind.config.js upward (standing build warnings + an
  // accidental CSS-pipeline entanglement with the deprecated React app).
  css: { postcss: {} },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
