import { type User, type InsertUser, type Reservation, type InsertReservation, type Guest, type InsertGuest, type Order, type InsertOrder, type OrderItem, type InsertOrderItem, type DbMenuItem, type InsertMenuItem, type Call, type InsertCall, users, reservations, guests, orders, orderItems, menuItems, calls } from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and } from "drizzle-orm";

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

  getOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  deleteOrder(id: string): Promise<boolean>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  getAllOrderItems(): Promise<OrderItem[]>;
  addOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  updateOrderItemQuantity(id: string, quantity: number): Promise<OrderItem | undefined>;
  deleteOrderItem(id: string): Promise<boolean>;
  getOrdersByGuestId(guestId: string): Promise<Order[]>;
  getOrderByReservationId(reservationId: string): Promise<Order | undefined>;

  getMenuItems(): Promise<DbMenuItem[]>;
  addMenuItem(item: InsertMenuItem): Promise<DbMenuItem>;
  deleteMenuItem(id: string): Promise<boolean>;
  getMenuItemCount(): Promise<number>;

  getCalls(): Promise<Call[]>;
  createCall(call: InsertCall): Promise<Call>;
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
      let noShowCount = 0;
      for (const r of allReservations) {
        if (r.status === "no-show") {
          noShowCount++;
        } else {
          visitKeys.add(`${r.date}|${r.time}|${r.partySize}`);
        }
      }
      const visitCount = visitKeys.size;
      let totalPartySize = 0;
      const seenKeys = new Set<string>();
      for (const r of allReservations) {
        if (r.status === "no-show") continue;
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
        noShowCount,
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
      noShowCount: 0,
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

    const visitMap = new Map<string, { name: string; phone: string; visitKeys: Set<string>; totalPartySize: number; lastVisit: string; noShowCount: number }>();

    for (const r of allReservations) {
      const key = r.phoneNumber;
      const isNoShow = r.status === "no-show";
      const visitKey = `${r.date}|${r.time}|${r.partySize}`;
      const existing = visitMap.get(key);

      if (existing) {
        if (isNoShow) {
          existing.noShowCount++;
        } else if (!existing.visitKeys.has(visitKey)) {
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
          visitKeys: isNoShow ? new Set() : new Set([visitKey]),
          totalPartySize: isNoShow ? 0 : r.partySize,
          lastVisit: r.date,
          noShowCount: isNoShow ? 1 : 0,
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
          noShowCount: data.noShowCount,
        }).where(eq(guests.id, existing.id));
      } else {
        await db.insert(guests).values({
          name: data.name,
          phone: data.phone,
          visitCount: data.visitKeys.size,
          lastVisit: data.lastVisit,
          totalPartySize: data.totalPartySize,
          noShowCount: data.noShowCount,
        });
      }
    }
  }

  async getOrders(): Promise<Order[]> {
    return db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values({
      ...insertOrder,
      status: insertOrder.status || "open",
    }).returning();
    return order;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const [updated] = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning();
    return updated;
  }

  async deleteOrder(id: string): Promise<boolean> {
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    const result = await db.delete(orders).where(eq(orders.id, id)).returning();
    return result.length > 0;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async addOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [existing] = await db.select().from(orderItems).where(
      and(eq(orderItems.orderId, item.orderId), eq(orderItems.itemName, item.itemName))
    );
    if (existing) {
      const [updated] = await db.update(orderItems).set({
        quantity: existing.quantity + (item.quantity || 1),
      }).where(eq(orderItems.id, existing.id)).returning();
      return updated;
    }
    const [orderItem] = await db.insert(orderItems).values(item).returning();
    return orderItem;
  }

  async updateOrderItemQuantity(id: string, quantity: number): Promise<OrderItem | undefined> {
    if (quantity <= 0) {
      await db.delete(orderItems).where(eq(orderItems.id, id));
      return undefined;
    }
    const [updated] = await db.update(orderItems).set({ quantity }).where(eq(orderItems.id, id)).returning();
    return updated;
  }

  async getAllOrderItems(): Promise<OrderItem[]> {
    return db.select().from(orderItems);
  }

  async deleteOrderItem(id: string): Promise<boolean> {
    const result = await db.delete(orderItems).where(eq(orderItems.id, id)).returning();
    return result.length > 0;
  }

  async getOrdersByGuestId(guestId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.guestId, guestId)).orderBy(desc(orders.createdAt));
  }

  async getOrderByReservationId(reservationId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.reservationId, reservationId));
    return order;
  }

  async getMenuItems(): Promise<DbMenuItem[]> {
    return db.select().from(menuItems).orderBy(menuItems.category, menuItems.itemName);
  }

  async addMenuItem(item: InsertMenuItem): Promise<DbMenuItem> {
    const [menuItem] = await db.insert(menuItems).values(item).returning();
    return menuItem;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    const result = await db.delete(menuItems).where(eq(menuItems.id, id)).returning();
    return result.length > 0;
  }

  async getMenuItemCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(menuItems);
    return Number(result.count);
  }

  async getCalls(): Promise<Call[]> {
    return db.select().from(calls).orderBy(desc(calls.createdAt));
  }

  async createCall(call: InsertCall): Promise<Call> {
    const [newCall] = await db.insert(calls).values(call).returning();
    return newCall;
  }
}

export const storage = new DatabaseStorage();
