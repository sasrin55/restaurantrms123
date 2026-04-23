import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "Seated_Product_Brochure.pdf");

const C = {
  teal:      "#0D7377",
  tealLight: "#E6F2F2",
  tealMid:   "#14A0A6",
  dark:      "#0F1923",
  gray:      "#6B7280",
  lightGray: "#F3F4F6",
  white:     "#FFFFFF",
  amber:     "#D97706",
  red:       "#DC2626",
  green:     "#059669",
  border:    "#E5E7EB",
};

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
  info: {
    Title: "Seated — Restaurant Intelligence Platform",
    Author: "Seated",
    Subject: "Product Brochure",
  },
});

doc.pipe(fs.createWriteStream(OUT));

const W = doc.page.width;
const H = doc.page.height;
const ML = 52;
const MR = W - 52;
const CW = MR - ML;

// ── helpers ──────────────────────────────────────────────────────────────────
function pageFooter(pageNum) {
  const y = H - 36;
  doc.rect(0, y - 8, W, 44).fill(C.teal);
  doc.fontSize(8).fillColor(C.white)
    .text("seated  ·  Restaurant Intelligence Platform  ·  Confidential", ML, y, { width: CW * 0.7 })
    .text(`Page ${pageNum}`, 0, y, { width: W - ML, align: "right" });
}

function sectionTitle(text, y) {
  doc.fontSize(11).fillColor(C.teal)
    .font("Helvetica-Bold")
    .text(text.toUpperCase(), ML, y, { characterSpacing: 1.5 });
  doc.rect(ML, y + 16, 36, 2).fill(C.teal);
  return y + 28;
}

function h2(text, y, color = C.dark) {
  doc.fontSize(16).fillColor(color).font("Helvetica-Bold").text(text, ML, y);
  return y + 24;
}

function body(text, y, opts = {}) {
  doc.fontSize(10).fillColor(opts.color || C.gray).font("Helvetica")
    .text(text, opts.x || ML, y, { width: opts.width || CW, lineGap: 3, ...opts });
  return doc.y + 6;
}

function bullet(text, y, opts = {}) {
  const x = opts.x || ML;
  const w = opts.width || CW;
  doc.circle(x + 4, y + 4.5, 2.5).fill(opts.color || C.teal);
  doc.fontSize(10).fillColor(opts.textColor || C.dark).font("Helvetica")
    .text(text, x + 14, y, { width: w - 14, lineGap: 2 });
  return doc.y + 5;
}

function tag(text, x, y, color = C.teal) {
  const tw = doc.fontSize(8).widthOfString(text) + 14;
  doc.roundedRect(x, y, tw, 17, 4).fill(color + "22");
  doc.fontSize(8).fillColor(color).font("Helvetica-Bold").text(text, x + 7, y + 4.5);
  return x + tw + 6;
}

function kpiBox(x, y, bw, bh, value, label, color) {
  doc.roundedRect(x, y, bw, bh, 8).fill(C.lightGray);
  doc.roundedRect(x, y, 4, bh, 2).fill(color);
  doc.fontSize(22).fillColor(color).font("Helvetica-Bold").text(value, x + 16, y + 14, { width: bw - 20, align: "center" });
  doc.fontSize(8).fillColor(C.gray).font("Helvetica").text(label, x + 16, y + 40, { width: bw - 20, align: "center" });
}

function featureCard(x, y, cw, ch, title, desc, accent) {
  doc.roundedRect(x, y, cw, ch, 8)
    .lineWidth(1).strokeColor(C.border).stroke();
  doc.roundedRect(x, y, cw, 4, 2).fill(accent);
  doc.fontSize(10).fillColor(C.dark).font("Helvetica-Bold").text(title, x + 12, y + 16, { width: cw - 24 });
  doc.fontSize(9).fillColor(C.gray).font("Helvetica").text(desc, x + 12, y + 32, { width: cw - 24, lineGap: 2 });
}

