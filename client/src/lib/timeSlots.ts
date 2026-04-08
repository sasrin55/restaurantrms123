export type MealPeriod = "breakfast" | "brunch" | "lunch" | "tea" | "dinner";

export interface TimeSlot {
  label: string;
  period: MealPeriod;
}

// ── Legacy slots (used for dates before the April 2026 update) ─────────────
const LEGACY_WEEKDAY_SLOTS: TimeSlot[] = [
  { label: "9:00 AM - 10:30 AM",  period: "breakfast" },
  { label: "10:45 AM - 12:15 PM", period: "brunch" },
  { label: "12:30 PM - 2:30 PM",  period: "lunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "5:00 PM - 7:00 PM",   period: "tea" },
  { label: "7:00 PM - 9:00 PM",   period: "dinner" },
  { label: "9:00 PM - 11:00 PM",  period: "dinner" },
];

const LEGACY_FRIDAY_SLOTS: TimeSlot[] = [
  { label: "9:00 AM - 10:30 AM",  period: "breakfast" },
  { label: "10:45 AM - 12:15 PM", period: "brunch" },
  { label: "12:30 PM - 2:30 PM",  period: "lunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "5:00 PM - 7:00 PM",   period: "tea" },
  { label: "7:30 PM - 9:30 PM",   period: "dinner" },
  { label: "9:45 PM - 11:45 PM",  period: "dinner" },
];

const LEGACY_WEEKEND_SLOTS: TimeSlot[] = [
  { label: "10:00 AM - 12:00 PM", period: "breakfast" },
  { label: "12:15 PM - 2:15 PM",  period: "brunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "5:00 PM - 7:00 PM",   period: "tea" },
  { label: "7:30 PM - 9:30 PM",   period: "dinner" },
  { label: "9:45 PM - 11:45 PM",  period: "dinner" },
];

// ── Current slots (from April 8 2026 onward) ────────────────────────────────
const NEW_WEEKDAY_SLOTS: TimeSlot[] = [
  { label: "9:00 AM - 12:00 PM",  period: "breakfast" },
  { label: "12:30 PM - 2:30 PM",  period: "brunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "4:30 PM - 6:30 PM",   period: "tea" },
  { label: "6:45 PM - 8:15 PM",   period: "dinner" },
  { label: "8:30 PM - 10:00 PM",  period: "dinner" },
];

const NEW_WEEKEND_SLOTS: TimeSlot[] = [
  { label: "10:00 AM - 12:00 PM", period: "breakfast" },
  { label: "12:00 PM - 2:00 PM",  period: "breakfast" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "4:30 PM - 6:30 PM",   period: "tea" },
  { label: "6:45 PM - 8:15 PM",   period: "dinner" },
  { label: "8:30 PM - 10:00 PM",  period: "dinner" },
];

// Cutover date — slots changed from this date onwards
const CUTOVER = new Date("2026-04-08");
function isCutoverOrLater(date: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const c = new Date(CUTOVER.getFullYear(), CUTOVER.getMonth(), CUTOVER.getDate());
  return d >= c;
}

export function getTimeSlotsForDate(date: Date | undefined): TimeSlot[] {
  if (!date) return [];
  const day = date.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const isWeekend = day === 0 || day === 6;

  if (isCutoverOrLater(date)) {
    return isWeekend ? NEW_WEEKEND_SLOTS : NEW_WEEKDAY_SLOTS;
  } else {
    if (day === 5) return LEGACY_FRIDAY_SLOTS;
    if (isWeekend) return LEGACY_WEEKEND_SLOTS;
    return LEGACY_WEEKDAY_SLOTS;
  }
}

export const ALL_SLOTS: TimeSlot[] = [
  // Legacy
  { label: "9:00 AM - 10:30 AM",  period: "breakfast" },
  { label: "10:00 AM - 12:00 PM", period: "breakfast" },
  { label: "10:45 AM - 12:15 PM", period: "brunch" },
  { label: "12:15 PM - 2:15 PM",  period: "brunch" },
  { label: "12:30 PM - 2:30 PM",  period: "lunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "5:00 PM - 7:00 PM",   period: "tea" },
  { label: "7:00 PM - 9:00 PM",   period: "dinner" },
  { label: "7:30 PM - 9:30 PM",   period: "dinner" },
  { label: "9:00 PM - 11:00 PM",  period: "dinner" },
  { label: "9:45 PM - 11:45 PM",  period: "dinner" },
  // New
  { label: "12:00 PM - 2:00 PM",  period: "breakfast" },
  { label: "4:30 PM - 6:30 PM",   period: "tea" },
  { label: "6:45 PM - 8:15 PM",   period: "dinner" },
  { label: "8:30 PM - 10:00 PM",  period: "dinner" },
];

export function getTimePeriodForLabel(timeLabel: string): MealPeriod | null {
  const slot = ALL_SLOTS.find(s => s.label === timeLabel);
  return slot ? slot.period : null;
}

export function isMonday(_date: Date): boolean {
  return false;
}

export function getPeriodLabel(period: MealPeriod): string {
  switch (period) {
    case "breakfast": return "Breakfast";
    case "brunch":    return "Brunch";
    case "lunch":     return "Lunch";
    case "tea":       return "Tea";
    case "dinner":    return "Dinner";
  }
}
