/**
 * Cron / manual sync authorization for ingestion routes.
 * Never logs the secret value.
 */

export type CronAuthResult = {
  ok: boolean;
  /** How the request presented credentials (never includes the secret). */
  authMethod: "authorization_bearer" | "x_cron_secret" | "missing" | "mismatch" | "secret_unset";
  /**
   * Best-effort invocation class.
   * Vercel Cron sends Authorization: Bearer <CRON_SECRET> and typically
   * includes `x-vercel-cron: 1`. Manual curls usually lack that header.
   */
  invocation: "scheduled" | "manual" | "unknown";
};

function trimSecret(secret: string): string {
  // Guard against accidental trailing newlines from dashboard paste.
  return secret.trim();
}

/**
 * Classify whether a request is authorized to run ingestion cron jobs.
 * Accepts:
 * - Authorization: Bearer <CRON_SECRET>  (Vercel Cron default)
 * - x-cron-secret: <CRON_SECRET>         (manual / ops convenience)
 */
export function authorizeCronRequest(request: Request): CronAuthResult {
  const rawSecret = process.env.CRON_SECRET;
  if (!rawSecret || !trimSecret(rawSecret)) {
    return {
      ok: false,
      authMethod: "secret_unset",
      invocation: classifyInvocation(request, false),
    };
  }

  const secret = trimSecret(rawSecret);
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");

  let authMethod: CronAuthResult["authMethod"] = "missing";
  let ok = false;

  if (authHeader != null) {
    const expected = `Bearer ${secret}`;
    if (authHeader === expected || authHeader === `Bearer ${rawSecret}`) {
      ok = true;
      authMethod = "authorization_bearer";
    } else if (authHeader.startsWith("Bearer ")) {
      authMethod = "mismatch";
    } else {
      authMethod = "mismatch";
    }
  } else if (cronHeader != null) {
    if (cronHeader === secret || cronHeader === rawSecret) {
      ok = true;
      authMethod = "x_cron_secret";
    } else {
      authMethod = "mismatch";
    }
  }

  return {
    ok,
    authMethod,
    invocation: classifyInvocation(request, ok && authMethod === "authorization_bearer"),
  };
}

function classifyInvocation(
  request: Request,
  bearerMatched: boolean
): CronAuthResult["invocation"] {
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron === "1" || vercelCron === "true") {
    return "scheduled";
  }
  // User-Agent used by Vercel Cron historically; treat as scheduled when
  // combined with a successful Bearer auth and no explicit manual marker.
  const ua = request.headers.get("user-agent") ?? "";
  if (bearerMatched && /vercel-cron/i.test(ua)) {
    return "scheduled";
  }
  if (request.headers.get("x-cron-manual") === "1") {
    return "manual";
  }
  // Authenticated without Vercel cron markers → treat as manual.
  if (bearerMatched || request.headers.get("x-cron-secret")) {
    return "manual";
  }
  return "unknown";
}

export type CronAuthLogFields = {
  route: string;
  ok: boolean;
  authMethod: CronAuthResult["authMethod"];
  invocation: CronAuthResult["invocation"];
  hasAuthorizationHeader: boolean;
  hasVercelCronHeader: boolean;
};

/** Safe observability payload — never includes secret material. */
export function cronAuthLogFields(
  request: Request,
  auth: CronAuthResult,
  route: string
): CronAuthLogFields {
  return {
    route,
    ok: auth.ok,
    authMethod: auth.authMethod,
    invocation: auth.invocation,
    hasAuthorizationHeader: Boolean(request.headers.get("authorization")),
    hasVercelCronHeader: Boolean(request.headers.get("x-vercel-cron")),
  };
}
