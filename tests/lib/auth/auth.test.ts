import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  isLikelyEmail,
  signInWithGoogle,
  signInWithEmail,
  deleteAccount,
  useCurrentUser,
} from "../../../lib/auth/auth";

// Mock Supabase client
const mockSignInWithOAuth = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock("../../../lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
      signInWithOtp: mockSignInWithOtp,
      signOut: mockSignOut,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

// Mock fetch for deleteAccount
global.fetch = vi.fn();

describe("Auth Methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup window.location for buildCallbackUrl
    Object.defineProperty(window, "location", {
      value: { origin: "http://localhost:3000", protocol: "http:" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isLikelyEmail", () => {
    it("validates basic email shapes", () => {
      expect(isLikelyEmail("test@example.com")).toBe(true);
      expect(isLikelyEmail("invalid")).toBe(false);
    });
  });

  describe("signInWithGoogle", () => {
    it("handles success", async () => {
      mockSignInWithOAuth.mockResolvedValue({ error: null });
      const res = await signInWithGoogle("en");
      expect(res).toEqual({ ok: true });
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
        }),
      );
    });

    it("handles oauth error", async () => {
      mockSignInWithOAuth.mockResolvedValue({ error: { message: "OAuth Failed" } });
      const res = await signInWithGoogle("en");
      expect(res).toEqual({ ok: false, error: "OAuth Failed" });
    });

    it("handles exception", async () => {
      mockSignInWithOAuth.mockRejectedValue(new Error("Network Error"));
      const res = await signInWithGoogle("en");
      expect(res).toEqual({ ok: false, error: "Network Error" });
    });
  });

  describe("signInWithEmail", () => {
    it("rejects invalid emails", async () => {
      const res = await signInWithEmail("invalid", "en");
      expect(res).toEqual({ ok: false, error: "invalid_email" });
      expect(mockSignInWithOtp).not.toHaveBeenCalled();
    });

    it("handles success", async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });
      const res = await signInWithEmail("test@example.com", "en");
      expect(res).toEqual({ ok: true });
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
        }),
      );
    });

    it("handles error", async () => {
      mockSignInWithOtp.mockResolvedValue({ error: { message: "OTP Failed" } });
      const res = await signInWithEmail("test@example.com", "en");
      expect(res).toEqual({ ok: false, error: "OTP Failed" });
    });
  });

  describe("deleteAccount", () => {
    it("handles success", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);
      const res = await deleteAccount();
      expect(res).toEqual({ ok: true });
      expect(mockSignOut).toHaveBeenCalled();
    });

    it("handles api error", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Bad Request" }),
      } as Response);
      const res = await deleteAccount();
      expect(res).toEqual({ ok: false, error: "Bad Request" });
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe("useCurrentUser", () => {
    it("handles successful session load", async () => {
      const mockSession = { user: { id: "user1" } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

      const { result } = renderHook(() => useCurrentUser());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual(mockSession.user);
      expect(result.current.error).toBeNull();
    });

    it("handles session load error", async () => {
      const mockError = new Error("Session load failed");
      mockGetSession.mockResolvedValue({ data: { session: null }, error: mockError });
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

      const { result } = renderHook(() => useCurrentUser());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.error).toEqual(mockError);
    });

    it("handles catch block network errors", async () => {
      const mockError = new Error("Network down");
      mockGetSession.mockRejectedValue(mockError);
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

      const { result } = renderHook(() => useCurrentUser());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.error).toEqual(mockError);
    });
  });
});
