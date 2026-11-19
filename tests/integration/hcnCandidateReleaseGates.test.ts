import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {authSignUp,login,rpc,http,sql} from './_runtime';

async function actor(){const email=`candidate-${randomUUID()}@local.test`;const password=randomUUID()+'Aa9!';const id=await authSignUp(email,password);sql(`UPDATE profiles SET provisioning_status='complete',must_change_password=false WHERE id='${id}';`);return{id,email,password,token:await login(email,password)};}
function details(email:string){return{step1:{legalBusinessName:'Synthetic candidate '+randomUUID(),legalForm:'LLC',businessClassification:'Home care agency',formationJurisdiction:'Pennsylvania',registeredAddress:'1 Fictional Ave Philadelphia PA',businessPhone:'215-555-0100',businessEmail:email},step2:{fullLegalName:'Synthetic Applicant',verifiedBusinessEmail:email,mobile:'215-555-0101',title:'Owner',relationshipToEntity:'Owner',authorizedSignatory:true,authorityAttestation:true},step5:{billingContact:'Synthetic Applicant',billingAddress:'1 Fictional Ave',billingEmail:email},step6:{accuracyAttestation:true,authorizedSignatoryConfirmed:true,privacyAck:true,signatureName:'Synthetic Applicant'}};}
async function application(waiver=true){const a=await actor();const [status,app]=await rpc('start_self_service_application',{p_selected_tier_code:'essential',p_initial_expected_active_patients:12,p_legal_name:'Synthetic Applicant',p_contact_email:a.email,p_application_details:details(a.email),p_coupon_code:waiver?'WELCOME100':null},a.token) as[number,{id:string;target_organization_id:string;application_details:{originatingQuoteId:string}}];expect(status,JSON.stringify(app)).toBe(200);return{...a,app,quote:app.application_details.originatingQuoteId};}
async function sign(a:Awaited<ReturnType<typeof application>>,type:string){const [status,body]=await rpc('self_service_execute_agreement',{p_application_id:a.app.id,p_contract_type:type,p_signatory_name:'Synthetic Applicant',p_signatory_title:'Owner',p_consent_to_electronic_records:true,p_user_agent:'candidate-release-regression'},a.token);expect(status,JSON.stringify(body)).toBe(200);}
function activationRejected(quote:string){expect(()=>sql(`SELECT activate_enterprise_license_from_quote('${quote}');`)).toThrow();}

