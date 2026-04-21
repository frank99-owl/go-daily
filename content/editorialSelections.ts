import coachEligibleIds from "./data/coachEligibleIds.json";

export const COACH_ALLOWLIST_IDS = coachEligibleIds as string[];
export const CURATED_RUNWAY_START_DATE = "2026-05-02";
export const AUTO_CURATED_START_INDEX = 15;

export const CURATED_RUNWAY_SOURCE_IDS = [
  "lib-0317",
  "lib-0329",
  "lib-0505",
  "lib-0542",
  "lib-0621",
  "lib-0748",
  "lib-0756",
  "lib-0831",
  "lib-0853",
  "lib-0854",
  "lib-0860",
  "lib-0861",
  "lib-0535",
  "lib-0724",
  "lib-0817",
  "lib-0835",
  "lib-0838",
  "lib-0841",
  "lib-0843",
  "lib-0844",
  "lib-0849",
  "lib-0850",
  "lib-0851",
  "lib-0945",
  "lib-0008",
  "lib-0009",
  "lib-0010",
  "lib-0012",
  "lib-0029",
  "lib-0031",
  "lib-0032",
  "lib-0040",
  "lib-0041",
  "lib-0045",
  "lib-0046",
  "lib-0047",
  "lib-0049",
  "lib-0050",
  "lib-0051",
  "lib-0052",
  "lib-0056",
  "lib-0057",
  "lib-0059",
  "lib-0060",
  "lib-0089",
] as const;

export function buildAutoCuratedId(index: number): string {
  return `cld-${String(AUTO_CURATED_START_INDEX + index).padStart(3, "0")}`;
}
