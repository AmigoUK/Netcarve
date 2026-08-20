import { useEffect, useState } from 'preact/hooks';
import { downloadText } from '@/src/lib/export/download';
import { projectsToJson, projectToJson } from '@/src/lib/export/json';
import { projectToMarkdown } from '@/src/lib/export/markdown';
import { projectToPlain } from '@/src/lib/export/plain';
import { projectToCsv } from '@/src/lib/export/csv';
import { findProject, upsertProject } from '@/src/lib/plan/projects';
import { removeValue, STORAGE_KEYS } from '@/src/lib/storage/store';
import { strings } from '@/src/strings';
import { AppFooter } from '@/src/ui/components/AppFooter';
import { ExportBar } from '@/src/ui/components/ExportBar';
import { ImportButton } from '@/src/ui/components/ImportButton';
import { Toast, type ToastMessage } from '@/src/ui/components/Toast';
import {
  consumeQueryParam,
  consumeQueryParams,
  navigate,
  useRoute,
  type RouteName,
} from '@/src/ui/router';
import { useProjects } from '@/src/ui/useProjects';
import { useSettings } from '@/src/ui/theme';
import { Calculator } from '@/src/ui/views/Calculator';
import { Planner } from '@/src/ui/views/Planner';
import { Projects } from '@/src/ui/views/Projects';
import { SettingsView } from '@/src/ui/views/Settings';
import { Vlsm } from '@/src/ui/views/Vlsm';
import { Conflicts } from '@/src/ui/views/Conflicts';
import { Tools } from '@/src/ui/views/Tools';
import { BIT_WIDTHS, type BitWidth } from '@/src/lib/numeric/value';
import { solutionToRoot } from '@/src/lib/vlsm/toPlan';
import { createProject } from '@/src/lib/plan/model';
import { formatCidr } from '@/src/lib/ip/cidr';
import { touch } from '@/src/lib/plan/projects';

interface AppProps {
  version: string;
}

const NAV: ReadonlyArray<{ name: RouteName; path: string; label: string }> = [
  { name: 'calc', path: '/calc', label: strings.nav.calculator },
  { name: 'projects', path: '/projects', label: strings.nav.projects },
  { name: 'vlsm', path: '/vlsm', label: strings.nav.vlsm },
  { name: 'conflicts', path: '/conflicts', label: strings.nav.conflicts },
  { name: 'tools', path: '/tools', label: strings.nav.tools },
  { name: 'settings', path: '/settings', label: strings.nav.settings },
];

