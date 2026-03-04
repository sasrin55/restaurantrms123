import { google } from 'googleapis';

const SPREADSHEET_ID = '1HgLRHFG7E80H5W0P-S5Qo--kOXxGRttbvanLKnMC4sQ';

const RESTAURANT_TABLES = [
  { number: "1", seating: "4 to 6" },
  { number: "2", seating: "4 to 6" },
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
  { number: "11", seating: "8 to 10" },
  { number: "12", seating: "3 to 4" },
  { number: "13", seating: "3 to 4" },
  { number: "14", seating: "4 to 6" },
  { number: "15", seating: "2 to 3" },
  { number: "15a", seating: "2 to 3" },
];

const TABLE_COUNT = RESTAURANT_TABLES.length;
const TEP_COUNT = 8;
const HEADERS = ['No.', 'Name', 'Pax', 'Time', 'Table', 'Seating', 'Number', 'Details'];
const COL_COUNT = HEADERS.length;

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

interface SectionLayout {
  section: TimeSlotSection;
  headerRow: number;
  colHeaderRow: number;
  firstDataRow: number;
  lastDataRow: number;
  totalRow: number;
  tepHeaderRow: number;
  tepColHeaderRow: number;
  tepFirstRow: number;
  tepLastRow: number;
}

function computeTabLayout(dateStr: string): SectionLayout[] {
  const timeSections = getSectionsForDate(dateStr);
  const layouts: SectionLayout[] = [];
  let row = 0;

  for (const section of timeSections) {
    row++;
    const headerRow = row; row++;
    const colHeaderRow = row; row++;
    const firstDataRow = row; row += TABLE_COUNT;
    const lastDataRow = row - 1;
    const totalRow = row; row++;
    row++;
    const tepHeaderRow = row; row++;
    const tepColHeaderRow = row; row++;
    const tepFirstRow = row; row += TEP_COUNT;
    const tepLastRow = row - 1;

    layouts.push({
      section, headerRow, colHeaderRow,
      firstDataRow, lastDataRow, totalRow,
      tepHeaderRow, tepColHeaderRow, tepFirstRow, tepLastRow,
    });
  }

  return layouts;
}

function generateSectionRows(section: TimeSlotSection, paxTotalRowNum: number): any[][] {
  const rows: any[][] = [];
  rows.push([]);
  rows.push([section.label, '', '', '', '', '', '', '']);
  rows.push([...HEADERS]);
  RESTAURANT_TABLES.forEach((t, i) => {
    rows.push([i + 1, '', '', '', t.number, t.seating, '', '']);
  });
  const firstPaxRow = paxTotalRowNum - TABLE_COUNT + 1;
  rows.push(['', 'Total:', `=SUM(C${firstPaxRow}:C${paxTotalRowNum})`, '', '', '', '', '']);
  rows.push([]);
  rows.push(['Teppanyaki Bar', '', '', '', '', '', '', '']);
  rows.push([...HEADERS]);
  for (let i = 1; i <= TEP_COUNT; i++) {
    rows.push([i, '', '', '', String(i), '1', '', '']);
  }
  return rows;
}

function generateTabTemplate(dateStr: string): any[][] {
  const layouts = computeTabLayout(dateStr);
  const allRows: any[][] = [];
  for (const layout of layouts) {
    const totalRow1Based = layout.totalRow + 1;
    allRows.push(...generateSectionRows(layout.section, totalRow1Based - 1));
  }
  allRows.push([]);
  return allRows;
}

const SOLID_BORDER = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };
const GRAY_BG = { red: 0.82, green: 0.82, blue: 0.82 };
const LIGHT_GRAY_BG = { red: 0.93, green: 0.93, blue: 0.93 };

