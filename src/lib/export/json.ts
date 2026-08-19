/**
 * JSON backup and restore (FR-EXP-03, FR-STOR-03).
 *
 * A single project is written as `{ app, schemaVersion, project }`; the Settings
 * "Export all data" action writes the same envelope with `projects`. Import accepts either,
 * revalidates every node, and refuses a schema version this build does not understand.
 */

import { strings } from '../../strings';
import {
  normaliseProject,
  PROJECT_SCHEMA_VERSION,
  type Project,
  type QuarantinedRoot,
} from '../plan/model';

export const EXPORT_APP = 'netcarve';

export interface ProjectEnvelope {
  app: typeof EXPORT_APP;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  project?: Project;
  projects?: Project[];
}

export function projectToJson(project: Project): string {
  return `${JSON.stringify(
    { app: EXPORT_APP, schemaVersion: PROJECT_SCHEMA_VERSION, project },
    undefined,
    2,
  )}\n`;
}

export function projectsToJson(projects: readonly Project[]): string {
  return `${JSON.stringify(
    { app: EXPORT_APP, schemaVersion: PROJECT_SCHEMA_VERSION, projects },
    undefined,
    2,
  )}\n`;
}

export type ImportResult =
  | { readonly ok: true; readonly projects: Project[]; readonly quarantined: QuarantinedRoot[] }
  | { readonly ok: false; readonly message: string };

/** Reads an exported file back into projects, or explains why it cannot. */
export function parseProjectJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: strings.exports.importBadShape };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, message: strings.exports.importBadShape };
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.app !== EXPORT_APP) {
    return { ok: false, message: strings.exports.importBadShape };
  }
  if (envelope.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return { ok: false, message: strings.exports.importBadVersion(envelope.schemaVersion) };
  }

  const candidates = Array.isArray(envelope.projects)
    ? envelope.projects
    : envelope.project === undefined
      ? []
      : [envelope.project];

  const projects: Project[] = [];
  const quarantined: QuarantinedRoot[] = [];
  for (const candidate of candidates) {
    const normalised = normaliseProject(candidate);
    if (normalised === undefined) continue;
    projects.push(normalised.project);
    quarantined.push(...normalised.quarantined);
  }

  if (projects.length === 0) {
    return { ok: false, message: strings.exports.importBadShape };
  }
  return { ok: true, projects, quarantined };
}
