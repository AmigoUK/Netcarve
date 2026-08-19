import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs TypeScript under Vitest with a DOM available', () => {
    const el: HTMLDivElement = document.createElement('div');
    el.textContent = 'NetCarve';
    expect(el.textContent).toBe('NetCarve');
  });
});