async function formatTab(sheets: any, tabName: string, dateStr: string) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const sheetInfo = (spreadsheet.data.sheets || []).find(
    (s: any) => s.properties?.title === tabName
  );
  if (!sheetInfo) return;
  const sheetId = sheetInfo.properties.sheetId;

  const layouts = computeTabLayout(dateStr);
  const requests: any[] = [];

  const columnWidths = [45, 160, 50, 80, 70, 80, 120, 160];
  for (let i = 0; i < columnWidths.length; i++) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: columnWidths[i] },
        fields: 'pixelSize',
      },
    });
  }

  for (const layout of layouts) {
    requests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: layout.headerRow, endRowIndex: layout.headerRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        mergeType: 'MERGE_ALL',
      },
    });

    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: layout.headerRow, endRowIndex: layout.headerRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true, fontSize: 11 },
            backgroundColor: GRAY_BG,
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat,backgroundColor)',
      },
    });

    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: layout.colHeaderRow, endRowIndex: layout.colHeaderRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true },
            backgroundColor: LIGHT_GRAY_BG,
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat,backgroundColor)',
      },
    });

    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: layout.totalRow, endRowIndex: layout.totalRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: LIGHT_GRAY_BG,
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    });

    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex: layout.headerRow, endRowIndex: layout.totalRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        top: SOLID_BORDER,
        bottom: SOLID_BORDER,
        left: SOLID_BORDER,
        right: SOLID_BORDER,
        innerHorizontal: SOLID_BORDER,
        innerVertical: SOLID_BORDER,
      },
    });

    for (const col of [0, 2, 3, 4, 5]) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: layout.firstDataRow, endRowIndex: layout.lastDataRow + 1, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });
    }

    requests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: layout.tepHeaderRow, endRowIndex: layout.tepHeaderRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        mergeType: 'MERGE_ALL',
      },
    });

    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: layout.tepHeaderRow, endRowIndex: layout.tepHeaderRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true, fontSize: 11 },
            backgroundColor: GRAY_BG,
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat,backgroundColor)',
      },
    });

    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: layout.tepColHeaderRow, endRowIndex: layout.tepColHeaderRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true },
            backgroundColor: LIGHT_GRAY_BG,
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat,backgroundColor)',
      },
    });

    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex: layout.tepHeaderRow, endRowIndex: layout.tepLastRow + 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        top: SOLID_BORDER,
        bottom: SOLID_BORDER,
        left: SOLID_BORDER,
        right: SOLID_BORDER,
        innerHorizontal: SOLID_BORDER,
        innerVertical: SOLID_BORDER,
      },
    });

    for (const col of [0, 2, 3, 4, 5]) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: layout.tepFirstRow, endRowIndex: layout.tepLastRow + 1, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
  }
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
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: template },
    });
    await formatTab(sheets, tabName, dateStr);
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

function findExistingGuestRow(
  rows: any[][],
  sectionLabel: string,
  customerName: string,
  phoneNumber: string
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

  for (let i = sectionRow + 2; i < nextSectionRow; i++) {
    const rowName = String(rows[i]?.[1] || '').trim();
    const rowPhone = String(rows[i]?.[6] || '').trim();
    if (rowName && rowName === customerName && rowPhone === phoneNumber) {
      return i;
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

export interface SheetNewReservation {
  customerName: string;
  phoneNumber: string;
  date: string;
  time: string;
  partySize: number;
  tableName: string;
  tableId: number;
  comments: string;
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

    const existingRow = findExistingGuestRow(rows, sectionLabel, reservation.customerName, reservation.phoneNumber);

    if (existingRow !== -1) {
      const currentTable = String(rows[existingRow]?.[4] || '').trim();
      const newTableVal = currentTable ? `${currentTable}, ${tableNum}` : tableNum;
      const sheetRow = existingRow + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!E${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[newTableVal]] },
      });
      console.log(`Added table ${tableNum} to existing row ${sheetRow} for ${reservation.customerName}`);
      return;
    }

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
    if (reservation.status === 'seated') {
      await highlightReservationRow(reservation, { red: 0.71, green: 0.88, blue: 0.70 });
    } else if (reservation.status === 'complete') {
      await highlightReservationRow(reservation, { red: 0.85, green: 0.85, blue: 0.85 });
    }
  } catch (error) {
    console.error('Failed to update reservation in Google Sheet:', error);
  }
}

