export type MealPeriod = "breakfast" | "brunch" | "lunch" | "tea" | "dinner" | "iftar" | "sehri";

export interface TimeSlot {
  label: string;
  period: MealPeriod;
}

const ALL_DAY_SLOTS: TimeSlot[] = [
  { label: "9:00 AM - 10:30 AM", period: "breakfast" },
  { label: "10:45 AM - 12:15 PM", period: "brunch" },
  { label: "12:30 PM - 2:30 PM", period: "lunch" },
  { label: "2:30 PM - 4:30 PM", period: "lunch" },
  { label: "5:00 PM - 7:00 PM", period: "tea" },
  { label: "7:00 PM - 9:00 PM", period: "dinner" },
  { label: "9:00 PM - 11:00 PM", period: "dinner" },
];

const RAMADAN_SLOTS: TimeSlot[] = [
  { label: "5:00 PM", period: "iftar" },
  { label: "8:00 PM", period: "dinner" },
  { label: "10:00 PM", period: "dinner" },
  { label: "12:00 AM", period: "sehri" },
  { label: "2:00 AM", period: "sehri" },
];

function isRamadanDate(date: Date): boolean {
  const year = date.getFullYear();
  const ramadanStart = new Date(year, 1, 18);
  const ramadanEnd = new Date(year, 2, 20);
  ramadanStart.setHours(0, 0, 0, 0);
  ramadanEnd.setHours(23, 59, 59, 999);
  const check = new Date(date);
  check.setHours(0, 0, 0, 0);
  return check >= ramadanStart && check <= ramadanEnd;
}

export function getTimeSlotsForDate(date: Date | undefined): TimeSlot[] {
  if (!date) return [];
  if (isRamadanDate(date)) return RAMADAN_SLOTS;
  return ALL_DAY_SLOTS;
}

export function getTimePeriodForLabel(timeLabel: string): MealPeriod | null {
  const slot = ALL_DAY_SLOTS.find(s => s.label === timeLabel)
    ?? RAMADAN_SLOTS.find(s => s.label === timeLabel);
  return slot ? slot.period : null;
}

export function isMonday(_date: Date): boolean {
  return false;
}

export function getPeriodLabel(period: MealPeriod): string {
  switch (period) {
    case "breakfast": return "Breakfast";
    case "brunch": return "Brunch";
    case "lunch": return "Lunch";
    case "tea": return "Tea";
    case "dinner": return "Dinner";
    case "iftar": return "Iftar";
    case "sehri": return "Sehri";
  }
}
