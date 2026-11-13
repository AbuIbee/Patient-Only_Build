// Master #28 two real signed-in users. Disposable, synthetic only.
import {test,expect} from '@playwright/test';
import {authSignUp,authDeleteUser,sql} from './integration/_runtime';
const BASE=process.env.MMA_E2E_FRONTEND_BASE;
const READY=Boolean(BASE&&process.env.MMA_TEST_DB_CONTAINER&&process.env.MMA_TEST_API_BASE);
const PW='HcnOffice28!Browser';
const q=(s:string)=>"'"+s.replace(/'/g,"''")+"'";

test('Owner independently approves caregiver office; patient scoped, then revoked',async({browser})=>{
  test.skip(!READY,'Isolated Supabase and frontend required');
  test.setTimeout(150_000);
  const stamp=Date.now();
  const emails=['owner','director'].map(r=>'m28-office-'+r+'-'+stamp+'@local.test');
  const users:string[]=[];let org='',patient='';
  const ownerContext=await browser.newContext(),directorContext=await browser.newContext();
  const ownerPage=await ownerContext.newPage(),directorPage=await directorContext.newPage();
  try{
    for(const e of emails)users.push(await authSignUp(e,PW));
    sql("UPDATE profiles SET must_change_password=false,provisioning_status='complete' WHERE id IN ("+users.map(q).join(',')+");");
    org=sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+q('Owner E2E '+stamp)+",'integrated_care',"+q(users[0])+") RETURNING id;");
    patient=sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('Synthetic','Patient','Synthetic Office Patient','1 Fictional Ave','Home') RETURNING id;");
    sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number,license_tier_code,specialist_slot_count) VALUES("+
      q(org)+",10,10,399,'active',"+q('M28-OWN-E2E-'+stamp)+",'essential',0);"+
      "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES("+q(org)+","+q(users[1])+",'director','active');"+
      "INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES("+q(org)+","+q(patient)+",'active',"+q(users[0])+");");
    await directorPage.goto(BASE+'/Professional/Admin');
    await directorPage.getByPlaceholder('you@example.com').fill(emails[1]);
    await directorPage.getByPlaceholder('Your password').fill(PW);
    await directorPage.getByRole('button',{name:/sign in/i}).click();
    const nav=directorPage.getByRole('navigation',{name:'ADMIN OFFICE navigation'});
    await expect(nav.getByRole('button',{name:'Organization Settings'})).toBeVisible({timeout:25000});
    await nav.getByRole('button',{name:'Organization Settings'}).click();
    await directorPage.getByRole('tab',{name:'Office Ownership'}).click();
    const panel=directorPage.getByRole('region',{name:'Office Ownership'});
    await panel.getByRole('combobox',{name:'Requested office'}).selectOption('caregiver');
    await panel.getByRole('textbox',{name:'Reason for office access'}).fill('Serve as backup caregiver for an assigned patient');
    await panel.getByRole('button',{name:'Request Owner approval'}).click();
    await expect(panel.getByText('pending',{exact:true})).toBeVisible({timeout:15000});

    await ownerPage.goto(BASE+'/Professional/OrganizationOwner');
    await ownerPage.getByPlaceholder('you@example.com').fill(emails[0]);
    await ownerPage.getByPlaceholder('Your password').fill(PW);
    await ownerPage.getByRole('button',{name:/sign in/i}).click();
    await expect(ownerPage.getByRole('heading',{name:/Organization Owner/})).toBeVisible({timeout:25000});
    const review=ownerPage.getByRole('region',{name:'Office access requests for Owner review'});
    await expect(review.getByText('Serve as backup caregiver for an assigned patient')).toBeVisible({timeout:15000});
    ownerPage.once('dialog',d=>d.accept('Synthetic caregiver backup access independently verified'));
    await review.getByRole('button',{name:'Approve request'}).click();
    await expect(review.getByText(/Office access active/)).toBeVisible({timeout:15000});

    // Assign the newly approved secondary caregiver through the real
    // Director staff management UI, not by bypassing the visible controls.
    await directorPage.reload();
    const navAfterApproval=directorPage.getByRole('navigation',{name:'ADMIN OFFICE navigation'});
    await navAfterApproval.getByRole('button',{name:'Staff Management'}).click();
    const assignmentCard=directorPage.getByRole('heading',{name:'Staff-to-Patient Assignments'}).locator('xpath=../..');
    await expect(assignmentCard.locator('select').filter({hasText:'Select staff member…'})
      .locator('option').filter({hasText:'Caregiver'})).toHaveCount(1);
    await assignmentCard.locator('select').filter({hasText:'Select staff member…'}).selectOption(users[1]);
    await assignmentCard.locator('select').filter({hasText:'Select covered patient…'}).selectOption(patient);
    await assignmentCard.getByRole('button',{name:'Assign',exact:true}).click();
    // The label exists in both the select option and visible assignment row.
    await expect(assignmentCard.locator('p.text-sm.text-ent-ink').filter({hasText:'Synthetic Office Patient'})).toBeVisible({timeout:15000});
    expect(sql('SELECT count(*) FROM staff_patient_assignments WHERE organization_id='+q(org)+
      ' AND patient_id='+q(patient)+' AND user_id='+q(users[1])+
      " AND org_role='caregiver' AND is_active=true;")).toBe('1');
    await directorPage.reload();
    const caregiver=directorPage.getByRole('button',{name:/Enterprise Caregiver/});
    await expect(caregiver).toBeVisible({timeout:25000});
    await caregiver.click();
    await expect(directorPage).toHaveURL(/\/Professional\/Caregiver$/i);
    await expect(directorPage.getByText('Synthetic Office Patient')).toBeVisible({timeout:25000});

    ownerPage.once('dialog',d=>d.accept('Synthetic test complete; revoke caregiver office now'));
    await review.getByRole('button',{name:'Revoke office access'}).click();
    await expect(review.getByText(/Office access inactive or revoked/)).toBeVisible({timeout:15000});
    await directorPage.reload();
    await expect(directorPage.getByRole('button',{name:/Enterprise Caregiver/})).toHaveCount(0);
    expect(sql("SELECT org_role FROM organization_memberships WHERE organization_id="+q(org)+
      " AND user_id="+q(users[1])+";")).toBe('director');
  }finally{
    await ownerContext.close().catch(()=>{});
    await directorContext.close().catch(()=>{});
    if(org)sql("DELETE FROM account_management_audit WHERE organization_id="+q(org)+";"+
      "DELETE FROM staff_patient_assignments WHERE organization_id="+q(org)+";"+
      "DELETE FROM hcn_director_office_grants WHERE organization_id="+q(org)+";"+
      "DELETE FROM hcn_director_office_requests WHERE organization_id="+q(org)+";"+
      "DELETE FROM covered_patient_memberships WHERE organization_id="+q(org)+";"+
      "DELETE FROM organization_memberships WHERE organization_id="+q(org)+";"+
      "DELETE FROM organization_licenses WHERE organization_id="+q(org)+";"+
      "DELETE FROM organizations WHERE id="+q(org)+";");
    if(patient)sql("DELETE FROM patients WHERE id="+q(patient)+";");
    for(const id of users)await authDeleteUser(id);
  }
});