describe('Candidate processor activation boundaries',()=>{
 it('unsigned, one signed and both signed cannot activate or unlock Director; waiver still requires monthly confirmation',async()=>{
  const a=await application();activationRejected(a.quote);await sign(a,'baa');activationRejected(a.quote);await sign(a,'saas_license');activationRejected(a.quote);
  expect(sql(`SELECT status FROM professional_applications WHERE id='${a.app.id}';`)).toBe('agreements_executed');
  expect(sql(`SELECT count(*) FROM hcn_deferred_billing_activations WHERE application_id='${a.app.id}';`)).toBe('0');
  expect(sql(`SELECT status FROM organization_memberships WHERE organization_id='${a.app.target_organization_id}' AND user_id='${a.id}';`)).toBe('invited');
  expect(()=>sql(`UPDATE organization_memberships SET status='active' WHERE organization_id='${a.app.target_organization_id}' AND user_id='${a.id}';`)).toThrow();
  expect(()=>sql(`UPDATE organization_licenses SET status='active' WHERE organization_id='${a.app.target_organization_id}';`)).toThrow();
  expect(()=>sql(`UPDATE professional_applications SET status='active' WHERE id='${a.app.id}';`)).toThrow();
  expect((await rpc('create_enterprise_billing_account',{p_quote_id:a.quote,p_billing_contact_email:a.email},a.token))[0]).toBe(200);
  expect((await rpc('create_enterprise_monthly_billing_component',{p_quote_id:a.quote,p_billing_timezone:'America/New_York'},a.token))[0]).toBe(200);
  for(const status of ['pending','incomplete','past_due','canceled']){sql(`UPDATE enterprise_billing_accounts SET status='${status}',stripe_subscription_id='sub_local_simulated' WHERE quote_id='${a.quote}' AND billing_component='monthly_patients';`);activationRejected(a.quote);}
  // Simulated service-side processor confirmation, not actual Stripe evidence.
  sql(`UPDATE enterprise_billing_accounts SET status='active',stripe_subscription_id='sub_local_simulated' WHERE quote_id='${a.quote}' AND billing_component='monthly_patients';`);
  const first=sql(`SELECT id||'|'||license_number FROM activate_enterprise_license_from_quote('${a.quote}');`);
  expect(sql(`SELECT id||'|'||license_number FROM activate_enterprise_license_from_quote('${a.quote}');`)).toBe(first);
  expect(sql(`SELECT count(*) FROM organizations WHERE id='${a.app.target_organization_id}';`)).toBe('1');
  expect(sql(`SELECT count(*) FROM organization_licenses WHERE organization_id='${a.app.target_organization_id}';`)).toBe('1');
  expect(sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${a.app.target_organization_id}' AND user_id='${a.id}';`)).toBe('1');
  expect(sql(`SELECT count(*) FROM professional_application_events WHERE application_id='${a.app.id}' AND event_type='enterprise_license_activated';`)).toBe('1');
 });
 it('a chargeable annual component also needs confirmation',async()=>{const a=await application(false);await sign(a,'baa');await sign(a,'saas_license');await rpc('create_enterprise_billing_account',{p_quote_id:a.quote,p_billing_contact_email:a.email},a.token);await rpc('create_enterprise_monthly_billing_component',{p_quote_id:a.quote,p_billing_timezone:'America/New_York'},a.token);sql(`UPDATE enterprise_billing_accounts SET status='active',stripe_subscription_id='sub_local_monthly' WHERE quote_id='${a.quote}' AND billing_component='monthly_patients';`);activationRejected(a.quote);sql(`UPDATE enterprise_billing_accounts SET status='active',stripe_subscription_id='sub_local_annual' WHERE quote_id='${a.quote}' AND billing_component='annual_license';`);expect(sql(`SELECT status FROM activate_enterprise_license_from_quote('${a.quote}');`)).toBe('active');});
});

describe('Applicant-owned self-service drafts',()=>{
 it('saves once across retries, isolates applicants, preserves fields and submits the same draft after validation',async()=>{
  const a=await actor(),other=await actor();const snapshot={step:'starter',selectedTier:'essential',fullLegalName:'',applicantEmail:a.email,legalBusinessName:'Draft '+randomUUID(),registeredAddress:'Apt 2B',initialPatients:'12'};
  const saves=await Promise.all(Array.from({length:4},()=>rpc('hcn_save_self_service_draft',{p_snapshot:snapshot},a.token)));
  for(const [status,body] of saves)expect(status,JSON.stringify(body)).toBe(200);
  const id=(saves[0][1] as {id:string}).id;expect(new Set(saves.map(x=>(x[1] as {id:string}).id)).size).toBe(1);
  expect(sql(`SELECT count(*) FROM professional_applications WHERE applicant_user_id='${a.id}';`)).toBe('1');
  const fresh=await login(a.email,a.password);const [readStatus,drafts]=await rpc('get_my_application_draft',{},fresh) as[number,Array<{id:string;application_details:{selfServiceDraft:typeof snapshot}}>];expect(readStatus).toBe(200);expect(drafts[0].id).toBe(id);expect(drafts[0].application_details.selfServiceDraft).toEqual(snapshot);
  expect(await http('GET',`/rest/v1/professional_applications?id=eq.${id}&select=id`,undefined,other.token)).toEqual([200,[]]);
  expect((await rpc('start_self_service_application',{p_selected_tier_code:'essential',p_initial_expected_active_patients:12,p_legal_name:'',p_contact_email:a.email,p_application_details:details(a.email)},a.token))[0]).toBeGreaterThanOrEqual(400);
  const [submitted,app]=await rpc('start_self_service_application',{p_selected_tier_code:'essential',p_initial_expected_active_patients:12,p_legal_name:'Synthetic Applicant',p_contact_email:a.email,p_application_details:details(a.email)},a.token) as[number,{id:string}];expect(submitted,JSON.stringify(app)).toBe(200);expect(app.id).toBe(id);
  expect((await rpc('hcn_save_self_service_draft',{p_snapshot:snapshot},a.token))[0]).toBeGreaterThanOrEqual(400);
 });
});
