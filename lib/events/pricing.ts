export type PriceBadge =
  | { kind: "free"; label: string }
  | { kind: "paid"; label: string }
  | { kind: "paid_unknown"; label: string }
  | null;

export interface PricedEvent {
  is_free: boolean | null | undefined;
  price_amount?: number | null;
  price_currency?: string | null;
}

export function getPriceBadge(
  event: PricedEvent,
  variant: "short" | "detail" = "short"
): PriceBadge {
  if (event.is_free === null || event.is_free === undefined) {
    return null;
  }

  if (event.is_free === true) {
    return {
      kind: "free",
      label: variant === "detail" ? "Free entry" : "Free",
    };
  }

  if (event.price_amount !== null && event.price_amount !== undefined) {
    const currency = event.price_currency || "USD";
    try {
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(event.price_amount));
      return { kind: "paid", label: formatted };
    } catch {
      return {
        kind: "paid",
        label: `$${Number(event.price_amount).toFixed(2)}`,
      };
    }
  }

  return { kind: "paid_unknown", label: "Paid" };
}
