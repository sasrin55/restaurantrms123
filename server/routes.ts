import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertReservationSchema, insertOrderSchema, insertOrderItemSchema, insertMenuItemSchema, guests } from "@shared/schema";
import { menuCategories } from "@shared/menuData";
import { appendReservationToSheet, updateReservationInSheet, exportAllReservationsToSheet, syncFromSheet, fetchAllSheetTabsData, type SheetReservationUpdate, type SheetNewReservation } from "./googleSheets";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  storage.rebuildGuestData().catch(err => console.error("Failed to rebuild guest data:", err));

  // Seed default staff members if none exist
  storage.getStaffMembers().then(existing => {
    if (existing.length === 0) {
      const defaults = ["Aqsa", "Arslan", "Feroz", "Angelica", "Aleezy", "Fiza"];
      Promise.all(defaults.map(n => storage.addStaffMember(n))).catch(console.error);
    }
  }).catch(console.error);

  app.get("/api/reservations", async (req, res) => {
    const reservations = await storage.getReservations();
    res.json(reservations);
  });

  app.get("/api/reservations/:id", async (req, res) => {
    const reservation = await storage.getReservation(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    res.json(reservation);
  });

  app.post("/api/reservations", async (req, res) => {
    const parsed = insertReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }

    // Block double-booking: reject if table already has an active reservation at this date/time
    const conflict = await storage.checkTableConflict(
      parsed.data.tableId,
      parsed.data.date,
      parsed.data.time
    );
    if (conflict) {
      return res.status(409).json({
        error: `${parsed.data.tableName} is already booked for ${parsed.data.time} — double booking prevented`,
        conflict: { customerName: conflict.customerName, status: conflict.status },
      });
    }

    const reservation = await storage.createReservation(parsed.data);

    await storage.upsertGuest(
      reservation.customerName,
      reservation.phoneNumber,
      reservation.date,
      reservation.partySize
    );

    appendReservationToSheet(reservation).catch(err =>
      console.error("Google Sheets sync error:", err)
    );

    res.status(201).json(reservation);
  });

  app.patch("/api/reservations/:id/status", async (req, res) => {
    const { status } = req.body;
    if (!status || typeof status !== "string") {
      return res.status(400).json({ error: "Status is required" });
    }
    const reservation = await storage.updateReservationStatus(req.params.id, status);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    updateReservationInSheet(reservation).catch(err =>
      console.error("Google Sheets status sync error:", err)
    );

    if (status === "no-show") {
      storage.upsertGuest(
        reservation.customerName,
        reservation.phoneNumber,
        reservation.date,
        reservation.partySize,
      ).catch(err => console.error("Failed to update guest no-show count:", err));
    }

    res.json(reservation);
  });

  app.patch("/api/reservations/:id", async (req, res) => {
    const { date, time, partySize, tableId, tableName, phoneNumber, comments, customerName } = req.body;
    const updates: any = {};
    if (date !== undefined) updates.date = date;
    if (time !== undefined) updates.time = time;
    if (partySize !== undefined) updates.partySize = partySize;
    if (tableId !== undefined) updates.tableId = tableId;
    if (tableName !== undefined) updates.tableName = tableName;
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
    if (comments !== undefined) updates.comments = comments;
    if (customerName !== undefined) updates.customerName = customerName;

    // If the edit changes table/date/time, block conflicts with other reservations (exclude self)
    if (updates.tableId !== undefined || updates.date !== undefined || updates.time !== undefined) {
      const current = await storage.getReservation(req.params.id);
      if (current) {
        const checkTableId = updates.tableId ?? current.tableId;
        const checkDate    = updates.date    ?? current.date;
        const checkTime    = updates.time    ?? current.time;
        const checkName    = updates.tableName ?? current.tableName;
        const conflict = await storage.checkTableConflict(checkTableId, checkDate, checkTime, req.params.id);
        if (conflict) {
          return res.status(409).json({
            error: `${checkName} is already booked for ${checkTime} — double booking prevented`,
            conflict: { customerName: conflict.customerName, status: conflict.status },
          });
        }
      }
    }

    const reservation = await storage.updateReservation(req.params.id, updates);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    updateReservationInSheet(reservation).catch(err =>
      console.error("Google Sheets edit sync error:", err)
    );

    res.json(reservation);
  });

  app.delete("/api/reservations/:id", async (req, res) => {
    const deleted = await storage.deleteReservation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    res.status(204).send();
  });

  app.post("/api/reservations/export-sheets", async (_req, res) => {
    try {
      const reservations = await storage.getReservations();
      const spreadsheetId = await exportAllReservationsToSheet(reservations);
      res.json({
        success: true,
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      });
    } catch (error: any) {
      console.error("Export to Google Sheets failed:", error);
      res.status(500).json({ error: error.message || "Failed to export to Google Sheets" });
    }
  });

  async function applySyncFromSheets(): Promise<{ updated: number; created: number; deleted: number; errors: string[] }> {
    const result = await syncFromSheet();
    const sheetUpdates: SheetReservationUpdate[] = result.updates || [];
    const sheetNewReservations: SheetNewReservation[] = result.newReservations || [];
    const sheetDates: string[] = result.sheetDates || [];
    let updatedCount = 0;
    let createdCount = 0;
    let deletedCount = 0;

    const sheetIds = new Set(sheetUpdates.map(u => u.id));

    for (const u of sheetUpdates) {
      const existing = await storage.getReservation(u.id);
      if (!existing) continue;

      const hasChanges =
        existing.customerName !== u.customerName ||
        existing.phoneNumber !== u.phoneNumber ||
        existing.time !== u.time ||
        existing.partySize !== u.partySize ||
        existing.tableId !== u.tableId ||
        existing.tableName !== u.tableName ||
        existing.comments !== u.comments ||
        existing.status !== u.status;

      if (hasChanges) {
        await storage.updateReservation(u.id, {
          customerName: u.customerName,
          phoneNumber: u.phoneNumber,
          time: u.time,
          partySize: u.partySize,
          tableId: u.tableId,
          tableName: u.tableName,
          comments: u.comments,
          status: u.status,
        });
        updatedCount++;
      }
    }

    for (const nr of sheetNewReservations) {
      const newRes = await storage.createReservation({
        customerName: nr.customerName,
        phoneNumber: nr.phoneNumber,
        date: nr.date,
        time: nr.time,
        partySize: nr.partySize,
        tableName: nr.tableName,
        tableId: nr.tableId,
        comments: nr.comments,
        status: "confirmed",
      });
      sheetIds.add(newRes.id);
      createdCount++;
    }

    if (updatedCount > 0 || createdCount > 0) {
      await storage.rebuildGuestData();
    }

    return { updated: updatedCount, created: createdCount, deleted: deletedCount, errors: result.errors };
  }

  app.post("/api/reservations/sync-from-sheets", async (_req, res) => {
    try {
      const result = await applySyncFromSheets();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Sync from Google Sheets failed:", error);
      res.status(500).json({ error: error.message || "Failed to sync from Google Sheets" });
    }
  });

  // Auto-sync from Sheets disabled — DB is now the source of truth.

  app.get("/api/guests", async (req, res) => {
    const guests = await storage.getGuests();
    res.json(guests);
  });

  app.delete("/api/guests/:id", async (req, res) => {
    const deleted = await storage.deleteGuest(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Guest not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/orders", async (req, res) => {
    const allOrders = await storage.getOrders();
    res.json(allOrders);
  });

  app.get("/api/orders/:id", async (req, res) => {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  });

  app.get("/api/orders/by-reservation/:reservationId", async (req, res) => {
    const order = await storage.getOrderByReservationId(req.params.reservationId);
    if (!order) return res.status(404).json({ error: "No order found for this reservation" });
    res.json(order);
  });

  app.post("/api/orders", async (req, res) => {
    const parsed = insertOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

    const orderData = { ...parsed.data };

    if (orderData.reservationId) {
      const reservation = await storage.getReservation(orderData.reservationId);
      if (reservation) {
        orderData.tableId = reservation.tableId;
        orderData.tableName = reservation.tableName;
        const guests = await storage.getGuests();
        const guest = guests.find((g) => g.phone === reservation.phoneNumber);
        if (guest) {
          orderData.guestId = guest.id;
          orderData.guestName = guest.name;
        } else {
          orderData.guestName = reservation.customerName;
        }
      }
    } else if (!orderData.guestId && orderData.tableId) {
      const reservations = await storage.getReservations();
      const today = new Date().toISOString().split("T")[0];
      const match = reservations.find(
        (r) => r.tableId === orderData.tableId && r.date === today && (r.status === "booked" || r.status === "confirmed" || r.status === "seated")
      );
      if (match) {
        const guests = await storage.getGuests();
        const guest = guests.find((g) => g.phone === match.phoneNumber);
        if (guest) {
          orderData.guestId = guest.id;
          orderData.guestName = guest.name;
        } else {
          orderData.guestName = match.customerName;
        }
      }
    }

    const order = await storage.createOrder(orderData);
    res.status(201).json(order);
  });

  app.patch("/api/orders/:id/status", async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });
    const order = await storage.updateOrderStatus(req.params.id, status);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  });

  app.delete("/api/orders/:id", async (req, res) => {
    const deleted = await storage.deleteOrder(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Order not found" });
    res.status(204).send();
  });

  app.get("/api/orders/:id/items", async (req, res) => {
    const items = await storage.getOrderItems(req.params.id);
    res.json(items);
  });

  app.post("/api/orders/:id/items", async (req, res) => {
    const parsed = insertOrderItemSchema.safeParse({ ...req.body, orderId: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const item = await storage.addOrderItem(parsed.data);
    res.status(201).json(item);
  });

  app.patch("/api/order-items/:id", async (req, res) => {
    const { quantity } = req.body;
    if (typeof quantity !== "number") return res.status(400).json({ error: "Quantity is required" });
    const item = await storage.updateOrderItemQuantity(req.params.id, quantity);
    res.json(item || { deleted: true });
  });

  app.delete("/api/order-items/:id", async (req, res) => {
    const deleted = await storage.deleteOrderItem(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Item not found" });
    res.status(204).send();
  });

  // Seed menu items from static data if database is empty
  storage.getMenuItemCount().then(async (count) => {
    if (count === 0) {
      for (const cat of menuCategories) {
        for (const item of cat.items) {
          await storage.addMenuItem({ category: cat.label, itemName: item.name });
        }
      }
      console.log("Seeded menu items from static data");
    }
  }).catch(err => console.error("Failed to seed menu items:", err));

  app.get("/api/menu", async (_req, res) => {
    const items = await storage.getMenuItems();
    const grouped = new Map<string, { id: string; itemName: string }[]>();
    for (const item of items) {
      const list = grouped.get(item.category) || [];
      list.push({ id: item.id, itemName: item.itemName });
      grouped.set(item.category, list);
    }
    const categories = Array.from(grouped.entries()).map(([category, items]) => ({
      category,
      items,
    }));
    res.json(categories);
  });

  app.post("/api/menu", async (req, res) => {
    const parsed = insertMenuItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const item = await storage.addMenuItem(parsed.data);
    res.status(201).json(item);
  });

  app.delete("/api/menu/:id", async (req, res) => {
    const deleted = await storage.deleteMenuItem(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Menu item not found" });
    res.status(204).send();
  });

  app.get("/api/analytics/menu", async (_req, res) => {
    const allOrders = await storage.getOrders();
    const allItems = await storage.getAllOrderItems();

    const itemCounts = new Map<string, { category: string; totalQty: number; orderCount: number }>();
    const categoryCounts = new Map<string, number>();
    const orderIdSet = new Set(allOrders.map(o => o.id));

    for (const item of allItems) {
      if (!orderIdSet.has(item.orderId)) continue;
      const existing = itemCounts.get(item.itemName);
      if (existing) {
        existing.totalQty += item.quantity;
        existing.orderCount += 1;
      } else {
        itemCounts.set(item.itemName, { category: item.category, totalQty: item.quantity, orderCount: 1 });
      }
      categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + item.quantity);
    }

    const topItems = Array.from(itemCounts.entries())
      .map(([name, data]) => ({ name, category: data.category, totalQty: data.totalQty, orderCount: data.orderCount }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 20);

    const categoryBreakdown = Array.from(categoryCounts.entries())
      .map(([category, totalQty]) => ({ category, totalQty }))
      .sort((a, b) => b.totalQty - a.totalQty);

    const totalOrders = allOrders.length;
    const totalItemsOrdered = allItems.reduce((s, i) => s + i.quantity, 0);

    res.json({ topItems, categoryBreakdown, totalOrders, totalItemsOrdered });
  });

  app.get("/api/analytics/guests/:guestId", async (req, res) => {
    const guestOrders = await storage.getOrdersByGuestId(req.params.guestId);
    const allItemsForGuest: { category: string; itemName: string; quantity: number }[] = [];

    for (const order of guestOrders) {
      const items = await storage.getOrderItems(order.id);
      allItemsForGuest.push(...items.map(i => ({ category: i.category, itemName: i.itemName, quantity: i.quantity })));
    }

    const itemCounts = new Map<string, number>();
    for (const item of allItemsForGuest) {
      itemCounts.set(item.itemName, (itemCounts.get(item.itemName) || 0) + item.quantity);
    }

    const favouriteItems = Array.from(itemCounts.entries())
      .map(([name, qty]) => ({ name, quantity: qty }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const totalOrders = guestOrders.length;
    const totalItemsOrdered = allItemsForGuest.reduce((s, i) => s + i.quantity, 0);
    const avgItemsPerOrder = totalOrders > 0 ? Math.round(totalItemsOrdered / totalOrders) : 0;

    res.json({ favouriteItems, totalOrders, totalItemsOrdered, avgItemsPerOrder });
  });

  app.get("/api/waitlist", async (_req, res) => {
    const entries = await storage.getWaitlistEntries();
    res.json(entries);
  });

  app.post("/api/waitlist", async (req, res) => {
    const { guestName, phone, partySize, notes, joinedAt, estimatedWaitMins, preferredDate, preferredTime, preferredTableId } = req.body;
    if (!guestName || !partySize) return res.status(400).json({ error: "guestName and partySize are required" });
    const entry = await storage.createWaitlistEntry({
      guestName,
      phone: phone || "",
      partySize: parseInt(partySize),
      notes: notes || "",
      joinedAt: joinedAt || Date.now(),
      estimatedWaitMins: estimatedWaitMins || 20,
      notified: false,
      notifiedAt: null,
      status: "waiting",
      preferredDate: preferredDate || "",
      preferredTime: preferredTime || "",
      preferredTableId: preferredTableId || null,
    });
    res.status(201).json(entry);
  });

  app.patch("/api/waitlist/:id", async (req, res) => {
    const updated = await storage.updateWaitlistEntry(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Entry not found" });
    res.json(updated);
  });

  app.delete("/api/waitlist/:id", async (req, res) => {
    const deleted = await storage.deleteWaitlistEntry(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Entry not found" });
    res.status(204).send();
  });

  // Bulk-archive (delete) all done entries for a specific date
  app.delete("/api/waitlist/archive/:date", async (req, res) => {
    const count = await storage.archiveWaitlistByDate(req.params.date);
    res.json({ deleted: count });
  });

  app.post("/api/waitlist/notify", async (req, res) => {
    const { guestName, phone } = req.body;
    if (!phone || !guestName) {
      return res.status(400).json({ error: "guestName and phone are required" });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return res.status(503).json({ error: "WhatsApp credentials not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)" });
    }

    const to = phone.replace(/\D/g, "");

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "waitlist_ready",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: guestName }],
          },
        ],
      },
    };

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("WhatsApp API error:", err);
      return res.status(502).json({ error: (err as any)?.error?.message || "WhatsApp API error" });
    }

    const data = await response.json();
    res.json({ success: true, data });
  });

  app.get("/api/analytics/sheets", async (_req, res) => {
    try {
      const tabs = await fetchAllSheetTabsData();
      res.json(tabs);
    } catch (error: any) {
      console.error("Failed to fetch sheet analytics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sheet data" });
    }
  });

  app.post("/api/incoming-call", async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "phone is required" });
    }

    const allGuests = await storage.getGuests();
    const normalizedPhone = phone.replace(/\s+/g, "").replace(/^0+/, "");
    let guest = allGuests.find(g => {
      const gPhone = g.phone.replace(/\s+/g, "").replace(/^0+/, "");
      return gPhone === normalizedPhone || gPhone.includes(normalizedPhone) || normalizedPhone.includes(gPhone);
    });

    let isNew = 0;
    if (!guest) {
      isNew = 1;
      guest = await storage.upsertGuest("Unknown Caller", phone, new Date().toISOString().split("T")[0], 0);
    }

    const allReservations = await storage.getReservations();
    const guestReservations = allReservations.filter(r => {
      const rPhone = r.phoneNumber.replace(/\s+/g, "").replace(/^0+/, "");
      return rPhone === normalizedPhone || rPhone.includes(normalizedPhone) || normalizedPhone.includes(rPhone);
    });
    const lastReservation = guestReservations.length > 0 ? guestReservations[0] : null;

    const call = await storage.createCall({
      phone,
      customerId: guest.id,
      isNewCustomer: isNew,
    });

    res.json({
      call,
      guest,
      isNewCustomer: isNew === 1,
      lastReservation,
    });
  });

  app.get("/api/calls", async (_req, res) => {
    const allCalls = await storage.getCalls();
    const allGuests = await storage.getGuests();
    const allReservations = await storage.getReservations();

    const enriched = allCalls.map(call => {
      const guest = allGuests.find(g => g.id === call.customerId);
      const normalizedPhone = call.phone.replace(/\s+/g, "").replace(/^0+/, "");
      const guestReservations = allReservations.filter(r => {
        const rPhone = r.phoneNumber.replace(/\s+/g, "").replace(/^0+/, "");
        return rPhone === normalizedPhone || rPhone.includes(normalizedPhone) || normalizedPhone.includes(rPhone);
      });
      const lastReservation = guestReservations.length > 0 ? guestReservations[0] : null;

      return {
        ...call,
        guestName: guest?.name || "Unknown",
        visitCount: guest?.visitCount || 0,
        lastReservation,
      };
    });

    res.json(enriched);
  });

  app.post("/api/call-log", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ error: "phone is required" });
      }

      console.log("Incoming call from MacroDroid:", phone);

      const allGuests = await storage.getGuests();
      const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "").replace(/^0+/, "");
      let guest = allGuests.find(g => {
        const gPhone = g.phone.replace(/[\s\-\(\)]/g, "").replace(/^0+/, "");
        return gPhone === normalizedPhone || gPhone.includes(normalizedPhone) || normalizedPhone.includes(gPhone);
      });

      let isNew = 0;
      if (!guest) {
        isNew = 1;
        guest = await storage.upsertGuest("Unknown Caller", phone, new Date().toISOString().split("T")[0], 0);
      }

      const call = await storage.createCall({
        phone,
        customerId: guest.id,
        isNewCustomer: isNew,
      });

      const allReservations = await storage.getReservations();
      const guestReservations = allReservations.filter(r => {
        const rPhone = r.phoneNumber.replace(/[\s\-\(\)]/g, "").replace(/^0+/, "");
        return rPhone === normalizedPhone || rPhone.includes(normalizedPhone) || normalizedPhone.includes(rPhone);
      });
      const lastReservation = guestReservations.length > 0 ? guestReservations[0] : null;

      res.json({
        success: true,
        call,
        guest: { name: guest.name, visitCount: guest.visitCount },
        isNewCustomer: isNew === 1,
        lastReservation: lastReservation ? {
          date: lastReservation.date,
          time: lastReservation.time,
          partySize: lastReservation.partySize,
          table: lastReservation.tableName,
        } : null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // ── Staff Members ─────────────────────────────────────────────────────────
  app.get("/api/staff", async (_req, res) => {
    const members = await storage.getStaffMembers();
    res.json(members);
  });

  app.post("/api/staff", async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    try {
      const member = await storage.addStaffMember(name.trim());
      res.status(201).json(member);
    } catch (err: any) {
      res.status(409).json({ error: "Name already exists" });
    }
  });

  app.delete("/api/staff/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const ok = await storage.deleteStaffMember(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  });

  return httpServer;
}