async function highlightReservationRow(reservation: ReservationData, color: { red: number; green: number; blue: number }) {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const tabName = formatDateForTab(reservation.date);
    const existingTabs = await getExistingTabs(sheets);
    if (!existingTabs.includes(tabName)) return;

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties',
    });
    const sheetInfo = (spreadsheet.data.sheets || []).find(
      (s: any) => s.properties?.title === tabName
    );
    if (!sheetInfo) return;
    const sheetId = sheetInfo.properties.sheetId;

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A:H`,
    });
    const rows = result.data.values || [];

    const sectionLabel = getSectionLabelForTime(reservation.time, reservation.date);
    if (!sectionLabel) return;

    const { number: tableNum, isTeppanyaki } = parseTableInfo(reservation.tableName);

    let rowIndex = findExistingGuestRow(rows, sectionLabel, reservation.customerName, reservation.phoneNumber);
    if (rowIndex === -1) {
      rowIndex = findTableRow(rows, sectionLabel, tableNum, isTeppanyaki);
    }
    if (rowIndex === -1) return;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: COL_COUNT,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: color,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        }],
      },
    });

    console.log(`Highlighted row ${rowIndex + 1} in ${tabName} for ${reservation.customerName} (${reservation.status})`);
  } catch (error) {
    console.error('Failed to highlight reservation in Google Sheet:', error);
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

interface GroupedReservation {
  customerName: string;
  phoneNumber: string;
  partySize: number;
  time: string;
  tableNumbers: string[];
  comments: string;
  firstTableNum: string;
  firstIsTeppanyaki: boolean;
}

function groupReservationsByGuest(reservations: ReservationData[]): GroupedReservation[] {
  const groups = new Map<string, GroupedReservation>();

  for (const r of reservations) {
    if (r.status === 'cancelled' || r.status === 'no-show') continue;
    const key = `${r.customerName}|${r.phoneNumber}|${r.time}`;
    const { number: tableNum, isTeppanyaki } = parseTableInfo(r.tableName);

    const existing = groups.get(key);
    if (existing) {
      existing.tableNumbers.push(tableNum);
    } else {
      groups.set(key, {
        customerName: r.customerName,
        phoneNumber: r.phoneNumber,
        partySize: r.partySize,
        time: r.time,
        tableNumbers: [tableNum],
        comments: r.comments || '',
        firstTableNum: tableNum,
        firstIsTeppanyaki: isTeppanyaki,
      });
    }
  }

  return Array.from(groups.values());
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

  for (const dateStr of byDate.keys()) {
    const tabName = formatDateForTab(dateStr);

    if (existingTabs.includes(tabName)) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A:Z`,
      });
      const spreadsheetMeta = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties',
      });
      const sheetMeta = (spreadsheetMeta.data.sheets || []).find(
        (s: any) => s.properties?.title === tabName
      );
      if (sheetMeta) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              unmergeCells: {
                range: {
                  sheetId: sheetMeta.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1000,
                  startColumnIndex: 0,
                  endColumnIndex: 26,
                },
              },
            }],
          },
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
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: template },
    });

    await formatTab(sheets, tabName, dateStr);

    const dateReservations = byDate.get(dateStr) || [];
    const grouped = groupReservationsByGuest(dateReservations);

    const dataResult = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A:H`,
    });
    const rows = dataResult.data.values || [];

    for (const group of grouped) {
      const sectionLabel = getSectionLabelForTime(group.time, dateStr);
      if (!sectionLabel) continue;

      const rowIndex = findTableRow(rows, sectionLabel, group.firstTableNum, group.firstIsTeppanyaki);
      if (rowIndex === -1) continue;

      const sheetRow = rowIndex + 1;
      const existingSeating = rows[rowIndex]?.[5] || '';
      const tableDisplay = group.tableNumbers.join(', ');

      rows[rowIndex] = [
        rows[rowIndex]?.[0] || '',
        group.customerName,
        group.partySize,
        group.time,
        tableDisplay,
        existingSeating,
        group.phoneNumber,
        group.comments,
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!B${sheetRow}:H${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            group.customerName,
            group.partySize,
            group.time,
            tableDisplay,
            existingSeating,
            group.phoneNumber,
            group.comments,
          ]],
        },
      });
    }
  }

  return SPREADSHEET_ID;
}

function parseTabNameToDate(tabName: string): string | null {
  const months: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
  };
  const match = tabName.match(/(\d+)\w+\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
  if (!match) return null;
  const day = parseInt(match[1]);
  const monthIdx = months[match[2]];
  if (monthIdx === undefined) return null;
  const now = new Date();
  const year = now.getFullYear();
  const m = String(monthIdx + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function reverseTableLookup(tableNum: string, isTeppanyaki: boolean): { tableId: number; tableName: string } | null {
  if (isTeppanyaki) {
    const seatNum = parseInt(tableNum);
    if (seatNum >= 1 && seatNum <= 8) {
      return { tableId: 1000 + seatNum, tableName: `Tepanyaki Seat ${seatNum}` };
    }
    return null;
  }
  const tableMap: Record<string, number> = {
    '1': 1, '2': 2, '25': 25, '3': 3, '4': 4, '5': 5, '20': 20,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, '11': 11,
    '12': 12, '13': 13, '14': 14, '15': 15, '15a': 16,
  };
  const id = tableMap[tableNum];
  if (!id) return null;
  return { tableId: id, tableName: `Table ${tableNum}` };
}

export async function syncFromSheet(): Promise<{ updated: number; errors: string[]; updates: SheetReservationUpdate[]; newReservations: SheetNewReservation[]; sheetDates: string[] }> {
  const updates: SheetReservationUpdate[] = [];
  const newReservations: SheetNewReservation[] = [];
  const errors: string[] = [];
  const sheetDates: string[] = [];

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties.title',
    });
    const tabs = (spreadsheet.data.sheets || []).map((s: any) => s.properties?.title as string);

    const { storage } = await import('./storage');
    const allReservations = await storage.getReservations();

    for (const tabName of tabs) {
      const dateStr = parseTabNameToDate(tabName);
      if (!dateStr) continue;
      sheetDates.push(dateStr);

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A:H`,
      });
      const rows = result.data.values || [];

      const sections = getSectionsForDate(dateStr);
      const dateReservations = allReservations.filter(r => r.date === dateStr);

      for (const section of sections) {
        let sectionRow = -1;
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i]?.[0] || '').trim() === section.label) {
            sectionRow = i;
            break;
          }
        }
        if (sectionRow === -1) continue;

        let nextSectionRow = rows.length;
        for (let i = sectionRow + 1; i < rows.length; i++) {
          const cell = String(rows[i]?.[0] || '').trim();
          if (cell.includes(' — ') && cell !== section.label) {
            nextSectionRow = i;
            break;
          }
        }

        let tepRow = -1;
        for (let i = sectionRow + 1; i < nextSectionRow; i++) {
          if (String(rows[i]?.[0] || '').trim() === 'Teppanyaki Bar') {
            tepRow = i;
            break;
          }
        }

        const regularEnd = tepRow !== -1 ? tepRow : nextSectionRow;
        for (let i = sectionRow + 2; i < regularEnd; i++) {
          processSheetRow(rows[i], dateStr, section.timeKey, false, dateReservations, updates, newReservations);
        }

        if (tepRow !== -1) {
          for (let i = tepRow + 2; i < nextSectionRow; i++) {
            processSheetRow(rows[i], dateStr, section.timeKey, true, dateReservations, updates, newReservations);
          }
        }
      }
    }
  } catch (error: any) {
    errors.push(error.message || 'Unknown sync error');
    console.error('syncFromSheet error:', error);
  }

  return { updated: updates.length, errors, updates, newReservations, sheetDates };
}

