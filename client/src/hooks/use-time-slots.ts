import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTimeSlotsForDate, type MealPeriod, type TimeSlot } from "@/lib/timeSlots";
import type { DbTimeSlot } from "@shared/schema";

export type { DbTimeSlot };

export function useTimeSlots() {
  const { data: dbSlots = [], isLoading } = useQuery<DbTimeSlot[]>({
    queryKey: ["/api/time-slots"],
    staleTime: 60_000,
  });

  const getSlotsForDate = useCallback(
    (date: Date | undefined): TimeSlot[] => {
      if (!date) return [];
      if (!dbSlots.length) return getTimeSlotsForDate(date);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      return dbSlots
        .filter(
          (s) =>
            s.isActive &&
            (s.appliesTo === "both" ||
              s.appliesTo === (isWeekend ? "weekend" : "weekday"))
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ label: s.label, period: s.period as MealPeriod }));
    },
    [dbSlots]
  );

  const getAllDbSlots = useCallback((): TimeSlot[] => {
    if (!dbSlots.length) return [];
    return dbSlots
      .filter((s) => s.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ label: s.label, period: s.period as MealPeriod }));
  }, [dbSlots]);

  return { dbSlots, getSlotsForDate, getAllDbSlots, isLoading };
}
