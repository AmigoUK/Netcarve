import { useMemo, useState } from 'preact/hooks';
import { groupDigits } from '../../lib/format';
import { formatCidr } from '../../lib/ip/cidr';
import type { Project } from '../../lib/plan/model';
import { vlsmToCsv } from '../../lib/export/csv';
import { vlsmToMarkdown } from '../../lib/export/markdown';
import { solveVlsm, type VlsmRequirement, type VlsmSolution } from '../../lib/vlsm/solver';
import { solutionToRoot } from '../../lib/vlsm/toPlan';
import { strings } from '../../strings';
import { ExportBar } from '../components/ExportBar';

interface VlsmProps {
  allowSlash31: boolean;
  exportFooter: boolean;
  projects: readonly Project[];
  /** Creates a new project holding the solution, or adds it as a root to an existing one. */
  onSendToPlanner: (targetProjectId: string | undefined, solution: VlsmSolution) => void;
}

interface Row extends VlsmRequirement {
  id: number;
}

let nextId = 1;

const emptyRow = (): Row => ({ id: nextId++, name: '', requiredHosts: 0 });

export function Vlsm({ allowSlash31, exportFooter, projects, onSendToPlanner }: VlsmProps) {
  const [base, setBase] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [target, setTarget] = useState('');

  const usable = rows.filter((row) => row.requiredHosts > 0);

  const result = useMemo(() => {
    if (base.trim() === '' || usable.length === 0) return undefined;
    return solveVlsm(
      base,
      usable.map((row) => ({
        name: row.name.trim() === '' ? strings.vlsm.unnamedRequirement : row.name,
        requiredHosts: row.requiredHosts,
      })),
      { allowSlash31 },
    );
    // `usable` is derived from rows; depending on rows keeps the memo honest.
  }, [base, rows, allowSlash31]);

  const solution = result?.ok === true ? result.solution : undefined;

  const patch = (id: number, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  };

  const move = (index: number, delta: number) => {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved as Row);
      return next;
    });
  };

  return (
    <div class="nc-stack">
      <header>
        <h1 class="nc-title">{strings.vlsm.title}</h1>
        <p class="nc-hint">{strings.vlsm.subtitle}</p>
      </header>

      <section class="nc-panel nc-section">
        <div class="nc-field">
          <label class="nc-field">
            <span class="nc-label">{strings.vlsm.baseLabel}</span>
            <input
              class="nc-input nc-mono"
              type="text"
              value={base}
              placeholder={strings.vlsm.basePlaceholder}
              onInput={(event) => setBase((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <p class="nc-hint">{strings.vlsm.baseIpv4Only}</p>
        </div>

        {allowSlash31 && <p class="nc-hint">{strings.vlsm.allowSlash31Hint}</p>}

        <div>
          <span class="nc-label">{strings.vlsm.requirements}</span>
          <ul class="nc-requirements">
            {rows.map((row, index) => (
              <li class="nc-requirement" key={row.id}>
                <label class="nc-field nc-field--grow">
                  <span class="nc-visually-hidden">{`${strings.vlsm.requirementName} ${index + 1}`}</span>
                  <input
                    class="nc-input nc-input--small"
                    type="text"
                    value={row.name}
                    placeholder={strings.vlsm.requirementPlaceholder}
                    aria-label={`${strings.vlsm.requirementName} ${index + 1}`}
                    onInput={(event) =>
                      patch(row.id, { name: (event.currentTarget as HTMLInputElement).value })
                    }
                  />
                </label>
                <label class="nc-field">
                  <span class="nc-visually-hidden">{`${strings.vlsm.requirementHosts} ${index + 1}`}</span>
                  <input
                    class="nc-input nc-input--small nc-mono nc-input--hosts"
                    type="number"
                    min={1}
                    value={row.requiredHosts === 0 ? '' : row.requiredHosts}
                    aria-label={`${strings.vlsm.requirementHosts} ${index + 1}`}
                    onInput={(event) =>
                      patch(row.id, {
                        requiredHosts: Number((event.currentTarget as HTMLInputElement).value),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  class="nc-button nc-button--quiet"
                  aria-label={`${strings.common.moveUp}: ${row.name || index + 1}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="nc-button nc-button--quiet"
                  aria-label={`${strings.common.moveDown}: ${row.name || index + 1}`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="nc-button nc-button--quiet"
                  aria-label={strings.vlsm.removeRequirement(row.name)}
                  onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            class="nc-button"
            onClick={() => setRows((current) => [...current, emptyRow()])}
          >
            {strings.vlsm.addRequirement}
          </button>
        </div>
      </section>

      {result?.ok === false && (
        <p class="nc-error" role="alert">
          {result.message}
        </p>
      )}

      {result === undefined && <p class="nc-empty">{strings.vlsm.empty}</p>}

      {solution !== undefined && (
        <section class="nc-panel nc-section">
          <header class="nc-row nc-space-between">
            <h2 class="nc-subtitle">{strings.vlsm.resultTitle}</h2>
            <ExportBar
              name={`vlsm-${formatCidr(solution.base)}`}
              markdown={() => vlsmToMarkdown(solution, exportFooter)}
              csv={() => vlsmToCsv(solution)}
            />
          </header>

          {solution.failure !== undefined && (
            <p class="nc-error" role="alert">
              {strings.vlsm.shortfall(
                solution.failure.name,
                groupDigits(solution.failure.shortfall),
              )}
            </p>
          )}

          <div class="nc-table-wrap">
            <table class="nc-table">
              <thead>
                <tr>
                  <th scope="col">{strings.vlsm.columns.name}</th>
                  <th scope="col">{strings.vlsm.columns.cidr}</th>
                  <th scope="col">{strings.vlsm.columns.mask}</th>
                  <th scope="col">{strings.vlsm.columns.range}</th>
                  <th scope="col">{strings.vlsm.columns.usable}</th>
                  <th scope="col">{strings.vlsm.columns.waste}</th>
                </tr>
              </thead>
              <tbody>
                {solution.allocations.map((entry) => (
                  <tr key={entry.summary.cidr}>
                    <td>{entry.name}</td>
                    <td class="nc-mono">{entry.summary.cidr}</td>
                    <td class="nc-mono">{entry.summary.mask}</td>
                    <td class="nc-mono">{entry.summary.range}</td>
                    <td class="nc-mono">{entry.summary.usable.primary}</td>
                    <td class="nc-mono">{entry.waste.toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p class="nc-hint">
            {strings.vlsm.summary(
              groupDigits(solution.allocatedAddresses),
              groupDigits(solution.totalAddresses),
              solution.utilisation,
            )}
          </p>

          <div>
            <span class="nc-label">{strings.vlsm.freeBlocks}</span>
            {solution.free.length === 0 ? (
              <p class="nc-hint">{strings.vlsm.noFreeBlocks}</p>
            ) : (
              <ul class="nc-free">
                {solution.free.map((block) => (
                  <li class="nc-mono" key={formatCidr(block)}>
                    {formatCidr(block)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {solution.allocations.length > 0 && (
            <div class="nc-row">
              <label class="nc-field nc-field--inline">
                <span class="nc-label">{strings.vlsm.sendTarget}</span>
                <select
                  class="nc-select"
                  value={target}
                  onChange={(event) => setTarget((event.currentTarget as HTMLSelectElement).value)}
                >
                  <option value="">{strings.vlsm.newProject}</option>
                  {projects.map((project) => (
                    <option value={project.id} key={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                class="nc-button nc-button--primary"
                onClick={() => onSendToPlanner(target === '' ? undefined : target, solution)}
              >
                {strings.vlsm.sendToPlanner}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Exposed so the shell can build the project without importing the solver itself. */
export { solutionToRoot };
