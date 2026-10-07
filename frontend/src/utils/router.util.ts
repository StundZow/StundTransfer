export function safeRedirectPath(path: string | undefined) {
  // StundTransfer: only paths of this site ("/x"). Refuses "javascript:...",
  // other sites ("//host", "/\host") and spaces or control characters
  // (browsers drop tabs and line breaks: "/\t/host" becomes "//host").
  if (
    typeof path !== "string" ||
    !/^\/(?![/\\])[^\s\\]*$/.test(path) ||
    [...path].some((char) => char < " " || char === "\x7f")
  )
    return "/";

  return path;
}

export function getQueryString(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}
