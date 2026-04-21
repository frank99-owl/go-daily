import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { getSiteUrl } from "@/lib/siteUrl";

describe("siteUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default url when NEXT_PUBLIC_SITE_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe("https://go-daily.vercel.app");
  });

  it("returns configured url and strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://custom.example.com/";
    expect(getSiteUrl()).toBe("https://custom.example.com");
    
    process.env.NEXT_PUBLIC_SITE_URL = "https://custom.example.com///";
    expect(getSiteUrl()).toBe("https://custom.example.com");
  });

  it("trims whitespace from the environment variable", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "  https://space.example.com/  ";
    expect(getSiteUrl()).toBe("https://space.example.com");
  });
});
