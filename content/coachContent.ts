import type { CoachVariationGroup, ContentReviewBatch } from "@/types";

import coachBasicEligibleIds from "./data/coachBasicEligibleIds.json";
import coachReadyIds from "./data/coachReadyIds.json";
import contentReviewBatches from "./data/contentReviewBatches.json";
import variationGroups from "./data/variationGroups.json";

export const COACH_BASIC_ELIGIBLE_IDS = coachBasicEligibleIds as string[];
export const COACH_READY_IDS = coachReadyIds as string[];
export const COACH_VARIATION_GROUPS = variationGroups as CoachVariationGroup[];
export const CONTENT_REVIEW_BATCHES = contentReviewBatches as ContentReviewBatch[];

export const COACH_BASIC_ELIGIBLE_ID_SET = new Set<string>(COACH_BASIC_ELIGIBLE_IDS);
export const COACH_READY_ID_SET = new Set<string>(COACH_READY_IDS);
export const COACH_VARIATION_READY_ID_SET = new Set<string>(
  COACH_VARIATION_GROUPS.flatMap((group) => group.puzzleIds),
);
