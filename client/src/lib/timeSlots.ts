export type MealPeriod = "breakfast" | "brunch" | "lunch" | "tea" | "dinner";

export interface TimeSlot {
  label: string;
  period: MealPeriod;
}

const WEEKDAY_SLOTS: TimeSlot[] = [
  { label: "9:00 AM - 10:30 AM",  period: "breakfast" },
  { label: "10:45 AM - 12:15 PM", period: "brunch" },
  { label: "12:30 PM - 2:30 PM",  period: "lunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "5:00 PM - 7:00 PM",   period: "tea" },
  { label: "7:00 PM - 9:00 PM",   period: "dinner" },
  { label: "9:00 PM - 11:00 PM",  period: "dinner" },
];

const FRIDAY_SLOTS: TimeSlot[] = [
  { label: "9:00 AM - 10:30 AM",  period: "breakfast" },
  { label: "10:45 AM - 12:15 PM", period: "brunch" },
  { label: "12:30 PM - 2:30 PM",  period: "lunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "5:00 PM - 7:00 PM",   period: "tea" },
  { label: "7:30 PM - 9:30 PM",   period: "dinner" },
  { label: "9:45 PM - 11:45 PM",  period: "dinner" },
];

const WEEKEND_SLOTS: TimeSlot[] = [
  { label: "10:00 AM - 12:00 PM", period: "breakfast" },
  { label: "12:15 PM - 2:15 PM",  period: "brunch" },
  { label: "2:30 PM - 4:30 PM",   period: "lunch" },
  { label: "5:00 PM - 7:00 PM",   period: "tea" },
  { label: "7:30 PM - 9:30 PM",   period: "dinner" },
  { label: "9:45 PM - 11:45 PM",  period: "dinner" },
];

export const ALL_SLOTS: TimeSlot[] = [
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
];

export function getTimeSlotsForDate(date: Date | undefined): TimeSlot[] {
  if (!date) return [];
  const day = date.getDay();
  if (day === 5) return FRIDAY_SLOTS;
  if (day === 0 || day === 6) return WEEKEND_SLOTS;
  return WEEKDAY_SLOTS;
}

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
