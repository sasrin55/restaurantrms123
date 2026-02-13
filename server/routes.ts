import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertReservationSchema } from "@shared/schema";
import { appendReservationToSheet, updateReservationInSheet, exportAllReservationsToSheet, syncFromSheet, type SheetReservationUpdate } from "./googleSheets";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  storage.rebuildGuestData().catch(err => console.error("Failed to rebuild guest data:", err));

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

    res.json(reservation);
  });

  app.patch("/api/reservations/:id", async (req, res) => {
    const { time, partySize, tableId, tableName, phoneNumber, comments } = req.body;
    const reservation = await storage.updateReservation(req.params.id, {
      time,
      partySize,
      tableId,
      tableName,
      phoneNumber,
      comments,
    });
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

  async function applySyncFromSheets(): Promise<{ updated: number; deleted: number; errors: string[] }> {
    const result = await syncFromSheet() as any;
    const sheetUpdates: SheetReservationUpdate[] = result.updates || [];
    let updatedCount = 0;
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

    const allReservations = await storage.getReservations();
    for (const r of allReservations) {
      if (!sheetIds.has(r.id)) {
        await storage.deleteReservation(r.id);
        deletedCount++;
      }
    }

    if (updatedCount > 0 || deletedCount > 0) {
      await storage.rebuildGuestData();
    }

    return { updated: updatedCount, deleted: deletedCount, errors: result.errors };
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

  setInterval(async () => {
    try {
      const result = await applySyncFromSheets();
      if (result.updated > 0 || result.deleted > 0) {
        console.log(`Auto-sync from Sheets: updated ${result.updated}, deleted ${result.deleted} reservation(s)`);
      }
    } catch (err) {
      console.error("Auto-sync from Sheets error:", err);
    }
  }, 2 * 60 * 1000);

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

  return httpServer;
}