export function App({ version }: AppProps) {
  const route = useRoute();
  const settings = useSettings();
  const projects = useProjects();
  const [calcInput, setCalcInput] = useState('');
  const [toolsValue, setToolsValue] = useState('');
  const [toolsWidth, setToolsWidth] = useState<BitWidth | undefined>();
  const [toast, setToast] = useState<ToastMessage | undefined>();

  // FR-CTX-02/04: the context menu hands the selection over as ?q, which is read once and
  // then wiped from the URL so a refresh does not re-trigger it.
  useEffect(() => {
    if (route.name !== 'calc') return;
    const query = consumeQueryParam(route, 'q');
    if (query !== undefined && query !== '') setCalcInput(query);
  }, [route]);

  // `#/tools?v=…&w=…` seeds the converter once, the same one-shot pattern as `?q=`
  // (FR-TOOL-07). Both keys are consumed together, or the second read would put the first back.
  useEffect(() => {
    if (route.name !== 'tools') return;
    const taken = consumeQueryParams(route, ['v', 'w']);
    if (taken.v !== undefined && taken.v !== '') setToolsValue(taken.v);
    const width = Number(taken.w);
    if ((BIT_WIDTHS as readonly number[]).includes(width)) setToolsWidth(width as BitWidth);
  }, [route]);

  // A root that could not be validated is quarantined on load; say so rather than letting
  // blocks quietly disappear.
  useEffect(() => {
    if (projects.quarantined.length === 0) return;
    const [first] = projects.quarantined;
    if (first === undefined) return;
    setToast({
      id: Date.now(),
      tone: 'error',
      text: `${first.roots.length} block(s) in “${first.project}” could not be read and were set aside: ${first.roots
        .map((root) => root.cidr)
        .join(', ')}.`,
    });
  }, [projects.quarantined]);

  const openProject = findProject(projects.projects, route.params.projectId ?? '');
  const notify = (text: string, tone: ToastMessage['tone'] = 'info') =>
    setToast({ id: Date.now(), text, tone });

  const exportEverything = () =>
    downloadText('netcarve-projects.json', projectsToJson(projects.projects), 'application/json');

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
              class={`nc-nav__link${
                route.name === entry.name || (entry.name === 'projects' && route.name === 'planner')
                  ? ' is-current'
                  : ''
              }`}
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
        {route.name === 'settings' && (
          <SettingsView
            handle={settings}
            version={version}
            onExportAll={exportEverything}
            onDeleteAll={async () => {
              await Promise.all([
                removeValue(STORAGE_KEYS.projects),
                removeValue(STORAGE_KEYS.settings),
                removeValue(STORAGE_KEYS.calcLast),
              ]);
              projects.replaceAll([]);
              settings.update({
                theme: 'auto',
                allowSlash31: false,
                exportFooter: true,
                defaultCopyFormat: 'markdown',
              });
            }}
          />
        )}

        {route.name === 'projects' && (
          <Projects
            projects={projects.projects}
            onOpen={(id) => navigate(`/planner/${id}`)}
            onCreate={(name, extra) => {
              const project = projects.create(name, extra);
              navigate(`/planner/${project.id}`);
            }}
            onDelete={projects.remove}
            actions={
              <>
                <ImportButton
                  onImported={(imported) => {
                    let next = projects.projects;
                    for (const project of imported) next = upsertProject(next, project);
                    projects.replaceAll(next);
                    notify(strings.exports.importDone(imported[0]?.name ?? ''));
                  }}
                  onError={(message) => notify(message, 'error')}
                />
                <button type="button" class="nc-button" onClick={exportEverything}>
                  {strings.projects.exportAll}
                </button>
              </>
            }
          />
        )}

        {route.name === 'planner' &&
          (openProject === undefined ? (
            projects.ready && <p class="nc-empty">{strings.projects.empty}</p>
          ) : (
            <Planner
              key={openProject.id}
              project={openProject}
              onChange={projects.save}
              onBack={() => navigate('/projects')}
              saveState={projects.saveState}
              actions={
                <ExportBar
                  name={openProject.name}
                  markdown={() => projectToMarkdown(openProject, settings.settings.exportFooter)}
                  plain={() => projectToPlain(openProject, settings.settings.exportFooter)}
                  copyFormat={settings.settings.defaultCopyFormat}
                  csv={() => projectToCsv(openProject)}
                  json={() => projectToJson(openProject)}
                />
              }
            />
          ))}

        {route.name === 'vlsm' && (
          <Vlsm
            allowSlash31={settings.settings.allowSlash31}
            exportFooter={settings.settings.exportFooter}
            copyFormat={settings.settings.defaultCopyFormat}
            projects={projects.projects}
            onSendToPlanner={(targetId, solution) => {
              const root = solutionToRoot(solution);
              const existing =
                targetId === undefined ? undefined : findProject(projects.projects, targetId);

              if (existing === undefined) {
                const created = createProject(strings.vlsm.projectName(formatCidr(solution.base)), {
                  roots: [root],
                });
                projects.save(created);
                notify(strings.vlsm.sentToPlanner(created.name));
                navigate(`/planner/${created.id}`);
                return;
              }

              const updated = touch({ ...existing, roots: [...existing.roots, root] });
              projects.save(updated);
              notify(strings.vlsm.sentToPlanner(updated.name));
              navigate(`/planner/${updated.id}`);
            }}
          />
        )}

        {route.name === 'conflicts' && (
          <Conflicts
            exportFooter={settings.settings.exportFooter}
            copyFormat={settings.settings.defaultCopyFormat}
          />
        )}

        {route.name === 'tools' && (
          <Tools
            key={`${toolsValue}|${toolsWidth ?? ''}`}
            initialValue={toolsValue}
            initialWidth={toolsWidth}
            exportFooter={settings.settings.exportFooter}
            copyFormat={settings.settings.defaultCopyFormat}
          />
        )}

        {route.name === 'calc' && (
          <div class="nc-stack">
            <h1 class="nc-title">{strings.calc.title}</h1>
            <section class="nc-panel nc-section">
              <Calculator
                value={calcInput}
                onChange={setCalcInput}
                exportFooter={settings.settings.exportFooter}
                copyFormat={settings.settings.defaultCopyFormat}
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
