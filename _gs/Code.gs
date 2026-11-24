/**
 * 血糖調節實驗室：貼入指定試算表的 Apps Script，部署為網頁應用程式。
 * POST JSON: { userName, userEmail, log }
 * 成功回傳純文字 OK；失敗直接回傳原始 error.message。
 * log 可以是文字、陣列或物件；前端使用含 batchId / events 的物件。
 */
const LOG_CONFIG = Object.freeze({
  SPREADSHEET_ID: '1RIOZuGQD8m9PRk-uKtZSh9LkyVA1SryGPFp5kWMT6RE',
  SHEET_NAME: 'logSheet',
  HEADERS: ['timeStamp', 'userName', 'userEmail', 'log'],
  MAX_LOG_LENGTH: 45000
});

function doPost(e) {
  let lock;
  let locked = false;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('POST body 不可為空；請傳入 JSON。');
    }
    const data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('JSON 最外層必須是物件。');
    }
    const userName = requiredText_(data.userName, 'userName', 100);
    const userEmail = requiredText_(data.userEmail, 'userEmail', 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      throw new Error('userEmail 格式不正確。');
    }
    if (data.log === undefined || data.log === null || data.log === '') {
      throw new Error('log 不可為空。');
    }
    const logText = typeof data.log === 'string' ? data.log : JSON.stringify(data.log);
    if (logText.length > LOG_CONFIG.MAX_LOG_LENGTH) {
      throw new Error('log 超過 45000 字元，請縮小每批事件內容。');
    }
    const batchId = data.log && typeof data.log === 'object' && !Array.isArray(data.log)
      ? data.log.batchId : '';
    if (batchId && !validBatchId_(batchId)) {
      throw new Error('log.batchId 格式不正確。');
    }
    if (data.log && typeof data.log === 'object' && 'events' in data.log) {
      if (!Array.isArray(data.log.events) || data.log.events.length < 1 || data.log.events.length > 5) {
        throw new Error('log.events 必須是含有 1 到 5 個事件的陣列。');
      }
    }

    // 將去重檢查與 appendRow 放在同一把鎖內，避免多人同時寫入造成競爭。
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    locked = true;
    const spreadsheet = SpreadsheetApp.openById(LOG_CONFIG.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(LOG_CONFIG.SHEET_NAME)
      || spreadsheet.insertSheet(LOG_CONFIG.SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(LOG_CONFIG.HEADERS.slice());
      sheet.setFrozenRows(1);
    } else {
      const headers = sheet.getRange(1, 1, 1, 4).getValues()[0];
      if (!LOG_CONFIG.HEADERS.every((header, index) => headers[index] === header)) {
        throw new Error('logSheet 的 A1:D1 必須依序為 timeStamp、userName、userEmail、log；現有資料未變更。');
      }
    }

    const previous = batchId ? findBatch_(sheet, batchId) : null;
    if (previous) {
      const existing = sheet.getRange(previous.getRow(), 2, 1, 3).getValues()[0];
      const previousName = String(existing[0]).replace(/^'/, '');
      const previousEmail = String(existing[1]).replace(/^'/, '');
      if (previousName !== userName || previousEmail !== userEmail || String(existing[2]) !== logText) {
        throw new Error('相同 batchId 已存在，但資料內容不同；未重複寫入。');
      }
      return textOutput_('OK');
    }

    // 一批事件是一列；時間採 GAS 伺服器接收時刻，事件本身另含前端時間。
    sheet.appendRow([new Date(), safeCellText_(userName), safeCellText_(userEmail), safeCellText_(logText)]);
    SpreadsheetApp.flush();
    return textOutput_('OK');
  } catch (error) {
    return textOutput_(errorMessage_(error));
  } finally {
    if (locked) lock.releaseLock();
  }
}

/**
 * 只讀的確認端點：給瀏覽器無法讀取跨來源 POST 回覆時查詢。
 * 只回傳不可猜測的 batchId 與是否存在，不回傳姓名、Email 或 log。
 * 使用 JSONP 以避開回覆讀取限制；GET 絕不新增或修改試算表資料。
 */
function doGet(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  if (parameters.action !== 'ack') return textOutput_('血糖調節紀錄服務已啟動。');
  const callback = String(parameters.callback || '');
  if (!/^__gasAck_[A-Za-z0-9_]{8,120}$/.test(callback)) {
    return textOutput_('callback 格式不正確。');
  }
  const batchId = String(parameters.batchId || '');
  let result;
  try {
    if (!validBatchId_(batchId)) throw new Error('batchId 格式不正確。');
    const sheet = SpreadsheetApp.openById(LOG_CONFIG.SPREADSHEET_ID).getSheetByName(LOG_CONFIG.SHEET_NAME);
    result = { batchId, status: sheet && findBatch_(sheet, batchId) ? 'OK' : 'PENDING' };
  } catch (error) {
    result = { batchId, status: 'ERROR', error: errorMessage_(error) };
  }
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function findBatch_(sheet, batchId) {
  const rows = sheet.getLastRow();
  if (rows < 2) return null;
  return sheet.getRange(2, 4, rows - 1, 1)
    .createTextFinder('"batchId":' + JSON.stringify(batchId))
    .useRegularExpression(false).matchCase(true).findNext();
}

function validBatchId_(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(value);
}

function requiredText_(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(field + ' 不可為空。');
  const text = value.trim();
  if (text.length > maxLength) throw new Error(field + ' 超過 ' + maxLength + ' 字元。');
  return text;
}

function safeCellText_(value) {
  // 使用者輸入以 = 開頭時，appendRow 原本可能把它當成公式；加上文字前綴。
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function errorMessage_(error) {
  return error && typeof error.message === 'string' ? error.message : String(error);
}

function textOutput_(text) {
  return ContentService.createTextOutput(String(text)).setMimeType(ContentService.MimeType.TEXT);
}
