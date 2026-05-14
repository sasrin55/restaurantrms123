import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertReservationSchema, insertOrderSchema, insertOrderItemSchema, insertMenuItemSchema, guests } from "@shared/schema";
import { menuCategories } from "@shared/menuData";
import { appendReservationToSheet, updateReservationInSheet, exportAllReservationsToSheet, syncFromSheet, fetchAllSheetTabsData, type SheetReservationUpdate, type SheetNewReservation } from "./googleSheets";
import { sendWhatsAppConfirmation } from "./whatsapp";

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

    const isWalkIn = reservation.phoneNumber.startsWith("NO_PHONE_");
    await storage.upsertGuest(
      reservation.customerName,
      reservation.phoneNumber,
      reservation.date,
      reservation.partySize,
      isWalkIn
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

  app.get("/api/guests/:id", async (req, res) => {
    const guest = await storage.getGuest(req.params.id);
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const allReservations = await storage.getReservations();
    const guestReservations = allReservations.filter(r => r.phoneNumber === guest.phone);
    res.json({ guest, reservations: guestReservations });
  });

  app.patch("/api/guests/:id", async (req, res) => {
    const allowed = ["depositRequired", "tags", "notes", "dietaryNotes", "notesUpdatedAt", "notesUpdatedBy", "name", "phone", "isWalkIn"];
    const updates: any = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (updates.notesUpdatedAt) updates.notesUpdatedAt = new Date(updates.notesUpdatedAt);
    const updated = await storage.updateGuest(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: "Guest not found" });
    res.json(updated);
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

  // ── WhatsApp send endpoint ─────────────────────────────────────────────────
  // POST /api/whatsapp/send  { "name": "...", "phone": "...", "message": "..." }
  app.post("/api/whatsapp/send", async (req, res) => {
    const { name, phone, message } = req.body;
    if (!name || !phone || !message) {
      return res.status(400).json({ error: "'name', 'phone', and 'message' are required" });
    }
    try {
      const result = await sendWhatsAppConfirmation(String(name), String(phone), String(message));
      res.json({ ok: true, chat_id: result.chat_id });
    } catch (err: any) {
      res.status(502).json({ ok: false, error: err.message });
    }
  });

  // ── WhatsApp test endpoint ─────────────────────────────────────────────────
  // POST /api/admin/test-whatsapp  { "name": "...", "phone": "..." }
  // Use this to verify the WA microservice connection without making a real reservation.
  app.post("/api/admin/test-whatsapp", async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: "Both 'name' and 'phone' are required" });
    }
    try {
      const result = await sendWhatsAppConfirmation(String(name), String(phone));
      res.json({ ok: true, chat_id: result.chat_id, message: `Test message sent to ${phone}` });
    } catch (err: any) {
      res.status(502).json({ ok: false, error: err.message });
    }
  });

  // ── V1 API (Seated B2C proxy) ─────────────────────────────────────────────
  // GET  /v1/restaurants/:restaurantId/availability?date=YYYY-MM-DD&party_size=N
  // POST /v1/restaurants/:restaurantId/reservations
  // Auth: X-API-Key header (same PUBLIC_API_KEY secret)

  const V1_RESTAURANT_ID = "paolas";
  const V1_MAX_PARTY_SIZE = 25;
  const V1_TOTAL_TABLES = 20; // capacity per slot before marking unavailable
  const V1_TIMEZONE = "Asia/Karachi";

  // 24-hour start time → internal slot label
  const V1_WEEKDAY_SLOTS = [
    { time24: "09:00", label: "9:00 AM - 10:30 AM" },
    { time24: "10:45", label: "10:45 AM - 12:15 PM" },
    { time24: "12:30", label: "12:30 PM - 2:30 PM" },
    { time24: "14:30", label: "2:30 PM - 4:30 PM" },
    { time24: "16:30", label: "4:30 PM - 6:30 PM" },
    { time24: "18:45", label: "6:45 PM - 8:15 PM" },
    { time24: "20:30", label: "8:30 PM - 10:00 PM" },
  ];
  const V1_WEEKEND_SLOTS = [
    { time24: "10:00", label: "10:00 AM - 12:00 PM" },
    { time24: "12:00", label: "12:00 PM - 2:00 PM" },
    { time24: "14:30", label: "2:30 PM - 4:30 PM" },
    { time24: "16:30", label: "4:30 PM - 6:30 PM" },
    { time24: "18:45", label: "6:45 PM - 8:15 PM" },
    { time24: "20:30", label: "8:30 PM - 10:00 PM" },
  ];

  function getV1SlotsForDate(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return (d.getDay() === 0 || d.getDay() === 6) ? V1_WEEKEND_SLOTS : V1_WEEKDAY_SLOTS;
  }

  // GET /v1/restaurants/:restaurantId/availability
  app.get("/v1/restaurants/:restaurantId/availability", requireApiKey, async (req, res) => {
    if (req.params.restaurantId !== V1_RESTAURANT_ID) {
      return res.status(404).json({ error: "restaurant_not_found", message: `Unknown restaurant '${req.params.restaurantId}'. Use 'paolas'.` });
    }
    const { date, party_size } = req.query;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "invalid_date", message: "date must be YYYY-MM-DD" });
    }
    const partySize = party_size ? parseInt(String(party_size)) : 1;
    if (isNaN(partySize) || partySize < 1) {
      return res.status(400).json({ error: "invalid_party_size", message: "party_size must be a positive integer" });
    }
    // Past date or too far in future → empty slots
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date + "T00:00:00");
    if (target < today || target > new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000)) {
      return res.json({ restaurant_id: V1_RESTAURANT_ID, date, party_size: partySize, timezone: V1_TIMEZONE, slots: [] });
    }
    // Oversized party → empty slots with reason
    if (partySize > V1_MAX_PARTY_SIZE) {
      return res.status(400).json({ error: "party_too_large", message: `Maximum party size is ${V1_MAX_PARTY_SIZE}` });
    }
    const all = await storage.getReservations();
    const active = all.filter(r => r.date === date && !["cancelled", "no-show"].includes(r.status));
    const counts: Record<string, number> = {};
    for (const r of active) counts[r.time] = (counts[r.time] ?? 0) + 1;
    const slots = getV1SlotsForDate(date).map(({ time24, label }) => {
      const booked = counts[label] ?? 0;
      const remaining = Math.max(0, V1_TOTAL_TABLES - booked);
      return { time: time24, available: remaining > 0, tables_remaining: remaining };
    });
    res.json({ restaurant_id: V1_RESTAURANT_ID, date, party_size: partySize, timezone: V1_TIMEZONE, slots });
  });

  // POST /v1/restaurants/:restaurantId/reservations
  app.post("/v1/restaurants/:restaurantId/reservations", requireApiKey, async (req, res) => {
    if (req.params.restaurantId !== V1_RESTAURANT_ID) {
      return res.status(404).json({ error: "restaurant_not_found", message: `Unknown restaurant '${req.params.restaurantId}'. Use 'paolas'.` });
    }
    const { date, time, party_size, customer_name, customer_phone, customer_email, occasion, notes, source } = req.body;
    if (!date || !time || !party_size || !customer_name || !customer_phone) {
      return res.status(400).json({ error: "missing_fields", message: "date, time, party_size, customer_name, customer_phone are all required" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ error: "invalid_date", message: "date must be YYYY-MM-DD" });
    }
    const size = parseInt(String(party_size));
    if (isNaN(size) || size < 1) {
      return res.status(400).json({ error: "invalid_party_size", message: "party_size must be a positive integer" });
    }
    if (size > V1_MAX_PARTY_SIZE) {
      return res.status(400).json({ error: "party_too_large", message: `Maximum party size is ${V1_MAX_PARTY_SIZE}` });
    }
    // Map 24h time → internal slot label
    const slotMap = getV1SlotsForDate(String(date));
    const matched = slotMap.find(s => s.time24 === String(time));
    if (!matched) {
      const valid = slotMap.map(s => s.time24).join(", ");
      return res.status(400).json({ error: "invalid_time", message: `Invalid time '${time}' for ${date}. Valid options: ${valid}` });
    }
    // Count active bookings for this slot (near-atomic: read then write in same tick)
    const all = await storage.getReservations();
    const slotCount = all.filter(r =>
      r.date === String(date) && r.time === matched.label && !["cancelled", "no-show"].includes(r.status)
    ).length;
    if (slotCount >= V1_TOTAL_TABLES) {
      return res.status(409).json({ error: "slot_unavailable", message: "This time slot is fully booked. Please choose another time." });
    }
    // Build comments from optional fields
    const extras: string[] = [];
    if (occasion) extras.push(`Occasion: ${occasion}`);
    if (customer_email) extras.push(`Email: ${customer_email}`);
    if (notes) extras.push(notes);
    const reservation = await storage.createReservation({
      customerName: String(customer_name).trim(),
      phoneNumber: String(customer_phone).trim(),
      date: String(date),
      time: matched.label,
      partySize: size,
      tableId: 0,
      tableName: "TBC",
      comments: extras.join(" | "),
      status: "booked",
      groupId: null,
      takenBy: source ? String(source) : "seated-b2c",
      previousStatus: null,
    });
    await storage.upsertGuest(reservation.customerName, reservation.phoneNumber, reservation.date, reservation.partySize, false).catch(() => {});
    res.status(201).json({
      id: reservation.id,
      status: "confirmed",
      restaurant_id: V1_RESTAURANT_ID,
      date: reservation.date,
      time: String(time),
      party_size: reservation.partySize,
    });
  });

  // ── Public API (B2C app) ──────────────────────────────────────────────────
  // All routes require: X-API-Key: <PUBLIC_API_KEY env secret>

  function requireApiKey(req: any, res: any, next: any) {
    const expected = process.env.PUBLIC_API_KEY;
    if (!expected) {
      return res.status(500).json({ error: "PUBLIC_API_KEY not configured on server" });
    }
    if (req.headers["x-api-key"] !== expected) {
      return res.status(401).json({ error: "Invalid or missing X-API-Key header" });
    }
    next();
  }

  // Time slots mirrored from client/src/lib/timeSlots.ts
  const PUBLIC_WEEKDAY_SLOTS = [
    "9:00 AM - 10:30 AM",
    "10:45 AM - 12:15 PM",
    "12:30 PM - 2:30 PM",
    "2:30 PM - 4:30 PM",
    "4:30 PM - 6:30 PM",
    "6:45 PM - 8:15 PM",
    "8:30 PM - 10:00 PM",
  ];
  const PUBLIC_WEEKEND_SLOTS = [
    "10:00 AM - 12:00 PM",
    "12:00 PM - 2:00 PM",
    "2:30 PM - 4:30 PM",
    "4:30 PM - 6:30 PM",
    "6:45 PM - 8:15 PM",
    "8:30 PM - 10:00 PM",
  ];
  // Max active bookings per slot before flagging as fully booked
  const PUBLIC_SLOT_CAPACITY = 20;

  function getSlotsForDateStr(dateStr: string): string[] {
    const d = new Date(dateStr + "T12:00:00");
    return (d.getDay() === 0 || d.getDay() === 6) ? PUBLIC_WEEKEND_SLOTS : PUBLIC_WEEKDAY_SLOTS;
  }

  function normalizePhone(p: string): string {
    return (p ?? "").replace(/\D/g, "");
  }

  // GET /api/public/availability?date=YYYY-MM-DD
  app.get("/api/public/availability", requireApiKey, async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date query param required in YYYY-MM-DD format" });
    }
    const all = await storage.getReservations();
    const active = all.filter(r => r.date === date && !["cancelled", "no-show"].includes(r.status));
    const counts: Record<string, number> = {};
    for (const r of active) counts[r.time] = (counts[r.time] ?? 0) + 1;
    const slots = getSlotsForDateStr(date).map(time => ({
      time,
      available: (counts[time] ?? 0) < PUBLIC_SLOT_CAPACITY,
      activeBookings: counts[time] ?? 0,
    }));
    res.json({ date, slots });
  });

  // GET /api/public/bookings?phone=XXXX
  app.get("/api/public/bookings", requireApiKey, async (req, res) => {
    const { phone } = req.query;
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "phone query param required" });
    }
    const normalized = normalizePhone(phone);
    const all = await storage.getReservations();
    const bookings = all
      .filter(r => normalizePhone(r.phoneNumber) === normalized)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(r => ({
        id: r.id,
        date: r.date,
        time: r.time,
        partySize: r.partySize,
        customerName: r.customerName,
        tableName: r.tableName || "TBC",
        status: r.status,
        comments: r.comments ?? "",
      }));
    res.json({ phone, bookings });
  });

  // POST /api/public/bookings
  // Body: { name, phone, date, time, partySize, comments? }
  app.post("/api/public/bookings", requireApiKey, async (req, res) => {
    const { name, phone, date, time, partySize, comments } = req.body;
    if (!name || !phone || !date || !time || !partySize) {
      return res.status(400).json({ error: "name, phone, date, time, partySize are all required" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
    const validSlots = getSlotsForDateStr(String(date));
    if (!validSlots.includes(String(time))) {
      return res.status(400).json({
        error: `Invalid time slot for ${date}. Valid options: ${validSlots.join(" | ")}`,
      });
    }
    const size = parseInt(String(partySize));
    if (isNaN(size) || size < 1 || size > 50) {
      return res.status(400).json({ error: "partySize must be between 1 and 50" });
    }
    const all = await storage.getReservations();
    const slotCount = all.filter(r =>
      r.date === String(date) && r.time === String(time) && !["cancelled", "no-show"].includes(r.status)
    ).length;
    if (slotCount >= PUBLIC_SLOT_CAPACITY) {
      return res.status(409).json({ error: "This time slot is fully booked" });
    }
    const reservation = await storage.createReservation({
      customerName: String(name).trim(),
      phoneNumber: String(phone).trim(),
      date: String(date),
      time: String(time),
      partySize: size,
      tableId: 0,
      tableName: "TBC",
      comments: comments ? String(comments).trim() : "",
      status: "booked",
      groupId: null,
      takenBy: "online",
      previousStatus: null,
    });
    await storage.upsertGuest(
      reservation.customerName,
      reservation.phoneNumber,
      reservation.date,
      reservation.partySize,
      false,
    ).catch(() => {});
    res.status(201).json({
      id: reservation.id,
      date: reservation.date,
      time: reservation.time,
      partySize: reservation.partySize,
      customerName: reservation.customerName,
      tableName: reservation.tableName,
      status: reservation.status,
      message: "Booking confirmed. A table will be assigned by the restaurant.",
    });
  });

  // PATCH /api/public/bookings/:id/cancel
  // Body: { phone } — must match the reservation's phone number
  app.patch("/api/public/bookings/:id/cancel", requireApiKey, async (req, res) => {
    const reservation = await storage.getReservation(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: "Booking not found" });
    }
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "phone is required to verify ownership" });
    }
    if (normalizePhone(String(phone)) !== normalizePhone(reservation.phoneNumber)) {
      return res.status(403).json({ error: "Phone number does not match this booking" });
    }
    if (reservation.status === "cancelled") {
      return res.status(409).json({ error: "Booking is already cancelled" });
    }
    if (["seated", "complete"].includes(reservation.status)) {
      return res.status(409).json({ error: "Cannot cancel a booking that is already seated or completed" });
    }
    const updated = await storage.updateReservationStatus(req.params.id, "cancelled");
    res.json({
      id: updated!.id,
      status: updated!.status,
      message: "Booking cancelled successfully",
    });
  });

  return httpServer;
}
