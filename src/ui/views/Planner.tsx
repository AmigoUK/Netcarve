import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatPercent } from '../../lib/format';
import { MAX_LEAVES_PER_ROOT, MAX_VLAN_ID, MIN_VLAN_ID } from '../../lib/plan/limits';
import { describeBlock } from '../../lib/plan/describe';
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from '../../lib/plan/history';
import type { PaletteToken, PlanNode, Project } from '../../lib/plan/model';
import { addRoot, removeRoot, replaceRoot } from '../../lib/plan/projects';
import {
  countLeaves,
  countNamedLeaves,
  flattenTree,
  joinNode,
  nodeAt,
  pathKey,
  splitNode,
  splitToPrefix,
  updateNode,
  utilisation,
  type PlanPath,
  type PlanResult,
  type PlanRow,
} from '../../lib/plan/tree';
import { strings } from '../../strings';
import { ColourPicker } from '../components/ColourPicker';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PlannerProps {
  project: Project;
  onChange: (project: Project) => void;
  onBack: () => void;
  saveState: SaveState;
  /** Rendered under the header — the export buttons live here from v0.9.0. */
  actions?: ComponentChildren;
}

/** A row's address across the whole project: which root, and the path inside it. */
interface RowRef {
  rootIndex: number;
  path: PlanPath;
}

const refKey = (rootIndex: number, path: PlanPath): string => `${rootIndex}:${pathKey(path)}`;

/** The collapsed paths belonging to one root, with the root prefix stripped back off. */
function collapsedWithin(collapsed: ReadonlySet<string>, rootIndex: number): Set<string> {
  const prefix = `${rootIndex}:`;
  return new Set(
    [...collapsed].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)),
  );
}

function messageFor(result: Extract<PlanResult<unknown>, { ok: false }>): string {
  switch (result.code) {
    case 'LEAF_LIMIT':
      return strings.planner.limitReached(Number(result.detail), MAX_LEAVES_PER_ROOT);
    case 'AT_MAX_PREFIX':
      return strings.planner.atMaxPrefix;
    case 'BAD_TARGET_PREFIX':
      return strings.planner.badTargetPrefix;
    default:
      return strings.planner.notFound;
  }
}

/**
 * The planner is mounted with `key={project.id}`, so opening a different project gives a
 * fresh undo history rather than one that spans two plans.
 */
