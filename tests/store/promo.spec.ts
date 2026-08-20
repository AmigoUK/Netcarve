import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, chromium, type Browser } from '@playwright/test';

const OUT = fileURLToPath(new URL('../../docs/store/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const ICON = readFileSync(
  fileURLToPath(new URL('../../public/icon/128.png', import.meta.url)),
).toString('base64');

/**
 * The promotional tiles the store asks for. They are drawn from the same palette as the
 * extension — petrol accent on oscilloscope slate — and the block motif is the icon's, so a
 * listing card, a tile and the app all read as one thing.
 */
const PALETTE = {
  slate: '#0a1015',
  panel: '#121a21',
  ink: '#dde6ec',
  soft: '#93a8b6',
  accent: '#3fbfd6',
  blue: '#60a5fa',
  green: '#4ade80',
  amber: '#fbbf24',
  violet: '#a78bfa',
  grey: '#64748b',
};

/** The carved-block motif: one root split into named subnets. */
function motif(scale: number): string {
  const cell = (colour: string, area: string, label = '') =>
    `<div style="grid-area:${area};background:${colour};border-radius:${
      3 * scale
    }px;display:flex;align-items:flex-end;padding:${6 * scale}px;font-size:${
      10 * scale
    }px;font-weight:600;color:#0a1015;letter-spacing:.02em">${label}</div>`;

  return `<div style="
      display:grid;
      grid-template-columns:repeat(6,1fr);
      grid-template-rows:repeat(4,1fr);
      gap:${5 * scale}px;
      width:${230 * scale}px;
      height:${150 * scale}px;
      padding:${9 * scale}px;
      background:${PALETTE.panel};
      border:1px solid #24323d;
      border-radius:${8 * scale}px;
      box-shadow:0 ${18 * scale}px ${40 * scale}px rgba(0,0,0,.45);
    ">
    ${cell(PALETTE.blue, '1 / 1 / 4 / 4', 'VLAN 10')}
    ${cell(PALETTE.green, '1 / 4 / 3 / 7', 'Servers')}
    ${cell(PALETTE.amber, '3 / 4 / 5 / 6', 'Voice')}
    ${cell(PALETTE.violet, '3 / 6 / 4 / 7')}
    ${cell('#1b2731', '4 / 6 / 5 / 7')}
    ${cell('#1b2731', '4 / 1 / 5 / 4')}
  </div>`;
}

function page(body: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%}
    body{
      background:
        radial-gradient(120% 120% at 100% 0%, rgba(63,191,214,.16) 0%, transparent 55%),
        repeating-linear-gradient(0deg, rgba(147,168,182,.05) 0 1px, transparent 1px 32px),
        repeating-linear-gradient(90deg, rgba(147,168,182,.05) 0 1px, transparent 1px 32px),
        ${PALETTE.slate};
      color:${PALETTE.ink};
      font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
      display:flex; align-items:center;
      box-sizing:border-box;
    }
    .name{font-weight:700;letter-spacing:-0.02em;line-height:1}
    .tag{color:${PALETTE.soft};line-height:1.35}
    .rule{height:2px;background:${PALETTE.accent};border-radius:2px}
  </style>${body}`;
}

// The tiles are pure artwork, so they render in a plain headless browser rather than the
// extension profile — no window-size limits to work around.
let browser: Browser;
test.beforeAll(async () => {
  browser = await chromium.launch();
});
test.afterAll(async () => {
  await browser.close();
});

test.describe('Chrome Web Store promotional tiles', () => {
  test('small tile — 440 × 280', async () => {
    const tile = await browser.newPage({ viewport: { width: 440, height: 280 } });
    await tile.setContent(
      page(`<div style="padding:30px 32px;display:grid;gap:16px;align-content:center">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="data:image/png;base64,${ICON}" width="54" height="54" alt="">
          <div>
            <div class="name" style="font-size:34px">NetCarve</div>
            <div class="tag" style="font-size:13px;margin-top:6px">Subnet calculator &amp; address planner</div>
          </div>
        </div>
        <div class="rule" style="width:64px"></div>
        <div class="tag" style="font-size:15px;color:${PALETTE.ink}">
          Plan address space,<br>not just calculate it.
        </div>
        <div class="tag" style="font-size:12px">IPv4 · IPv6 · VLSM · on-device only</div>
      </div>`),
    );
    await tile.evaluate(() => document.fonts.ready);
    await tile.screenshot({ path: `${OUT}promo-small-440x280.png` });
    await tile.close();
  });

  test('marquee tile — 1400 × 560', async () => {
    const tile = await browser.newPage({ viewport: { width: 1400, height: 560 } });
    await tile.setContent(
      page(`<div style="display:grid;grid-template-columns:1fr auto;gap:80px;align-items:center;padding:0 96px;width:100%">
        <div style="display:grid;gap:24px">
          <div style="display:flex;align-items:center;gap:18px">
            <img src="data:image/png;base64,${ICON}" width="64" height="64" alt="">
            <div class="name" style="font-size:46px">NetCarve</div>
          </div>
          <div class="name" style="font-size:56px;line-height:1.08">
            Plan address space,<br>not just calculate it.
          </div>
          <div class="rule" style="width:96px"></div>
          <div class="tag" style="font-size:22px;max-width:34ch">
            Subnet calculator, visual planner, VLSM solver and conflict checker — running
            entirely on your own machine.
          </div>
          <div class="tag" style="font-size:17px;letter-spacing:.06em;text-transform:uppercase">
            Two permissions · No network requests · No accounts
          </div>
        </div>
        ${motif(1.55)}
      </div>`),
    );
    await tile.evaluate(() => document.fonts.ready);
    await tile.screenshot({ path: `${OUT}promo-marquee-1400x560.png` });
    await tile.close();
  });

  /**
   * GitHub's social preview — the card shown whenever the repository link is pasted into
   * Slack, a chat or a post. It is set through Settings → General → Social preview; there is
   * no API for it, so this only produces the file.
   *
   * GitHub crops the card on some surfaces, so nothing important sits near the edges.
   */
  test('GitHub social preview — 1280 × 640', async () => {
    const card = await browser.newPage({ viewport: { width: 1280, height: 640 } });
    await card.setContent(
      page(`<div style="display:grid;grid-template-columns:1fr auto;gap:64px;align-items:center;padding:0 88px;width:100%">
        <div style="display:grid;gap:22px">
          <div style="display:flex;align-items:center;gap:16px">
            <img src="data:image/png;base64,${ICON}" width="56" height="56" alt="">
            <div class="name" style="font-size:40px">NetCarve</div>
          </div>
          <div class="name" style="font-size:46px;line-height:1.1">
            Plan address space,<br>not just calculate it.
          </div>
          <div class="rule" style="width:84px"></div>
          <div class="tag" style="font-size:19px;max-width:36ch">
            A Chrome extension for IPv4/IPv6 subnetting, visual subnet planning, VLSM and
            conflict checking — entirely on-device.
          </div>
          <div class="tag" style="font-size:15px;letter-spacing:.06em;text-transform:uppercase">
            github.com/AmigoUK/Netcarve · MIT
          </div>
        </div>
        ${motif(1.3)}
      </div>`),
    );
    await card.evaluate(() => document.fonts.ready);
    await card.screenshot({ path: `${OUT}github-social-preview-1280x640.png` });
    await card.close();
  });
});
