export interface RestaurantTable {
  id: number;
  number: string;
  minCapacity: number;
  maxCapacity: number;
}

export const restaurantTables: RestaurantTable[] = [
  { id: 1, number: "1", minCapacity: 5, maxCapacity: 5 },
  { id: 2, number: "2", minCapacity: 5, maxCapacity: 5 },
  { id: 25, number: "25", minCapacity: 2, maxCapacity: 3 },
  { id: 3, number: "3", minCapacity: 2, maxCapacity: 2 },
  { id: 4, number: "4", minCapacity: 2, maxCapacity: 2 },
  { id: 5, number: "5", minCapacity: 5, maxCapacity: 6 },
  { id: 20, number: "20", minCapacity: 5, maxCapacity: 6 },
  { id: 6, number: "6", minCapacity: 3, maxCapacity: 4 },
  { id: 7, number: "7", minCapacity: 4, maxCapacity: 4 },
  { id: 8, number: "8", minCapacity: 2, maxCapacity: 3 },
  { id: 9, number: "9", minCapacity: 2, maxCapacity: 2 },
  { id: 10, number: "10", minCapacity: 2, maxCapacity: 2 },
  { id: 11, number: "11", minCapacity: 6, maxCapacity: 8 },
  { id: 12, number: "12", minCapacity: 3, maxCapacity: 3 },
  { id: 13, number: "13", minCapacity: 3, maxCapacity: 4 },
  { id: 14, number: "14", minCapacity: 6, maxCapacity: 6 },
  { id: 15, number: "15", minCapacity: 2, maxCapacity: 3 },
  { id: 150, number: "15a", minCapacity: 2, maxCapacity: 3 },
];

export interface TableCombo {
  table1: RestaurantTable;
  table2: RestaurantTable;
  totalMin: number;
  totalMax: number;
}

export function getAvailableSingleTables(
  partySize: number,
  bookedTableIds: number[]
): RestaurantTable[] {
  return restaurantTables.filter(
    (t) =>
      partySize >= t.minCapacity &&
      partySize <= t.maxCapacity &&
      !bookedTableIds.includes(t.id)
  );
}

export function getAvailableTableCombos(
  partySize: number,
  bookedTableIds: number[]
): TableCombo[] {
  const available = restaurantTables.filter((t) => !bookedTableIds.includes(t.id));
  const combos: TableCombo[] = [];

  for (let i = 0; i < available.length; i++) {
    for (let j = i + 1; j < available.length; j++) {
      const t1 = available[i];
      const t2 = available[j];
      const totalMin = t1.minCapacity + t2.minCapacity;
      const totalMax = t1.maxCapacity + t2.maxCapacity;
      if (partySize >= totalMin && partySize <= totalMax) {
        combos.push({
          table1: t1,
          table2: t2,
          totalMin,
          totalMax,
        });
      }
    }
  }

  combos.sort((a, b) => a.totalMax - b.totalMax);
  return combos;
}
