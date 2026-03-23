const SHEET_NAME = "TabletTracker";

function doGet(e) {
  const action = (e.parameter.action || "").trim();

  if (action === "health") {
    return jsonResponse({ ok: true, message: "alive" });
  }

  if (action === "list") {
    return jsonResponse({ ok: true, records: getAllRecords() });
  }

  return jsonResponse({ ok: false, message: "Unknown action" });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = body.action || "";

    if (action === "upsert") {
      upsertRecord(body.date, body.tablets, body.updatedAt);
      return jsonResponse({ ok: true });
    }

    if (action === "bulkUpsert") {
      const records = Array.isArray(body.records) ? body.records : [];
      records.forEach((record) => {
        upsertRecord(record.date, record.tablets, record.updatedAt);
      });
      return jsonResponse({ ok: true, count: records.length });
    }

    if (action === "deleteMany") {
      const dates = Array.isArray(body.dates) ? body.dates : [];
      const deleted = deleteManyRecords(dates);
      return jsonResponse({ ok: true, deleted });
    }

    return jsonResponse({ ok: false, message: "Unknown action" });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message || "Invalid request" });
  }
}

function getAllRecords() {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  const result = {};

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const date = String(row[0] || "").trim();
    if (!date) {
      continue;
    }

    result[date] = {
      tablets: [Boolean(row[1]), Boolean(row[2]), Boolean(row[3])],
      updatedAt: Number(row[4] || 0)
    };
  }

  return result;
}

function upsertRecord(date, tablets, updatedAt) {
  if (!date || !Array.isArray(tablets) || tablets.length !== 3) {
    return;
  }

  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  const t = [Boolean(tablets[0]), Boolean(tablets[1]), Boolean(tablets[2])];
  const stamp = Number(updatedAt || Date.now());

  for (let i = 1; i < rows.length; i += 1) {
    if (String(rows[i][0]).trim() === date) {
      const existingUpdatedAt = Number(rows[i][4] || 0);
      if (stamp >= existingUpdatedAt) {
        sheet.getRange(i + 1, 1, 1, 5).setValues([[date, t[0], t[1], t[2], stamp]]);
      }
      return;
    }
  }

  sheet.appendRow([date, t[0], t[1], t[2], stamp]);
}

function deleteManyRecords(dates) {
  const targets = new Set((dates || []).map((date) => String(date || "").trim()).filter(Boolean));
  if (!targets.size) {
    return 0;
  }

  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  let deleted = 0;

  for (let i = rows.length - 1; i >= 1; i -= 1) {
    const rowDate = String(rows[i][0] || "").trim();
    if (targets.has(rowDate)) {
      sheet.deleteRow(i + 1);
      deleted += 1;
    }
  }

  return deleted;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Date", "Tablet1", "Tablet2", "Tablet3", "UpdatedAt"]);
  }

  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
