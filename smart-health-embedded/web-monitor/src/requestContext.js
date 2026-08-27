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

function getTrustedProxyHops(env = process.env) {
  const configured = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isFinite(configured)) return 0;
  return Math.min(10, Math.max(0, Math.trunc(configured)));
}

function getClientIp(req, env = process.env) {
  const socketAddress = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
  const trustedProxyHops = getTrustedProxyHops(env);
  if (trustedProxyHops === 0) return socketAddress;

  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  const forwardedChain = forwardedFor
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(-32);
  if (forwardedChain.length < trustedProxyHops) return socketAddress;
  return forwardedChain[forwardedChain.length - trustedProxyHops] || socketAddress;
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
  getClientIp,
  getRequestContext,
  getTrustedProxyHops,
};
