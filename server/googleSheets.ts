// Google Sheets integration via Replit connector
import { google } from 'googleapis';

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
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

let cachedSpreadsheetId: string | null = null;

const HEADERS = ['#', 'Name', 'Phone', 'Time', 'Party Size', 'Table', 'Comments', 'Status', 'Created At', 'ID'];

function formatDateForTab(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(parts[1]) - 1] || parts[1];
    const day = parseInt(parts[2]);
    const year = parts[0];
    return `${month} ${day}, ${year}`;
  }
  return dateStr;
}

async function getOrCreateSpreadsheet(): Promise<string> {
  if (cachedSpreadsheetId) {
    return cachedSpreadsheetId;
  }

  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const searchResult = await drive.files.list({
    q: "name = 'PAOLA\\'s Reservations' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (searchResult.data.files && searchResult.data.files.length > 0) {
    cachedSpreadsheetId = searchResult.data.files[0].id!;
    return cachedSpreadsheetId;
  }

  const sheets = await getUncachableGoogleSheetClient();
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "PAOLA's Reservations" },
      sheets: [{
        properties: { title: 'Overview' },
      }],
    },
  });

  cachedSpreadsheetId = spreadsheet.data.spreadsheetId!;
  return cachedSpreadsheetId;
}

async function ensureDateTab(sheets: any, spreadsheetId: string, dateStr: string): Promise<string> {
  const tabName = formatDateForTab(dateStr);

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const existingSheets = spreadsheet.data.sheets || [];
  const tabExists = existingSheets.some((s: any) => s.properties?.title === tabName);

  if (!tabExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: tabName },
          },
        }],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1:J1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [HEADERS],
      },
    });
  }

  return tabName;
}

function parseTabNameToDate(tabName: string): string | null {
  const months: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
  };
  const match = tabName.match(/^(\w+)\s+(\d+),\s+(\d+)$/);
  if (!match) return null;
  const month = months[match[1]];
  if (!month) return null;
  const day = match[2].padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}

const TABLE_NAME_TO_ID: Record<string, number> = {
  'Table 1': 1, 'Table 2': 2, 'Table 25': 25, 'Table 3': 3, 'Table 4': 4,
  'Table 5': 5, 'Table 20': 20, 'Table 6': 6, 'Table 7': 7, 'Table 8': 8,
  'Table 9': 9, 'Table 10': 10, 'Table 11': 11, 'Table 12': 12, 'Table 13': 13,
  'Table 14': 14, 'Table 15': 15, 'Table 15a': 150,
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

export async function syncFromSheet(): Promise<{ updated: number; errors: string[] }> {
  const sheets = await getUncachableGoogleSheetClient();
  const spreadsheetId = await getOrCreateSpreadsheet();
  const errors: string[] = [];
  const updates: SheetReservationUpdate[] = [];

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const allSheets = spreadsheet.data.sheets || [];
  const dateTabs = allSheets
    .map((s: any) => s.properties?.title as string)
    .filter((title: string) => title && title !== 'Overview' && parseTabNameToDate(title));

  for (const tabName of dateTabs) {
    const dateStr = parseTabNameToDate(tabName);
    if (!dateStr) continue;

    try {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tabName}'!A:J`,
      });

      const rows = result.data.values || [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 10) continue;

        const id = (row[9] || '').toString().trim();
        if (!id) continue;

        const tableName = (row[5] || '').toString().trim();
        const tableId = TABLE_NAME_TO_ID[tableName];
        if (!tableId) {
          errors.push(`Row ${i + 1} in "${tabName}": unknown table "${tableName}"`);
          continue;
        }

        updates.push({
          id,
          customerName: (row[1] || '').toString().trim(),
          phoneNumber: (row[2] || '').toString().trim(),
          date: dateStr,
          time: (row[3] || '').toString().trim(),
          partySize: parseInt(row[4]) || 0,
          tableName,
          tableId,
          comments: (row[6] || '').toString().trim(),
          status: (row[7] || '').toString().trim(),
        });
      }
    } catch (err: any) {
      errors.push(`Failed to read tab "${tabName}": ${err.message}`);
    }
  }

  return { updated: updates.length, errors, updates } as any;
}

type ReservationData = {
  id: string;
  customerName: string;
  phoneNumber: string;
  date: string;
  time: string;
  partySize: number;
  tableName: string;
  comments?: string | null;
  status: string;
  createdAt: Date | null;
};

function reservationToRow(reservation: ReservationData, rowNumber?: number) {
  return [
    rowNumber ?? "",
    reservation.customerName,
    reservation.phoneNumber,
    reservation.time,
    reservation.partySize,
    reservation.tableName,
    reservation.comments || "",
    reservation.status,
    reservation.createdAt ? reservation.createdAt.toISOString() : new Date().toISOString(),
    reservation.id,
  ];
}

async function findRowByReservationId(sheets: any, spreadsheetId: string, tabName: string, reservationId: string): Promise<number> {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!J:J`,
    });

    const rows = result.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === reservationId) {
        return i + 1;
      }
    }
  } catch {
  }
  return -1;
}

export async function appendReservationToSheet(reservation: ReservationData) {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const spreadsheetId = await getOrCreateSpreadsheet();
    const tabName = await ensureDateTab(sheets, spreadsheetId, reservation.date);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tabName}'!A:J`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [reservationToRow(reservation)],
      },
    });
  } catch (error) {
    console.error('Failed to append reservation to Google Sheet:', error);
  }
}

export async function updateReservationInSheet(reservation: ReservationData) {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const spreadsheetId = await getOrCreateSpreadsheet();
    const tabName = await ensureDateTab(sheets, spreadsheetId, reservation.date);

    const rowIndex = await findRowByReservationId(sheets, spreadsheetId, tabName, reservation.id);

    if (rowIndex > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A${rowIndex}:J${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [reservationToRow(reservation, rowIndex - 1)],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${tabName}'!A:J`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [reservationToRow(reservation)],
        },
      });
    }
  } catch (error) {
    console.error('Failed to update reservation in Google Sheet:', error);
  }
}

export async function exportAllReservationsToSheet(reservations: ReservationData[]) {
  const sheets = await getUncachableGoogleSheetClient();
  const spreadsheetId = await getOrCreateSpreadsheet();

  const byDate = new Map<string, ReservationData[]>();
  for (const r of reservations) {
    const existing = byDate.get(r.date);
    if (existing) {
      existing.push(r);
    } else {
      byDate.set(r.date, [r]);
    }
  }

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title,sheets.properties.sheetId',
  });

  const existingSheets = spreadsheet.data.sheets || [];
  const deleteRequests: any[] = [];
  for (const s of existingSheets) {
    const title = s.properties?.title;
    if (title && title !== 'Overview') {
      deleteRequests.push({
        deleteSheet: { sheetId: s.properties?.sheetId },
      });
    }
  }

  if (deleteRequests.length > 0) {
    const hasOverview = existingSheets.some((s: any) => s.properties?.title === 'Overview');
    if (!hasOverview) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: { properties: { title: 'Overview' } },
          }],
        },
      });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: deleteRequests },
    });
  }

  const sortedDates = Array.from(byDate.keys()).sort();

  for (const dateStr of sortedDates) {
    const dateReservations = byDate.get(dateStr)!;
    const tabName = await ensureDateTab(sheets, spreadsheetId, dateStr);
    const rows = dateReservations.map((r, i) => reservationToRow(r, i + 1));

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [HEADERS, ...rows],
      },
    });
  }

  return spreadsheetId;
}
