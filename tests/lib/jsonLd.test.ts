import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "@/lib/jsonLd";

describe("serializeJsonLd", () => {
  it("escapes script-breaking characters", () => {
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>&" })).toBe(
      '{"name":"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e\\u0026"}',
    );
  });
});
