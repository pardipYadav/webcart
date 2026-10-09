export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return local;
}

export function cleanName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return null;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)) return null;
  return name;
}

export function cleanInstructions(input: string) {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
