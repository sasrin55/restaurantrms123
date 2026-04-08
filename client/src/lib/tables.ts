export type TableSection = "Outdoor" | "Main Floor" | "Upstairs";

export interface RestaurantTable {
  id: number;
  number: string;
  minCapacity: number;
  maxCapacity: number;
  section: TableSection;
}

export const restaurantTables: RestaurantTable[] = [
  // Outdoor
  { id: 11,  number: "11 Outdoor",  minCapacity: 5,  maxCapacity: 6,  section: "Outdoor" },
  { id: 12,  number: "12 Outdoor",  minCapacity: 7,  maxCapacity: 8,  section: "Outdoor" },
  { id: 13,  number: "13 Outdoor",  minCapacity: 3,  maxCapacity: 4,  section: "Outdoor" },

  // Main Floor
  { id: 17,  number: "17",  minCapacity: 4,  maxCapacity: 4,  section: "Main Floor" },
  { id: 18,  number: "18",  minCapacity: 3,  maxCapacity: 3,  section: "Main Floor" },
  { id: 19,  number: "19",  minCapacity: 6,  maxCapacity: 6,  section: "Main Floor" },
  { id: 190, number: "19A", minCapacity: 3,  maxCapacity: 4,  section: "Main Floor" },
  { id: 20,  number: "20",  minCapacity: 10, maxCapacity: 10, section: "Main Floor" },
  { id: 21,  number: "21",  minCapacity: 3,  maxCapacity: 3,  section: "Main Floor" },
  { id: 22,  number: "22",  minCapacity: 4,  maxCapacity: 4,  section: "Main Floor" },
  { id: 23,  number: "23",  minCapacity: 6,  maxCapacity: 6,  section: "Main Floor" },
  { id: 24,  number: "24",  minCapacity: 5,  maxCapacity: 5,  section: "Main Floor" },
  { id: 25,  number: "25",  minCapacity: 10, maxCapacity: 10, section: "Main Floor" },
  { id: 26,  number: "26",  minCapacity: 2,  maxCapacity: 2,  section: "Main Floor" },
  { id: 27,  number: "27",  minCapacity: 2,  maxCapacity: 2,  section: "Main Floor" },

  // Upstairs
  { id: 40,  number: "40",  minCapacity: 4,  maxCapacity: 4,  section: "Upstairs" },
  { id: 41,  number: "41",  minCapacity: 6,  maxCapacity: 8,  section: "Upstairs" },
  { id: 42,  number: "42",  minCapacity: 6,  maxCapacity: 8,  section: "Upstairs" },
  { id: 420, number: "42A", minCapacity: 2,  maxCapacity: 3,  section: "Upstairs" },
  { id: 43,  number: "43",  minCapacity: 4,  maxCapacity: 4,  section: "Upstairs" },
  { id: 44,  number: "44",  minCapacity: 4,  maxCapacity: 4,  section: "Upstairs" },
  { id: 45,  number: "45",  minCapacity: 2,  maxCapacity: 3,  section: "Upstairs" },
  { id: 46,  number: "46",  minCapacity: 2,  maxCapacity: 2,  section: "Upstairs" },
  { id: 47,  number: "47",  minCapacity: 2,  maxCapacity: 2,  section: "Upstairs" },
  { id: 48,  number: "48",  minCapacity: 6,  maxCapacity: 8,  section: "Upstairs" },
  { id: 49,  number: "49",  minCapacity: 2,  maxCapacity: 2,  section: "Upstairs" },
  { id: 51,  number: "51",  minCapacity: 4,  maxCapacity: 4,  section: "Upstairs" },
  { id: 52,  number: "52",  minCapacity: 4,  maxCapacity: 4,  section: "Upstairs" },
  { id: 53,  number: "53",  minCapacity: 4,  maxCapacity: 4,  section: "Upstairs" },
];

export const TABLE_SECTIONS: TableSection[] = ["Outdoor", "Main Floor", "Upstairs"];

export function getTablesBySection(section: TableSection): RestaurantTable[] {
  return restaurantTables.filter(t => t.section === section);
}

export interface TepanyakiSeat {
  id: number;
  number: string;
}

export const tepanyakiSeats: TepanyakiSeat[] = Array.from({ length: 8 }, (_, i) => ({
  id: 1000 + i + 1,
  number: `${i + 1}`,
}));
