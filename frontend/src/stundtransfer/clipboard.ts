// StundTransfer: copying links to the clipboard, and the address they use.

/** Address for links sent to other people: the public one set in the admin
 *  settings, even when the page is opened at home on the NAS local address. */
export const publicAppUrl = (
  get: (key: string, defaultValue?: boolean) => string,
) => {
  const appUrl = get("general.appUrl");
  return (appUrl && appUrl !== get("general.appUrl", true)
    ? appUrl
    : window.location.origin
  ).replace(/\/+$/, "");
};

/** Copies a text; false when the browser refused. The local http address
 *  has no Clipboard API: the old way is used there. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Page not in front, or refused: try the old way
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

/** Copies now, or as soon as the page is back in front (the browser refuses
 *  while another window is used, e.g. at the end of a long upload).
 *  Returns a function that gives up. */
export function copyWhenPossible(text: string, onCopied: () => void) {
  let done = false;
  let trying = false;
  const attempt = async () => {
    if (done || trying) return;
    trying = true;
    const copied = await copyText(text);
    trying = false;
    if (copied && !done) {
      done = true;
      window.removeEventListener("focus", attempt);
      onCopied();
    }
  };
  window.addEventListener("focus", attempt);
  attempt();
  return () => {
    done = true;
    window.removeEventListener("focus", attempt);
  };
}
