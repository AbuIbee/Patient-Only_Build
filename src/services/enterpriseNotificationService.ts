// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase I2 — client wrappers for
// migration 116's enterprise_notifications. Reads go through plain
// RLS-protected table selects (a user only ever sees their own rows,
// or every row if they are the Platform Owner, per migration 116's
// policies); the only write is marking one's own notification read.
import { supabase } from '@/lib/supabase';

export interface EnterpriseNotification {
  id: string;
  notificationType: string;
  title: string;
  body: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
}

function mapNotification(r: Record<string, unknown>): EnterpriseNotification {
  return {
    id: r.id as string, notificationType: r.notification_type as string, title: r.title as string, body: r.body as string | null,
    relatedEntityType: r.related_entity_type as string | null, relatedEntityId: r.related_entity_id as string | null,
    readAt: r.read_at as string | null, createdAt: r.created_at as string,
  };
}

// Explicitly filters to the caller's own recipient_user_id rather
// than relying on RLS alone -- the Platform Owner's own RLS policy
// intentionally grants broader audit visibility (every notification,
// for oversight), which would otherwise leak into what is meant to be
// a personal "my notifications" list the moment an owner account
// calls this.
//
// CODEX F-19 -- a real fetch failure (network error, session expiry,
// an RLS denial) was previously indistinguishable from "you genuinely
// have zero notifications": both silently returned []. Returns the
// error explicitly instead, so the caller can show it rather than a
// fabricated empty inbox.
export async function getMyNotifications(limit = 20): Promise<{ notifications: EnterpriseNotification[]; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notifications: [], error: 'Not signed in' };
  const { data, error } = await supabase
    .from('enterprise_notifications')
    .select('*')
    .eq('recipient_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { notifications: [], error: error.message };
  return { notifications: (data as unknown as Record<string, unknown>[] ?? []).map(mapNotification), error: null };
}

export async function markNotificationRead(notificationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: notificationId });
  return { error: error ? error.message : null };
}
