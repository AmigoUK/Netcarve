import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { formatDate } from '../../lib/format';
import type { Project } from '../../lib/plan/model';
import { countLeaves } from '../../lib/plan/tree';
import { strings } from '../../strings';

interface ProjectsProps {
  projects: readonly Project[];
  onOpen: (id: string) => void;
  onCreate: (name: string, extra: { client?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
  /** Import and export-all controls, wired in from v0.9.0. */
  actions?: ComponentChildren;
}

export function Projects({ projects, onOpen, onCreate, onDelete, actions }: ProjectsProps) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | undefined>();

  return (
    <div class="nc-stack">
      <header class="nc-projects__head">
        <div>
          <h1 class="nc-title">{strings.projects.title}</h1>
          <p class="nc-hint">{strings.projects.subtitle}</p>
        </div>
        {actions !== undefined && <div class="nc-row">{actions}</div>}
      </header>

      <form
        class="nc-panel nc-section nc-projects__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() === '') return;
          onCreate(name, { client: client.trim(), notes: notes.trim() });
          setName('');
          setClient('');
          setNotes('');
        }}
      >
        <div class="nc-projects__fields">
          <label class="nc-field">
            <span class="nc-label">{strings.projects.nameLabel}</span>
            <input
              class="nc-input nc-input--small"
              type="text"
              value={name}
              placeholder={strings.projects.namePlaceholder}
              onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="nc-field">
            <span class="nc-label">{strings.projects.clientLabel}</span>
            <input
              class="nc-input nc-input--small"
              type="text"
              value={client}
              placeholder={strings.projects.clientPlaceholder}
              onInput={(event) => setClient((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="nc-field">
            <span class="nc-label">{strings.projects.notesLabel}</span>
            <input
              class="nc-input nc-input--small"
              type="text"
              value={notes}
              onInput={(event) => setNotes((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        </div>
        <button type="submit" class="nc-button nc-button--primary" disabled={name.trim() === ''}>
          {strings.projects.create}
        </button>
      </form>

      {projects.length === 0 ? (
        <p class="nc-empty">{strings.projects.empty}</p>
      ) : (
        <ul class="nc-cards">
          {projects.map((project) => {
            const leaves = project.roots.reduce((total, root) => total + countLeaves(root), 0);
            return (
              <li class="nc-panel nc-card" key={project.id}>
                <div class="nc-card__body">
                  <h2 class="nc-card__name">{project.name}</h2>
                  {project.client !== undefined && (
                    <p class="nc-card__client">{project.client}</p>
                  )}
                  <p class="nc-hint">
                    {strings.projects.rootCount(project.roots.length)} · {leaves} subnets ·{' '}
                    {strings.projects.updatedOn(formatDate(project.updatedAt))}
                  </p>
                  {project.roots.length > 0 && (
                    <p class="nc-card__roots nc-mono">
                      {project.roots.map((root) => root.cidr).join('  ')}
                    </p>
                  )}
                </div>
                <div class="nc-card__actions">
                  <button
                    type="button"
                    class="nc-button nc-button--primary"
                    onClick={() => onOpen(project.id)}
                  >
                    {strings.projects.open}
                  </button>
                  <button
                    type="button"
                    class="nc-button nc-button--danger"
                    onClick={() => setPendingDelete(project.id)}
                  >
                    {strings.common.delete}
                  </button>
                </div>
                {pendingDelete === project.id && (
                  <div class="nc-inline-panel" role="alertdialog">
                    <p>{strings.projects.deleteConfirm(project.name)}</p>
                    <div class="nc-row">
                      <button
                        type="button"
                        class="nc-button nc-button--danger"
                        onClick={() => {
                          onDelete(project.id);
                          setPendingDelete(undefined);
                        }}
                      >
                        {strings.common.delete}
                      </button>
                      <button
                        type="button"
                        class="nc-button"
                        onClick={() => setPendingDelete(undefined)}
                      >
                        {strings.common.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
