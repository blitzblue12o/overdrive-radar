/**
 * Deterministic Overdrive automotive relevance for mixed venue calendars.
 * Pure string rules — no LLM.
 */

const AUTO_POSITIVE =
  /\b(car\s*show|custom\s*car|classic\s*car|hot\s*rod|street\s*rod|car\s*meet|cars?\s*&\s*coffee|cars?\s+and\s+coffee|cruise\s*night|car\s*cruise|auto\s*show|automotive|motorsport|motor\s*sport|vehicle\s*exhibition|truck\s*show|motorcycle\s*show|lowrider|kustom|muscle\s*car|exotics?|tuner\s*car|drag\s*race|autocross|track\s*day|hpde|concours|car\s*club)\b/i;

/** Strong token matches even when spaced oddly (CARS, CARS, CARS). */
const AUTO_TOKEN =
  /\b(cars?|trucks?|hot\s*rods?|motorcycles?|vehicles?|automotive)\b/i;

const NON_AUTO_DOMINANT =
  /\b(tattoo\s*show|oktoberfest|harvest\s*festival|lego|brick\s*convention|concert|tour|oddities\s*expo|swap\s*meet|flea\s*market|farmers?\s*market|wine\s*fest|food\s*fest)\b/i;

export type OverdriveRelevanceResult = {
  relevant: boolean;
  reason: "automotive_keyword" | "non_automotive" | "insufficient_signal";
};

/**
 * Mixed venue calendars must opt into Overdrive via automotive signal.
 * Non-auto dominant titles (swap meet, festivals, concerts) are excluded
 * even if a weak vehicle word appears in boilerplate.
 */
export function evaluateOverdriveAutomotiveRelevance(
  title: string,
  description?: string | null
): OverdriveRelevanceResult {
  const titleText = title ?? "";
  const descText = description ?? "";
  const blob = `${titleText}\n${descText}`;

  if (NON_AUTO_DOMINANT.test(titleText) && !AUTO_POSITIVE.test(titleText)) {
    return { relevant: false, reason: "non_automotive" };
  }

  if (AUTO_POSITIVE.test(blob)) {
    return { relevant: true, reason: "automotive_keyword" };
  }

  // Title-level car/vehicle token is enough for shows named "… Car Show".
  if (AUTO_TOKEN.test(titleText) && !NON_AUTO_DOMINANT.test(titleText)) {
    return { relevant: true, reason: "automotive_keyword" };
  }

  // Description may say "CARS, CARS, CARS" without a formal category phrase.
  if (
    AUTO_TOKEN.test(descText) &&
    !NON_AUTO_DOMINANT.test(titleText) &&
    /\bcars?\b/i.test(descText)
  ) {
    return { relevant: true, reason: "automotive_keyword" };
  }

  return { relevant: false, reason: "insufficient_signal" };
}

export function isAutomotiveOverdriveCandidate(
  title: string,
  description?: string | null
): boolean {
  return evaluateOverdriveAutomotiveRelevance(title, description).relevant;
}

/** Map automotive titles to Overdrive category tokens for normalizeRawEvent. */
export function inferOverdriveCategoryTokens(
  title: string,
  description?: string | null
): string[] {
  const blob = `${title}\n${description ?? ""}`.toLowerCase();
  if (/cruise|cruise\s*night|drive/.test(blob)) return ["cruise"];
  if (/cars?\s*&\s*coffee|cars?\s+and\s+coffee|car\s*meet|meet\b/.test(blob)) {
    return ["cars and coffee"];
  }
  if (/track|hpde|motorsport|race|autocross|solo/.test(blob)) {
    return ["track"];
  }
  if (/show|exhibition|concours|nationals|custom\s*car/.test(blob)) {
    return ["car show"];
  }
  return ["car show"];
}
