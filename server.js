const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const APP_DIR = __dirname;
const INDEX_FILE = path.join(APP_DIR, "index.html");
const PORT = Number(process.env.PORT) || 3040;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": stat.size
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (_error) {
    sendText(res, 404, "Not found");
  }
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function invokeApiHandler(req, res, pathname, requestUrl) {
  const apiFile = path.join(APP_DIR, `${pathname}.js`);
  if (!apiFile.startsWith(APP_DIR) || !fs.existsSync(apiFile)) {
    sendJson(res, 404, { error: "Not found" });
    return true;
  }

  try {
    req.body = await parseRequestBody(req);
  } catch (_error) {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return true;
  }

  req.query = Object.fromEntries(requestUrl.searchParams.entries());
  delete require.cache[require.resolve(apiFile)];
  const handler = require(apiFile);
  await handler(req, res);
  return true;
}

function safeStaticPath(requestPath) {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]);
  const normalized = path.normalize(cleanPath).replace(/^([.][.][/\\])+/, "");
  const resolved = path.join(APP_DIR, normalized);
  if (!resolved.startsWith(APP_DIR)) return null;
  if (!fs.existsSync(resolved)) return null;
  if (!fs.statSync(resolved).isFile()) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        app: "PAM AI",
        message: "Local server is healthy"
      });
    }

    if (pathname.startsWith("/api/")) {
      return invokeApiHandler(req, res, pathname, requestUrl);
    }

    if (req.method === "GET") {
      const staticFile = pathname === "/" ? null : safeStaticPath(pathname);
      if (staticFile) return sendFile(res, staticFile);
      return sendFile(res, INDEX_FILE);
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, { error: "Server error", detail: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PAM AI running on http://127.0.0.1:${PORT}`);
});
