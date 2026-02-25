import { google } from 'googleapis';

const SPREADSHEET_ID = '1HgLRHFG7E80H5W0P-S5Qo--kOXxGRttbvanLKnMC4sQ';

const RESTAURANT_TABLES = [
  { number: "1", seating: "5" },
  { number: "2", seating: "5" },
  { number: "25", seating: "2 to 3" },
  { number: "3", seating: "2" },
  { number: "4", seating: "2" },
  { number: "5", seating: "5 to 6" },
  { number: "20", seating: "5 to 6" },
  { number: "6", seating: "3 to 4" },
  { number: "7", seating: "4" },
  { number: "8", seating: "2 to 3" },
  { number: "9", seating: "2" },
  { number: "10", seating: "2" },
  { number: "11", seating: "6 to 8" },
  { number: "12", seating: "3" },
  { number: "13", seating: "3 to 4" },
  { number: "14", seating: "6" },
  { number: "15", seating: "2 to 3" },
  { number: "15a", seating: "2 to 3" },
];

const HEADERS = ['No.', 'Name', 'Pax', 'Time', 'Table', 'Seating', 'Number', 'Details'];

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

function ordinalSuffix(d: number): string {
  if (d >= 11 && d <= 13) return 'th';
  switch (d % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatDateForTab(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${d}${ordinalSuffix(d)} ${months[m - 1]}`;
}

function isRamadanDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  const start = new Date(y, 1, 18);
  start.setHours(0, 0, 0, 0);
  const end = new Date(y, 2, 20);
  end.setHours(23, 59, 59, 999);
  return date >= start && date <= end;
}

interface TimeSlotSection {
  label: string;
  timeKey: string;
}

function getSectionsForDate(dateStr: string): TimeSlotSection[] {
  if (isRamadanDate(dateStr)) {
    return [
      { label: "Iftar — 5:00 PM", timeKey: "5:00 PM" },
      { label: "Dinner — 8:00 PM", timeKey: "8:00 PM" },
      { label: "Dinner — 10:00 PM", timeKey: "10:00 PM" },
      { label: "Sehri — 12:00 AM", timeKey: "12:00 AM" },
      { label: "Sehri — 2:00 AM", timeKey: "2:00 AM" },
    ];
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0 || dow === 6) {
    return [
      { label: "Breakfast — 10:00 AM to 12:00 PM", timeKey: "10:00 AM - 12:00 PM" },
      { label: "Breakfast — 12:00 PM to 2:00 PM", timeKey: "12:00 PM - 2:00 PM" },
      { label: "Lunch — 2:30 PM to 4:30 PM", timeKey: "2:30 PM - 4:30 PM" },
      { label: "Lunch — 5:00 PM to 7:00 PM", timeKey: "5:00 PM - 7:00 PM" },
      { label: "Dinner — 7:30 PM to 9:30 PM", timeKey: "7:30 PM - 9:30 PM" },
      { label: "Dinner — 9:30 PM to 11:30 PM", timeKey: "9:30 PM - 11:30 PM" },
    ];
  }
  return [
    { label: "Lunch — 2:00 PM to 4:00 PM", timeKey: "2:00 PM - 4:00 PM" },
    { label: "Lunch — 4:30 PM to 6:30 PM", timeKey: "4:30 PM - 6:30 PM" },
    { label: "Dinner — 7:00 PM to 9:00 PM", timeKey: "7:00 PM - 9:00 PM" },
    { label: "Dinner — 9:15 PM to 11:15 PM", timeKey: "9:15 PM - 11:15 PM" },
  ];
}

function getSectionLabelForTime(time: string, dateStr: string): string | null {
  const sections = getSectionsForDate(dateStr);
  const match = sections.find(s => s.timeKey === time);
  return match?.label || null;
}

function generateSectionRows(section: TimeSlotSection): any[][] {
  const rows: any[][] = [];
  rows.push([]);
  rows.push([section.label, '', '', '', '', '', '', '']);
  rows.push([...HEADERS]);
  RESTAURANT_TABLES.forEach((t, i) => {
    rows.push([i + 1, '', '', '', t.number, t.seating, '', '']);
  });
  rows.push(['', 'Total:', '', '', '', '', '', '']);
  rows.push([]);
  rows.push(['Teppanyaki Bar', '', '', '', '', '', '', '']);
  rows.push([...HEADERS]);
  for (let i = 1; i <= 8; i++) {
    rows.push([i, '', '', '', String(i), '1', '', '']);
  }
  return rows;
}

function generateTabTemplate(dateStr: string): any[][] {
  const sections = getSectionsForDate(dateStr);
  const allRows: any[][] = [];
  for (const section of sections) {
    allRows.push(...generateSectionRows(section));
  }
  allRows.push([]);
  return allRows;
}

async function getExistingTabs(sheets: any): Promise<string[]> {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  });
  return (spreadsheet.data.sheets || []).map((s: any) => s.properties?.title as string);
}

async function ensureAndGetTab(sheets: any, dateStr: string): Promise<string> {
  const tabName = formatDateForTab(dateStr);
  const existingTabs = await getExistingTabs(sheets);

  if (!existingTabs.includes(tabName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
    const template = generateTabTemplate(dateStr);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: template },
    });
  }

  return tabName;
}

function findTableRow(
  rows: any[][],
  sectionLabel: string,
  tableNumber: string,
  isTeppanyaki: boolean
): number {
  let sectionRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i]?.[0] || '').trim() === sectionLabel) {
      sectionRow = i;
      break;
    }
  }
  if (sectionRow === -1) return -1;

  let nextSectionRow = rows.length;
  for (let i = sectionRow + 1; i < rows.length; i++) {
    const cell = String(rows[i]?.[0] || '').trim();
    if (cell.includes(' — ') && cell !== sectionLabel) {
      nextSectionRow = i;
      break;
    }
  }

  if (isTeppanyaki) {
    let tepRow = -1;
    for (let i = sectionRow + 1; i < nextSectionRow; i++) {
      if (String(rows[i]?.[0] || '').trim() === 'Teppanyaki Bar') {
        tepRow = i;
        break;
      }
    }
    if (tepRow === -1) return -1;
    for (let i = tepRow + 2; i < nextSectionRow; i++) {
      if (String(rows[i]?.[4] || '').trim() === tableNumber) {
        return i;
      }
    }
  } else {
    let endSearch = nextSectionRow;
    for (let i = sectionRow + 1; i < nextSectionRow; i++) {
      if (String(rows[i]?.[0] || '').trim() === 'Teppanyaki Bar') {
        endSearch = i;
        break;
      }
    }
    for (let i = sectionRow + 2; i < endSearch; i++) {
      if (String(rows[i]?.[4] || '').trim() === tableNumber) {
        return i;
      }
    }
  }
  return -1;
}

function parseTableInfo(tableName: string): { number: string; isTeppanyaki: boolean } {
  if (tableName.startsWith('Tepanyaki Seat ')) {
    return { number: tableName.replace('Tepanyaki Seat ', ''), isTeppanyaki: true };
  }
  return { number: tableName.replace('Table ', ''), isTeppanyaki: false };
}

type ReservationData = {
  id: string;
  customerName: string;
  phoneNumber: string;
  date: string;
  time: string;
  partySize: number;
  tableId: number;
  tableName: string;
  comments?: string | null;
  status: string;
  createdAt: Date | null;
};

export interface SheetReservationUpdate {
  id: string;
  customerName: string;
  phoneNumber: string;
  date: string;
  time: string;
  partySize: number;
  tableName: string;
  tableId: number;
  comments: string;
  status: string;
}

export async function appendReservationToSheet(reservation: ReservationData) {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const tabName = await ensureAndGetTab(sheets, reservation.date);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A:H`,
    });
    const rows = result.data.values || [];

    const sectionLabel = getSectionLabelForTime(reservation.time, reservation.date);
    if (!sectionLabel) {
      console.error(`No section found for time "${reservation.time}" on ${reservation.date}`);
      return;
    }

    const { number: tableNum, isTeppanyaki } = parseTableInfo(reservation.tableName);
    const rowIndex = findTableRow(rows, sectionLabel, tableNum, isTeppanyaki);

    if (rowIndex === -1) {
      console.error(`Table row not found for ${reservation.tableName} in section "${sectionLabel}"`);
      return;
    }

    const sheetRow = rowIndex + 1;
    const existingSeating = rows[rowIndex]?.[5] || '';

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!B${sheetRow}:H${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          reservation.customerName,
          reservation.partySize,
          reservation.time,
          tableNum,
          existingSeating,
          reservation.phoneNumber,
          reservation.comments || '',
        ]],
      },
    });

    console.log(`Synced reservation to sheet: ${tabName}, row ${sheetRow}, table ${reservation.tableName}`);
  } catch (error) {
    console.error('Failed to sync reservation to Google Sheet:', error);
  }
}

