import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Slot mapping ──────────────────────────────────────────────────────────────
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

// ── Table mapping ─────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDate(dateStr) {
  const m = dateStr.match(/(\d+)(?:st|nd|rd|th)\s+(\w+)/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const months = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
  const month = months[m[2]];
  if (!month) return null;
  return `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function isPastDate(dateStr) {
  // Today is 2026-04-08
  return dateStr < '2026-04-08';
}

function mapStatus(rawStatus, dateStr) {
  const s = (rawStatus || '').toLowerCase().trim();
  const past = isPastDate(dateStr);

  if (s === 'na' || s === 'nr') return 'no-show';
  if (s.includes('cancel')) return 'cancelled';
  if (s.startsWith('released')) return 'cancelled';
  if (s === 'confirmed' || s === 'cnfrmed' || s === 'confrmed' || s.startsWith('confirmed for')) {
    return past ? 'complete' : 'confirmed';
  }
  if (s === 'waiting' || s === 'waitng' || s === 'pu' || s === 'on the way') {
    return past ? 'complete' : 'booked';
  }
  // Empty or unrecognised strings
  return past ? 'complete' : 'booked';
}

function cleanPhone(contact) {
  if (!contact) return '';
  // Strip spaces but keep the rest as-is (may be a note not a number)
  return contact.trim().replace(/\s+/g, '');
}

function normalizeName(name) {
  if (!name) return 'Walk In';
  const n = name.trim().toLowerCase();
  if (n === 'walk in' || n === 'walkin' || n === '') return 'Walk In';
  return name.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    const raw = JSON.parse(readFileSync('attached_assets/cosa_reservations_v5_1775631171422.json', 'utf8'));

    console.log(`Total JSON records: ${raw.length}`);

    // 1. Clear existing reservations
    await client.query('DELETE FROM reservations');
    console.log('Cleared existing reservations.');

    let inserted = 0;
    let skipped = 0;

    for (const r of raw) {
      // Parse date
      const date = parseDate(r.date);
      if (!date) { skipped++; continue; }

      // Map slot
      const time = SLOT_MAP[r.slot];
      if (!time) {
        console.warn(`  Unknown slot: "${r.slot}" — skipping`);
        skipped++;
        continue;
      }

      // Map table
      const tableKey = (r.table || '').trim().toLowerCase();
      const tableInfo = TABLE_MAP[tableKey];
      if (!tableInfo) {
        // Skip unknown/outdoor tables not in our system
        skipped++;
        continue;
      }

      const pax = parseInt(r.pax) || 1;
      const status = mapStatus(r.status, date);
      const phone = cleanPhone(r.contact);
      const name = normalizeName(r.name);
      const takenBy = (r.taken_by || '').trim() || null;

      await client.query(
        `INSERT INTO reservations
           (id, customer_name, phone_number, date, time, party_size, table_id, table_name, status, taken_by, comments, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
        [
          randomUUID(),
          name,
          phone,
          date,
          time,
          pax,
          tableInfo.id,
          tableInfo.name,
          status,
          takenBy,
          '',
        ]
      );
      inserted++;
    }

    console.log(`Done. Inserted: ${inserted}, Skipped: ${skipped}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
