import { describe, expect, test } from "bun:test";
import { LOCAL_API_URL, PRODUCTION_API_URL, pickApiUrl } from "./config";

describe("pickApiUrl", () => {
  test("localhost uses the local backend", () => {
    expect(pickApiUrl(undefined, "localhost")).toBe(LOCAL_API_URL);
    expect(pickApiUrl(undefined, "127.0.0.1")).toBe(LOCAL_API_URL);
  });
  test("any other host uses Render", () => {
    expect(pickApiUrl(undefined, "vigil-agent-flow.lovable.app")).toBe(PRODUCTION_API_URL);
  });
  test("VITE_API_URL overrides both and loses trailing slashes", () => {
    expect(pickApiUrl("https://x.test/", "localhost")).toBe("https://x.test");
    expect(pickApiUrl("https://x.test", "vigil-agent-flow.lovable.app")).toBe("https://x.test");
  });
});
