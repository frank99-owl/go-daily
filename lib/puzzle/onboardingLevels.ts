export const ONBOARDING_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type OnboardingLevel = (typeof ONBOARDING_LEVELS)[number];

export type PuzzleDifficulty = 1 | 2 | 3 | 4 | 5;

export const ONBOARDING_LEVEL_DIFFICULTIES: Record<OnboardingLevel, PuzzleDifficulty[]> = {
  beginner: [1],
  intermediate: [2, 3],
  advanced: [4, 5],
};

const LEGACY_ONBOARDING_LEVELS: Record<string, OnboardingLevel> = {
  kyu: "intermediate",
  dan: "advanced",
};

export function isOnboardingLevel(value: string | undefined): value is OnboardingLevel {
  return !!value && ONBOARDING_LEVELS.includes(value as OnboardingLevel);
}

export function parseOnboardingLevel(value: string | null | undefined): OnboardingLevel | null {
  if (!value) return null;
  if (LEGACY_ONBOARDING_LEVELS[value]) return LEGACY_ONBOARDING_LEVELS[value];
  return isOnboardingLevel(value) ? value : null;
}

export function normalizeOnboardingLevel(value: string | undefined): OnboardingLevel {
  return parseOnboardingLevel(value) ?? "beginner";
}

export function getDifficultiesForOnboardingLevel(level: OnboardingLevel): PuzzleDifficulty[] {
  return ONBOARDING_LEVEL_DIFFICULTIES[level];
}
