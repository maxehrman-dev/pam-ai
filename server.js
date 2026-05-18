const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { MAX_BODY_BYTES, checkRateLimit } = require("./api/_lib/security.js");
const { applySecurityHeaders, sendJson } = require("./api/_lib/http.js");

const APP_DIR = __dirname;
const INDEX_FILE = path.join(APP_DIR, "index.html");
const PORT = Number(process.env.PORT) || 3000;

loadLocalEnv();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function loadLocalEnv() {
  const envFiles = [".env.local", ".env"];

  for (const name of envFiles) {
    const filePath = path.join(APP_DIR, name);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  applySecurityHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    const extension = path.extname(filePath).toLowerCase();
    applySecurityHeaders(res, {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' https://cdn.plaid.com; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-src https://cdn.plaid.com https://*.plaid.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin"
    });
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
    let totalBytes = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (settled) return;
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        settled = true;
        reject(error);
      }
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
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
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.statusCode === 413 ? "Request body is too large." : "Invalid JSON body" });
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

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0];
  return forwarded || req.socket?.remoteAddress || "127.0.0.1";
}

const server = http.createServer((req, res) => {
  try {
    applySecurityHeaders(res);
    req.clientIp = getClientIp(req);
    const requestUrl = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && pathname === "/api/health") {
      if (
        !checkRateLimit(req, res, {
          routeKey: "health",
          ipLimit: { windowMs: 60 * 1000, max: 30 }
        })
      ) {
        return;
      }
      return sendJson(res, 200, {
        ok: true,
        app: "PAM AI",
        message: "Local server is healthy"
      });
    }

    // Future Plaid flow:
    // 1. Backend creates a link_token
    // 2. Frontend opens Plaid Link
    // 3. Plaid returns a public_token
    // 4. Backend exchanges public_token for an access_token
    // 5. Access token stays server-side only
    // 6. Backend fetches Transactions, Balances, and Liabilities
    // 7. PAM normalizes Plaid data into the shared baseline object
    //
    // Never expose PLAID_SECRET in frontend code.
    // Never store Plaid access tokens in localStorage.
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
    return sendJson(res, 500, {
      ok: false,
      error: "Server error"
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PAM AI running on http://127.0.0.1:${PORT}`);
});
