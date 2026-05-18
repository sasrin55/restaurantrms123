import { pool } from "./db";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

function nowPkt(): Date {
  return new Date(Date.now() + PKT_OFFSET_MS);
}

function pktDateString(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Returns the end time in minutes for a slot label like "12:30 PM - 2:30 PM".
 * For overnight slots (end time < start time, e.g. "10:30 PM - 12:00 AM"),
 * the end is returned as minutes-past-midnight + 1440 so comparisons work
 * correctly across the midnight boundary.
 */
function slotEndMinutes(slotTime: string): { endMin: number; overnight: boolean } | null {
  const dashIdx = slotTime.lastIndexOf(" - ");
  if (dashIdx === -1) return null;

  const startPart = slotTime.slice(0, dashIdx).trim();
  const endPart   = slotTime.slice(dashIdx + 3).trim();

  const startMin = parseTimeToMinutes(startPart);
  const rawEnd   = parseTimeToMinutes(endPart);
  if (startMin === null || rawEnd === null) return null;

  // If end <= start the slot crosses midnight (e.g. 10:30 PM → 12:00 AM).
  // Represent end as 1440 + rawEnd so arithmetic comparisons still work.
  const overnight = rawEnd <= startMin;
  const endMin    = overnight ? rawEnd + 1440 : rawEnd;

  return { endMin, overnight };
}

export async function autoCompleteSeatedReservations(): Promise<void> {
  const client = await pool.connect();
  try {
    const pkt = nowPkt();
    const todayStr = pktDateString(pkt);
    // Current PKT time in minutes since midnight (0–1439)
    const currentMinutes = pkt.getUTCHours() * 60 + pkt.getUTCMinutes();
    // For overnight-slot comparisons (e.g. at 1:00 AM PKT = 60 min)
    // we also evaluate against the "next-day" representation (60 + 1440 = 1500)
    // so slots ending at 12:00 AM or 2:00 AM complete correctly.
    const currentMinutesNextDay = currentMinutes + 1440;

    const { rows } = await client.query<{ id: string; time: string; date: string }>(
      `SELECT id, time, date::text FROM reservations WHERE status = 'seated' AND date <= $1`,
      [todayStr]
    );

    const toComplete: string[] = [];
    for (const row of rows) {
      const reservationDate = row.date.slice(0, 10);

      // Past-date seated reservations → always complete
      if (reservationDate < todayStr) {
        toComplete.push(row.id);
        continue;
      }

      const parsed = slotEndMinutes(row.time);
      if (parsed === null) continue; // unparseable time — skip, don't touch

      const { endMin, overnight } = parsed;

      // Use strictly > (not >=) so a reservation is only completed AFTER its
      // slot ends, not at the exact minute it ends (which is the same minute
      // the next slot starts, causing false "completed at start" appearances).
      const effectiveCurrent = overnight ? currentMinutesNextDay : currentMinutes;
      if (effectiveCurrent > endMin) {
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
