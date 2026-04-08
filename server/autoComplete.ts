import { pool } from "./db";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

function nowPkt(): Date {
  return new Date(Date.now() + PKT_OFFSET_MS);
}

function pktDateString(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function slotEndMinutes(slotTime: string): number | null {
  // Format: "12:30 PM - 2:30 PM" — grab the part after " - "
  const dashIdx = slotTime.lastIndexOf(" - ");
  if (dashIdx === -1) return null;
  const endPart = slotTime.slice(dashIdx + 3).trim(); // "2:30 PM"

  const match = endPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;

  return h * 60 + m;
}

export async function autoCompleteSeatedReservations(): Promise<void> {
  const client = await pool.connect();
  try {
    const pkt = nowPkt();
    const todayStr = pktDateString(pkt);
    const currentMinutes = pkt.getUTCHours() * 60 + pkt.getUTCMinutes();

    const { rows } = await client.query<{ id: string; time: string; date: string }>(
      `SELECT id, time, date::text FROM reservations WHERE status = 'seated' AND date <= $1`,
      [todayStr]
    );

    const toComplete: string[] = [];
    for (const row of rows) {
      const reservationDate = row.date.slice(0, 10);
      if (reservationDate < todayStr) {
        toComplete.push(row.id);
        continue;
      }
      const endMin = slotEndMinutes(row.time);
      if (endMin !== null && currentMinutes >= endMin) {
        toComplete.push(row.id);
      }
    }

    if (toComplete.length > 0) {
      await client.query(
        `UPDATE reservations SET status = 'complete' WHERE id = ANY($1::text[])`,
        [toComplete]
      );
      console.log(`[auto-complete] Marked ${toComplete.length} seated reservation(s) as complete (PKT ${pkt.toISOString()})`);
    }
  } catch (err) {
    console.error("[auto-complete] Error:", err);
  } finally {
    client.release();
  }
}

export function startAutoCompleteJob(): void {
  autoCompleteSeatedReservations();
  setInterval(autoCompleteSeatedReservations, 60_000);
}