function divider(y) {
  doc.rect(ML, y, CW, 0.5).fill(C.border);
  return y + 16;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 1 — COVER
// ─────────────────────────────────────────────────────────────────────────────
doc.rect(0, 0, W, H).fill(C.dark);
doc.rect(0, 0, W, H * 0.62).fill(C.teal);

// Decorative rings
doc.circle(W - 80, 120, 180).lineWidth(1).strokeColor(C.white + "18").stroke();
doc.circle(W - 80, 120, 120).lineWidth(1).strokeColor(C.white + "18").stroke();
doc.circle(W - 80, 120, 60).lineWidth(0.5).strokeColor(C.white + "25").stroke();

doc.circle(100, H * 0.62 + 60, 80).lineWidth(1).strokeColor(C.tealMid + "40").stroke();

// Brand mark
doc.rect(ML, 72, 42, 42).fill(C.white + "22");
doc.fontSize(28).fillColor(C.white).font("Helvetica-Bold").text("S", ML + 10, 80);
doc.fontSize(13).fillColor(C.white).font("Helvetica-Bold").text("seated", ML + 56, 88);

// Headline
doc.fontSize(44).fillColor(C.white).font("Helvetica-Bold")
  .text("The Restaurant", ML, 170, { lineGap: 4 })
  .text("Intelligence", ML, 218, { lineGap: 4 })
  .text("Platform.", ML, 266);

doc.fontSize(13).fillColor(C.white + "CC").font("Helvetica")
  .text("From scattered spreadsheets to a single,\nlive command centre for every service.", ML, 330, { lineGap: 5 });

// Divider stripe
doc.rect(ML, 400, 60, 3).fill(C.white + "80");

// Feature pills on cover
const pills = ["Reservations", "Guest Intelligence", "Live Analytics", "No-Show Tracking", "Google Sheets Sync"];
let px = ML;
let py = 422;
for (const p of pills) {
  const pw = doc.fontSize(9).widthOfString(p) + 20;
  if (px + pw > MR) { px = ML; py += 28; }
  doc.roundedRect(px, py, pw, 22, 11).fill(C.white + "18");
  doc.fontSize(9).fillColor(C.white).font("Helvetica").text(p, px + 10, py + 6);
  px += pw + 8;
}

// Bottom dark section
doc.fontSize(11).fillColor(C.white + "99").font("Helvetica")
  .text("Built for", ML, H * 0.62 + 24);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold")
  .text("PAOLA'S Cosa Nostra", ML, H * 0.62 + 40);
doc.fontSize(10).fillColor(C.gray).font("Helvetica")
  .text("Presented to prospective restaurant partners", ML, H * 0.62 + 66);

// Stats row on cover
const stats = [
  { v: "10+",  l: "Modules" },
  { v: "100%", l: "No double\nbookings" },
  { v: "Live",  l: "Analytics\ndashboard" },
  { v: "Auto", l: "Google Sheets\nsync" },
];
const sw = (CW - 32) / 4;
let sx = ML;
for (const s of stats) {
  doc.roundedRect(sx, H * 0.62 + 100, sw, 68, 8).fill(C.white + "08");
  doc.fontSize(20).fillColor(C.tealMid).font("Helvetica-Bold").text(s.v, sx, H * 0.62 + 114, { width: sw, align: "center" });
  doc.fontSize(8).fillColor(C.gray).font("Helvetica").text(s.l, sx, H * 0.62 + 138, { width: sw, align: "center", lineGap: 2 });
  sx += sw + 10;
}

pageFooter(1);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 2 — THE EXCEL PROBLEM
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });

doc.rect(0, 0, W, 56).fill(C.teal);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold").text("From Excel to Intelligence", ML, 18);

let y = 76;

y = sectionTitle("The Problem with Spreadsheets", y);

const painPoints = [
  ["No real-time availability", "Two staff members open the same file. Both book Table 27 for 8:00 PM Saturday. You discover the conflict at the door."],
  ["Zero guest memory", "A VIP who visits every week is treated like a stranger on every call. No visit history, no preferences, no recognition."],
  ["Manual everything", "Date calculations, column sorting, status tracking — every update is a manual step that can be wrong or missed."],
  ["Analytics don't exist", "Which time slot fills fastest? Which guests no-show most? Which table is least used? Excel cannot answer these in real time."],
  ["No call intelligence", "When a guest calls, staff scramble to search the file. The guest waits. Details get missed or mis-recorded."],
  ["Disconnected workflow", "Reservations, waitlist, orders, staff notes, inventory — all in separate files, never talking to each other."],
];

