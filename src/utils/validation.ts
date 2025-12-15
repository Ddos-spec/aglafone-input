export const sanitizeNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const sanitizeString = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const isValidDateString = (value: string): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const d = new Date(trimmed);
  return !Number.isNaN(d.getTime());
};
