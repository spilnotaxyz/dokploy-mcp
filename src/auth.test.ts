import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthMiddleware } from "./auth.js";

function appWithGuard() {
  const app = new Hono();
  app.use("/mcp", createAuthMiddleware());
  app.post("/mcp", (c) => c.json({ ok: true }));
  return app;
}

describe("createAuthMiddleware", () => {
  const original = process.env.MCP_AUTH_TOKEN;

  beforeEach(() => {
    delete process.env.MCP_AUTH_TOKEN;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MCP_AUTH_TOKEN;
    } else {
      process.env.MCP_AUTH_TOKEN = original;
    }
  });

  it("allows all requests when MCP_AUTH_TOKEN is unset", async () => {
    const res = await appWithGuard().request("/mcp", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("rejects requests with no token when a secret is set", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";
    const res = await appWithGuard().request("/mcp", { method: "POST" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: -32001 } });
  });

  it("rejects requests with the wrong token", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";
    const res = await appWithGuard().request("/mcp", {
      method: "POST",
      headers: { authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts the correct token as a Bearer header", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";
    const res = await appWithGuard().request("/mcp", {
      method: "POST",
      headers: { authorization: "Bearer s3cret" },
    });
    expect(res.status).toBe(200);
  });

  it("accepts the correct token as a bare header value", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";
    const res = await appWithGuard().request("/mcp", {
      method: "POST",
      headers: { authorization: "s3cret" },
    });
    expect(res.status).toBe(200);
  });
});