for (const [title, desc] of painPoints) {
  doc.roundedRect(ML, y, CW, 52, 6).fill(C.lightGray);
  doc.rect(ML, y, 4, 52).fill(C.red);
  doc.fontSize(10).fillColor(C.dark).font("Helvetica-Bold").text(title, ML + 16, y + 10, { width: CW - 24 });
  doc.fontSize(9).fillColor(C.gray).font("Helvetica").text(desc, ML + 16, y + 26, { width: CW - 24, lineGap: 2 });
  y += 62;
}

y = divider(y + 4);

y = sectionTitle("What Seated Changes", y);
doc.fontSize(10).fillColor(C.gray).font("Helvetica")
  .text("Seated replaces every spreadsheet with a live, role-aware dashboard — purpose-built for the pace of a restaurant service.", ML, y, { width: CW, lineGap: 3 });

pageFooter(2);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 3 — FEATURES (Part 1)
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.rect(0, 0, W, 56).fill(C.teal);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold").text("Platform Features", ML, 18);

y = 76;
y = sectionTitle("Core Reservation Engine", y);

const features1 = [
  {
    title: "Smart Reservation Creation",
    desc: "Create bookings in seconds — name, phone, date, time, party size, table, and notes in one form. The system auto-selects the right time slots for the day of week (weekday, weekend, Ramadan schedules).",
    tags: ["Multi-table booking", "Time slot auto-config", "Walk-in mode"],
  },
  {
    title: "Double-Booking Prevention (Enforced at Database Level)",
    desc: "The system checks for conflicts before saving any reservation — not just in the browser but at the server, so two staff opening the same form simultaneously cannot create a conflict. If a table is taken, the booking is rejected with a clear error.",
    tags: ["Backend-enforced", "Real-time", "Concurrent-safe"],
  },
  {
    title: "Live Reservation Dashboard",
    desc: "Active, Completed, and Cancellations & No-Shows in separate tabs. Filter by today, tomorrow, this week, or pick any date. Search by name, phone, or table instantly.",
    tags: ["Grid & list views", "Slot-based tabs", "All-time cancellations view"],
  },
  {
    title: "Status Lifecycle Tracking",
    desc: "Booked → Confirmed → Seated → Completed, with one-tap transitions. Cancelled and No-show statuses include undo support. The system records what status a reservation held before becoming a no-show.",
    tags: ["Status history", "Undo complete", "No-show tracking"],
  },
];

for (const f of features1) {
  doc.roundedRect(ML, y, CW, 80, 8).lineWidth(1).strokeColor(C.border).stroke();
  doc.roundedRect(ML, y, CW, 4, 2).fill(C.teal);
  doc.fontSize(10).fillColor(C.dark).font("Helvetica-Bold").text(f.title, ML + 12, y + 16, { width: CW - 24 });
  doc.fontSize(9).fillColor(C.gray).font("Helvetica").text(f.desc, ML + 12, y + 32, { width: CW - 24, lineGap: 2 });
  let tx = ML + 12;
  let ty = y + 60;
  for (const t of f.tags) {
    tx = tag(t, tx, ty, C.teal);
  }
  y += 92;
}

pageFooter(3);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 4 — FEATURES (Part 2)
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.rect(0, 0, W, 56).fill(C.teal);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold").text("Platform Features — Continued", ML, 18);

y = 76;

const featureGrid = [
  { title: "Guest Directory", desc: "Every guest auto-saved with visit count, party history, and lifetime covers. Repeat-guest rate, favourite time slots, and no-show count tracked automatically.", accent: C.teal },
  { title: "Waitlist Management", desc: "Live queue with join time, estimated wait, and one-tap seat. Walk-in seating flows directly into the reservation system with no duplicate entry.", accent: C.tealMid },
  { title: "Incoming Call Tracker", desc: "Log a phone number and instantly see the caller's full history — last booking, visit count, whether they're new or returning — before the conversation ends.", accent: C.amber },
  { title: "Order Management", desc: "Table-based order creation with category browsing, search, and quantity controls. Links to today's reservation automatically. Open and closed order tracking.", accent: C.green },
  { title: "Menu Management", desc: "Full menu CRUD by category. Powers the order system and analytics. Add, edit, or remove items without touching code.", accent: C.teal },
  { title: "Table Overview", desc: "See every table's live status — free, booked, or seated — for the selected date and time. Navigate by slot. Colour-coded occupancy at a glance.", accent: C.tealMid },
];

