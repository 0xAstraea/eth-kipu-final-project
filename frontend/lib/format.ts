export function shorten(value: string, size = 6): string {
  if (!value) return "";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function formatBig(value: string | bigint, size = 8): string {
  const text = value.toString();
  if (text.length <= size * 2) return text;
  return `${text.slice(0, size)}…${text.slice(-size)}`;
}
