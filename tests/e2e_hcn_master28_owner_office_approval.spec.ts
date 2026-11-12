// Browser-verified independent Owner approval path for Master #28.
// Disposable Supabase + fictional users; approval is deliberately not an office role grant.
import {test,expect} from '@playwright/test';
import {authSignUp,authDeleteUser,sql} from './integration/_runtime';
const URL=process.env.MMA_E2E_FRONTEND_BASE;
const READY=Boolean(URL && process.env.MMA_TEST_API_BASE && process.env.MMA_TEST_DB_CONTAINER);
const PW='OwnerReview28!Pass';
const q=(s:string)=> "'" + s.replace(/'/g,"''") + "'";

test('a distinct Organization Owner can review a Director office request, without immediate privilege escalation',async({browser})=>{
  test.skip(!READY,'Requires disposable backend and isolated frontend');
  const stamp=Date.now(),users:string[]=[];
  const ownerEmail='m28-owner-e2e-'+stamp+'@local.test';
  const dirEmail='m28-director-e2e-'+stamp+'@local.test';
  const ownerContext=await browser.newContext();
  const directorContext=await browser.newContext();
  const ownerPage=await ownerContext.newPage();
  const directorPage=await directorContext.newPage();
  let org='';
  try{
    const owner=await authSignUp(ownerEmail,PW);
    const director=await authSignUp(dirEmail,PW);
    users.push(owner,director);
    sql("UPDATE profiles SET must_change_password=false,provisioning_status='complete' WHERE id IN ("+
      users.map(q).join(',')+");");
    org=sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+
      q('M28 Owner Browser '+stamp)+",'integrated_care',"+q(owner)+") RETURNING id;");
    sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) "+
      "VALUES("+q(org)+",10,10,399,'active');"+
      "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) "+
      "VALUES("+q(org)+","+q(director)+",'director','active');");

    await directorPage.goto(URL+'/Professional');
    await directorPage.getByPlaceholder('you@example.com').fill(dirEmail);
    await directorPage.getByPlaceholder('Your password').fill(PW);
    await directorPage.getByRole('button',{name:/sign in/i}).click();
    await directorPage.getByRole('button',{name:'Organization Settings',exact:true}).click();
    await directorPage.getByRole('tab',{name:'Office Ownership'}).click();
    await directorPage.getByRole('textbox',{name:'Reason for office access'}).fill('Need an additional caregiver office for test coverage');
    await directorPage.getByRole('button',{name:'Request Owner approval'}).click();
    await expect(directorPage.getByText(/Office access request submitted/)).toBeVisible();
    expect(sql("SELECT status FROM hcn_director_office_requests WHERE organization_id="+q(org)+";")).toBe('pending');

    // Owner has no Director membership; owner route must be independent.
    await ownerPage.goto(URL+'/Professional/OrganizationOwner');
    await ownerPage.getByPlaceholder('you@example.com').fill(ownerEmail);
    await ownerPage.getByPlaceholder('Your password').fill(PW);
    await ownerPage.getByRole('button',{name:/sign in/i}).click();
    await expect(ownerPage.getByRole('heading',{name:/Haneen Care Network — Organization Owner/})).toBeVisible({timeout:25000});
    await expect(ownerPage.getByText('Need an additional caregiver office for test coverage')).toBeVisible();
    ownerPage.once('dialog',dialog=>dialog.accept('Approved for test, but effective role grant remains gated'));
    await ownerPage.getByRole('button',{name:'Approve request'}).click();
    await expect(ownerPage.getByText('approved',{exact:true})).toBeVisible({timeout:15000});
    expect(sql("SELECT status FROM hcn_director_office_requests WHERE organization_id="+q(org)+";")).toBe('approved');
    expect(sql("SELECT count(*) FROM organization_memberships WHERE organization_id="+q(org)+
      " AND user_id="+q(director)+" AND org_role='caregiver';")).toBe('0');
  }finally{
    await ownerContext.close();await directorContext.close();
    if(org)sql("DELETE FROM account_management_audit WHERE organization_id="+q(org)+";"+
      "DELETE FROM hcn_director_office_requests WHERE organization_id="+q(org)+";"+
      "DELETE FROM organization_memberships WHERE organization_id="+q(org)+";"+
      "DELETE FROM organization_licenses WHERE organization_id="+q(org)+";"+
      "DELETE FROM organizations WHERE id="+q(org)+";");
    for(const id of users)await authDeleteUser(id);
  }
});
