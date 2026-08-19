import { useEffect, useState } from 'preact/hooks';
import { removeValue, STORAGE_KEYS } from '@/src/lib/storage/store';
import { strings } from '@/src/strings';
import { AppFooter } from '@/src/ui/components/AppFooter';
import { Toast, type ToastMessage } from '@/src/ui/components/Toast';
import { consumeQueryParam, navigate, useRoute, type RouteName } from '@/src/ui/router';
import { useSettings } from '@/src/ui/theme';
import { Calculator } from '@/src/ui/views/Calculator';
import { SettingsView } from '@/src/ui/views/Settings';

interface AppProps {
  version: string;
}

/** Nav entries, in the order they appear in the rail. */
const NAV: ReadonlyArray<{ name: RouteName; path: string; label: string }> = [
  { name: 'calc', path: '/calc', label: strings.nav.calculator },
  { name: 'settings', path: '/settings', label: strings.nav.settings },
];

export function App({ version }: AppProps) {
  const route = useRoute();
  const settings = useSettings();
  const [calcInput, setCalcInput] = useState('');
  const [toast, setToast] = useState<ToastMessage | undefined>();

  // FR-CTX-02/04: the context menu hands the selection over as ?q, which is read once and
  // then wiped from the URL so a refresh does not re-trigger it.
  useEffect(() => {
    if (route.name !== 'calc') return;
    const query = consumeQueryParam(route, 'q');
    if (query !== undefined && query !== '') setCalcInput(query);
  }, [route]);

  const notify = (text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone });
  };

  return (
    <div class="nc-shell">
      <header class="nc-shell__head">
        <a class="nc-wordmark" href="#/calc">
          <span class="nc-wordmark__name">{strings.app.name}</span>
          <span class="nc-wordmark__tagline">{strings.app.tagline}</span>
        </a>
        <nav class="nc-nav" aria-label={strings.app.name}>
          {NAV.map((entry) => (
            <a
              key={entry.name}
              class={`nc-nav__link${route.name === entry.name ? ' is-current' : ''}`}
              href={`#${entry.path}`}
              aria-current={route.name === entry.name ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(entry.path);
              }}
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </header>

      <main class="nc-shell__body">
        {route.name === 'settings' ? (
          <SettingsView
            handle={settings}
            version={version}
            onExportAll={() => notify(strings.settings.exportAll)}
            onDeleteAll={async () => {
              await Promise.all([
                removeValue(STORAGE_KEYS.projects),
                removeValue(STORAGE_KEYS.settings),
                removeValue(STORAGE_KEYS.calcLast),
              ]);
              settings.update({
                theme: 'auto',
                allowSlash31: false,
                exportFooter: true,
                defaultCopyFormat: 'markdown',
              });
            }}
          />
        ) : (
          <div class="nc-stack">
            <h1 class="nc-title">{strings.calc.title}</h1>
            <section class="nc-panel nc-section">
              <Calculator
                value={calcInput}
                onChange={setCalcInput}
                exportFooter={settings.settings.exportFooter}
              />
            </section>
          </div>
        )}
      </main>

      <AppFooter version={version} />
      <Toast message={toast} onDismiss={() => setToast(undefined)} />
    </div>
  );
}
