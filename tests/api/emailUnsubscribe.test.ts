/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: supabaseMocks.createServiceClient,
}));

import { GET, POST } from "@/app/email/unsubscribe/route";

type ProfileUpdateResult = {
  data?: { user_id: string } | null;
  error?: { message: string } | null;
};

function buildAdminClient(result: ProfileUpdateResult = { data: { user_id: "u-1" }, error: null }) {
  const updateSpy = vi.fn();
  const eqSpy = vi.fn();
  const selectSpy = vi.fn();
  const maybeSingleSpy = vi.fn(async () => result);
  const fromSpy = vi.fn(() => ({
    update: vi.fn((payload: unknown) => {
      updateSpy(payload);
      return {
        eq: vi.fn((column: string, value: unknown) => {
          eqSpy(column, value);
          return {
            select: vi.fn((columns: string) => {
              selectSpy(columns);
              return { maybeSingle: maybeSingleSpy };
            }),
          };
        }),
      };
    }),
  }));

  return { client: { from: fromSpy }, fromSpy, updateSpy, eqSpy, selectSpy, maybeSingleSpy };
}

function request(path: string, init?: RequestInit): Request {
  return new Request(new URL(path, "https://go-daily.app"), init);
}

describe("/email/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET marks the profile opted out and renders the success confirmation page", async () => {
    const admin = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(admin.client);

    const response = await GET(request("/email/unsubscribe?token=tok-123"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("You're unsubscribed");
    expect(admin.fromSpy).toHaveBeenCalledWith("profiles");
    expect(admin.updateSpy).toHaveBeenCalledWith({
      email_opt_out: true,
      updated_at: expect.any(String),
    });
    expect(admin.eqSpy).toHaveBeenCalledWith("email_unsubscribe_token", "tok-123");
    expect(admin.selectSpy).toHaveBeenCalledWith("user_id");
  });

  it("GET treats a missing token as invalid without touching Supabase", async () => {
    const response = await GET(request("/email/unsubscribe"));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("This unsubscribe link is invalid");
    expect(supabaseMocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("GET treats an unmatched token as invalid", async () => {
    const admin = buildAdminClient({ data: null, error: null });
    supabaseMocks.createServiceClient.mockReturnValue(admin.client);

    const response = await GET(request("/email/unsubscribe?token=unknown"));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("This unsubscribe link is invalid");
  });

  it("GET localizes the confirmation page from Accept-Language", async () => {
    const admin = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(admin.client);

    const response = await GET(
      request("/email/unsubscribe?token=tok-123", {
        headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.5" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("已退订邮件提醒");
  });

  it("POST supports one-click List-Unsubscribe without redirecting", async () => {
    const admin = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(admin.client);

    const response = await POST(
      request("/email/unsubscribe?token=tok-123", {
        method: "POST",
        body: "List-Unsubscribe=One-Click",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(admin.eqSpy).toHaveBeenCalledWith("email_unsubscribe_token", "tok-123");
  });

  it("POST returns 500 when the opt-out write fails", async () => {
    const admin = buildAdminClient({ data: null, error: { message: "write failed" } });
    supabaseMocks.createServiceClient.mockReturnValue(admin.client);

    const response = await POST(request("/email/unsubscribe?token=tok-123", { method: "POST" }));

    expect(response.status).toBe(500);
  });
});
