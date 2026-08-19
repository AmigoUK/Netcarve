import { strings } from '../../strings';

interface AppFooterProps {
  version: string;
}

/**
 * The attv.uk credit line. It sits on every full-page app route; the popup links to the app
 * instead, where the viewport can carry it (DECISIONS.md D8).
 */
export function AppFooter({ version }: AppFooterProps) {
  const { footer } = strings;
  return (
    <footer class="nc-credit">
      <a href={`mailto:${footer.email}`}>{footer.email}</a>
      <span class="nc-credit__dot" aria-hidden="true">
        ·
      </span>
      <span>{footer.credit}</span>
      <span class="nc-credit__dot" aria-hidden="true">
        ·
      </span>
      <a href={footer.siteUrl} target="_blank" rel="noreferrer">
        {footer.site}
      </a>
      <span class="nc-credit__dot" aria-hidden="true">
        ·
      </span>
      <a href={footer.repoUrl} target="_blank" rel="noreferrer">
        {footer.repo}
      </a>
      <span class="nc-credit__dot" aria-hidden="true">
        ·
      </span>
      <span class="nc-mono">{strings.app.version(version)}</span>
    </footer>
  );
}
