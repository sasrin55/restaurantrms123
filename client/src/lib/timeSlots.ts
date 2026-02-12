export type MealPeriod = "breakfast" | "lunch" | "dinner";

export interface TimeSlot {
  label: string;
  period: MealPeriod;
}

const WEEKDAY_SLOTS: TimeSlot[] = [
  { label: "2:00 PM - 4:00 PM", period: "lunch" },
  { label: "4:30 PM - 6:30 PM", period: "lunch" },
  { label: "7:00 PM - 9:00 PM", period: "dinner" },
  { label: "9:15 PM - 11:15 PM", period: "dinner" },
];

const WEEKEND_SLOTS: TimeSlot[] = [
  { label: "10:00 AM - 12:00 PM", period: "breakfast" },
  { label: "12:00 PM - 2:00 PM", period: "breakfast" },
  { label: "2:30 PM - 4:30 PM", period: "lunch" },
  { label: "5:00 PM - 7:00 PM", period: "lunch" },
  { label: "7:30 PM - 9:30 PM", period: "dinner" },
  { label: "9:30 PM - 11:30 PM", period: "dinner" },
];

export function getTimeSlotsForDate(date: Date | undefined): TimeSlot[] {
  if (!date) return [];
  const day = date.getDay();
  if (day === 1) return [];
  if (day === 0 || day === 6) return WEEKEND_SLOTS;
  return WEEKDAY_SLOTS;
}

export function isMonday(date: Date): boolean {
  return date.getDay() === 1;
}

export function getPeriodLabel(period: MealPeriod): string {
  switch (period) {
    case "breakfast": return "Breakfast";
    case "lunch": return "Lunch";
    case "dinner": return "Dinner";
  }
}
