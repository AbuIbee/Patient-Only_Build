// HCN Master #28: real Director + approved Provider browser correspondence.
// Uses isolated disposable Supabase and synthetic patient, never real email.
import { test, expect } from '@playwright/test';
import { authSignUp, authDeleteUser, login, rpc, sql, BASE, SERVICE } from './integration/_runtime';
import { createClient } from '@supabase/supabase-js';
const FRONTEND = process.env.MMA_E2E_FRONTEND_BASE;
const READY=Boolean(FRONTEND && process.env.MMA_TEST_DB_CONTAINER && process.env.MMA_TEST_API_BASE);
const PW='HcnMaster28Browser!';
const q=(s:string)=> "'" + s.replace(/'/g,"''") + "'";

test('verified Provider account exchanges 3 messages without repeating OTP; revocation stops read',async({browser})=>{
  test.skip(!READY,'Requires isolated frontend and disposable Supabase');
  const stamp=Date.now();
  const dirEmail='m28-e2e-dir-'+stamp+'@local.test';
  const providerEmail='m28-e2e-provider-'+stamp+'@local.test';
  const ids:string[]=[];let org='',patient='',provider='';
  const directorContext=await browser.newContext();
  const providerContext=await browser.newContext();
  const directorPage=await directorContext.newPage();
  const providerPage=await providerContext.newPage();
  try {
    const director=await authSignUp(dirEmail,PW);
    const providerUser=await authSignUp(providerEmail,PW);
    ids.push(director,providerUser);
    sql("UPDATE profiles SET must_change_password=false,provisioning_status='complete' WHERE id IN ("+
      [director,providerUser].map(q).join(',')+");");
    org=sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+
      q('Master 28 Browser '+stamp)+",'integrated_care',"+q(director)+") RETURNING id;");
    patient=sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES("+
      "'Synthetic','Browser','Browser Test Patient','1 Fake Road','Home') RETURNING id;");
    sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES("+
      q(org)+",10,10,399,'active');"+
      "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES("+
      q(org)+","+q(director)+",'director','active');"+
      "INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES("+
      q(org)+","+q(patient)+",'active',"+q(director)+");");
    const directorToken=await login(dirEmail,PW);
    const [createdStatus,created]=await rpc('hcn_upsert_healthcare_provider',{
      p_organization_id:org,p_provider_id:null,p_display_name:'Dr. Synthetic Provider',
      p_professional_title:'Test MD',p_specialty:'primary_care_physician',
      p_specialty_other_label:null,p_practice_name:'Synthetic Clinic',
      p_office_phone:null,p_fax_number:null,p_secure_contact_email:providerEmail,
      p_office_address:null,p_professional_identifier:'TEST-BROWSER-001',
      p_credentials:'Fictional identity only',p_expected_version:null,
    },directorToken);
    expect(createdStatus,JSON.stringify(created)).toBe(200);
    provider=(created as {id:string}).id;

    // Actual provider logs in with their one-time-confirmed Supabase account.
    await providerPage.goto(FRONTEND+'/Professional/Provider');
    await providerPage.getByPlaceholder('you@example.com').fill(providerEmail);
    await providerPage.getByPlaceholder('Your password').fill(PW);
    await providerPage.getByRole('button',{name:/sign in/i}).click();
    await expect(providerPage.getByRole('heading',{name:/Provider Inbox/i})).toBeVisible({timeout:25000});
    await providerPage.getByRole('button',{name:'Claim my account'}).click();
    await expect(providerPage.getByText(/Awaiting organization approval/)).toBeVisible();

    await directorPage.goto(FRONTEND+'/Professional');
    await directorPage.getByPlaceholder('you@example.com').fill(dirEmail);
    await directorPage.getByPlaceholder('Your password').fill(PW);
    await directorPage.getByRole('button',{name:/sign in/i}).click();
    await directorPage.getByRole('button',{name:'Clinical Coordination'}).click();
    await expect(directorPage.getByRole('heading',{name:'Healthcare Provider Directory'})).toBeVisible();
    directorPage.once('dialog',dialog=>dialog.accept('Synthetic independent professional credential verification completed for testing'));
    await directorPage.getByRole('button',{name:'Verify & approve account'}).click();
    await expect(directorPage.getByText('Account: active')).toBeVisible({timeout:15000});
    // Existing patient association RPC (owner authorized).
    const [assocCode] = await rpc('hcn_associate_provider_with_patient',{
      p_patient_id:patient,p_provider_id:provider,p_relationship_note:'Browser fixture'
    },directorToken);
    expect(assocCode).toBe(200);
    await directorPage.getByRole('button',{name:'Refresh',exact:true}).first().click();

    const panel=directorPage.getByRole('region',{name:'Provider conversations'});
    await panel.getByRole('combobox',{name:'Conversation patient'}).selectOption(patient);
    await panel.getByRole('combobox',{name:'Conversation provider'}).selectOption(provider);
    await panel.getByRole('button',{name:'Open conversation'}).click();
    const directorThread=panel.getByRole('region',{name:'Secure clinical conversation'});
    await expect(directorThread).toBeVisible();
    await directorThread.getByRole('textbox',{name:'Reply securely'}).fill('Synthetic question from Director');
    await directorThread.getByRole('button',{name:'Send message'}).click();
    await expect(directorThread.getByText('Synthetic question from Director')).toBeVisible();

    await providerPage.getByRole('button',{name:'Refresh inbox'}).click();
    await providerPage.getByRole('button',{name:/Browser Test Patient · Dr. Synthetic Provider/}).click();
    const providerThread=providerPage.getByRole('region',{name:'Secure clinical conversation'});
    await expect(providerThread.getByText('Synthetic question from Director')).toBeVisible({timeout:15000});
    await providerThread.getByRole('textbox',{name:'Reply securely'}).fill('Synthetic answer from the verified provider');
    await providerThread.getByRole('button',{name:'Send message'}).click();
    await expect(directorThread.getByText('Synthetic answer from the verified provider')).toBeVisible({timeout:20000});

    // Real provider-to-Director document upload, storage receipt, and review.
    await providerThread.getByLabel('Upload a document securely (25 MiB maximum)').setInputFiles({
      name:'synthetic-provider-review.pdf',mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
    });
    await providerThread.getByRole('button',{name:'Upload to care team'}).click();
    await expect(providerThread.getByText('synthetic-provider-review.pdf')).toBeVisible({timeout:20000});
    await expect(directorThread.getByText('synthetic-provider-review.pdf')).toBeVisible({timeout:20000});
    directorPage.once('dialog',dialog=>dialog.accept('Synthetic provider upload reviewed'));
    await directorThread.getByRole('button',{name:'Accept',exact:true}).click();
    expect(sql("SELECT review_status FROM hcn_clinical_documents WHERE organization_id="+q(org)+" LIMIT 1;")).toBe('accepted');
    await directorThread.getByRole('textbox',{name:'Reply securely'}).fill('Synthetic follow-up from Director');
    await directorThread.getByRole('button',{name:'Send message'}).click();
    await expect(providerThread.getByText('Synthetic follow-up from Director')).toBeVisible({timeout:20000});
    expect(sql("SELECT count(*) FROM hcn_provider_messages WHERE thread_id IN "+
      "(SELECT id FROM hcn_provider_threads WHERE organization_id="+q(org)+");")).toBe('3');


    // Revocation immediately changes backend authority and clears data on refresh.
    sql("UPDATE hcn_provider_accounts SET status='revoked' WHERE provider_id="+q(provider)+";");
    await providerPage.reload();
    await expect(providerPage.getByRole('region',{name:'Secure clinical conversation'})).toHaveCount(0);
  } finally {
    await directorContext.close();await providerContext.close();
    if(org) {
      const uploadedPaths=sql("SELECT string_agg(d.storage_path,'|') FROM hcn_clinical_documents d "+
        "JOIN hcn_provider_thread_documents td ON td.document_id=d.id "+
        "JOIN hcn_provider_threads t ON t.id=td.thread_id WHERE t.organization_id="+q(org)+";");
      sql("DELETE FROM hcn_provider_thread_documents WHERE thread_id IN "+
        "(SELECT id FROM hcn_provider_threads WHERE organization_id="+q(org)+");"+
        "DELETE FROM hcn_clinical_documents WHERE organization_id="+q(org)+";");
      if(uploadedPaths) await createClient(BASE,SERVICE).storage.from('hcn-clinical-documents').remove(uploadedPaths.split('|'));
      sql("DELETE FROM hcn_provider_messages WHERE thread_id IN "+
        "(SELECT id FROM hcn_provider_threads WHERE organization_id="+q(org)+");"+
        "DELETE FROM hcn_provider_threads WHERE organization_id="+q(org)+";");
      sql("DELETE FROM hcn_provider_accounts WHERE organization_id="+q(org)+";");
      sql("DELETE FROM hcn_patient_provider_associations WHERE organization_id="+q(org)+";");
      sql("DELETE FROM hcn_healthcare_providers WHERE organization_id="+q(org)+";");
      sql("DELETE FROM covered_patient_memberships WHERE organization_id="+q(org)+";");
      sql("DELETE FROM organization_memberships WHERE organization_id="+q(org)+";");
      sql("DELETE FROM organization_licenses WHERE organization_id="+q(org)+";");
      sql("DELETE FROM organizations WHERE id="+q(org)+";");
    }
    if(patient)sql("DELETE FROM patients WHERE id="+q(patient)+";");
    for(const id of ids)await authDeleteUser(id);
  }
});
