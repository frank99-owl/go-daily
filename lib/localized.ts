import type { Locale, LocalizedText } from "@/types";

// English first (lingua franca of Go study on the web) then Chinese (the
// project's primary language), then the two remaining CJK locales.
const FALLBACK_ORDER: Locale[] = ["en", "zh", "ja", "ko"];

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
