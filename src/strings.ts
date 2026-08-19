/**
 * Every user-facing string in NetCarve, in British English (NFR-I18N-01).
 *
 * The shape is a plain nested object of literals so a future locale can be added by
 * exporting a second object of the same type and swapping it at the module boundary —
 * no refactoring of the views required (spec §13).
 */

import type { ParseErrorCode, WarningCode } from './lib/ip/errors';

export const strings = {
  app: {
    name: 'NetCarve',
    tagline: 'Plan address space, not just calculate it.',
    openApp: 'Open the full app',
    version: (version: string) => `v${version}`,
  },

  nav: {
    calculator: 'Calculator',
    projects: 'Projects',
    planner: 'Planner',
    vlsm: 'VLSM solver',
    conflicts: 'Conflicts',
    settings: 'Settings',
  },

  common: {
    copy: 'Copy',
    copied: 'Copied',
    copyAsMarkdown: 'Copy as Markdown',
    copyAsText: 'Copy as text',
    copyValue: (label: string) => `Copy ${label}`,
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    delete: 'Delete',
    rename: 'Rename',
    save: 'Save',
    add: 'Add',
    remove: 'Remove',
    undo: 'Undo',
    redo: 'Redo',
    moveUp: 'Move up',
    moveDown: 'Move down',
    saving: 'Saving…',
    saved: 'All changes saved',
    saveFailed: 'Could not save — your work is still here, but only until you close this tab.',
  },

  calc: {
    title: 'Quick calculator',
    inputLabel: 'IP address or CIDR block',
    placeholder: '10.20.0.0/16, 192.168.1.37 255.255.255.0 or 2001:db8::/48',
    emptyState: 'Type an address to see its network, range and reserved-range notes.',
    prefixStepper: 'Prefix length',
    widen: 'Widen the block',
    narrow: 'Narrow the block',
    fields: {
      input: 'Input',
      family: 'Family',
      network: 'Network address',
      prefix: 'Prefix length',
      mask: 'Subnet mask',
      wildcard: 'Wildcard mask',
      broadcast: 'Broadcast address',
      lastAddress: 'Last address',
      firstUsable: 'First usable',
      lastUsable: 'Last usable',
      usable: 'Usable addresses',
      total: 'Total addresses',
      canonical: 'Canonical form',
      expanded: 'Full form',
      range: 'Address range',
    },
    binaryTitle: 'Bit ruler',
    binaryHint: 'Filled cells are network bits; the rule marks the prefix boundary.',
    hextetTitle: 'Group ruler',
    notes: {
      rfc3021: 'RFC 3021 point-to-point — both addresses are usable.',
      hostRoute: 'Host route — a single address.',
      p2pV6: 'RFC 6164 point-to-point link.',
      standardSubnet: 'Standard IPv6 subnet size.',
      hostAddress: 'Input was a host address within this network.',
      anycast:
        'IPv6 reserves the all-zeros host address for subnet-router anycast, but it is not subtracted from the usable count.',
      noBroadcast: 'IPv6 has no broadcast address — this is simply the last address in the block.',
    },
    specialTitle: 'Reserved ranges',
    deprecated: 'deprecated',
  },

  projects: {
    title: 'Projects',
    subtitle: 'Address plans, kept on this machine only.',
    empty: 'No projects yet. Create one to start carving up an address block.',
    create: 'New project',
    nameLabel: 'Project name',
    clientLabel: 'Client (optional)',
    notesLabel: 'Notes (optional)',
    namePlaceholder: 'Head office refresh',
    clientPlaceholder: 'Acme Ltd',
    open: 'Open',
    createdOn: (date: string) => `Created ${date}`,
    updatedOn: (date: string) => `Updated ${date}`,
    rootCount: (count: number) => (count === 1 ? '1 root block' : `${count} root blocks`),
    deleteConfirm: (name: string) =>
      `Delete “${name}”? The plan and every block in it will be removed from this machine.`,
    importJson: 'Import JSON',
    exportAll: 'Export all projects',
  },

  planner: {
    title: 'Planner',
    addRoot: 'Add a root block',
    addRootPlaceholder: '10.20.0.0/16',
    addRootAction: 'Add block',
    rootOverlaps: (existing: string) =>
      `That block overlaps ${existing}, which is already in this project.`,
    split: 'Split',
    splitTo: 'Split to…',
    splitToTitle: 'Split to a target prefix',
    splitToPrompt: (cidr: string) => `Carve ${cidr} into equal blocks of:`,
    join: 'Join',
    joinConfirm: (cidr: string, named: number, leaves: number) =>
      named === 0
        ? `Join ${cidr} back into one block? ${leaves} empty blocks will be removed.`
        : `Join ${cidr} back into one block? ${named} named ${
            named === 1 ? 'subnet' : 'subnets'
          } will be lost, along with ${leaves - named} empty blocks.`,
    limitReached: (leaves: number, limit: number) =>
      `That would create ${leaves.toLocaleString('en-GB')} blocks in one root. NetCarve stops at ${limit.toLocaleString(
        'en-GB',
      )} so the tree stays quick to work with — split a smaller block instead.`,
    atMaxPrefix: 'This block is a single address — there is nothing left to split.',
    collapse: 'Collapse',
    expand: 'Expand',
    nameLabel: 'Name',
    namePlaceholder: 'VLAN 10 — Office',
    vlanLabel: 'VLAN ID',
    vlanRange: 'A VLAN ID is a whole number from 1 to 4094.',
    colourLabel: 'Colour',
    notesLabel: 'Notes',
    unnamed: 'Unnamed',
    utilisation: (percent: string) => `${percent}% planned`,
    utilisationDetail: (named: string, total: string) => `${named} of ${total} addresses named`,
    keyboardHint: 'Arrow keys move · S splits · J joins · F2 renames',
    badTargetPrefix: 'Choose a prefix longer than the block itself.',
    notFound: 'That block is no longer in the plan.',
    removeRoot: 'Remove root block',
    removeRootConfirm: (cidr: string) =>
      `Remove ${cidr} and everything planned inside it?`,
    targetPrefix: 'Target prefix',
    applySplit: 'Carve',
    edit: 'Edit',
    done: 'Done',
    back: 'All projects',
    free: 'Free',
    tree: (cidr: string) => `Plan for ${cidr}`,
    selected: 'Selected block',
    emptyRoots: 'No blocks yet. Add a root block such as 10.20.0.0/16 to begin.',
    columns: {
      block: 'Block',
      mask: 'Mask',
      range: 'Range',
      usable: 'Usable',
      name: 'Name',
      vlan: 'VLAN',
    },
  },

  vlsm: {
    title: 'VLSM solver',
    subtitle: 'Turn host counts into an allocation that wastes as little space as possible.',
    baseLabel: 'Base network',
    basePlaceholder: '192.168.10.0/24',
    baseIpv4Only: 'The solver works on IPv4 — host-count sizing is an IPv4 problem.',
    requirements: 'Requirements',
    requirementName: 'Name',
    requirementHosts: 'Hosts',
    addRequirement: 'Add requirement',
    solve: 'Solve',
    allowSlash31Hint: '/31 links are enabled in Settings — two-host requirements use a /31.',
    resultTitle: 'Allocation',
    freeBlocks: 'Free blocks',
    noFreeBlocks: 'Every address in the base network is allocated.',
    summary: (used: string, total: string, percent: string) =>
      `${used} of ${total} addresses allocated — ${percent}% utilisation.`,
    shortfall: (name: string, shortfall: string) =>
      `${name} does not fit. The base network is ${shortfall} addresses short.`,
    sendToPlanner: 'Send to planner',
    sendTarget: 'Add to',
    newProject: 'A new project',
    projectName: (base: string) => `VLSM plan for ${base}`,
    removeRequirement: (name: string) => `Remove ${name === '' ? 'this requirement' : name}`,
    requirementPlaceholder: 'Warehouse',
    unnamedRequirement: 'Unnamed requirement',
    sentToPlanner: (project: string) => `Added to “${project}”.`,
    columns: {
      name: 'Name',
      cidr: 'Allocated block',
      mask: 'Mask',
      range: 'Range',
      usable: 'Usable',
      waste: 'Waste',
    },
    empty: 'Add a base network and at least one requirement, then solve.',
  },

  conflicts: {
    title: 'Conflict checker',
    subtitle:
      'Paste a list of blocks — one per line — to find duplicates and overlaps before a merge or a site-to-site VPN.',
    inputLabel: 'Blocks, one per line',
    placeholder: '10.0.0.0/8\n10.1.0.0/16\n192.168.0.0/16  # branch office\n2001:db8::/48',
    check: 'Check for conflicts',
    clean: (count: number) =>
      `No overlaps found across ${count} ${count === 1 ? 'block' : 'blocks'}.`,
    identical: 'Identical blocks',
    containment: 'Containment',
    alignmentNote:
      'CIDR blocks are always aligned to their own size, so two blocks either sit apart or one wholly contains the other — a partial overlap is arithmetically impossible.',
    invalidLines: (count: number) =>
      `${count} ${count === 1 ? 'line was' : 'lines were'} skipped.`,
    lineError: (line: number, text: string, message: string) =>
      `Line ${line} — “${text}”: ${message}`,
    familyNote: 'IPv4 and IPv6 blocks are compared separately; they never conflict.',
    empty: 'Nothing to check yet.',
  },

  settings: {
    title: 'Settings',
    theme: 'Theme',
    themeAuto: 'Match the system',
    themeLight: 'Light',
    themeDark: 'Dark',
    allowSlash31: 'Allow /31 for two-host links',
    allowSlash31Hint:
      'RFC 3021 point-to-point links. Off by default because some older equipment refuses them.',
    exportFooter: 'Add a NetCarve credit line to exports',
    defaultCopyFormat: 'Default copy format',
    copyMarkdown: 'Markdown',
    copyPlain: 'Plain text',
    plannerLimit: (limit: number) =>
      `A single root block can hold up to ${limit.toLocaleString('en-GB')} subnets.`,
    dataTitle: 'Your data',
    dataNote:
      'Everything NetCarve knows lives in this browser profile. There is no account, no server and no network request.',
    exportAll: 'Export all data',
    deleteAll: 'Delete all data',
    deleteAllPrompt: 'Type DELETE to remove every project and setting from this machine.',
    deleteAllConfirmWord: 'DELETE',
    deleteAllDone: 'Everything has been removed.',
    aboutTitle: 'About',
  },

  exports: {
    markdown: 'Markdown',
    csv: 'CSV',
    json: 'JSON',
    downloadCsv: 'Download CSV',
    downloadJson: 'Download JSON',
    footer: 'Generated by NetCarve — attv.uk',
    importLabel: 'Choose a NetCarve JSON file',
    importBadShape: 'That file is not a NetCarve export.',
    importBadVersion: (version: unknown) =>
      `That file uses schema version ${String(version)}, which this build of NetCarve cannot read.`,
    importDone: (name: string) => `Imported “${name}”.`,
  },

  contextMenu: {
    analyse: 'Analyse "%s" in NetCarve',
  },

  footer: {
    email: 'dev@attv.uk',
    credit: "Project & Development: Tomasz 'Amigo' Lewandowski",
    site: 'www.attv.uk',
    siteUrl: 'https://www.attv.uk',
    repo: 'GitHub',
    repoUrl: 'https://github.com/AmigoUK/Netcarve',
  },
} as const;

