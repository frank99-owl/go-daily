import { getOrCreateDeviceId } from "@/lib/auth/deviceId";

import { isOnboardingLevel, parseOnboardingLevel, type OnboardingLevel } from "./onboardingLevels";

export const ONBOARDING_LEVEL_STORAGE_KEY = "go-daily.onboarding-level";
export const ONBOARDING_LEVEL_COOKIE = "go-daily.onboarding-level";
export const DAILY_PUZZLE_SEED_COOKIE = "go-daily.daily-seed";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${COOKIE_MAX_AGE_SECONDS};SameSite=Lax`;
}

export function saveOnboardingPreference(level: OnboardingLevel): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ONBOARDING_LEVEL_STORAGE_KEY, level);
  } catch {
    // Preference cookies below still keep the server-rendered /today route useful.
  }

  setCookie(ONBOARDING_LEVEL_COOKIE, level);

  try {
    setCookie(DAILY_PUZZLE_SEED_COOKIE, getOrCreateDeviceId());
  } catch {
    // A missing seed only means anonymous daily puzzles fall back to the shared rotation.
  }
}

export function loadOnboardingPreference(): OnboardingLevel {
  return loadStoredOnboardingPreference() ?? "beginner";
}

export function loadStoredOnboardingPreference(): OnboardingLevel | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(ONBOARDING_LEVEL_STORAGE_KEY) ?? undefined;
    if (isOnboardingLevel(stored)) return stored;
  } catch {
    // Fall through to the cookie/default path.
  }

  if (typeof document !== "undefined") {
    const cookieValue = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ONBOARDING_LEVEL_COOKIE}=`))
      ?.split("=")[1];
    if (cookieValue) return parseOnboardingLevel(decodeURIComponent(cookieValue));
  }

  return null;
}

export async function saveOnboardingPreferenceToAccount(level: OnboardingLevel): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const response = await fetch("/api/profile/training-level", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level }),
    });
    return response.ok;
  } catch (err) {
    console.warn("[onboarding] failed to save training level to account", err);
    return false;
  }
}

export function parseStoredOnboardingPreference(
  value: string | null | undefined,
): OnboardingLevel | null {
  return parseOnboardingLevel(value);
}
