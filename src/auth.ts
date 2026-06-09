import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("MCP-Auth");

const jsonrpcUnauthorized = {
  jsonrpc: "2.0" as const,
  error: { code: -32001, message: "Unauthorized" },
  id: null,
};

// Constant-time comparison so a wrong token can't be recovered via timing.
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch; compare against a fixed-length
  // digest-free buffer guard first to keep it constant-time on the equal path.
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

// Accepts either a bare token or an "Authorization: Bearer <token>" header.
function extractToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) {
    return undefined;
  }
  const trimmed = authHeader.trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(trimmed);
  return bearer?.[1] ? bearer[1].trim() : trimmed;
}

/**
 * Guards the inbound HTTP transport with a shared secret.
 *
 * The secret is read from the MCP_AUTH_TOKEN environment variable. When it is
 * set, every guarded request must present it as `Authorization: Bearer <token>`
 * (a bare token value is also accepted). When it is NOT set, the server runs
 * unauthenticated and logs a loud warning — appropriate only for trusted local
 * (stdio) use, never for a public deployment.
 */
export function createAuthMiddleware(): MiddlewareHandler {
  const expected = process.env.MCP_AUTH_TOKEN?.trim();

  if (!expected) {
    logger.warn(
      "MCP_AUTH_TOKEN is not set — the HTTP transport is UNAUTHENTICATED. " +
        "Anyone able to reach it can drive this server and control your Dokploy " +
        "instance. Set MCP_AUTH_TOKEN to require a bearer token on every request.",
    );
  } else {
    logger.info("Inbound authentication enabled (MCP_AUTH_TOKEN)");
  }

  return async (c, next) => {
    if (!expected) {
      return next();
    }

    const provided = extractToken(c.req.header("authorization"));
    if (!provided || !safeEqual(provided, expected)) {
      logger.warn("Rejected unauthorized request", {
        path: c.req.path,
        method: c.req.method,
      });
      return c.json(jsonrpcUnauthorized, 401);
    }

    return next();
  };
}
