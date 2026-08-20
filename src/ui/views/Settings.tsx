import { useState } from 'preact/hooks';
import { MAX_LEAVES_PER_ROOT } from '../../lib/plan/limits';
import type { CopyFormat, ThemePreference } from '../../lib/storage/settings';
import { strings } from '../../strings';
import type { SettingsHandle } from '../theme';

interface SettingsViewProps {
  handle: SettingsHandle;
  version: string;
  /** Downloads every project as one JSON file (FR-STOR-03). */
  onExportAll: () => void;
  /** Clears every NetCarve key from this browser profile. */
  onDeleteAll: () => Promise<void>;
}

const THEME_OPTIONS: ReadonlyArray<[ThemePreference, string]> = [
  ['auto', strings.settings.themeAuto],
  ['light', strings.settings.themeLight],
  ['dark', strings.settings.themeDark],
];

const COPY_OPTIONS: ReadonlyArray<[CopyFormat, string]> = [
  ['markdown', strings.settings.copyMarkdown],
  ['plain', strings.settings.copyPlain],
];

const repo = strings.footer.repoUrl;

/** One labelled link in the About list. */
function AboutLink({ label, href, text }: { label: string; href: string; text: string }) {
  return (
    <div class="nc-values__row">
      <dt class="nc-label">{label}</dt>
      <dd>
        <a href={href} target="_blank" rel="noreferrer">
          {text}
        </a>
      </dd>
    </div>
  );
}

export function SettingsView({ handle, version, onExportAll, onDeleteAll }: SettingsViewProps) {
  const { settings, update } = handle;
  const [confirmation, setConfirmation] = useState('');
  const [deleted, setDeleted] = useState(false);
  const canDelete = confirmation === strings.settings.deleteAllConfirmWord;

  return (
    <div class="nc-stack">
      <h1 class="nc-title">{strings.settings.title}</h1>

      <section class="nc-panel nc-section">
        <fieldset class="nc-fieldset">
          <legend class="nc-label">{strings.settings.theme}</legend>
          <div class="nc-radios">
            {THEME_OPTIONS.map(([value, label]) => (
              <label class="nc-radio" key={value}>
                <input
                  type="radio"
                  name="nc-theme"
                  value={value}
                  checked={settings.theme === value}
                  onChange={() => update({ theme: value })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label class="nc-toggle">
          <input
            type="checkbox"
            checked={settings.allowSlash31}
            onChange={(event) =>
              update({ allowSlash31: (event.currentTarget as HTMLInputElement).checked })
            }
          />
          <span>
            <span class="nc-toggle__label">{strings.settings.allowSlash31}</span>
            <span class="nc-toggle__hint">{strings.settings.allowSlash31Hint}</span>
          </span>
        </label>

        <label class="nc-toggle">
          <input
            type="checkbox"
            checked={settings.exportFooter}
            onChange={(event) =>
              update({ exportFooter: (event.currentTarget as HTMLInputElement).checked })
            }
          />
          <span>
            <span class="nc-toggle__label">{strings.settings.exportFooter}</span>
            <span class="nc-toggle__hint">{strings.exports.footer}</span>
          </span>
        </label>

        <label class="nc-field nc-field--inline">
          <span class="nc-label">{strings.settings.defaultCopyFormat}</span>
          <select
            class="nc-select"
            value={settings.defaultCopyFormat}
            onChange={(event) =>
              update({
                defaultCopyFormat: (event.currentTarget as HTMLSelectElement).value as CopyFormat,
              })
            }
          >
            {COPY_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <p class="nc-hint">{strings.settings.plannerLimit(MAX_LEAVES_PER_ROOT)}</p>
      </section>

      <section class="nc-panel nc-section">
        <h2 class="nc-subtitle">{strings.settings.dataTitle}</h2>
        <p class="nc-hint">{strings.settings.dataNote}</p>

        <div class="nc-row">
          <button type="button" class="nc-button" onClick={onExportAll}>
            {strings.settings.exportAll}
          </button>
        </div>

        <div class="nc-danger-zone">
          <label class="nc-field">
            <span class="nc-label">{strings.settings.deleteAllPrompt}</span>
            <input
              class="nc-input nc-input--small nc-mono"
              type="text"
              value={confirmation}
              autocomplete="off"
              onInput={(event) =>
                setConfirmation((event.currentTarget as HTMLInputElement).value)
              }
            />
          </label>
          <button
            type="button"
            class="nc-button nc-button--danger"
            disabled={!canDelete}
            onClick={() => {
              void onDeleteAll().then(() => {
                setConfirmation('');
                setDeleted(true);
              });
            }}
          >
            {strings.settings.deleteAll}
          </button>
          {deleted && <p class="nc-hint nc-hint--success">{strings.settings.deleteAllDone}</p>}
        </div>
      </section>

      <section class="nc-panel nc-section">
        <h2 class="nc-subtitle">{strings.settings.aboutTitle}</h2>
        <p class="nc-hint">
          {strings.app.name} <span class="nc-mono">{strings.app.version(version)}</span> —{' '}
          {strings.app.tagline}
        </p>

        {/* The release link points at the tag this build came from, so a bug report can name
            the exact version without anyone having to work out what they are running. */}
        <dl class="nc-values">
          <AboutLink
            label={strings.settings.about.source}
            href={repo}
            text="AmigoUK/Netcarve"
          />
          <AboutLink
            label={strings.settings.about.release}
            href={`${repo}/releases/tag/v${version}`}
            text={strings.settings.about.releaseValue(version)}
          />
          <AboutLink
            label={strings.settings.about.changelog}
            href={`${repo}/blob/v${version}/CHANGELOG.md`}
            text="CHANGELOG.md"
          />
          <AboutLink
            label={strings.settings.about.issues}
            href={`${repo}/issues/new`}
            text={strings.settings.about.issuesValue}
          />
          <AboutLink
            label={strings.settings.about.licence}
            href={`${repo}/blob/v${version}/LICENSE`}
            text={strings.settings.about.licenceValue}
          />
          <div class="nc-values__row">
            <dt class="nc-label">{strings.settings.about.builtBy}</dt>
            <dd>
              <a href={strings.footer.siteUrl} target="_blank" rel="noreferrer">
                {strings.footer.site}
              </a>{' '}
              · <a href={`mailto:${strings.footer.email}`}>{strings.footer.email}</a>
            </dd>
          </div>
        </dl>

        <p class="nc-hint">{strings.footer.credit}</p>
      </section>
    </div>
  );
}
