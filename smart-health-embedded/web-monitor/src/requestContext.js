const crypto = require("node:crypto");

function createRequestId() {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return typeof value === "string" ? value : "";
}

function getClientIp(req) {
  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
}

function createRequestContext(req) {
  if (req.context) {
    return req.context;
  }

  req.context = {
    requestId: firstHeaderValue(req.headers["x-request-id"]) || createRequestId(),
    actor: null,
    organizationId: "",
    ip: getClientIp(req),
    userAgent: firstHeaderValue(req.headers["user-agent"]),
  };
  return req.context;
}

function attachActor(req, user) {
  const context = createRequestContext(req);
  if (!user) {
    context.actor = null;
    context.organizationId = "";
    return context;
  }

  context.actor = {
    id: user.id || "",
    firebaseUid: user.firebaseUid || "",
    role: user.role || "",
    email: user.email || "",
  };
  context.organizationId = user.organizationId || context.organizationId || "";
  return context;
}

function getRequestContext(req) {
  return req && req.context ? req.context : null;
}

module.exports = {
  attachActor,
  createRequestContext,
  getRequestContext,
};
