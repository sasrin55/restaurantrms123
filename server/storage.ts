import { type User, type InsertUser, type Reservation, type InsertReservation, type Guest, type InsertGuest } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getReservations(): Promise<Reservation[]>;
  getReservation(id: string): Promise<Reservation | undefined>;
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, updates: Partial<Reservation>): Promise<Reservation | undefined>;
  updateReservationStatus(id: string, status: string): Promise<Reservation | undefined>;
  deleteReservation(id: string): Promise<boolean>;

  getGuests(): Promise<Guest[]>;
  getGuest(id: string): Promise<Guest | undefined>;
  upsertGuest(name: string, phone: string, date: string, partySize: number): Promise<Guest>;
  deleteGuest(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private reservations: Map<string, Reservation>;
  private guestsStore: Map<string, Guest>;

  constructor() {
    this.users = new Map();
    this.reservations = new Map();
    this.guestsStore = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getReservations(): Promise<Reservation[]> {
    return Array.from(this.reservations.values()).sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateB.getTime() - dateA.getTime();
    });
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    return this.reservations.get(id);
  }

  async createReservation(insertReservation: InsertReservation): Promise<Reservation> {
    const id = randomUUID();
    const reservation: Reservation = {
      ...insertReservation,
      id,
      comments: insertReservation.comments ?? "",
      status: insertReservation.status || "confirmed",
      createdAt: new Date(),
    };
    this.reservations.set(id, reservation);
    return reservation;
  }

  async updateReservation(id: string, updates: Partial<Reservation>): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    
    const updated = { ...reservation, ...updates };
    this.reservations.set(id, updated);
    return updated;
  }

  async updateReservationStatus(id: string, status: string): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    
    const updated = { ...reservation, status };
    this.reservations.set(id, updated);
    return updated;
  }

  async deleteReservation(id: string): Promise<boolean> {
    return this.reservations.delete(id);
  }

  async getGuests(): Promise<Guest[]> {
    return Array.from(this.guestsStore.values()).sort((a, b) => 
      b.visitCount - a.visitCount
    );
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    return this.guestsStore.get(id);
  }

  private visitKeys = new Set<string>();

  async upsertGuest(name: string, phone: string, date: string, partySize: number): Promise<Guest> {
    const visitKey = `${phone}|${date}|${partySize}`;
    const isNewVisit = !this.visitKeys.has(visitKey);
    this.visitKeys.add(visitKey);

    const existingByPhone = Array.from(this.guestsStore.values()).find(g => g.phone === phone);
    
    if (existingByPhone) {
      if (isNewVisit) {
        existingByPhone.visitCount += 1;
        existingByPhone.totalPartySize += partySize;
      }
      if (date > existingByPhone.lastVisit) {
        existingByPhone.lastVisit = date;
        existingByPhone.name = name;
      }
      this.guestsStore.set(existingByPhone.id, existingByPhone);
      return existingByPhone;
    }

    const id = randomUUID();
    const guest: Guest = {
      id,
      name,
      phone,
      visitCount: 1,
      lastVisit: date,
      totalPartySize: partySize,
    };
    this.guestsStore.set(id, guest);
    return guest;
  }
  async deleteGuest(id: string): Promise<boolean> {
    return this.guestsStore.delete(id);
  }

  async rebuildGuestData(): Promise<void> {
    const reservations = Array.from(this.reservations.values());
    const visitMap = new Map<string, { name: string; phone: string; dates: Set<string>; totalPartySize: number; lastVisit: string }>();

    for (const r of reservations) {
      const key = r.phoneNumber;
      const visitKey = `${r.phoneNumber}|${r.date}|${r.partySize}`;
      const existing = visitMap.get(key);

      if (existing) {
        if (!existing.dates.has(visitKey)) {
          existing.dates.add(visitKey);
          existing.totalPartySize += r.partySize;
        }
        if (r.date > existing.lastVisit) {
          existing.lastVisit = r.date;
          existing.name = r.customerName;
        }
      } else {
        visitMap.set(key, {
          name: r.customerName,
          phone: r.phoneNumber,
          dates: new Set([visitKey]),
          totalPartySize: r.partySize,
          lastVisit: r.date,
        });
      }
    }

    const oldGuests = new Map(this.guestsStore);
    this.guestsStore.clear();
    this.visitKeys.clear();

    for (const [phone, data] of Array.from(visitMap.entries())) {
      const existingGuest = Array.from(oldGuests.values()).find(g => g.phone === phone);
      const id = existingGuest?.id || randomUUID();
      const guest: Guest = {
        id,
        name: data.name,
        phone: data.phone,
        visitCount: data.dates.size,
        lastVisit: data.lastVisit,
        totalPartySize: data.totalPartySize,
      };
      this.guestsStore.set(id, guest);
      data.dates.forEach(vk => this.visitKeys.add(vk));
    }
  }
}

export const storage = new MemStorage();
