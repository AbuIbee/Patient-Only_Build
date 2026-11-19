import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {authSignUp,sql,login,rpc} from './integration/_runtime';
import {requireE2eEnv} from './_e2eTargetValidation';
const base=requireE2eEnv('MMA_E2E_FRONTEND_BASE');

test('direct Director route and reload resume signed applicant billing without granting the office',async({browser})=>{
 const email=`pending-route-${randomUUID()}@local.test`,password=randomUUID()+'Aa9!';
 const id=await authSignUp(email,password);sql(`UPDATE profiles SET provisioning_status='complete',must_change_password=false WHERE id='${id}';`);
 const token=await login(email,password),name='Synthetic Pending Applicant';
 const details={step1:{legalBusinessName:'Synthetic Pending Route '+randomUUID(),legalForm:'LLC',businessClassification:'Home care agency',formationJurisdiction:'Pennsylvania',registeredAddress:'1 Fictional Ave',businessPhone:'215-555-0100',businessEmail:email},step2:{fullLegalName:name,verifiedBusinessEmail:email,mobile:'215-555-0101',title:'Owner',relationshipToEntity:'Owner',authorizedSignatory:true,authorityAttestation:true},step5:{billingContact:name,billingAddress:'1 Fictional Ave',billingEmail:email},step6:{accuracyAttestation:true,authorizedSignatoryConfirmed:true,privacyAck:true,signatureName:name}};
 const [created,app]=await rpc('start_self_service_application',{p_selected_tier_code:'essential',p_initial_expected_active_patients:12,p_legal_name:name,p_contact_email:email,p_application_details:details,p_coupon_code:'WELCOME100'},token) as [number,{id:string}];expect(created).toBe(200);
 for(const type of ['baa','saas_license'])expect((await rpc('self_service_execute_agreement',{p_application_id:app.id,p_contract_type:type,p_signatory_name:name,p_signatory_title:'Owner',p_consent_to_electronic_records:true,p_user_agent:'isolated route fixture'},token))[0]).toBe(200);
 // Setup is a backend fixture. The interaction being verified is the actual
 // signed-in route and reload boundary, independently of canonical-byte tests.
 const context=await browser.newContext(),page=await context.newPage();await page.goto(base+'/Professional/Admin');await page.getByPlaceholder('you@example.com').fill(email);await page.getByPlaceholder('Your password').fill(password);await page.getByRole('button',{name:/sign in/i}).click();await expect(page.getByRole('heading',{name:'Sign in to your workspace'})).toBeHidden();
 await page.goto(base+'/Professional/Admin');await expect(page.getByRole('heading',{name:'Agreements signed — authorize billing'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Agreements signed — authorize billing'})).toBeVisible();await expect(page.getByRole('heading',{name:'Director Dashboard',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Authorize separate monthly billing'})).toBeEnabled();await page.screenshot({path:test.info().outputPath('pending-billing-route-reloaded.png'),fullPage:true});await context.close();
});

