import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/(^|[ \-'])([a-z])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

export const PHONE_DENYLIST = new Set([
  "any", "n/a", "na", "nill", "nil", "0", "00", "0000000000",
  "hold", "waiting", "block", "tbd", "tbc",
]);

export function isValidPhone(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (PHONE_DENYLIST.has(t)) return false;
  if (t.startsWith("no_phone_")) return false;
  return raw.replace(/\D/g, "").length >= 10;
}
