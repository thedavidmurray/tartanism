/*
 * native/app-urlopen.js — Capacitor Universal Link / App Clip listener.
 *
 * Wires App.addListener('appUrlOpen') + App.getLaunchUrl() into the existing
 * genome/deeplink.js parser so an installed user tapping a Tartanism share
 * link reconstructs the litter in-app.
 *
 * Called once from ui/app.js boot(). No TypeScript — this directory is plain
 * ES modules compiled by Vite like the rest of app/src.
 */
import { parseHash } from '../genome/deeplink.js';

export async function initAppUrlOpen({ onLitter, toast }) {
  let initialized = false;

  // Safely import Capacitor — no-ops gracefully in browser dev (no native runtime)
  let App;
  try {
    const cap = await import('@capacitor/app');
    App = cap.App;
  } catch {
    // Not running in Capacitor — browser dev / web build. Silent pass.
    return;
  }

  // Shared handler: given a URL string, extract the g= fragment and route it.
  function routeUrl(urlStr) {
    try {
      const url = new URL(urlStr);
      // Universal Links deliver the full URL. The fragment contains the payload:
      // https://tartanism.app/b#g=PAYLOAD
      const hashLike = url.hash || ('/' + url.pathname);
      const parsed = parseHash(hashLike);
      if (parsed) {
        // Clear fragment so back-navigation stays clean
        if (typeof history !== 'undefined') {
          history.replaceState(null, '', url.pathname + url.search);
        }
        onLitter(parsed.descriptor, parsed.litter);
        toast?.('Open link — ready to breed from shared sett');
        return true;
      }
    } catch {
      // Malformed invocation — never let appUrlOpen crash cold start
    }
    return false;
  }

  // 1) Listen for future opens (app backgrounded → re-opened via link)
  App.addListener('appUrlOpen', (event) => {
    routeUrl(event.url);
  });

  // 2) Cold-start from a link: Capacitor populates getLaunchUrl() once.
  try {
    const launch = await App.getLaunchUrl();
    if (launch && launch.url) {
      routeUrl(launch.url);
    }
  } catch {
    // Some Capacitor versions throw if no launch URL — swallow
  }

  initialized = true;
}
