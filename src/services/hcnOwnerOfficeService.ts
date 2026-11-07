import { supabase } from '@/lib/supabase';

export type OwnedOrganization = {
  organizationId: string;
  organizationName: string;
  licenseActive: boolean;
  directorEnabled: boolean;
};

export async function loadOwnedOrganizations(): Promise<{data: OwnedOrganization[]|null; error: string|null}> {
  const {data,error} = await supabase.rpc('hcn_my_owned_organizations');
  if (error) return {data:null,error:error.message};
  return {data:(data??[]).map(o=>({
    organizationId:o.organization_id,
    organizationName:o.organization_name,
    licenseActive:o.license_active,
    directorEnabled:o.director_enabled,
  })),error:null};
}

export async function enableOwnDirectorOffice(orgId:string):Promise<{error:string|null}> {
  if (!orgId) return {error:'An organization is required.'};
  const {data,error}=await supabase.rpc('hcn_owner_enable_director_office',{p_org_id:orgId});
  if (error) return {error:error.message};
  if (data!==true) return {error:'Director activation was not confirmed.'};
  return {error:null};
}
