/**
 * Planner limits (FR-PLAN-04).
 *
 * A single root block may hold at most this many leaves. The ceiling protects both rendering
 * (a tree this size still stays under a frame budget) and `chrome.storage.local`, and it is
 * shown read-only in Settings rather than being sprung on the user (DECISIONS.md D4).
 */
export const MAX_LEAVES_PER_ROOT = 1024;

/** Valid VLAN IDs, per IEEE 802.1Q. */
export const MIN_VLAN_ID = 1;
export const MAX_VLAN_ID = 4094;
