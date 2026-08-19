import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// NetCarve is a local-first extension: the manifest asks for `storage` and
// `contextMenus` and nothing else (NFR-PERM-01), and no code in the bundle
// performs a network request (NFR-PERM-02).
export default defineConfig({
  manifest: {
    version: pkg.version,
    name: 'NetCarve — subnet calculator & address planner',
    short_name: 'NetCarve',
    description:
      'Calculates and plans IPv4/IPv6 subnetting entirely on-device: quick calculator, visual planner, VLSM solver and conflict checker.',
    permissions: ['storage', 'contextMenus'],
    author: { email: 'dev@attv.uk' },
    homepage_url: 'https://www.attv.uk',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      96: '/icon/96.png',
      128: '/icon/128.png',
    },
    action: {
      default_title: 'NetCarve',
    },
  },
  vite: () => ({
    plugins: [preact()],
    define: {
      // The version is shown in the popup header and the app footer.
      __NETCARVE_VERSION__: JSON.stringify(pkg.version),
    },
  }),
});