test('mobile applicant saves incomplete details once and restores fields and step after logout in fresh contexts',async({browser})=>{
 test.setTimeout(90000);const email=`draft-browser-${randomUUID()}@local.test`,password=randomUUID()+'Aa9!';const id=await authSignUp(email,password);sql(`UPDATE profiles SET provisioning_status='complete',must_change_password=false WHERE id='${id}';`);
 async function open():Promise<Page>{const c=await browser.newContext({viewport:{width:390,height:844}});const p=await c.newPage();await p.goto(base+'/Professional');await p.getByPlaceholder('you@example.com').fill(email);await p.getByPlaceholder('Your password').fill(password);await p.getByRole('button',{name:/sign in/i}).click();await expect(p.getByRole('heading',{name:'Sign in to your workspace'})).toBeHidden();await p.goto(base+'/Professional/Register');await p.getByText('Purchase a License / Become a Director',{exact:true}).click();return p;}
 let p=await open();await p.getByRole('button',{name:/^Essential\b/}).click();
 const fields=[['Legal business name','Lantern draft '+randomUUID()],['Legal entity type','LLC'],['Business classification','Home care agency'],['Formation jurisdiction','Pennsylvania'],['Business phone','215-555-0100'],['Registered address','1 Fictional Ave Apt 2B, Philadelphia PA'],['Mobile number','215-555-0101'],['Title','Owner'],['Your relationship to this business','Owner'],['Billing contact name','Synthetic Applicant'],['Billing address','1 Fictional Ave'],['Billing email',email],['Initial expected active patients','12']];
 for(const [label,value]of fields)await p.getByLabel(label+' *',{exact:true}).fill(value);
 await p.getByLabel('Your full legal name *',{exact:true}).fill('');await p.getByLabel(/I am an authorized representative/).check();await p.getByLabel(/I have the authority to enter/).check();
 await expect(p.getByRole('button',{name:'Continue to pricing'})).toBeDisabled();await p.getByRole('button',{name:'Save Draft',exact:true}).click();await expect(p.getByText('Draft saved. You can sign out and return to this application.')).toBeVisible();await p.getByRole('button',{name:'Save Draft',exact:true}).click();
 const draft=sql(`SELECT id FROM professional_applications WHERE applicant_user_id='${id}' AND status='draft';`);expect(draft).toMatch(/^[0-9a-f-]{36}$/);expect(sql(`SELECT count(*) FROM professional_applications WHERE applicant_user_id='${id}';`)).toBe('1');
 await p.screenshot({path:test.info().outputPath('draft-incomplete.png'),fullPage:true});await p.getByRole('button',{name:'Logout',exact:true}).click();await p.context().close();
 p=await open();await expect(p.getByRole('heading',{name:'Starter application'})).toBeVisible();
 for(const [label,value]of fields)await expect(p.getByLabel(label+' *',{exact:true})).toHaveValue(value);
 await expect(p.getByLabel('Your full legal name *',{exact:true})).toHaveValue('');await p.getByLabel('Your full legal name *',{exact:true}).fill('Synthetic Applicant');await p.getByRole('button',{name:'Continue to pricing'}).click();await p.getByRole('button',{name:'Save Draft',exact:true}).click();await expect(p.getByText('Draft saved. You can sign out and return to this application.')).toBeVisible();await p.getByRole('button',{name:'Logout',exact:true}).click();await p.context().close();
 p=await open();await expect(p.getByRole('heading',{name:'Pricing and agreements'})).toBeVisible();await expect(p.getByText(/Separate monthly patient fee: \$250.00/)).toBeVisible();expect(sql(`SELECT id FROM professional_applications WHERE applicant_user_id='${id}' AND status='draft';`)).toBe(draft);await p.screenshot({path:test.info().outputPath('draft-restored-pricing.png'),fullPage:true});await p.context().close();
});

test('public enterprise pricing and legal links render published catalog amounts without residential checkout',async({page})=>{
 await page.goto(base+'/pricing');await expect(page.getByRole('heading',{name:'Organization pricing',exact:true})).toBeVisible();
 const tiers=JSON.parse(sql(`SELECT json_agg(json_build_object('name',display_name,'cents',annual_fee_cents)) FROM license_tier_catalog WHERE is_published;`)) as Array<{name:string;cents:number}>;
 for(const tier of tiers){const card=page.locator('section').filter({has:page.getByRole('heading',{name:tier.name,exact:true})});await expect(card).toContainText((tier.cents/100).toFixed(2));await expect(card.getByRole('link',{name:'Apply for an organization'})).toHaveAttribute('href','/Professional/Register');}
 await page.getByRole('link',{name:'Review privacy and legal documents'}).click();await expect(page).toHaveURL(/\/privacy$/);await page.getByRole('link',{name:'Organization pricing',exact:true}).click();await expect(page).toHaveURL(/\/pricing$/);await page.screenshot({path:test.info().outputPath('enterprise-pricing.png'),fullPage:true});
});
