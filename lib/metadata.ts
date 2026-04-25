import en from "@/content/messages/en.json";
import ja from "@/content/messages/ja.json";
import ko from "@/content/messages/ko.json";
import zh from "@/content/messages/zh.json";
import type { Locale } from "@/types";

export const DICTS = { zh, en, ja, ko } as const;

export function getMessages(locale: Locale) {
  return DICTS[locale] ?? DICTS.en;
}
