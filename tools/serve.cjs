/* Small local static server. Run npm start, then open http://localhost:8080. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(__dirname, "../public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT || 8080);
http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname.endsWith("/index.html")) {
      res.writeHead(308, { Location: pathname.replace(/index\.html$/, "") }); res.end(); return;
    }
    const target = path.resolve(root, "." + pathname, ...(pathname.endsWith("/") ? ["index.html"] : []));
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(400); res.end("Bad request"); }
}).listen(port, "127.0.0.1", () => console.log(`FiMova: http://localhost:${port}`));
