export interface RestaurantTable {
  id: number;
  number: string;
  minCapacity: number;
  maxCapacity: number;
}

export const restaurantTables: RestaurantTable[] = [
  { id: 11,  number: "11",  minCapacity: 5,  maxCapacity: 6  },
  { id: 12,  number: "12",  minCapacity: 7,  maxCapacity: 8  },
  { id: 13,  number: "13",  minCapacity: 3,  maxCapacity: 4  },
  { id: 17,  number: "17",  minCapacity: 4,  maxCapacity: 4  },
  { id: 18,  number: "18",  minCapacity: 3,  maxCapacity: 3  },
  { id: 19,  number: "19",  minCapacity: 6,  maxCapacity: 6  },
  { id: 190, number: "19A", minCapacity: 3,  maxCapacity: 4  },
  { id: 20,  number: "20",  minCapacity: 10, maxCapacity: 10 },
  { id: 21,  number: "21",  minCapacity: 3,  maxCapacity: 3  },
  { id: 22,  number: "22",  minCapacity: 4,  maxCapacity: 4  },
  { id: 23,  number: "23",  minCapacity: 6,  maxCapacity: 6  },
  { id: 24,  number: "24",  minCapacity: 5,  maxCapacity: 5  },
  { id: 25,  number: "25",  minCapacity: 10, maxCapacity: 10 },
  { id: 26,  number: "26",  minCapacity: 2,  maxCapacity: 2  },
  { id: 27,  number: "27",  minCapacity: 2,  maxCapacity: 2  },
];

export interface TepanyakiSeat {
  id: number;
  number: string;
}

export const tepanyakiSeats: TepanyakiSeat[] = Array.from({ length: 8 }, (_, i) => ({
  id: 1000 + i + 1,
  number: `${i + 1}`,
}));
