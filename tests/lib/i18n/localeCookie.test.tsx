/**
 * Cookies the client writes are Secure on HTTPS and plain on http, so
 * production never sends them unprotected and local development over http
 * still keeps them. The check uses the browser's own rule: a Secure cookie set
 * on an https page is not visible from an http page on the same host.
 */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { LocaleProvider, useLocale } from "@/lib/i18n/i18n";
import { saveOnboardingPreference } from "@/lib/puzzle/onboardingPreference";

const dom = (globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } })
  .jsdom;
let originalUrl: string;

function visit(url: string) {
  dom.reconfigure({ url });
}

function clearCookies(...names: string[]) {
  visit("https://go-daily.app/");
  for (const name of names) document.cookie = `${name}=; path=/; max-age=0`;
}

beforeAll(() => {
  originalUrl = window.location.href;
});

afterEach(() => {
  clearCookies("go-daily.locale", "go-daily.onboarding-level", "go-daily.daily-seed");
  visit(originalUrl);
});

function switchLocale(to: "ja" | "ko") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LocaleProvider initialLocale="en">{children}</LocaleProvider>
  );
  const { result } = renderHook(() => useLocale(), { wrapper });
  act(() => result.current.setLocale(to));
}

describe("locale cookie", () => {
  it("is Secure when set over HTTPS", () => {
    visit("https://go-daily.app/en");
    switchLocale("ja");
    expect(document.cookie).toContain("go-daily.locale=ja");

    visit("http://go-daily.app/en");
    expect(document.cookie).not.toContain("go-daily.locale");
  });

  it("is a plain cookie over http, so local development keeps it", () => {
    visit("http://go-daily.app/en");
    switchLocale("ko");

    expect(document.cookie).toContain("go-daily.locale=ko");
  });
});

describe("onboarding preference cookies", () => {
  it("are Secure when set over HTTPS", () => {
    visit("https://go-daily.app/en");
    saveOnboardingPreference("advanced");
    expect(document.cookie).toContain("go-daily.onboarding-level=advanced");
    expect(document.cookie).toContain("go-daily.daily-seed=");

    visit("http://go-daily.app/en");
    expect(document.cookie).not.toContain("go-daily.onboarding-level");
    expect(document.cookie).not.toContain("go-daily.daily-seed");
  });

  it("are plain cookies over http", () => {
    visit("http://go-daily.app/en");
    saveOnboardingPreference("beginner");

    expect(document.cookie).toContain("go-daily.onboarding-level=beginner");
  });
});