const PARSE_ERROR_COPY: Record<ParseErrorCode, string> = {
  EMPTY: 'Enter an IP address or CIDR block.',
  BAD_FORM: 'That does not look like an IPv4 or IPv6 address.',
  BAD_OCTET: 'Each IPv4 octet must be a plain number from 0 to 255 — no leading zeros.',
  BAD_PREFIX: 'The prefix length must be 0–32 for IPv4 or 0–128 for IPv6.',
  BAD_GROUP: 'Each IPv6 group must be one to four hexadecimal digits.',
  DOUBLE_COMPRESSION: 'An IPv6 address may use “::” only once.',
  TOO_MANY_GROUPS: 'That IPv6 address has too many groups.',
  TOO_FEW_GROUPS: 'That IPv6 address needs eight groups, or “::” to stand in for the rest.',
  NONCONTIGUOUS_MASK: 'A subnet mask must be a run of ones followed only by zeros.',
  MASK_NOT_SUPPORTED: 'IPv6 uses prefix lengths rather than dotted masks — try /64.',
  AT_MAX_PREFIX: 'This block is a single address — there is nothing left to split.',
  FAMILY_MISMATCH: 'Those two blocks belong to different address families.',
};

const WARNING_COPY: Record<WarningCode, string> = {
  ZONE_ID_STRIPPED: 'The zone ID was ignored — it identifies an interface, not an address.',
  ASSUMED_HOST_PREFIX: 'No prefix given, so this is treated as a single host.',
  HOST_BITS_SET: 'Input was a host address within this network.',
};

/** Friendly copy for a parser failure. */
export function errorMessage(code: ParseErrorCode): string {
  return PARSE_ERROR_COPY[code];
}

/** Friendly copy for a warning attached to a successful parse. */
export function warningMessage(code: WarningCode): string {
  return WARNING_COPY[code];
}
