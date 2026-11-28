// Real browser + GoTrue + PostgREST on explicitly configured disposable stack only.
// Verifies the entire caregiver assistance lifecycle and preserved homepage layout.
import { test, expect } from '@playwright/test';
import { authSignUp, authDeleteUser, sql } from './integration/_runtime';

const BASE=process.env.MMA_E2E_FRONTEND_BASE;
const READY=Boolean(BASE && process.env.MMA_TEST_API_BASE && process.env.MMA_TEST_DB_CONTAINER);
const PASSWORD='HcnSafetyE2e9!';

async function seed(){
  const stamp=Date.now();
  const directorEmail='safety-director-'+stamp+'@local.test';
  const caregiverEmail='safety-caregiver-'+stamp+'@local.test';
  const directorId=await authSignUp(directorEmail,PASSWORD);
  const caregiverId=await authSignUp(caregiverEmail,PASSWORD);
  sql("UPDATE profiles SET must_change_password=false,provisioning_status='complete' "+
    "WHERE id IN ('"+directorId+"','"+caregiverId+"');");
  const orgId=sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+
    "'Safety UI "+stamp+"','integrated_care','"+directorId+"') RETURNING id;");
  const patientId=sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES("+
    "'Fictional','Safety','Fictional Safety Patient','100 Test Lane','Fictional') RETURNING id;");
  sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number) "+
    "VALUES('"+orgId+"',10,10,399,'active','SAFETY-"+stamp+"');"+
    "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES "+
    "('"+orgId+"','"+directorId+"','director','active'),"+
    "('"+orgId+"','"+caregiverId+"','caregiver','active');"+
    "INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) "+
    "VALUES('"+orgId+"','"+patientId+"','active','"+directorId+"');"+
    "INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) "+
    "VALUES('"+orgId+"','"+caregiverId+"','"+patientId+"','caregiver',true,'"+directorId+"');");
  return {directorEmail,caregiverEmail,directorId,caregiverId,orgId,patientId};
}
async function cleanup(c:Awaited<ReturnType<typeof seed>>){
  const q=(value:string)=>"'"+value+"'";
  sql("DELETE FROM hcn_caregiver_assistance_events WHERE alert_id IN "+
      "(SELECT id FROM hcn_caregiver_assistance_alerts WHERE organization_id="+q(c.orgId)+");"+
      "DELETE FROM hcn_caregiver_assistance_alerts WHERE organization_id="+q(c.orgId)+";"+
      "DELETE FROM staff_patient_assignments WHERE organization_id="+q(c.orgId)+";"+
      "DELETE FROM covered_patient_memberships WHERE organization_id="+q(c.orgId)+";"+
      "DELETE FROM organization_memberships WHERE organization_id="+q(c.orgId)+";"+
      "DELETE FROM organization_licenses WHERE organization_id="+q(c.orgId)+";"+
      "DELETE FROM organizations WHERE id="+q(c.orgId)+";"+
      "DELETE FROM patients WHERE id="+q(c.patientId)+";");
  await authDeleteUser(c.caregiverId);
  await authDeleteUser(c.directorId);
}
test('caregiver assistance reaches top of original Director attention queue, with audited contact and resolution',async({browser})=>{
  test.skip(!READY,'Requires disposable Supabase and frontend server, never hosted data');
  const ctx=await seed();
  const caregiver=await browser.newPage();
  const director=await browser.newPage();
  try {
    await caregiver.goto(BASE+'/Professional',{waitUntil:'domcontentloaded'});
    await caregiver.getByPlaceholder('you@example.com').fill(ctx.caregiverEmail);
    await caregiver.getByPlaceholder('Your password').fill(PASSWORD);
    await caregiver.getByRole('button',{name:/sign in/i}).click();
    await expect(caregiver.getByRole('heading',{name:'What do you need to do next?'}))
      .toBeVisible({timeout:30000});
    await expect(caregiver.getByText('Need help from your Director?')).toBeVisible();
    await caregiver.getByRole('button',{name:'Request assistance'}).click();
    const request=caregiver.getByRole('dialog',{name:'Request Director assistance'});
    await expect(request).toBeVisible();
    await request.getByRole('textbox',{name:'What help is needed?'}).fill(
      'Fictional caregiver requests assistance with an assigned patient, no actual emergency.');
    await request.getByRole('button',{name:'Send assistance request to Director'}).click();
    await expect(request).toBeHidden({timeout:15000});
    await expect(caregiver.getByText(/Director acknowledgment pending/)).toBeVisible({timeout:15000});

    await director.goto(BASE+'/Professional/Admin',{waitUntil:'domcontentloaded'});
    await director.getByPlaceholder('you@example.com').fill(ctx.directorEmail);
    await director.getByPlaceholder('Your password').fill(PASSWORD);
    await director.getByRole('button',{name:/sign in/i}).click();
    await expect(director.getByRole('heading',{name:'Director Quick Actions'})).toBeVisible({timeout:30000});
    await expect(director.getByRole('heading',{name:'Needs Your Attention'})).toBeVisible();
    await expect(director.getByRole('heading',{name:'Recent Staff Activity'})).toBeVisible();
    await expect(director.getByRole('heading',{name:'Live Caregiver Status'})).toBeVisible();
    await expect(director.getByRole('heading',{name:'Next 48 Hours Coverage'})).toBeVisible();
    await expect(director.getByRole('heading',{name:'Director Operational Command Center'})).toHaveCount(0);

    let assistance=director.getByRole('button',{name:/Caregiver needs assistance · open/});
    await expect(assistance).toBeVisible({timeout:30000});
    await assistance.click();
    let details=director.getByRole('dialog',{name:'Caregiver assistance — action required'});
    await details.getByRole('button',{name:'Acknowledge request'}).click();
    await expect(details).toBeHidden({timeout:15000});
    assistance=director.getByRole('button',{name:/Caregiver needs assistance · acknowledged/});
    await expect(assistance).toBeVisible({timeout:15000});
    await assistance.click();
    details=director.getByRole('dialog',{name:'Caregiver assistance — action required'});
    await details.getByRole('combobox',{name:'Contact method'}).selectOption('phone');
    await details.getByRole('textbox',{name:/Record the contact/}).fill(
      'Fictional phone contact with assigned caregiver confirmed.');
    await details.getByRole('button',{name:'Record contact with caregiver'}).click();
    await expect(details).toBeHidden({timeout:15000});
    assistance=director.getByRole('button',{name:/Caregiver needs assistance · in contact/});
    await expect(assistance).toBeVisible({timeout:15000});
    await assistance.click();
    details=director.getByRole('dialog',{name:'Caregiver assistance — action required'});
    await details.getByRole('textbox',{name:/Resolution notes/}).fill(
      'Fictional staff contact completed and requested assistance resolved.');
    await details.getByRole('button',{name:'Resolve request with audit note'}).click();
    await expect(details).toBeHidden({timeout:15000});
    await expect(director.getByRole('button',{name:/Caregiver needs assistance/})).toHaveCount(0);
    expect(sql("SELECT count(*) FROM hcn_caregiver_assistance_events e JOIN "+
      "hcn_caregiver_assistance_alerts a ON a.id=e.alert_id WHERE a.organization_id='"+
      ctx.orgId+"';")).toBe('4');
  } finally {
    await caregiver.close();
    await director.close();
    await cleanup(ctx);
  }
});
