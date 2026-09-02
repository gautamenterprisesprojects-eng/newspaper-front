/**
 * Saving a file from inside the native WebView shell.
 *
 * The web way of saving a file -- create a Blob, point an <a download> at it,
 * click it -- does nothing at all inside a WebView:
 *
 *   - Android WebView ignores the `download` attribute entirely unless the
 *     host app installs a DownloadListener, and even then the native
 *     downloader cannot fetch a `blob:` URL, because that URL only exists
 *     inside the web page's own memory.
 *   - iOS WKWebView needs a WKDownloadDelegate (14.5+) and hits the same
 *     blob problem.
 *
 * The result is a button that looks like it worked and produces no file --
 * which, for this product, is the entire deliverable silently failing.
 *
 * So on native we hand the bytes to the OS instead: write them to the app's
 * cache directory via Capacitor's Filesystem plugin, then open the system
 * share sheet on that file. The user gets "Save to Files" on iOS and the
 * usual save/share chooser on Android, and neither platform needs a storage
 * permission for this route.
 *
 * Deliberately talks to Capacitor through the `window.Capacitor` bridge the
 * shell injects at runtime, rather than importing @capacitor/* packages. This
 * web app is built and deployed on its own and merely *loaded* by the shell,
 * so it must not grow a build-time dependency on the native project. In a
 * plain browser the bridge is absent, `isNative()` is false, and the ordinary
 * download path runs unchanged.
 */

type CapacitorPlugins = {
  Filesystem?: {
    writeFile(options: {
      path: string;
      data: string;
      directory?: string;
      recursive?: boolean;
    }): Promise<{ uri: string }>;
  };
  Share?: {
    share(options: {
      title?: string;
      text?: string;
      url?: string;
      dialogTitle?: string;
    }): Promise<unknown>;
  };
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: CapacitorPlugins;
};

const getBridge = (): CapacitorBridge | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;

/** True only inside the wrapped iOS/Android shell. */
export const isNativeShell = (): boolean => {
  const bridge = getBridge();
  return Boolean(bridge?.isNativePlatform?.());
};

/** Blob -> bare base64 (no `data:` prefix), which is what Filesystem wants. */
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });

export type SaveOutcome =
  | { ok: true; via: "browser" | "native" }
  | { ok: false; error: string };

const saveViaBrowser = (blob: Blob, filename: string): SaveOutcome => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { ok: true, via: "browser" };
};

/**
 * Save (or share) a file. Returns an outcome rather than throwing, so callers
 * can surface a real message instead of leaving the user staring at a button
 * that did nothing.
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  options: { shareTitle?: string } = {},
): Promise<SaveOutcome> {
  if (!isNativeShell()) {
    return saveViaBrowser(blob, filename);
  }

  const plugins = getBridge()?.Plugins;
  const filesystem = plugins?.Filesystem;
  const share = plugins?.Share;

  // The shell is native but the plugins are missing from the native project.
  // Falling back keeps behaviour no worse than before rather than throwing.
  if (!filesystem?.writeFile) {
    return saveViaBrowser(blob, filename);
  }

  try {
    const data = await blobToBase64(blob);
    // Cache, not Documents: needs no permission on either platform, and the
    // OS reclaims it later. The file's permanent home is wherever the user
    // chooses to put it from the share sheet.
    const written = await filesystem.writeFile({
      path: filename,
      data,
      directory: "CACHE",
      recursive: true,
    });

    if (share?.share && written?.uri) {
      await share.share({
        title: options.shareTitle ?? filename,
        url: written.uri,
        dialogTitle: options.shareTitle ?? filename,
      });
    }

    return { ok: true, via: "native" };
  } catch (error) {
    // A user dismissing the share sheet rejects the promise on both
    // platforms. That is not a failure worth reporting -- the file is written
    // either way, they simply chose not to send it anywhere.
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message) || /abort/i.test(message)) {
      return { ok: true, via: "native" };
    }
    return { ok: false, error: message };
  }
}

/** Convenience for the many callers holding raw bytes rather than a Blob. */
export async function saveBytes(
  bytes: Uint8Array | ArrayBuffer,
  filename: string,
  mimeType: string,
  options: { shareTitle?: string } = {},
): Promise<SaveOutcome> {
  const data = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes.slice(0);
  return saveFile(new Blob([data], { type: mimeType }), filename, options);
}

/** Convenience for base64 payloads (the API returns credential PDFs this way). */
export async function saveBase64(
  base64: string,
  filename: string,
  mimeType: string,
  options: { shareTitle?: string } = {},
): Promise<SaveOutcome> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return saveFile(new Blob([bytes], { type: mimeType }), filename, options);
}

/**
 * Opening a remote URL (an already-generated PDF, say). `target="_blank"` is
 * frequently a no-op in a WebView; the shell's Browser plugin opens a proper
 * in-app browser instead, and falls back to window.open elsewhere.
 */
export async function openExternal(url: string): Promise<void> {
  const plugins = getBridge()?.Plugins as
    | (CapacitorPlugins & { Browser?: { open(o: { url: string }): Promise<unknown> } })
    | undefined;

  if (isNativeShell() && plugins?.Browser?.open) {
    try {
      await plugins.Browser.open({ url });
      return;
    } catch {
      // fall through to the web path
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
