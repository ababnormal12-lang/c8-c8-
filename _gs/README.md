# GAS 部署與操作紀錄說明

本資料夾的 `Code.gs` 搭配上層的 `胰島素與葡萄糖調節模擬器.html` 使用。前端負責收集資料、暫存、分批及重試；GAS 負責檢查、去重與寫入 Google 試算表。

## 1. 已指定的目的地

- [Google 試算表](https://docs.google.com/spreadsheets/d/1RIOZuGQD8m9PRk-uKtZSh9LkyVA1SryGPFp5kWMT6RE/edit)
- [Apps Script 專案編輯器](https://script.google.com/u/0/home/projects/1wRxI579zTdAtMvFJC-dcmFzwu_eQIsXeyusl3BkHpPcI85487SRXhjJz/edit)
- 寫入工作表：`logSheet`。不存在時由第一筆 POST 自動建立；不會把原有「工作表1」改名。
- A1:D1 欄名：`timeStamp`、`userName`、`userEmail`、`log`。

`Code.gs` 已寫入指定專案並儲存為同名檔案，前端也已填入提供的 [GAS 接收網址](https://script.google.com/macros/s/AKfycbzShqv0c1x_jDV6yNz6kT8bHEmokFYr1zQOOMIv0dO2tBPvLH5IIz-e_1xsLvJ-OaeJ/exec)。部署存取對象已調整為「所有人」，學生不用登入 Google 也可提交紀錄。已用可辨識的示範姓名與 Email 確認登入紀錄及一批 5 個按鈕事件實際寫入 `logSheet`，前端確認成功後才清除暫存。

## 2. 部署為網頁應用程式

1. 開啟上述 Apps Script 專案，確認有本資料夾的程式碼。
2. 按「部署」，建立新的部署作業。
3. 類型選「網頁應用程式」。
4. 執行身分選擇擁有目的試算表寫入權限的自己，讓寫入由此帳戶執行。
5. 若要讓未登入 Google 的前端學生送資料，存取對象需要允許「任何人」；帳戶或機構可能限制此選項。
6. 確認並完成 Google 要求的授權與部署。若出現安全或帳戶授權畫面，由帳戶持有人確認處理。
7. 複製「網頁應用程式」網址，格式應為 `https://script.google.com/macros/s/部署識別碼/exec`。

這會建立可接收寫入的端點。允許任何人存取代表拿到此網址的人可提交紀錄，不代表開放讀取整份試算表。不要把使用者自行填寫的姓名與 Email 視為已驗證身分。

部署流程與執行身分說明可參照 [Google 官方 Web Apps 文件](https://developers.google.com/apps-script/guides/web)。

### 日後更新 Code.gs

儲存編輯器中的程式，不代表既有 `/exec` 部署已更新。請在管理部署作業中編輯該部署，選用新版本並更新，才能讓原網址使用新程式。

## 3. 把網址接回 HTML

可選以下一種方式：

### 方式 A：寫進 HTML，供整班使用

用編輯器開啟上層 HTML，搜尋：

```javascript
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzShqv0c1x_jDV6yNz6kT8bHEmokFYr1zQOOMIv0dO2tBPvLH5IIz-e_1xsLvJ-OaeJ/exec';
```

本版已填好上述網址。日後更換部署時，把單引號中間替換成新的完整 `/exec` 網址，儲存後重新整理；編輯器網址無法接收 `doPost`。

### 方式 B：只設定目前這個瀏覽器

1. 先填寫姓名與 Email，進入模擬器。
2. 按頁尾「紀錄」。
3. 展開「管理者設定」。
4. 填入 `/exec` 網址，按「儲存網址並重試」。

網址只存在這個瀏覽器來源的 localStorage 中。其他學生、其他瀏覽器或其他網址來源不會自動取得這個設定；正式分發時通常使用方式 A。若 HTML 已有預設網址，重新載入時會優先使用它。

## 4. 姓名與 Email 的前端變數

```javascript
let userName = '';
let userEmail = '';
```

資料確認後會把欄位內容指定給這兩個變數。兩者放在頂層傳統 script 的詞彙作用域，可供同一頁後續程式使用；它們不是靠 `window.userName` 或 `window.userEmail` 屬性保存。

姓名會去除前後空白並檢查非空白，最長 100 字元；Email 檢查格式，最長 254 字元。確認資料前，不能跳過進入視窗直接操作模擬器。Email 格式驗證不等同於寄送驗證信。

## 5. 送出格式

`doPost(e)` 接收 JSON，最外層欄位如下：

| 欄位 | 型別 | 內容 |
| --- | --- | --- |
| `userName` | 字串 | 確認後的姓名 |
| `userEmail` | 字串 | 確認後的 Email |
| `log` | 前端使用物件 | 批號、工作階段、批次類型與事件陣列 |

以下是一筆登入確認封包示例；其中姓名與 Email 都是示範資料：

```json
{
  "userName": "示範學生",
  "userEmail": "student@example.com",
  "log": {
    "version": 1,
    "batchId": "demo-batch-1234567890",
    "sessionId": "demo-session-123456",
    "kind": "identify",
    "createdAt": "2026-11-24T02:00:00.000Z",
    "events": [
      {
        "eventId": "demo-event-1234567890",
        "timeStamp": "2026-11-24T02:00:00.000Z",
        "type": "identity_confirm",
        "target": "identity-form"
      }
    ]
  }
}
```

一般操作的 `kind` 為 `events`，每批正好 5 個事件；立即同步或離開時，`kind` 會記下觸發原因，允許最後 1–4 個事件。重新載入復原上一輪未成批事件時使用 `resume`。

每個一般操作事件另含當下的 `snapshot`：`relativeGlucose`、`blood`、`cell`、`insulinBusy`。點擊事件含元件標籤與操作來源；輸入事件含欄位型別及最多 1000 字元的值。

伺服器也接受純文字或陣列型別的 `log`，方便簡單整合；但沒有有效 `batchId` 的自訂資料不能享有本前端的重試去重保護。含 `events` 的物件必須有 1–5 個事件，整個 log 最長 45000 字元。

## 6. 一批如何寫成試算表的一列？

核心寫入動作是：

```javascript
sheet.appendRow([
  new Date(),
  safeCellText_(userName),
  safeCellText_(userEmail),
  safeCellText_(logText)
]);
```

`logText` 是把 log 物件轉成 JSON 字串的結果，因此一格內包含整批事件，而不是把 5 個事件拆成 5 列。最外層 `timeStamp` 是 GAS 接收時間；事件自己的時間另存於 log。

資料中的姓名與輸入文字可能以 `=` 開頭，`safeCellText_()` 會加上文字前綴，避免被當成試算表公式。`appendRow` 的行為可參照 [Google Sheet 類別文件](https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendRow(Object))。

## 7. 成功、失敗與 exact 錯誤訊息

成功只回傳純文字：

```text
OK
```

失敗回傳 `error.message` 原文，不加 `ERROR:` 或其他前綴。例如 Email 不正確時：

```text
userEmail 格式不正確。
```

JSON 解析或 Google 服務拋出的錯誤也使用同一個處理方式；其實際文字取決於執行時收到的錯誤，沒有另外捏造固定訊息。

GAS ContentService 回覆錯誤文字時，不一定提供與內容相符的 HTTP 錯誤狀態碼。前端必須檢查回覆是不是 `OK`，不能只看請求有完成或 `response.ok`。

## 8. 為什麼另有 doGet？

瀏覽器可能因網路或跨來源回覆限制，沒讀到 POST 的結果，而資料其實已寫入。這種情況下，前端會用只讀確認查詢同一個批號。

查詢只回傳：

```json
{"batchId":"demo-batch-1234567890","status":"OK"}
```

尚未找到則為 `PENDING`，查詢出錯則為 `ERROR` 並附錯誤訊息。回覆使用受限制名稱的 JSONP callback；不包含姓名、Email、事件內容，也不會新增或修改資料。

前端 POST 的 body 是 JSON 字串，Content-Type 使用 `text/plain;charset=UTF-8`，減少跨來源預檢；不是用 `no-cors` 隱藏錯誤並直接清除暫存。若 POST 與只讀確認都無法讀取，就維持待送出。

Google 的 ContentService 會把內容重新導向到回覆網址，其說明與只讀 JSONP 注意事項可參照 [官方 Content Service 文件](https://developers.google.com/apps-script/guides/content)。

## 9. 暫存與重試規則

- 瀏覽器暫存 key：`insulin-glucose:activity:v1`。
- 管理者網址 key：`insulin-glucose:gas-url:v1`。
- 每次事件先保存到暫存；成批後，姓名、Email 與這批事件一起固定下來。
- 重試沿用同一個 `batchId` 與內容。GAS 在 Script Lock 中先查重，再 `appendRow`，避免相同請求同時多寫。
- 失敗處理完成後，依序約等 3、6、12、24、48、60 秒重試，之後最多等 60 秒；重新連線或立即同步也能重試。
- 未設定部署網址時不傳送，保留暫存；設定網址後會重試。
- 重新開始模擬不會刪除紀錄。重新載入頁面會重設模擬並再詢問身分，但待送舊紀錄保留原本的姓名與 Email。
- 暫存寫入失敗時，介面會顯示原因。可以先下載 JSON 備份，避免關閉頁面後失去僅在記憶體中的資料。

這版使用同來源的單一 localStorage 狀態，請不要在同一瀏覽器同來源同時開兩個分頁寫紀錄。清除瀏覽器網站資料、使用私密模式、換裝置或更換來源，都可能讓原本的暫存無法取得。

## 10. 如何確認真正寫進 Google？

1. 完成部署並設定前端網址。
2. 用可識別的測試姓名與示範 Email 確認資料。
3. 等待頁尾顯示已同步，再到試算表看 `logSheet`。
4. 確認有一筆 `identify`，四欄依序正確。
5. 做 5 次有效操作，確認新增的一列內，`events` 長度為 5。
6. 做 1–4 次操作後按立即同步，確認剩餘事件也能寫入。
7. 觀察失敗或斷線時，狀態應維持待送出；恢復後再確認，不應因重試增加相同批號的列。

本機替身測試已檢查程式規則，瀏覽器也已檢查登入、暫存及版面。接入網址時曾發現部署僅限擁有者，導致前端無法寫入；調整為「所有人」後，已在真實 `logSheet` 看見下列 3 筆測試資料，並確認前端待送數量歸零。測試姓名為 `連線測試_20261124`，Email 為 `gas-test@example.com`，可與正式學生資料區分。

| 試算表列 | 批次類型 | 事件數 | 驗證內容 |
| --- | --- | ---: | --- |
| 第 2 列 | identify | 1 | 姓名與 Email 確認後立即寫入 |
| 第 3 列 | events | 5 | 五次 A 按鈕操作合併為一列 |
| 第 4 列 | manual | 2 | B 與重新開始兩個事件，立即同步後寫入 |

三筆批號各不相同。測試資料保留於表中；前端待送事件、已成批及未滿 5 個的數量皆為 0。
