import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// NetCarve is a local-first extension: the manifest asks for `storage` and
// `contextMenus` and nothing else (NFR-PERM-01), and no code in the bundle
// performs a network request (NFR-PERM-02).
export default defineConfig({
  manifest: {
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
  }),
});
