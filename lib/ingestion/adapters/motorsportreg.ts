import type { RawSourceEvent, SourceAdapter, SourceRecord } from "@/lib/ingestion/types";

/**
 * Scaffold only — real MotorsportReg API access pending approval.
 * Do not call any MotorsportReg endpoints from this adapter.
 */
export class MotorsportRegAdapter implements SourceAdapter {
  readonly type = "motorsportreg" as const;

  async fetchEvents(source: SourceRecord): Promise<RawSourceEvent[]> {
    void source;
    throw new Error(
      "MotorsportReg adapter is not yet configured (pending API approval)"
    );
  }
}
