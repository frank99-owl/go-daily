import { describe, expect, it } from "vitest";

import { isAuthSessionMissingError } from "./authErrors";

describe("auth error helpers", () => {
  it("treats missing auth sessions as an expected anonymous state", () => {
    expect(isAuthSessionMissingError({ name: "AuthSessionMissingError" })).toBe(true);
    expect(isAuthSessionMissingError({ message: "Auth session missing!" })).toBe(true);
  });

  it("does not hide unrelated auth errors", () => {
    expect(isAuthSessionMissingError({ message: "JWT expired" })).toBe(false);
  });
});
