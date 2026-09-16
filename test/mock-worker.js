// 极简本地mock服务器，模拟 cloudflare-worker/worker.js 的行为，仅用于本地测试同步逻辑
// Minimal local mock server standing in for cloudflare-worker/worker.js, test-only.
const http = require("http");

const APP_TOKEN = "test-secret-token";
const received = [];

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const token = req.headers["x-app-token"];
    if (token !== APP_TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }
    let payload;
    try { payload = JSON.parse(body); } catch (e) {
      res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "bad json" })); return;
    }
    received.push(payload);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, reportNo: payload.reportNo }));
  });
});

server.listen(8766, () => {
  console.log("mock-worker listening on 8766");
});

process.on("message", (msg) => {
  if (msg === "dump") process.send({ received });
});

module.exports = { server, received, APP_TOKEN };
