/**
 * Structured trace logging for Delete-After-Viewing (DAV) backend lifecycle.
 * Prefix every line with [DAV-TRACE] so a single message can be followed end-to-end.
 */

export type DavTraceStep =
  | "STEP1_INSERT"
  | "STEP2_VIEWED"
  | "STEP3_EXIT"
  | "STEP4_HANDLER"
  | "STEP5_SQL"
  | "STEP6_AFFECTED"
  | "STEP7_VERIFY";

export function davTrace(
  step: DavTraceStep,
  messageId: string | null,
  detail: Record<string, unknown>,
): void {
  console.log(
    `[DAV-TRACE] ${step}`,
    JSON.stringify({
      messageId,
      ts: new Date().toISOString(),
      ...detail,
    }),
  );
}

export async function davVerifyMessageRow(
  admin: { from: (table: string) => any },
  messageId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("messages")
    .select("id, conversation_id, sender_id, disappear_after_view, viewed_at, first_read_at, read_at")
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    davTrace("STEP7_VERIFY", messageId, { table: "messages", error: error.message, exists: false });
    return null;
  }

  davTrace("STEP7_VERIFY", messageId, {
    table: "messages",
    exists: !!data,
    row: data ?? null,
  });
  return data;
}

export async function davVerifyUserViewRow(
  admin: { from: (table: string) => any },
  messageId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await (admin as any)
    .from("message_user_views")
    .select("message_id, user_id, viewed_at")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    davTrace("STEP7_VERIFY", messageId, {
      table: "message_user_views",
      userId,
      error: error.message,
      exists: false,
    });
    return null;
  }

  davTrace("STEP7_VERIFY", messageId, {
    table: "message_user_views",
    userId,
    exists: !!data,
    row: data ?? null,
  });
  return data;
}

export async function davVerifyDeletionRow(
  admin: { from: (table: string) => any },
  messageId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("message_deletions")
    .select("message_id, user_id, deleted_for_all")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    davTrace("STEP7_VERIFY", messageId, {
      table: "message_deletions",
      userId,
      error: error.message,
      exists: false,
    });
    return null;
  }

  davTrace("STEP7_VERIFY", messageId, {
    table: "message_deletions",
    userId,
    exists: !!data,
    row: data ?? null,
  });
  return data;
}

export function logSqlResult(
  step: "STEP5_SQL" | "STEP6_AFFECTED",
  messageId: string | null,
  op: string,
  table: string,
  filters: Record<string, unknown>,
  result: { error?: { message: string } | null; count?: number | null; data?: unknown },
): void {
  const affected = result.count ?? (Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0);

  davTrace(step, messageId, {
    op,
    table,
    filters,
    error: result.error?.message ?? null,
    affectedRows: affected,
    returned: result.data ?? null,
  });

  if (step === "STEP6_AFFECTED" && affected === 0 && !result.error) {
    davTrace("STEP6_AFFECTED", messageId, {
      halt: true,
      reason: "affected_rows_zero",
      op,
      table,
      filters,
    });
  }
}
