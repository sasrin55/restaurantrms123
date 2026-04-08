export type MealPeriod = "breakfast" | "brunch" | "lunch" | "tea" | "dinner";

export interface TimeSlot {
  label: string;
  period: MealPeriod;
}

const WEEKDAY_SLOTS: TimeSlot[] = [
  { label: "9:00 AM - 12:00 PM",  period: "breakfast" },
  { label: "12:30 PM - 2:30 PM",  period: "lunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "4:30 PM - 6:30 PM",   period: "tea" },
  { label: "6:45 PM - 8:15 PM",   period: "dinner" },
  { label: "8:30 PM - 10:00 PM",  period: "dinner" },
];

const WEEKEND_SLOTS: TimeSlot[] = [
  { label: "10:00 AM - 12:00 PM", period: "breakfast" },
  { label: "12:00 PM - 2:00 PM",  period: "brunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "4:30 PM - 6:30 PM",   period: "tea" },
  { label: "6:45 PM - 8:15 PM",   period: "dinner" },
  { label: "8:30 PM - 10:00 PM",  period: "dinner" },
];

export function getTimeSlotsForDate(date: Date | undefined): TimeSlot[] {
  if (!date) return [];
  const day = date.getDay(); // 0=Sun, 6=Sat
  return (day === 0 || day === 6) ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
}

// Union of all current slot labels for period lookup
export const ALL_SLOTS: TimeSlot[] = [
  ...WEEKDAY_SLOTS,
  // Weekend-only slots not in weekday list
  { label: "10:00 AM - 12:00 PM", period: "breakfast" },
  { label: "12:00 PM - 2:00 PM",  period: "brunch" },
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
