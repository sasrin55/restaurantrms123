import { type User, type InsertUser, type Reservation, type InsertReservation, type Guest, type InsertGuest, users, reservations, guests } from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

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
  rebuildGuestData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getReservations(): Promise<Reservation[]> {
    const results = await db.select().from(reservations).orderBy(desc(reservations.date), desc(reservations.time));
    return results;
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id));
    return reservation;
  }

  async createReservation(insertReservation: InsertReservation): Promise<Reservation> {
    const [reservation] = await db.insert(reservations).values({
      ...insertReservation,
      comments: insertReservation.comments ?? "",
      status: insertReservation.status || "confirmed",
    }).returning();
    return reservation;
  }

  async updateReservation(id: string, updates: Partial<Reservation>): Promise<Reservation | undefined> {
    const [updated] = await db.update(reservations).set(updates).where(eq(reservations.id, id)).returning();
    return updated;
  }

  async updateReservationStatus(id: string, status: string): Promise<Reservation | undefined> {
    const [updated] = await db.update(reservations).set({ status }).where(eq(reservations.id, id)).returning();
    return updated;
  }

  async deleteReservation(id: string): Promise<boolean> {
    const result = await db.delete(reservations).where(eq(reservations.id, id)).returning();
    return result.length > 0;
  }

  async getGuests(): Promise<Guest[]> {
    return db.select().from(guests).orderBy(desc(guests.visitCount));
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    const [guest] = await db.select().from(guests).where(eq(guests.id, id));
    return guest;
  }

  async upsertGuest(name: string, phone: string, date: string, partySize: number): Promise<Guest> {
    const [existing] = await db.select().from(guests).where(eq(guests.phone, phone));

    if (existing) {
      const allReservations = await db.select().from(reservations).where(eq(reservations.phoneNumber, phone));
      const visitKeys = new Set<string>();
      for (const r of allReservations) {
        visitKeys.add(`${r.date}|${r.time}|${r.partySize}`);
      }
      const visitCount = visitKeys.size;
      let totalPartySize = 0;
      const seenKeys = new Set<string>();
      for (const r of allReservations) {
        const vk = `${r.date}|${r.time}|${r.partySize}`;
        if (!seenKeys.has(vk)) {
          seenKeys.add(vk);
          totalPartySize += r.partySize;
        }
      }

      const [updated] = await db.update(guests).set({
        name: date >= existing.lastVisit ? name : existing.name,
        visitCount,
        totalPartySize,
        lastVisit: date > existing.lastVisit ? date : existing.lastVisit,
      }).where(eq(guests.id, existing.id)).returning();
      return updated;
    }

    const [guest] = await db.insert(guests).values({
      name,
      phone,
      visitCount: 1,
      lastVisit: date,
      totalPartySize: partySize,
    }).returning();
    return guest;
  }

  async deleteGuest(id: string): Promise<boolean> {
    const result = await db.delete(guests).where(eq(guests.id, id)).returning();
    return result.length > 0;
  }

  async rebuildGuestData(): Promise<void> {
    const allReservations = await db.select().from(reservations);
    if (allReservations.length === 0) return;

    const visitMap = new Map<string, { name: string; phone: string; visitKeys: Set<string>; totalPartySize: number; lastVisit: string }>();

    for (const r of allReservations) {
      const key = r.phoneNumber;
      const visitKey = `${r.date}|${r.time}|${r.partySize}`;
      const existing = visitMap.get(key);

      if (existing) {
        if (!existing.visitKeys.has(visitKey)) {
          existing.visitKeys.add(visitKey);
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
          visitKeys: new Set([visitKey]),
          totalPartySize: r.partySize,
          lastVisit: r.date,
        });
      }
    }

    for (const [, data] of Array.from(visitMap.entries())) {
      const [existing] = await db.select().from(guests).where(eq(guests.phone, data.phone));
      if (existing) {
        await db.update(guests).set({
          name: data.name,
          visitCount: data.visitKeys.size,
          totalPartySize: data.totalPartySize,
          lastVisit: data.lastVisit,
        }).where(eq(guests.id, existing.id));
      } else {
        await db.insert(guests).values({
          name: data.name,
          phone: data.phone,
          visitCount: data.visitKeys.size,
          lastVisit: data.lastVisit,
          totalPartySize: data.totalPartySize,
        });
      }
    }
  }
}

export const storage = new DatabaseStorage();
