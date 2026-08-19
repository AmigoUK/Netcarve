import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createProject, type Project } from '../lib/plan/model';
import {
  loadProjects,
  removeProject as removeFromList,
  upsertProject,
  type LoadedProjects,
} from '../lib/plan/projects';
import { createDebouncedWriter, STORAGE_KEYS } from '../lib/storage/store';
import type { SaveState } from './views/Planner';

export interface ProjectsHandle {
  projects: Project[];
  /** True once storage has been read. */
  ready: boolean;
  saveState: SaveState;
  /** Roots that failed validation on load, reported so the user is not left guessing. */
  quarantined: LoadedProjects['quarantined'];
  create: (name: string, extra?: { client?: string; notes?: string }) => Project;
  save: (project: Project) => void;
  remove: (id: string) => void;
  replaceAll: (projects: Project[]) => void;
}

/**
 * Owns the project list: reads it once, writes it back through the debounced writer
 * (FR-PLAN-08, FR-STOR-01) and reports whether the last write landed (FR-STOR-02).
 */
export function useProjects(): ProjectsHandle {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [quarantined, setQuarantined] = useState<LoadedProjects['quarantined']>([]);
  const loaded = useRef(false);

  const writer = useMemo(
    () => createDebouncedWriter(STORAGE_KEYS.projects, () => setSaveState('error')),
    [],
  );

  useEffect(() => {
    let live = true;
    void loadProjects().then((result) => {
      if (!live) return;
      setProjects(result.projects);
      setQuarantined(result.quarantined);
      loaded.current = true;
      setReady(true);
    });
    return () => {
      live = false;
      void writer.flush();
    };
  }, [writer]);

  const persist = useCallback(
    (next: Project[]) => {
      setProjects(next);
      if (!loaded.current) return;
      setSaveState('saving');
      writer.queue(next);
      // The writer coalesces, so the indicator settles once the debounce has elapsed.
      setTimeout(() => {
        setSaveState((current) => (current === 'saving' ? 'saved' : current));
      }, 600);
    },
    [writer],
  );

  const create = useCallback(
    (name: string, extra: { client?: string; notes?: string } = {}) => {
      const project = createProject(name, extra);
      persist(upsertProject(projects, project));
      return project;
    },
    [projects, persist],
  );

  const save = useCallback(
    (project: Project) => persist(upsertProject(projects, project)),
    [projects, persist],
  );

  const remove = useCallback(
    (id: string) => persist(removeFromList(projects, id)),
    [projects, persist],
  );

  const replaceAll = useCallback((next: Project[]) => persist(next), [persist]);

  return { projects, ready, saveState, quarantined, create, save, remove, replaceAll };
}