const cardW = (CW - 12) / 2;
const cardH = 110;
let col = 0;
let row = 0;
for (const f of featureGrid) {
  const cx = ML + col * (cardW + 12);
  const cy = y + row * (cardH + 10);
  featureCard(cx, cy, cardW, cardH, f.title, f.desc, f.accent);
  col++;
  if (col > 1) { col = 0; row++; }
}

y += row * (cardH + 10) + cardH + 20;

y = sectionTitle("Google Sheets Integration", y);
doc.roundedRect(ML, y, CW, 60, 8).fill(C.tealLight);
doc.fontSize(10).fillColor(C.dark).font("Helvetica-Bold")
  .text("Automatic sync — no manual export needed.", ML + 16, y + 12, { width: CW - 32 });
doc.fontSize(9).fillColor(C.gray).font("Helvetica")
  .text("Every new reservation is written to the correct tab and row in your Google Sheet the moment it is created. Status changes (seated, cancelled, no-show) update the sheet row in real time. A manual full export is always one click away for auditing.", ML + 16, y + 28, { width: CW - 32, lineGap: 2 });

pageFooter(4);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 5 — ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.rect(0, 0, W, 56).fill(C.teal);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold").text("Analytics & Intelligence", ML, 18);

y = 76;

const analyticsSections = [
  {
    label: "Performance",
    color: C.teal,
    items: ["Total covers and reservations for any date range", "Average party size and covers-per-day", "Table utilisation rate (booked vs available)", "Busiest day, day of week, and time slot"],
  },
  {
    label: "Guest Behaviour",
    color: C.tealMid,
    items: ["Repeat guest rate (walk-ins excluded to keep data clean)", "Top returning guests by visit count and lifetime covers", "Walk-in volume, peak slot, and share of total bookings"],
  },
  {
    label: "No-Show Intelligence",
    color: C.amber,
    items: [
      "Total no-shows and no-show rate",
      "Confirmed → no-show vs Booked → no-show breakdown (who confirmed but still didn't come)",
      "Peak no-show time slot (which slot is highest risk)",
      "Top no-show guests ranked by frequency",
    ],
  },
  {
    label: "Cancellation Tracking",
    color: C.red,
    items: ["Cancellation rate across all reservations", "Filter cancellations by today, a specific date, a date range, or all time", "Full historical record always accessible in one tab"],
  },
];

for (const s of analyticsSections) {
  const blockH = s.items.length * 18 + 32;
  doc.roundedRect(ML, y, CW, blockH, 8).lineWidth(1).strokeColor(s.color + "44").stroke();
  doc.rect(ML, y, 4, blockH).fill(s.color);
  doc.fontSize(10).fillColor(s.color).font("Helvetica-Bold").text(s.label, ML + 16, y + 10);
  let iy = y + 28;
  for (const item of s.items) {
    doc.circle(ML + 24, iy + 4, 2).fill(s.color);
    doc.fontSize(9).fillColor(C.dark).font("Helvetica").text(item, ML + 34, iy, { width: CW - 42, lineGap: 1 });
    iy = doc.y + 6;
  }
  y = iy + 10;
}

y = divider(y);
doc.fontSize(9).fillColor(C.gray).font("Helvetica")
  .text("All analytics respond to the date filter — all time, a single day, or a custom range. Walk-ins are automatically separated from regular guests to prevent inflating repeat guest and return rate figures.", ML, y, { width: CW, lineGap: 3 });

pageFooter(5);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 6 — EFFICIENCY GAINS
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.rect(0, 0, W, 56).fill(C.teal);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold").text("Efficiency Gains vs Excel", ML, 18);

y = 76;

const comparisons = [
  { task: "Check table availability for a time slot", excel: "Open file, scroll, manually scan rows", seated: "Instant — table grid shows live colour-coded status" },
  { task: "Avoid a double booking", excel: "Hope no one else books while you're in the file", seated: "Server-side lock — physically impossible to double-book" },
  { task: "Identify a returning guest on a call", excel: "Search the sheet by name or phone while the caller waits", seated: "Log the number — full history appears in under 1 second" },
  { task: "See tonight's bookings by time slot", excel: "Filter, sort, and format — 5+ steps", seated: "Dashboard loads in the correct slot view by default" },
  { task: "Track how many no-shows you had last month", excel: "Manual count or a pivot table", seated: "Analytics page — filter by range, read the number" },
  { task: "Move a guest from the waitlist to a table", excel: "Delete from waitlist, add to reservations — 2 files", seated: "One-tap Seat — creates the reservation automatically" },
  { task: "Sync reservation data to Google Sheets", excel: "Already in a sheet (with no structure)", seated: "Automatic — writes to the correct tab and row on save" },
  { task: "Know which time slot is most popular", excel: "Build a formula or pivot table", seated: "Analytics page — slots sorted by cover volume" },
];

