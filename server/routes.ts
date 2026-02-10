import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertReservationSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
    res.json(reservation);
  });

  app.patch("/api/reservations/:id", async (req, res) => {
    const { time, partySize, tableId, tableName, phoneNumber } = req.body;
    const reservation = await storage.updateReservation(req.params.id, {
      time,
      partySize,
      tableId,
      tableName,
      phoneNumber,
    });
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    res.json(reservation);
  });

  app.delete("/api/reservations/:id", async (req, res) => {
    const deleted = await storage.deleteReservation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    res.status(204).send();
  });

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
