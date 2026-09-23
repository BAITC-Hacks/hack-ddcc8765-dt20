import { afterEach, describe, expect, it, vi } from "vitest";
import { guardRequest, readJson } from "../src/lib/server/http";
afterEach(() => vi.unstubAllEnvs());
describe("demo HTTP boundary", () => {
  it("allows production access without credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_ACCESS_PASSWORD", "");
    expect(() =>
      guardRequest(new Request("https://demo.example/api/tasks")),
    ).not.toThrow();
  });
  it("ignores a legacy demo password and cached browser credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_ACCESS_PASSWORD", "a-long-demo-password");
    expect(() =>
      guardRequest(new Request("https://demo.example/api/tasks")),
    ).not.toThrow();
    expect(() =>
      guardRequest(
        new Request("https://demo.example/api/tasks", {
          headers: {
            authorization:
              "Basic " +
              Buffer.from("demo:obsolete-password").toString("base64"),
          },
        }),
      ),
    ).not.toThrow();
  });
  it("rejects cross-origin writes", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_ACCESS_PASSWORD", "");
    expect(() =>
      guardRequest(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { origin: "https://elsewhere.example" },
        }),
      ),
    ).toThrow();
  });
  it("rejects invalid JSON and excessive bodies", async () => {
    await expect(
      readJson(
        new Request("http://localhost", {
          method: "POST",
          body: "bad",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJson(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ text: "x".repeat(70000) }),
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