const colWidths = [160, 145, 145];
const headers = ["Task", "With Excel", "With Seated"];

// Table header
doc.rect(ML, y, CW, 22).fill(C.teal);
let cx2 = ML;
for (let i = 0; i < headers.length; i++) {
  doc.fontSize(9).fillColor(C.white).font("Helvetica-Bold")
    .text(headers[i], cx2 + 8, y + 7, { width: colWidths[i] - 8 });
  cx2 += colWidths[i];
}
y += 22;

for (let i = 0; i < comparisons.length; i++) {
  const row2 = comparisons[i];
  const rowH = 30;
  doc.rect(ML, y, CW, rowH).fill(i % 2 === 0 ? C.lightGray : C.white);
  doc.rect(ML, y, CW, rowH).lineWidth(0.5).strokeColor(C.border).stroke();

  const cells = [row2.task, row2.excel, row2.seated];
  let cx3 = ML;
  for (let j = 0; j < cells.length; j++) {
    const color = j === 2 ? C.green : j === 1 ? C.red : C.dark;
    doc.fontSize(8).fillColor(color).font(j === 2 ? "Helvetica-Bold" : "Helvetica")
      .text(cells[j], cx3 + 8, y + 6, { width: colWidths[j] - 12, lineGap: 1 });
    cx3 += colWidths[j];
  }
  y += rowH;
}

y += 16;
doc.roundedRect(ML, y, CW, 44, 8).fill(C.tealLight);
doc.fontSize(11).fillColor(C.teal).font("Helvetica-Bold")
  .text("The result: less time administrating, more time with guests.", ML + 16, y + 10, { width: CW - 32 });
doc.fontSize(9).fillColor(C.gray).font("Helvetica")
  .text("Every feature was designed to remove friction from service — not add another tool to manage.", ML + 16, y + 28, { width: CW - 32 });

pageFooter(6);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 7 — BUILD STORY & EVOLUTION
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.rect(0, 0, W, 56).fill(C.teal);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold").text("Build Story & Version Evolution", ML, 18);

y = 76;

y = sectionTitle("How It Was Built", y);
doc.fontSize(10).fillColor(C.gray).font("Helvetica")
  .text("Seated was built iteratively — every feature was shaped by real operational feedback from PAOLA's Cosa Nostra. The product grew from a basic booking form to a full restaurant intelligence platform across dozens of focused build sessions.", ML, y, { width: CW, lineGap: 3 });
y = doc.y + 16;

const timeline = [
  {
    phase: "Phase 1 — Foundation",
    period: "Initial build",
    color: C.teal,
    items: [
      "Core reservation creation, editing, and deletion",
      "Guest directory with automatic visit tracking",
      "Table availability view with occupied/free states",
      "Google Sheets export for the existing team workflow",
    ],
  },
  {
    phase: "Phase 2 — Operations",
    period: "Service workflows",
    color: C.tealMid,
    items: [
      "Real-time waitlist with estimated wait times and one-tap seating",
      "Walk-in reservation mode — seated immediately without pre-booking",
      "Order management system with menu categories and table linking",
      "Menu CRUD page for direct management without developer access",
      "Incoming call log with instant guest lookup by phone number",
      "PostgreSQL persistence replacing in-memory storage",
    ],
  },
  {
    phase: "Phase 3 — Intelligence",
    period: "Analytics & insights",
    color: C.amber,
    items: [
      "Full analytics dashboard: covers, slots, day-of-week patterns, table utilisation",
      "Repeat guest rate, top returning guests, walk-in separation",
      "No-show analytics: total rate, peak slot, top offenders, status transition breakdown",
      "Date filtering across all analytics views (day / range / all time)",
      "Walk-in detection improved to handle all creation sources and name variations",
    ],
  },
  {
    phase: "Phase 4 — Reliability",
    period: "Hardening & polish",
    color: C.green,
    items: [
      "Backend-enforced double-booking prevention (database-level, not just UI)",
      "Cancellations tab with independent date filter (today / date / range / all time)",
      "Status history tracking: records previous status before a no-show is marked",
      "Undo Completed — reverse accidentally-completed reservations back to Seated",
      "Login page and session-based authentication for access control",
    ],
  },
];

