const { sendJson } = require("./http.js");

const GLOBAL_RATE_LIMIT_STORE = global.__PAM_RATE_LIMIT_STORE__ || new Map();
global.__PAM_RATE_LIMIT_STORE__ = GLOBAL_RATE_LIMIT_STORE;

const MAX_BODY_BYTES = 128 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_PATTERN = /^(?:[A-Z]{2}|OTHER)$/;

function sanitizeString(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function sanitizeText(value) {
  return sanitizeString(value).replace(/\s+/g, " ");
}

function reject(message, path = "request") {
  const error = new Error(message);
  error.statusCode = 400;
  error.path = path;
  throw error;
}

function validateUnknownFields(value, schema, path) {
  const allowed = new Set(Object.keys(schema.properties || {}));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      reject(`Unexpected field "${key}" in ${path}.`, path);
    }
  }
}

function sanitizeUnknownValue(value) {
  if (typeof value === "string") return sanitizeText(value).slice(0, 1200);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeUnknownValue);
  if (value && typeof value === "object") {
    return Object.entries(value)
      .slice(0, 50)
      .reduce((next, [key, rawValue]) => {
        const cleanKey = sanitizeText(key).slice(0, 80);
        if (cleanKey) next[cleanKey] = sanitizeUnknownValue(rawValue);
        return next;
      }, {});
  }
  return null;
}

function validateString(value, schema, path) {
  if (typeof value !== "string") {
    reject(`${path} must be a string.`, path);
  }

  const normalized = schema.trim === false ? value : sanitizeText(value);
  if (schema.minLength && normalized.length < schema.minLength) {
    reject(`${path} must be at least ${schema.minLength} characters.`, path);
  }
  if (schema.maxLength && normalized.length > schema.maxLength) {
    reject(`${path} must be at most ${schema.maxLength} characters.`, path);
  }
  if (schema.format === "email" && normalized && !EMAIL_PATTERN.test(normalized)) {
    reject(`${path} must be a valid email address.`, path);
  }
  if (schema.pattern && normalized && !schema.pattern.test(normalized)) {
    reject(`${path} has an invalid format.`, path);
  }
  if (schema.enum && !schema.enum.includes(normalized)) {
    reject(`${path} must be one of: ${schema.enum.join(", ")}.`, path);
  }

  if (schema.lowercase) return normalized.toLowerCase();
  if (schema.uppercase) return normalized.toUpperCase();
  return normalized;
}

function validateNumber(value, schema, path) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    reject(`${path} must be a valid number.`, path);
  }
  if (schema.integer && !Number.isInteger(value)) {
    reject(`${path} must be a whole number.`, path);
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    reject(`${path} must be at least ${schema.minimum}.`, path);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    reject(`${path} must be at most ${schema.maximum}.`, path);
  }
  return value;
}

function validateArray(value, schema, path) {
  if (!Array.isArray(value)) {
    reject(`${path} must be an array.`, path);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    reject(`${path} must contain at most ${schema.maxItems} items.`, path);
  }
  return value.map((item, index) => validateValue(item, schema.items || {}, `${path}[${index}]`));
}

function validateObject(value, schema, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    reject(`${path} must be an object.`, path);
  }

  if (!schema.allowUnknown) {
    validateUnknownFields(value, schema, path);
  }
  const nextValue = schema.allowUnknown
    ? Object.entries(value).reduce((next, [key, rawValue]) => {
        const cleanKey = sanitizeText(key).slice(0, 80);
        if (cleanKey) next[cleanKey] = sanitizeUnknownValue(rawValue);
        return next;
      }, {})
    : {};
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);

  for (const [key, childSchema] of Object.entries(properties)) {
    const childPath = `${path}.${key}`;
    const present = Object.prototype.hasOwnProperty.call(value, key);
    if (!present) {
      if (required.has(key)) {
        reject(`${childPath} is required.`, childPath);
      }
      continue;
    }

    const childValue = value[key];
    if (childValue === null) {
      if (!childSchema.allowNull) {
        reject(`${childPath} cannot be null.`, childPath);
      }
      nextValue[key] = null;
      continue;
    }

    nextValue[key] = validateValue(childValue, childSchema, childPath);
  }

  return nextValue;
}

function validateValue(value, schema, path) {
  const type = schema.type || "string";

  if (type === "string") return validateString(value, schema, path);
  if (type === "number") return validateNumber(value, schema, path);
  if (type === "integer") return validateNumber(value, { ...schema, integer: true }, path);
  if (type === "boolean") {
    if (typeof value !== "boolean") {
      reject(`${path} must be true or false.`, path);
    }
    return value;
  }
  if (type === "array") return validateArray(value, schema, path);
  if (type === "object") return validateObject(value, schema, path);

  reject(`Unsupported schema type "${type}" for ${path}.`, path);
}

function validatePayload(payload, schema, pathLabel) {
  const baseSchema = {
    type: "object",
    properties: {},
    required: [],
    ...schema
  };
  return validateObject(payload || {}, baseSchema, pathLabel);
}

function getRateLimitEntry(key, windowMs) {
  const now = Date.now();
  const existing = GLOBAL_RATE_LIMIT_STORE.get(key);

  if (!existing || existing.resetAt <= now) {
    const entry = {
      count: 0,
      resetAt: now + windowMs
    };
    GLOBAL_RATE_LIMIT_STORE.set(key, entry);
    return entry;
  }

  return existing;
}

function pruneRateLimitStore() {
  const now = Date.now();
  for (const [key, entry] of GLOBAL_RATE_LIMIT_STORE.entries()) {
    if (!entry || entry.resetAt <= now) {
      GLOBAL_RATE_LIMIT_STORE.delete(key);
    }
  }
}

function checkRateLimit(req, res, config = {}) {
  const {
    routeKey = "global",
    userKey = "",
    ipLimit = { windowMs: 60 * 1000, max: 60 },
    userLimit = null
  } = config;

  pruneRateLimitStore();

  const ipKey = `${routeKey}:ip:${req.clientIp || "unknown"}`;
  const ipEntry = getRateLimitEntry(ipKey, ipLimit.windowMs);
  ipEntry.count += 1;

  let retryAfterMs = ipEntry.resetAt - Date.now();
  if (ipEntry.count > ipLimit.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    sendJson(
      res,
      429,
      {
        ok: false,
        error: "Too many requests. Please wait and try again.",
        retryAfterSeconds
      },
      { "Retry-After": String(retryAfterSeconds) }
    );
    return false;
  }

  if (userLimit && userKey) {
    const normalizedUserKey = sanitizeText(userKey).toLowerCase();
    if (normalizedUserKey) {
      const scopedKey = `${routeKey}:user:${normalizedUserKey}`;
      const userEntry = getRateLimitEntry(scopedKey, userLimit.windowMs);
      userEntry.count += 1;
      retryAfterMs = userEntry.resetAt - Date.now();

      if (userEntry.count > userLimit.max) {
        const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        sendJson(
          res,
          429,
          {
            ok: false,
            error: "Too many requests for this account. Please wait and try again.",
            retryAfterSeconds
          },
          { "Retry-After": String(retryAfterSeconds) }
        );
        return false;
      }
    }
  }

  return true;
}

function getOptionalString(value, maxLength = 160) {
  if (value === undefined || value === null || value === "") return "";
  return validateString(value, { type: "string", maxLength }, "value");
}

module.exports = {
  MAX_BODY_BYTES,
  STATE_PATTERN,
  checkRateLimit,
  getOptionalString,
  sanitizeString,
  sanitizeText,
  validatePayload
};
