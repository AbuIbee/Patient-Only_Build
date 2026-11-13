import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

const ownerApi = supabase as unknown as SupabaseClient;
export type OwnedOrganization = { organizationId: string; organizationName: string };

/** Explicitly authenticated, RLS/SQL-scoped lookup of orgs this user owns.
 * This is not a Director membership and never confers clinical privileges.
 */
export async function listMyOwnedOrganizations(): Promise<OwnedOrganization[]> {
  const { data, error } = await ownerApi.rpc('hcn_list_my_owned_organizations');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    organizationId: String(r.organization_id),
    organizationName: String(r.organization_name),
  }));
}