export function Planner({ project, onChange, onBack, saveState, actions }: PlannerProps) {
  const [history, setHistory] = useState<History<Project>>(() => initHistory(project));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<RowRef | undefined>();
  const [editing, setEditing] = useState<string | undefined>();
  const [pendingJoin, setPendingJoin] = useState<RowRef | undefined>();
  const [splitTarget, setSplitTarget] = useState<RowRef | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [rootInput, setRootInput] = useState('');
  const [rootError, setRootError] = useState<string | undefined>();
  const treeRef = useRef<HTMLDivElement>(null);

  const current = history.present;

  // The parent owns persistence, so it is told about a new present *after* the render that
  // produced it — notifying from inside a state updater would run a parent update mid-update.
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => {
    if (current !== project) notify.current(current);
  }, [current]);

  const commit = useCallback(
    (next: Project) => setHistory((previous) => pushHistory(previous, next)),
    [],
  );

  const step = useCallback(
    (direction: 'undo' | 'redo') =>
      setHistory((previous) => (direction === 'undo' ? undo(previous) : redo(previous))),
    [],
  );

  const rows = useMemo(
    () =>
      current.roots.flatMap((root, rootIndex) =>
        flattenTree(root, collapsedWithin(collapsed, rootIndex)).map((row) => ({ row, rootIndex })),
      ),
    [current.roots, collapsed],
  );

  const applyToRoot = useCallback(
    (rootIndex: number, operation: (root: PlanNode) => PlanResult<PlanNode>) => {
      const root = current.roots[rootIndex];
      if (root === undefined) return;
      const result = operation(root);
      if (!result.ok) {
        setNotice(messageFor(result));
        return;
      }
      setNotice(undefined);
      commit(replaceRoot(current, rootIndex, result.value));
    },
    [current, commit],
  );

  const doSplit = useCallback(
    (ref: RowRef) => applyToRoot(ref.rootIndex, (root) => splitNode(root, ref.path)),
    [applyToRoot],
  );

  const doJoin = useCallback(
    (ref: RowRef) => {
      applyToRoot(ref.rootIndex, (root) => joinNode(root, ref.path));
      setPendingJoin(undefined);
    },
    [applyToRoot],
  );

  const toggleCollapse = (key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (editing !== undefined) return;
    const index = rows.findIndex(
      (entry) =>
        selected !== undefined &&
        entry.rootIndex === selected.rootIndex &&
        pathKey(entry.row.path) === pathKey(selected.path),
    );

    const select = (next: number) => {
      const entry = rows[Math.min(Math.max(next, 0), rows.length - 1)];
      if (entry === undefined) return;
      setSelected({ rootIndex: entry.rootIndex, path: entry.row.path });
      event.preventDefault();
    };

    switch (event.key) {
      case 'ArrowDown':
        select(index + 1);
        break;
      case 'ArrowUp':
        select(index === -1 ? 0 : index - 1);
        break;
      case 'ArrowLeft': {
        if (selected === undefined) break;
        const entry = rows[index];
        if (entry !== undefined && !entry.row.leaf) {
          toggleCollapse(refKey(entry.rootIndex, entry.row.path));
        } else if (selected.path.length > 0) {
          setSelected({ rootIndex: selected.rootIndex, path: selected.path.slice(0, -1) });
        }
        event.preventDefault();
        break;
      }
      case 'ArrowRight': {
        const entry = rows[index];
        if (entry !== undefined && !entry.row.leaf) {
          setCollapsed((previous) => {
            const next = new Set(previous);
            next.delete(refKey(entry.rootIndex, entry.row.path));
            return next;
          });
        }
        event.preventDefault();
        break;
      }
      case 's':
      case 'S':
        if (selected !== undefined) {
          doSplit(selected);
          event.preventDefault();
        }
        break;
      case 'j':
      case 'J':
        if (selected !== undefined) {
          const node = nodeAt(current.roots[selected.rootIndex] as PlanNode, selected.path);
          if (node?.children !== undefined) setPendingJoin(selected);
          event.preventDefault();
        }
        break;
      case 'F2':
      case 'Enter':
        if (selected !== undefined) {
          setEditing(refKey(selected.rootIndex, selected.path));
          event.preventDefault();
        }
        break;
      default:
        break;
    }
  };

  return (
    <div class="nc-stack">
      <header class="nc-planner__head">
        <div>
          <button type="button" class="nc-button nc-button--quiet" onClick={onBack}>
            ← {strings.planner.back}
          </button>
          <h1 class="nc-title">{current.name}</h1>
          {current.client !== undefined && <p class="nc-hint">{current.client}</p>}
        </div>
        <div class="nc-planner__tools">
          <span class={`nc-save nc-save--${saveState}`} role="status">
            {saveState === 'saving'
              ? strings.common.saving
              : saveState === 'error'
                ? strings.common.saveFailed
                : strings.common.saved}
          </span>
          <button
            type="button"
            class="nc-button"
            disabled={!canUndo(history)}
            onClick={() => step('undo')}
          >
            {strings.common.undo}
          </button>
          <button
            type="button"
            class="nc-button"
            disabled={!canRedo(history)}
            onClick={() => step('redo')}
          >
            {strings.common.redo}
          </button>
          {actions}
        </div>
      </header>

      <form
        class="nc-row nc-panel nc-section"
        onSubmit={(event) => {
          event.preventDefault();
          const result = addRoot(current, rootInput);
          if (!result.ok) {
            setRootError(
              result.message.includes('/')
                ? strings.planner.rootOverlaps(result.message)
                : result.message,
            );
            return;
          }
          setRootError(undefined);
          setRootInput('');
          commit(result.project);
        }}
      >
        <label class="nc-field nc-field--grow">
          <span class="nc-label">{strings.planner.addRoot}</span>
          <input
            class="nc-input nc-input--small nc-mono"
            type="text"
            value={rootInput}
            placeholder={strings.planner.addRootPlaceholder}
            onInput={(event) => setRootInput((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button type="submit" class="nc-button nc-button--primary">
          {strings.planner.addRootAction}
        </button>
        {rootError !== undefined && (
          <p class="nc-error" role="alert">
            {rootError}
          </p>
        )}
      </form>

      {notice !== undefined && (
        <p class="nc-error" role="alert">
          {notice}
        </p>
      )}

      {current.roots.length === 0 && <p class="nc-empty">{strings.planner.emptyRoots}</p>}

      <div ref={treeRef} onKeyDown={onKeyDown}>
        {current.roots.map((root, rootIndex) => (
          <RootSection
            key={root.cidr}
            root={root}
            rootIndex={rootIndex}
            rows={rows.filter((entry) => entry.rootIndex === rootIndex).map((entry) => entry.row)}
            collapsed={collapsed}
            selected={selected}
            editing={editing}
            pendingJoin={pendingJoin}
            splitTarget={splitTarget}
            onSelect={(ref) => setSelected(ref)}
            onEdit={setEditing}
            onToggleCollapse={toggleCollapse}
            onSplit={doSplit}
            onAskJoin={setPendingJoin}
            onCancelJoin={() => setPendingJoin(undefined)}
            onJoin={doJoin}
            onAskSplitTo={setSplitTarget}
            onCancelSplitTo={() => setSplitTarget(undefined)}
            onSplitTo={(ref, prefix) => {
              applyToRoot(ref.rootIndex, (node) => splitToPrefix(node, ref.path, prefix));
              setSplitTarget(undefined);
            }}
            onUpdate={(ref, patch) =>
              applyToRoot(ref.rootIndex, (node) => updateNode(node, ref.path, patch))
            }
            onRemoveRoot={() => commit(removeRoot(current, rootIndex))}
          />
        ))}
      </div>

      {current.roots.length > 0 && <p class="nc-hint">{strings.planner.keyboardHint}</p>}
    </div>
  );
}

interface RootSectionProps {
  root: PlanNode;
  rootIndex: number;
  rows: PlanRow[];
  collapsed: ReadonlySet<string>;
  selected: RowRef | undefined;
  editing: string | undefined;
  pendingJoin: RowRef | undefined;
  splitTarget: RowRef | undefined;
  onSelect: (ref: RowRef) => void;
  onEdit: (key: string | undefined) => void;
  onToggleCollapse: (key: string) => void;
  onSplit: (ref: RowRef) => void;
  onAskJoin: (ref: RowRef) => void;
  onCancelJoin: () => void;
  onJoin: (ref: RowRef) => void;
  onAskSplitTo: (ref: RowRef) => void;
  onCancelSplitTo: () => void;
  onSplitTo: (ref: RowRef, prefix: number) => void;
  onUpdate: (ref: RowRef, patch: Partial<Omit<PlanNode, 'cidr' | 'children'>>) => void;
  onRemoveRoot: () => void;
}

function RootSection(props: RootSectionProps) {
  const { root, rootIndex, rows } = props;
  const use = utilisation(root);
  const percent = formatPercent(use.named, use.total);

  return (
    <section class="nc-panel nc-root">
      <header class="nc-root__head">
        <h2 class="nc-root__cidr nc-mono">{root.cidr}</h2>
        <div class="nc-root__meter">
          <div
            class="nc-meter"
            role="meter"
            aria-valuenow={Number(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={strings.planner.utilisation(percent)}
          >
            <span class="nc-meter__fill" style={`width:${percent}%`} />
          </div>
          <span class="nc-hint">
            {strings.planner.utilisation(percent)} ·{' '}
            {strings.planner.utilisationDetail(use.named.toString(), use.total.toString())}
          </span>
        </div>
        <button
          type="button"
          class="nc-button nc-button--quiet"
          onClick={props.onRemoveRoot}
          title={strings.planner.removeRootConfirm(root.cidr)}
        >
          {strings.planner.removeRoot}
        </button>
      </header>

      <ul class="nc-tree" role="tree" aria-label={strings.planner.tree(root.cidr)}>
        {rows.map((row) => (
          <TreeRow key={pathKey(row.path)} {...props} row={row} rootIndex={rootIndex} />
        ))}
      </ul>
    </section>
  );
}

interface TreeRowProps extends RootSectionProps {
  row: PlanRow;
}

function TreeRow(props: TreeRowProps) {
  const { row, rootIndex, selected, editing, collapsed } = props;
  const key = refKey(rootIndex, row.path);
  const ref: RowRef = { rootIndex, path: row.path };
  const summary = describeBlock(row.block);
  const isSelected =
    selected !== undefined &&
    selected.rootIndex === rootIndex &&
    pathKey(selected.path) === pathKey(row.path);
  const isEditing = editing === key;
  const isCollapsed = collapsed.has(key);
  const joining =
    props.pendingJoin !== undefined &&
    props.pendingJoin.rootIndex === rootIndex &&
    pathKey(props.pendingJoin.path) === pathKey(row.path);
  const splitting =
    props.splitTarget !== undefined &&
    props.splitTarget.rootIndex === rootIndex &&
    pathKey(props.splitTarget.path) === pathKey(row.path);

  return (
    <li
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={isSelected}
      aria-expanded={row.leaf ? undefined : !isCollapsed}
      class={`nc-tree__item${isSelected ? ' is-selected' : ''}`}
    >
      <div
        class="nc-tree__row"
        style={`--depth:${row.depth}`}
        tabIndex={isSelected ? 0 : -1}
        onFocus={() => props.onSelect(ref)}
        onClick={() => props.onSelect(ref)}
      >
        {!row.leaf && (
          <button
            type="button"
            class="nc-tree__twisty"
            aria-label={isCollapsed ? strings.planner.expand : strings.planner.collapse}
            onClick={(event) => {
              event.stopPropagation();
              props.onToggleCollapse(key);
            }}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        )}

        <span
          class={`nc-dot${row.node.colour === undefined ? ' is-empty' : ` nc-dot--${row.node.colour}`}`}
          aria-hidden="true"
        />

        <span class="nc-tree__cidr nc-mono">{summary.cidr}</span>
        {summary.mask !== '' && <span class="nc-tree__mask nc-mono">{summary.mask}</span>}
        <span class="nc-tree__range nc-mono">{summary.range}</span>
        <span class="nc-tree__usable nc-mono">{summary.usable.primary}</span>
        <span class={`nc-tree__name${row.node.name === undefined ? ' is-empty' : ''}`}>
          {row.node.name ?? strings.planner.unnamed}
        </span>
        {row.node.vlanId !== undefined && (
          <span class="nc-tree__vlan nc-mono">VLAN {row.node.vlanId}</span>
        )}
        {summary.standardSubnet && <span class="nc-chip">{strings.calc.notes.standardSubnet}</span>}

        <span class="nc-tree__actions">
          {row.leaf ? (
            <>
              <button
                type="button"
                class="nc-button nc-button--quiet"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onSplit(ref);
                }}
              >
                {strings.planner.split}
              </button>
              <button
                type="button"
                class="nc-button nc-button--quiet"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onAskSplitTo(ref);
                }}
              >
                {strings.planner.splitTo}
              </button>
            </>
          ) : (
            <button
              type="button"
              class="nc-button nc-button--quiet"
              onClick={(event) => {
                event.stopPropagation();
                props.onAskJoin(ref);
              }}
            >
              {strings.planner.join}
            </button>
          )}
          <button
            type="button"
            class="nc-button nc-button--quiet"
            aria-expanded={isEditing}
            onClick={(event) => {
              event.stopPropagation();
              props.onEdit(isEditing ? undefined : key);
            }}
          >
            {strings.planner.edit}
          </button>
        </span>
      </div>

      {joining && (
        <div class="nc-inline-panel" role="alertdialog" aria-label={strings.planner.join}>
          <p>
            {strings.planner.joinConfirm(
              row.node.cidr,
              countNamedLeaves(row.node),
              countLeaves(row.node),
            )}
          </p>
          <div class="nc-row">
            <button
              type="button"
              class="nc-button nc-button--danger"
              onClick={() => props.onJoin(ref)}
            >
              {strings.planner.join}
            </button>
            <button type="button" class="nc-button" onClick={props.onCancelJoin}>
              {strings.common.cancel}
            </button>
          </div>
        </div>
      )}

      {splitting && (
        <SplitToPanel
          cidr={row.node.cidr}
          prefix={row.block.prefix}
          maxPrefix={row.block.family === 4 ? 32 : 128}
          onCancel={props.onCancelSplitTo}
          onApply={(target) => props.onSplitTo(ref, target)}
        />
      )}

      {isEditing && (
        <NodeEditor
          node={row.node}
          leaf={row.leaf}
          onChange={(patch) => props.onUpdate(ref, patch)}
          onDone={() => props.onEdit(undefined)}
        />
      )}
    </li>
  );
}