export async function updateReservationInSheet(reservation: ReservationData) {
  try {
    if (reservation.status === 'cancelled' || reservation.status === 'no-show') {
      await clearReservationFromSheet(reservation);
      return;
    }
    await appendReservationToSheet(reservation);
  } catch (error) {
    console.error('Failed to update reservation in Google Sheet:', error);
  }
}

async function clearReservationFromSheet(reservation: ReservationData) {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const tabName = formatDateForTab(reservation.date);
    const existingTabs = await getExistingTabs(sheets);
    if (!existingTabs.includes(tabName)) return;

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A:H`,
    });
    const rows = result.data.values || [];

    const sectionLabel = getSectionLabelForTime(reservation.time, reservation.date);
    if (!sectionLabel) return;

    const { number: tableNum, isTeppanyaki } = parseTableInfo(reservation.tableName);
    const rowIndex = findTableRow(rows, sectionLabel, tableNum, isTeppanyaki);
    if (rowIndex === -1) return;

    const sheetRow = rowIndex + 1;
    const existingSeating = rows[rowIndex]?.[5] || '';

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!B${sheetRow}:H${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['', '', '', tableNum, existingSeating, '', '']],
      },
    });
  } catch (error) {
    console.error('Failed to clear reservation from Google Sheet:', error);
  }
}

export async function exportAllReservationsToSheet(reservations: ReservationData[]) {
  const sheets = await getUncachableGoogleSheetClient();

  const byDate = new Map<string, ReservationData[]>();
  for (const r of reservations) {
    const existing = byDate.get(r.date);
    if (existing) existing.push(r);
    else byDate.set(r.date, [r]);
  }

  const existingTabs = await getExistingTabs(sheets);

  const allDates = new Set<string>();
  for (const dateStr of byDate.keys()) allDates.add(dateStr);

  for (const dateStr of allDates) {
    const tabName = formatDateForTab(dateStr);

    if (existingTabs.includes(tabName)) {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties.title,sheets.properties.sheetId',
      });
      const sheetInfo = (spreadsheet.data.sheets || []).find(
        (s: any) => s.properties?.title === tabName
      );
      if (sheetInfo) {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${tabName}'!A:H`,
        });
      }
    } else {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
    }

    const template = generateTabTemplate(dateStr);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: template },
    });

    const dateReservations = byDate.get(dateStr) || [];
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A:H`,
    });
    const rows = result.data.values || [];

    for (const reservation of dateReservations) {
      if (reservation.status === 'cancelled' || reservation.status === 'no-show') continue;

      const sectionLabel = getSectionLabelForTime(reservation.time, reservation.date);
      if (!sectionLabel) continue;

      const { number: tableNum, isTeppanyaki } = parseTableInfo(reservation.tableName);
      const rowIndex = findTableRow(rows, sectionLabel, tableNum, isTeppanyaki);
      if (rowIndex === -1) continue;

      const sheetRow = rowIndex + 1;
      const existingSeating = rows[rowIndex]?.[5] || '';

      rows[rowIndex] = [
        rows[rowIndex]?.[0] || '',
        reservation.customerName,
        reservation.partySize,
        reservation.time,
        tableNum,
        existingSeating,
        reservation.phoneNumber,
        reservation.comments || '',
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!B${sheetRow}:H${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            reservation.customerName,
            reservation.partySize,
            reservation.time,
            tableNum,
            existingSeating,
            reservation.phoneNumber,
            reservation.comments || '',
          ]],
        },
      });
    }
  }

  return SPREADSHEET_ID;
}

export async function syncFromSheet(): Promise<{ updated: number; errors: string[]; updates: SheetReservationUpdate[]; sheetDates: string[] }> {
  return { updated: 0, errors: [], updates: [], sheetDates: [] };
}
