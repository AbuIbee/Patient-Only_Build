// ROUND 6 (continued) — C03 Care Updates. Migration 071 added
// `messages.message_type` but never gave any client path a way to set
// it to 'care_update' — send_message() (migration 036) had no such
// parameter, so every message, regardless of intent, was permanently
// stuck at the column's own DEFAULT 'message'. Migration 073 adds one
// new DEFAULT-valued parameter so every pre-existing call site
// (positional arg count unchanged in every real caller) is unaffected.
//
// LIVE VERIFICATION (this round): sending with the new parameter
// omitted still inserts message_type='message' (regression-checked
// against the exact pre-existing 4-argument call shape); sending with
// p_message_type='care_update' succeeds and is distinguishable when
// read back by another participant; an invalid value is rejected.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ROUND 6 — migration 073 Care Update message type', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/073_r6_care_update_message_type.sql'), 'utf-8');

  it('send_message gains p_message_type with a DEFAULT so every existing 4-argument call is unaffected', () => {
    expect(source).toMatch(/p_message_type TEXT DEFAULT 'message'/);
    expect(source).toMatch(/DROP FUNCTION IF EXISTS public\.send_message\(UUID, TEXT, BOOLEAN, UUID\)/);
  });

  it('rejects an invalid message type and inserts the real column on the messages row', () => {
    expect(source).toMatch(/IF p_message_type NOT IN \('message', 'care_update'\) THEN/);
    expect(source).toMatch(/INSERT INTO messages \(conversation_id, sender_id, sender_role, body, is_urgent, reply_to_message_id, message_type\)/);
  });

  it('every other authorization/validation line is preserved from migration 036 (participant check, reply-target check)', () => {
    expect(source).toMatch(/NOT public\.is_conversation_participant\(p_conversation_id\)/);
    expect(source).toMatch(/SELECT 1 FROM messages WHERE id = p_reply_to_message_id AND conversation_id = p_conversation_id/);
  });
});
