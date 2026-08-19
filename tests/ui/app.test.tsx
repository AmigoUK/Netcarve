import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/app/App';
import { setStorageArea, STORAGE_KEYS, storageArea } from '@/src/lib/storage/store';
import { applyTheme } from '@/src/ui/theme';

function memoryArea(seed: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(seed));
  return {
    data,
    async get(key: string) {
      return data.get(key);
    },
    async set(key: string, value: unknown) {
      data.set(key, value);
    },
    async remove(key: string) {
      data.delete(key);
    },
  };
}

let area: ReturnType<typeof memoryArea>;

beforeEach(() => {
  area = memoryArea();
  setStorageArea(area);
  globalThis.location.hash = '';
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  setStorageArea(undefined);
  vi.restoreAllMocks();
});

describe('applyTheme', () => {
  it('stamps an explicit choice and clears it for auto', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('App shell', () => {
  it('shows the calculator by default', () => {
    render(<App version="1.2.3" />);
    expect(screen.getByRole('heading', { name: 'Quick calculator' })).toBeInTheDocument();
  });

  it('carries the credit footer and version on every page', () => {
    render(<App version="1.2.3" />);
    expect(screen.getByText("Project & Development: Tomasz 'Amigo' Lewandowski")).toBeInTheDocument();
    expect(screen.getByText('dev@attv.uk')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('navigates to settings', async () => {
    render(<App version="1.2.3" />);
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('reads ?q once and cleans the URL (FR-CTX-02/04)', async () => {
    globalThis.location.hash = '#/calc?q=10.20.0.0%2F16';
    render(<App version="1.2.3" />);

    await waitFor(() => expect(screen.getByDisplayValue('10.20.0.0/16')).toBeInTheDocument());
    expect(globalThis.location.hash).toBe('#/calc');
  });

  it('shows a friendly parse error when the selection was not an address (FR-CTX-03)', async () => {
    globalThis.location.hash = '#/calc?q=not%20an%20address';
    render(<App version="1.2.3" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Settings', () => {
  it('persists a theme change and applies it', async () => {
    globalThis.location.hash = '#/settings';
    render(<App version="1.2.3" />);

    fireEvent.click(await screen.findByLabelText('Dark'));

    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
    );
    await waitFor(() =>
      expect(area.data.get(STORAGE_KEYS.settings)).toMatchObject({ theme: 'dark' }),
    );
  });

  it('toggles /31 links and the export footer', async () => {
    globalThis.location.hash = '#/settings';
    render(<App version="1.2.3" />);

    fireEvent.click(await screen.findByLabelText(/Allow \/31 for two-host links/i));
    await waitFor(() =>
      expect(area.data.get(STORAGE_KEYS.settings)).toMatchObject({ allowSlash31: true }),
    );
  });

  it('shows the planner limit as read-only information', async () => {
    globalThis.location.hash = '#/settings';
    render(<App version="1.2.3" />);
    expect(
      await screen.findByText(/A single root block can hold up to 1,024 subnets\./),
    ).toBeInTheDocument();
  });

  it('requires the word DELETE before clearing everything (FR-STOR-03)', async () => {
    globalThis.location.hash = '#/settings';
    await storageArea().set(STORAGE_KEYS.calcLast, '10.0.0.0/8');
    render(<App version="1.2.3" />);

    const button = await screen.findByRole('button', { name: 'Delete all data' });
    expect(button).toBeDisabled();

    fireEvent.input(screen.getByLabelText(/Type DELETE/i), { target: { value: 'delete' } });
    expect(button).toBeDisabled();

    fireEvent.input(screen.getByLabelText(/Type DELETE/i), { target: { value: 'DELETE' } });
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);
    await waitFor(() => expect(area.data.get(STORAGE_KEYS.calcLast)).toBeUndefined());
    expect(await screen.findByText('Everything has been removed.')).toBeInTheDocument();
  });
});
