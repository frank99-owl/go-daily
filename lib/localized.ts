import type { Locale, LocalizedText } from "@/types";

// Fallback order when a LocalizedText is missing the requested locale.
// English first (lingua franca of Go study on the web) then Chinese (the
// project's primary language), then the two remaining CJK locales.
const FALLBACK_ORDER: Locale[] = ["en", "zh", "ja", "ko"];

/**
 * Safe accessor for a LocalizedText bundle.
 *
 * Returns `text[locale]` if populated; otherwise walks FALLBACK_ORDER so the
 * UI never renders `undefined` or an empty string when *any* locale is filled
 * in. The build-time validator (`scripts/validatePuzzles.ts`) enforces full
 * 4-language coverage for curated puzzles, so fallback only kicks in if:
 *   - A library import (`isCurated: false`) intentionally ships with stub
 *     text in some locale, or
 *   - Someone is iterating on a draft puzzle with the validator temporarily
 *     bypassed.
 *
 * Returns "" only when every locale is empty, which is always a bug.
 */
export function localized(text: LocalizedText, locale: Locale): string {
  const v = text[locale];
  if (v) return v;
  for (const fb of FALLBACK_ORDER) {
    if (fb === locale) continue;
    const alt = text[fb];
    if (alt) return alt;
  }
  return "";
}