interface SplitToPanelProps {
  cidr: string;
  prefix: number;
  maxPrefix: number;
  onCancel: () => void;
  onApply: (prefix: number) => void;
}

function SplitToPanel({ cidr, prefix, maxPrefix, onCancel, onApply }: SplitToPanelProps) {
  const [target, setTarget] = useState(String(Math.min(prefix + 1, maxPrefix)));

  return (
    <form
      class="nc-inline-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(Number(target));
      }}
    >
      <p>{strings.planner.splitToPrompt(cidr)}</p>
      <div class="nc-row">
        <label class="nc-field nc-field--inline">
          <span class="nc-label">{strings.planner.targetPrefix}</span>
          <input
            class="nc-input nc-input--small nc-mono"
            type="number"
            min={prefix + 1}
            max={maxPrefix}
            value={target}
            onInput={(event) => setTarget((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button type="submit" class="nc-button nc-button--primary">
          {strings.planner.applySplit}
        </button>
        <button type="button" class="nc-button" onClick={onCancel}>
          {strings.common.cancel}
        </button>
      </div>
    </form>
  );
}

interface NodeEditorProps {
  node: PlanNode;
  leaf: boolean;
  onChange: (patch: Partial<Omit<PlanNode, 'cidr' | 'children'>>) => void;
  onDone: () => void;
}

/** Inline metadata editing (FR-PLAN-05). Internal nodes may carry a name only. */
function NodeEditor({ node, leaf, onChange, onDone }: NodeEditorProps) {
  const [vlanError, setVlanError] = useState<string | undefined>();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => nameRef.current?.focus(), []);

  return (
    <div class="nc-inline-panel nc-editor">
      <label class="nc-field">
        <span class="nc-label">{strings.planner.nameLabel}</span>
        <input
          ref={nameRef}
          class="nc-input nc-input--small"
          type="text"
          value={node.name ?? ''}
          placeholder={strings.planner.namePlaceholder}
          onInput={(event) => onChange({ name: (event.currentTarget as HTMLInputElement).value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') onDone();
          }}
        />
      </label>

      {leaf && (
        <>
          <label class="nc-field">
            <span class="nc-label">{strings.planner.vlanLabel}</span>
            <input
              class="nc-input nc-input--small nc-mono"
              type="number"
              min={MIN_VLAN_ID}
              max={MAX_VLAN_ID}
              value={node.vlanId ?? ''}
              onInput={(event) => {
                const raw = (event.currentTarget as HTMLInputElement).value;
                if (raw === '') {
                  setVlanError(undefined);
                  onChange({ vlanId: undefined });
                  return;
                }
                const parsed = Number(raw);
                if (!Number.isInteger(parsed) || parsed < MIN_VLAN_ID || parsed > MAX_VLAN_ID) {
                  setVlanError(strings.planner.vlanRange);
                  return;
                }
                setVlanError(undefined);
                onChange({ vlanId: parsed });
              }}
            />
            {vlanError !== undefined && (
              <span class="nc-error" role="alert">
                {vlanError}
              </span>
            )}
          </label>

          <div class="nc-field">
            <span class="nc-label">{strings.planner.colourLabel}</span>
            <ColourPicker
              value={node.colour}
              onChange={(colour: PaletteToken | undefined) => onChange({ colour })}
            />
          </div>

          <label class="nc-field">
            <span class="nc-label">{strings.planner.notesLabel}</span>
            <input
              class="nc-input nc-input--small"
              type="text"
              value={node.notes ?? ''}
              onInput={(event) =>
                onChange({ notes: (event.currentTarget as HTMLInputElement).value })
              }
            />
          </label>
        </>
      )}

      <button type="button" class="nc-button" onClick={onDone}>
        {strings.planner.done}
      </button>
    </div>
  );
}
