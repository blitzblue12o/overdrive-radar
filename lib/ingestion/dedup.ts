import type { SupabaseClient } from "@supabase/supabase-js";

export type DuplicateHit = {
  candidate_id: string;
  candidate_title: string;
  title_similarity: number;
  same_day: boolean;
  venue_similarity: number;
};

/**
 * Flag-only duplicate detection. Calls find_possible_duplicates and returns
 * the best candidate id. Never changes moderation_status.
 */
export async function findPossibleDuplicateId(
  client: SupabaseClient,
  eventId: string,
  similarityThreshold = 0.4
): Promise<string | null> {
  const { data, error } = await client.rpc("find_possible_duplicates", {
    p_event_id: eventId,
    p_similarity_threshold: similarityThreshold,
  });

  if (error) {
    throw new Error(`find_possible_duplicates failed: ${error.message}`);
  }

  const rows = (data ?? []) as DuplicateHit[];
  return rows[0]?.candidate_id ?? null;
}

export async function flagDuplicateIfNeeded(
  client: SupabaseClient,
  eventId: string
): Promise<string | null> {
  const duplicateOf = await findPossibleDuplicateId(client, eventId);
  if (!duplicateOf) return null;

  const { error } = await client
    .from("events")
    .update({ possible_duplicate_of: duplicateOf })
    .eq("id", eventId)
    // Never alter moderation via dedup path.
    .eq("moderation_status", "pending");

  if (error) {
    throw new Error(`Failed to set possible_duplicate_of: ${error.message}`);
  }

  return duplicateOf;
}