for (const phase of timeline) {
  const itemH = phase.items.length * 16 + 44;
  doc.roundedRect(ML, y, CW, itemH, 8).lineWidth(1).strokeColor(phase.color + "40").stroke();
  doc.rect(ML, y, 4, itemH).fill(phase.color);

  doc.fontSize(10).fillColor(phase.color).font("Helvetica-Bold").text(phase.phase, ML + 16, y + 10, { width: CW - 100 });
  doc.fontSize(8).fillColor(C.gray).font("Helvetica").text(phase.period, MR - 80, y + 12, { width: 76, align: "right" });

  let iy = y + 30;
  for (const item of phase.items) {
    doc.circle(ML + 24, iy + 4, 2).fill(phase.color);
    doc.fontSize(9).fillColor(C.dark).font("Helvetica").text(item, ML + 34, iy, { width: CW - 46, lineGap: 1 });
    iy = doc.y + 5;
  }
  y = iy + 10;
}

pageFooter(7);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 8 — TECH SNAPSHOT + CLOSE
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.rect(0, 0, W, 56).fill(C.teal);
doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold").text("Technical Snapshot & Next Steps", ML, 18);

y = 76;

y = sectionTitle("What Powers Seated", y);

const techRows = [
  ["Frontend", "React 18 + TypeScript, TanStack Query, shadcn/ui, Tailwind CSS"],
  ["Backend", "Node.js + Express, RESTful API with full input validation"],
  ["Database", "PostgreSQL with Drizzle ORM — typed queries, safe migrations"],
  ["Auth", "Session-based login with secure cookie management"],
  ["Google Sheets", "Live OAuth-connected sync via Replit Connector — no API keys to manage"],
  ["Hosting", "Cloud deployment on app.seated.pk with TLS, health checks, and uptime monitoring"],
  ["Conflict Safety", "Server-side booking validation — concurrent booking attempts are rejected at the database layer"],
];

for (let i = 0; i < techRows.length; i++) {
  const [label, value] = techRows[i];
  doc.rect(ML, y, CW, 26).fill(i % 2 === 0 ? C.lightGray : C.white);
  doc.fontSize(9).fillColor(C.teal).font("Helvetica-Bold").text(label, ML + 12, y + 8, { width: 100 });
  doc.fontSize(9).fillColor(C.dark).font("Helvetica").text(value, ML + 120, y + 8, { width: CW - 132 });
  y += 26;
}

y += 20;
y = sectionTitle("What Seated Delivers", y);

const kpiData = [
  { v: "0",    l: "Double\nbookings possible", c: C.green },
  { v: "Live", l: "Guest history\non every call", c: C.teal },
  { v: "Auto", l: "Sheet sync\non every save", c: C.tealMid },
  { v: "Full",  l: "Analytics\nhistory", c: C.amber },
];

const kw = (CW - 30) / 4;
let kx = ML;
for (const k of kpiData) {
  kpiBox(kx, y, kw, 66, k.v, k.l, k.c);
  kx += kw + 10;
}
y += 86;

y = divider(y);
y = sectionTitle("Ready to Get Started?", y);

doc.roundedRect(ML, y, CW, 90, 10).fill(C.teal);
doc.circle(MR - 30, y + 45, 40).fill(C.white + "0A");
doc.circle(MR - 60, y + 10, 25).fill(C.white + "0A");

doc.fontSize(14).fillColor(C.white).font("Helvetica-Bold")
  .text("Seated is built to replace your spreadsheet\nfrom day one.", ML + 20, y + 14, { width: CW - 60, lineGap: 4 });
doc.fontSize(10).fillColor(C.white + "CC").font("Helvetica")
  .text("Request a demo or onboarding conversation to see the platform\nlive against your actual reservation workflow.", ML + 20, y + 52, { width: CW - 60, lineGap: 3 });

y += 104;
doc.fontSize(9).fillColor(C.gray).font("Helvetica")
  .text("Seated is a purpose-built, continuously improved restaurant intelligence platform. This document reflects the current live version.", ML, y, { width: CW, lineGap: 2, align: "center" });

pageFooter(8);

doc.end();
console.log("✓ PDF written to:", OUT);
