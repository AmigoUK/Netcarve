import { installContextMenu, type BackgroundApi } from '@/src/lib/menu';

/**
 * The service worker does exactly one job: register the "Analyse …" context-menu item and
 * open the calculator when it is clicked (F6). No listeners beyond that, no network, no
 * storage writes.
 */
export default defineBackground(() => {
  installContextMenu((globalThis as unknown as { chrome: BackgroundApi }).chrome);
});
