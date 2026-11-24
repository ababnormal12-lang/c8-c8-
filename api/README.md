# Vercel 中間代理：POST /api/save

`save.js` 使用 Vercel 的 Node.js Function，接收前端 POST 的 JSON，從 `process.env.GAS_URL` 取得 Apps Script 接收網址，再使用內建 `fetch` 轉送資料。GAS 的回覆文字與 HTTP 狀態會回傳給前端。

## 1. 放置位置

```text
成果/                         ← 在 Vercel 中設為專案根目錄
├── 胰島素與葡萄糖調節模擬器.html
├── api/
│   ├── save.js                ← 對應 /api/save
│   └── README.md
└── _gs/
    └── Code.gs
```

目前採 CommonJS 的 `module.exports` 格式，適用這份沒有設定 `type: module` 的專案；若日後整個專案改用 ES Modules，需一併調整匯出格式。沒有使用第三方套件。

Vercel 的 `/api` 目錄與 Node.js 請求／回應物件說明，見 [官方 Node.js Runtime 文件](https://vercel.com/docs/functions/runtimes/node-js)。

## 2. 設定環境變數

在 Vercel 專案設定新增環境變數：

```text
GAS_URL=https://script.google.com/macros/s/AKfycbzShqv0c1x_jDV6yNz6kT8bHEmokFYr1zQOOMIv0dO2tBPvLH5IIz-e_1xsLvJ-OaeJ/exec
```

請套用到需要的部署環境，例如 Production；設定或更改後要重新部署，才會讓新的函式執行個體取得設定。環境變數屬於伺服器端設定，不要改成 `NEXT_PUBLIC_GAS_URL` 之類的前端公開變數。

這次建立的是本機程式檔，尚未替你建立 Vercel 專案、設定線上環境變數或部署。Vercel 環境變數的生效方式見 [官方 Environment Variables 文件](https://vercel.com/docs/environment-variables)。

## 3. 前端呼叫方式

同一個 Vercel 網站的前端可使用：

```javascript
const response = await fetch('/api/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userName,
    userEmail,
    log
  })
});

const result = await response.text();
if (response.ok && result.trim() === 'OK') {
  // 只有這個分支可以把對應批次從前端暫存移除。
} else {
  throw new Error(result || 'HTTP ' + response.status);
}
```

要使用代理路徑，需要讓前端送出函式呼叫 `/api/save`。目前的單一 HTML 仍採用已驗證的直接 GAS 傳送方式；新增此檔案不會自動切換前端。將前端改接代理時，應一併調整 GAS 網址格式檢查與直接 GAS 的 JSONP 確認流程，不能只替換網址字串。

`/api/save` 必須在已部署或正在本機模擬 Vercel 的環境中執行；直接用瀏覽器開啟本機 HTML，不會建立這個伺服器路徑。

## 4. 回覆與錯誤

| 情況 | HTTP 狀態 | 回覆內容 |
| --- | --- | --- |
| GAS 成功 | 保留 GAS 狀態，通常是 200 | 原樣回傳 `OK` |
| GAS 回傳應用程式錯誤 | 保留 GAS 狀態，可能仍為 200 | 原樣回傳錯誤文字，不包成另一層 JSON |
| GAS 回傳 HTTP 錯誤 | 保留 GAS 狀態 | 原樣回傳本文 |
| 不是 POST | 405 | 提示只接受 POST，並附 `Allow: POST` |
| 未設定或填錯 GAS_URL | 500 | 提示設定問題 |
| 本文不是有效的 JSON 物件 | 400 | 提示 JSON 格式問題 |
| 無法連線至 GAS | 502 | 連線錯誤訊息 |
| 等待 GAS 超過 20 秒 | 504 | 提示尚未確認儲存，應保留原批號重試 |

代理不會自動重送 POST，也不會修改 `log.batchId`。這可讓前端沿用原批號重試，交由既有 GAS 去重。逾時不代表 GAS 一定沒有寫入，因此前端不可在逾時後直接刪除待送資料。

代理使用伺服器端轉送，不需要從瀏覽器直接向 GAS 做跨來源 POST；此檔案沒有另行開放跨網站的 CORS 權限，前端以同網站路徑呼叫。
