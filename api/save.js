'use strict';

/**
 * Vercel Node.js Function：POST /api/save
 * 在 Vercel 環境變數設定 GAS_URL，不把接收網址寫死在這個函式內。
 * 成功回傳 GAS 的 OK；GAS 錯誤文字也原樣回傳，讓前端決定是否保留暫存。
 */
module.exports = async function save(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('只接受 POST 請求。');
  }

  const configuredUrl = (process.env.GAS_URL || '').trim();
  if (!configuredUrl) {
    return res.status(500).send('尚未設定 GAS_URL 環境變數。');
  }

  let gasUrl;
  try {
    gasUrl = new URL(configuredUrl);
    if (gasUrl.protocol !== 'https:' || gasUrl.hostname !== 'script.google.com'
      || gasUrl.username || gasUrl.password
      || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gasUrl.pathname)) {
      throw new Error('Invalid GAS URL');
    }
  } catch {
    return res.status(500).send('GAS_URL 必須是有效的 Apps Script /exec HTTPS 網址。');
  }

  let data;
  let body;
  try {
    // Vercel 依 Content-Type 提供物件、字串或 Buffer；統一成 JSON 再轉送。
    data = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8'))
      : typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid JSON object');
    }
    body = JSON.stringify(data);
  } catch {
    return res.status(400).send('請以 POST 傳入有效的 JSON 物件。');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const upstream = await fetch(gasUrl.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
      redirect: 'follow',
      signal: controller.signal
    });
    const result = await upstream.text();
    // GAS 的應用程式錯誤可能仍是 HTTP 200，因此保留文字，不自行改成成功訊息。
    return res.status(upstream.status).send(result);
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') {
      return res.status(504).send('GAS 回應逾時；尚未確認儲存，請保留原批號後重試。');
    }
    return res.status(502).send('無法連線至 GAS：' + error.message);
  } finally {
    clearTimeout(timeout);
  }
};