function processSheetRow(
  row: any[] | undefined,
  dateStr: string,
  timeKey: string,
  isTeppanyaki: boolean,
  dateReservations: any[],
  updates: SheetReservationUpdate[],
  newReservations: SheetNewReservation[]
) {
  if (!row) return;
  const name = String(row[1] || '').trim();
  const pax = parseInt(String(row[2] || '0'));
  const tableNum = String(row[4] || '').trim();
  const phone = String(row[6] || '').trim();
  const comments = String(row[7] || '').trim();

  if (!name || !tableNum) return;

  const tableInfo = reverseTableLookup(tableNum, isTeppanyaki);
  if (!tableInfo) return;

  const matching = dateReservations.filter(r =>
    r.tableId === tableInfo.tableId && r.time === timeKey
  );

  if (matching.length === 1) {
    const r = matching[0];
    const hasChanges =
      r.customerName !== name ||
      r.phoneNumber !== phone ||
      r.partySize !== pax ||
      (r.comments || '') !== comments;

    if (hasChanges) {
      updates.push({
        id: r.id,
        customerName: name,
        phoneNumber: phone || r.phoneNumber,
        date: dateStr,
        time: timeKey,
        partySize: pax || r.partySize,
        tableName: tableInfo.tableName,
        tableId: tableInfo.tableId,
        comments: comments,
        status: r.status,
      });
    } else {
      updates.push({
        id: r.id,
        customerName: r.customerName,
        phoneNumber: r.phoneNumber,
        date: r.date,
        time: r.time,
        partySize: r.partySize,
        tableName: r.tableName,
        tableId: r.tableId,
        comments: r.comments || '',
        status: r.status,
      });
    }
  } else if (matching.length === 0) {
    newReservations.push({
      customerName: name,
      phoneNumber: phone,
      date: dateStr,
      time: timeKey,
      partySize: pax || 1,
      tableName: tableInfo.tableName,
      tableId: tableInfo.tableId,
      comments: comments,
    });
  } else if (matching.length > 1) {
    const exact = matching.find(r =>
      r.customerName === name || r.phoneNumber === phone
    );
    if (exact) {
      updates.push({
        id: exact.id,
        customerName: name,
        phoneNumber: phone || exact.phoneNumber,
        date: dateStr,
        time: timeKey,
        partySize: pax || exact.partySize,
        tableName: tableInfo.tableName,
        tableId: tableInfo.tableId,
        comments: comments,
        status: exact.status,
      });
      for (const r of matching) {
        if (r.id !== exact.id) {
          updates.push({
            id: r.id,
            customerName: r.customerName,
            phoneNumber: r.phoneNumber,
            date: r.date,
            time: r.time,
            partySize: r.partySize,
            tableName: r.tableName,
            tableId: r.tableId,
            comments: r.comments || '',
            status: r.status,
          });
        }
      }
    }
  }
}
