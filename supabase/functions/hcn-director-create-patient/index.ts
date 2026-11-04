// HCN Director/Owner patient enrollment. No browser-held service role,
// no public patient self-enrollment into an Enterprise organization.
// A new patient identity receives only its own password setup invitation;
// no caregiver may see the account until a Director makes an assignment.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SITE='https://www.haneencarenetwork.com';
const allowed=new Set([SITE,'https://haneencarenetwork.com','http://localhost:3000','http://localhost:5173']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function headers(origin:string|null) {
  return {
    'Access-Control-Allow-Origin':allowed.has(origin??'')?origin!:SITE,
    'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
  };
}
function result(origin:string|null,code:number,data:Record<string,unknown>){
  return new Response(JSON.stringify(data),{status:code,headers:headers(origin)});
}
function txt(x:unknown){return typeof x==='string'?x.trim():'';}
function emailError(error:unknown):boolean{
  const o=error as {status?:number,code?:string,message?:string}|null;
  return o?.status===429||o?.code==='over_email_send_rate_limit'
    ||/rate limit|too many email/i.test(o?.message||'');
}
serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=='POST')return result(origin,405,{error:'POST required'});
  if(origin&&!allowed.has(origin))return result(origin,403,{error:'Origin not allowed'});
  const header=req.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer '))return result(origin,401,{error:'Sign in as the organization Director'});
  const token=header.slice(7);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!anon||!secret)return result(origin,503,{error:'Patient enrollment service unavailable'});
  try{
    const data=await req.json() as Record<string,unknown>;
    const organizationId=txt(data.organizationId);
    const firstName=txt(data.firstName),lastName=txt(data.lastName);
    const email=txt(data.email).toLowerCase();
    const dob=txt(data.dateOfBirth);
    if(!UUID.test(organizationId)||!EMAIL.test(email)||email.length>254
       ||firstName.length<1||firstName.length>80||lastName.length<1||lastName.length>80){
      return result(origin,400,{error:'Organization, valid patient email, first and last names are required'});
    }
    if(dob&&(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||Number.isNaN(Date.parse(dob))||
      new Date(dob).getTime()>Date.now()))return result(origin,400,{error:'Date of birth must be a valid past date'});
    const userClient=createClient(url,anon,{
      global:{headers:{Authorization:'Bearer '+token}},
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:{user},error:authError}=await userClient.auth.getUser(token);
    if(authError||!user)return result(origin,401,{error:'Session expired; sign in again'});
    const [director,owner]=await Promise.all([
      userClient.rpc('is_active_org_director',{p_org_id:organizationId}),
      userClient.rpc('am_i_org_owner',{p_org_id:organizationId}),
    ]);
    if(director.error||owner.error)return result(origin,503,{error:'Unable to verify management authority'});
    if(!director.data&&!owner.data)return result(origin,403,{error:'Only the Organization Owner or Director may create patients'});

    const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
    // Read-only preflight; authoritative locks and capacity checks are in
    // the service-role-only hcn_director_enroll_patient() transaction.
    const [lic,org,existing]=await Promise.all([
      admin.from('organization_licenses').select('status,license_number,covered_patient_capacity')
        .eq('organization_id',organizationId).maybeSingle(),
      admin.from('organizations').select('id,package_type')
        .eq('id',organizationId).maybeSingle(),
      admin.from('profiles').select('id,role').ilike('email',email).maybeSingle(),
    ]);
    if(lic.error||org.error||existing.error)return result(origin,503,{error:'Could not verify patient enrollment prerequisites'});
    if(!org.data||org.data.package_type!=='integrated_care'||!lic.data||
      lic.data.status!=='active'||!lic.data.license_number){
      return result(origin,403,{error:'An active Integrated Care organization license is required'});
    }
    if(lic.data.covered_patient_capacity===null||lic.data.covered_patient_capacity<1){
      return result(origin,409,{error:'Patient capacity is not configured on the organization license'});
    }
    if(existing.data){
      const {data:coverage}=await admin.from('covered_patient_memberships')
        .select('status').eq('organization_id',organizationId)
        .eq('patient_id',existing.data.id).maybeSingle();
      if(coverage?.status==='active')return result(origin,200,{
        success:true,alreadyEnrolled:true,patientId:existing.data.id,
        message:'Patient is already enrolled in this organization. Assign an active caregiver; no duplicate account was created.',
      });
      return result(origin,409,{
        error:'That email already belongs to an account. Existing identities require a separate reviewed enrollment; no account was changed.',
      });
    }

    const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{
      redirectTo:SITE+'/activate',
      data:{first_name:firstName,last_name:lastName,role:'patient'},
    });
    if(inviteError||!invited.user){
      return result(origin,emailError(inviteError)?429:422,{
        code:emailError(inviteError)?'EMAIL_RATE_LIMIT':'PATIENT_INVITE_FAILED',
        error:emailError(inviteError)
          ? 'Supabase Auth email sending limit reached. Configure production SMTP before inviting more patients; no patient account was created.'
          : 'Patient invitation could not be sent. No patient account was created.',
      });
    }
    const patientId=invited.user.id;
    const {data:registered,error:enrollError}=await admin.rpc('hcn_director_enroll_patient',{
      p_org_id:organizationId,p_patient_id:patientId,p_actor_id:user.id,
      p_first_name:firstName,p_last_name:lastName,p_date_of_birth:dob||null,
    });
    if(enrollError||registered!==patientId){
      // Auth user creation is a separate transaction from PostgreSQL.
      // Only delete the newly invited user if server-side checks prove
      // the patient record and organization coverage were never made.
      const [p,c]=await Promise.all([
        admin.from('patients').select('id').eq('id',patientId).maybeSingle(),
        admin.from('covered_patient_memberships').select('id').eq('patient_id',patientId).limit(1),
      ]);
      if(!p.error&&!c.error&&!p.data&&(!c.data||c.data.length===0)){
        const {error:cleanup}=await admin.auth.admin.deleteUser(patientId);
        if(cleanup)console.error('HCN new patient pending identity cleanup failed');
      }
      return result(origin,409,{error:enrollError?.message||'Patient account enrollment incomplete; contact support before retrying'});
    }
    return result(origin,200,{
      success:true,patientId,invitationSent:true,
      message:'Patient account enrolled and invitation sent. No caregiver access is granted until an active caregiver is explicitly assigned.',
    });
  }catch(err){
    console.error('HCN Director patient enrollment exception',err instanceof Error?err.name:'unknown');
    return result(origin,500,{error:'Patient enrollment encountered a server error; verify inventory before retrying'});
  }
});
