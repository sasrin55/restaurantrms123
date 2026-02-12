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

const HEADERS = ['Name', 'Phone', 'Date', 'Time', 'Party Size', 'Table', 'Comments', 'Status', 'Created At', 'ID'];

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
        properties: { title: 'Reservations' },
      }],
    },
  });

  cachedSpreadsheetId = spreadsheet.data.spreadsheetId!;

  await sheets.spreadsheets.values.update({
    spreadsheetId: cachedSpreadsheetId,
    range: `Reservations!A1:J1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [HEADERS],
    },
  });

  return cachedSpreadsheetId;
}

function reservationToRow(reservation: {
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
}) {
  return [
    reservation.customerName,
    reservation.phoneNumber,
    reservation.date,
    reservation.time,
    reservation.partySize,
    reservation.tableName,
    reservation.comments || "",
    reservation.status,
    reservation.createdAt ? reservation.createdAt.toISOString() : new Date().toISOString(),
    reservation.id,
  ];
}

async function findRowByReservationId(sheets: any, spreadsheetId: string, reservationId: string): Promise<number> {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Reservations!J:J',
  });

  const rows = result.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === reservationId) {
      return i + 1;
    }
  }
  return -1;
}

export async function appendReservationToSheet(reservation: {
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
}) {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const spreadsheetId = await getOrCreateSpreadsheet();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Reservations!A:J',
      valueInputOption: 'RAW',
      requestBody: {
        values: [reservationToRow(reservation)],
      },
    });
  } catch (error) {
    console.error('Failed to append reservation to Google Sheet:', error);
  }
}

export async function updateReservationInSheet(reservation: {
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
}) {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const spreadsheetId = await getOrCreateSpreadsheet();

    const rowIndex = await findRowByReservationId(sheets, spreadsheetId, reservation.id);

    if (rowIndex > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Reservations!A${rowIndex}:J${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [reservationToRow(reservation)],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Reservations!A:J',
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

export async function exportAllReservationsToSheet(reservations: Array<{
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
}>) {
  const sheets = await getUncachableGoogleSheetClient();
  const spreadsheetId = await getOrCreateSpreadsheet();

  const rows = reservations.map(r => reservationToRow(r));

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Reservations!A:J',
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Reservations!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [HEADERS, ...rows],
    },
  });

  return spreadsheetId;
}
