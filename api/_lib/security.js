const { sendJson } = require("./http.js");

const GLOBAL_RATE_LIMIT_STORE = global.__PAM_RATE_LIMIT_STORE__ || new Map();
global.__PAM_RATE_LIMIT_STORE__ = GLOBAL_RATE_LIMIT_STORE;
const GLOBAL_USAGE_BUDGET_STORE = global.__PAM_USAGE_BUDGET_STORE__ || new Map();
global.__PAM_USAGE_BUDGET_STORE__ = GLOBAL_USAGE_BUDGET_STORE;

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

function getClientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0];
  return forwarded || String(req?.headers?.["x-real-ip"] || "").trim() || req?.clientIp || "unknown";
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

  const ipKey = `${routeKey}:ip:${getClientIp(req)}`;
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

function envFlagEnabled(name) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function assertServiceEnabled(res, { serviceName = "This service", envKeys = [] } = {}) {
  const disabledBy = envKeys.find((key) => envFlagEnabled(key));
  if (!disabledBy) return true;

  sendJson(res, 503, {
    ok: false,
    error: `${serviceName} is temporarily paused to protect service costs.`,
    disabledBy
  });
  return false;
}

function getUtcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function pruneUsageBudgetStore() {
  const today = getUtcDayKey();
  for (const [key, entry] of GLOBAL_USAGE_BUDGET_STORE.entries()) {
    if (!entry || entry.day !== today) {
      GLOBAL_USAGE_BUDGET_STORE.delete(key);
    }
  }
}

function getUsageBudgetEntry(key) {
  const day = getUtcDayKey();
  const existing = GLOBAL_USAGE_BUDGET_STORE.get(key);
  if (existing?.day === day) return existing;

  const entry = { day, count: 0 };
  GLOBAL_USAGE_BUDGET_STORE.set(key, entry);
  return entry;
}

function readLimit(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function secondsUntilUtcMidnight() {
  const now = new Date();
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((tomorrow - now.getTime()) / 1000));
}

function checkDailyUsageBudget(req, res, config = {}) {
  const {
    routeKey = "global",
    userKey = "",
    ipDailyLimit = 250,
    userDailyLimit = null,
    envLimitKey = ""
  } = config;
  const ipLimit = readLimit(envLimitKey ? process.env[`${envLimitKey}_IP_DAILY_LIMIT`] : "", ipDailyLimit);
  const userLimit = userDailyLimit
    ? readLimit(envLimitKey ? process.env[`${envLimitKey}_USER_DAILY_LIMIT`] : "", userDailyLimit)
    : null;

  pruneUsageBudgetStore();

  const retryAfterSeconds = secondsUntilUtcMidnight();
  const ipKey = `${routeKey}:daily:ip:${getClientIp(req)}`;
  const ipEntry = getUsageBudgetEntry(ipKey);
  ipEntry.count += 1;

  if (ipEntry.count > ipLimit) {
    sendJson(
      res,
      429,
      {
        ok: false,
        error: "Daily request limit reached. Please try again tomorrow.",
        retryAfterSeconds
      },
      { "Retry-After": String(retryAfterSeconds) }
    );
    return false;
  }

  if (userLimit && userKey) {
    const normalizedUserKey = sanitizeText(userKey).toLowerCase();
    if (normalizedUserKey) {
      const userEntry = getUsageBudgetEntry(`${routeKey}:daily:user:${normalizedUserKey}`);
      userEntry.count += 1;
      if (userEntry.count > userLimit) {
        sendJson(
          res,
          429,
          {
            ok: false,
            error: "Daily limit reached for this account. Please try again tomorrow.",
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
  assertServiceEnabled,
  checkDailyUsageBudget,
  checkRateLimit,
  getOptionalString,
  sanitizeString,
  sanitizeText,
  validatePayload
};
