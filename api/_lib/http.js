const DEFAULT_SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
};

function applySecurityHeaders(res, extraHeaders = {}) {
  const headers = {
    ...DEFAULT_SECURITY_HEADERS,
    ...extraHeaders
  };

  for (const [key, value] of Object.entries(headers)) {
    if (!res.hasHeader(key)) {
      res.setHeader(key, value);
    }
  }
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  applySecurityHeaders(res, extraHeaders);
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function sendMethodNotAllowed(res) {
  return sendJson(res, 405, {
    ok: false,
    error: "Method not allowed"
  });
}

module.exports = {
  applySecurityHeaders,
  sendJson,
  sendMethodNotAllowed
};
