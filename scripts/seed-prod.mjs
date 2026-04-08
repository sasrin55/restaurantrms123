/**
 * Production seed script — runs on startup.
 * Only imports if the data hasn't been loaded yet (checks for v5 marker).
 */
import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SLOT_MAP = {
  "Breakfast 9 AM - 10:30 AM":    "9:00 AM - 12:00 PM",
  "Brunch 10:45 PM - 12:15 PM":   "9:00 AM - 12:00 PM",
  "Brunch 10:45 PM - 12:00 PM":   "9:00 AM - 12:00 PM",
  "Breakfast 10 AM - 12 PM":      "10:00 AM - 12:00 PM",
  "Brunch 12:15 PM - 2 PM":       "12:00 PM - 2:00 PM",
  "Lunch Slot 12:30 PM":          "12:30 PM - 2:30 PM",
  "Lunch 2:30 PM":                "2:30 PM - 4:30 PM",
  "Lunch Slot 2:30 PM":           "2:30 PM - 4:30 PM",
  "Tea Time Slot 5 PM":           "4:30 PM - 6:30 PM",
  "Tea Time Slot 4:30 PM":        "4:30 PM - 6:30 PM",
  "Dinner Slot 6:45 PM - 8:15PM": "6:45 PM - 8:15 PM",
  "Dinner Slot 7:00 - 9:00 PM":   "6:45 PM - 8:15 PM",
  "Dinner Slot 7:30 - 9:30 PM":   "6:45 PM - 8:15 PM",
  "Dinner 8:30 PM - 10:00 PM":    "8:30 PM - 10:00 PM",
  "Dinner 9:00 PM - 11:00 PM":    "8:30 PM - 10:00 PM",
  "Dinner 9:45 PM - 11:45 PM":    "8:30 PM - 10:00 PM",
};

const TABLE_MAP = {
  '11':  { id: 11,  name: 'Table 11 Outdoor' },
  '12':  { id: 12,  name: 'Table 12 Outdoor' },
  '13':  { id: 13,  name: 'Table 13 Outdoor' },
  '17':  { id: 17,  name: 'Table 17' },
  '18':  { id: 18,  name: 'Table 18' },
  '19':  { id: 19,  name: 'Table 19' },
  '19a': { id: 190, name: 'Table 19A' },
  '20':  { id: 20,  name: 'Table 20' },
  '21':  { id: 21,  name: 'Table 21' },
  '22':  { id: 22,  name: 'Table 22' },
  '23':  { id: 23,  name: 'Table 23' },
  '24':  { id: 24,  name: 'Table 24' },
  '25':  { id: 25,  name: 'Table 25' },
  '26':  { id: 26,  name: 'Table 26' },
  '27':  { id: 27,  name: 'Table 27' },
};

function parseDate(dateStr) {
  const m = dateStr.match(/(\d+)(?:st|nd|rd|th)\s+(\w+)/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
  const month = months[m[2]];
  if (!month) return null;
  return `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function isPastDate(d) { return d < '2026-04-08'; }

function mapStatus(raw, date) {
  const s = (raw || '').toLowerCase().trim();
  const past = isPastDate(date);
  if (s === 'na' || s === 'nr') return 'no-show';
  if (s.includes('cancel')) return 'cancelled';
  if (s.startsWith('released')) return 'cancelled';
  if (s === 'confirmed' || s === 'cnfrmed' || s === 'confrmed' || s.startsWith('confirmed for'))
    return past ? 'complete' : 'confirmed';
  if (s === 'waiting' || s === 'waitng' || s === 'pu' || s === 'on the way')
    return past ? 'complete' : 'booked';
  return past ? 'complete' : 'booked';
}

function cleanPhone(c) { return (c || '').trim().replace(/\s+/g, ''); }
function normalizeName(n) {
  if (!n) return 'Walk In';
  const l = n.trim().toLowerCase();
  return (l === 'walk in' || l === 'walkin' || l === '') ? 'Walk In' : n.trim();
}

export async function seedIfNeeded() {
  const client = await pool.connect();
  try {
    // Check for v5 marker: a record from 2026-04-01 with the new slot label
    const check = await client.query(
      `SELECT 1 FROM reservations WHERE date='2026-04-01' AND time='12:30 PM - 2:30 PM' LIMIT 1`
    );
    if (check.rows.length > 0) {
      console.log('[seed] Data already at v5 — skipping import.');
      return;
    }

    console.log('[seed] Importing v5 reservation data...');
    const raw = JSON.parse(readFileSync(
      new URL('../attached_assets/cosa_reservations_v5_1775631171422.json', import.meta.url)
    ));

    await client.query('DELETE FROM reservations');

    let inserted = 0, skipped = 0;
    for (const r of raw) {
      const date = parseDate(r.date);
      if (!date) { skipped++; continue; }
      const time = SLOT_MAP[r.slot];
      if (!time) { skipped++; continue; }
      const tableKey = (r.table || '').trim().toLowerCase();
      const tableInfo = TABLE_MAP[tableKey];
      if (!tableInfo) { skipped++; continue; }

      await client.query(
        `INSERT INTO reservations
           (id,customer_name,phone_number,date,time,party_size,table_id,table_name,status,taken_by,comments,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
        [
          randomUUID(),
          normalizeName(r.name),
          cleanPhone(r.contact),
          date,
          time,
          parseInt(r.pax) || 1,
          tableInfo.id,
          tableInfo.name,
          mapStatus(r.status, date),
          (r.taken_by || '').trim() || null,
          '',
        ]
      );
      inserted++;
    }
    console.log(`[seed] Done. Inserted: ${inserted}, Skipped: ${skipped}`);
  } finally {
    client.release();
  }
}
