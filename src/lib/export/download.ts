/**
 * Clipboard and file delivery, using only what an extension page can do without extra
 * permissions: `navigator.clipboard.writeText` under a user gesture (FR-EXP-04) and an
 * object-URL anchor for downloads (FR-EXP-02).
 */

/** Copies text to the clipboard. Resolves to `false` when the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Triggers a download of `content` as `filename`, without the `downloads` permission. */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Turns a project or view name into a safe file name stem. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'netcarve' : slug;
}
