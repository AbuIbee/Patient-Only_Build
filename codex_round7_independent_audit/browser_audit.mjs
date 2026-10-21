/* eslint-disable */
import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('codex_round7_independent_audit');
const cfg=JSON.parse(fs.readFileSync(path.join(dir,'ephemeral_local_config.json'),'utf8'));
const records=[];
function result(id,condition,evidence){const row={id,assertion_met:!!condition,evidence};records.push(row);console.log(id,condition?'OBSERVED':'NOT ESTABLISHED',JSON.stringify(evidence).slice(0,260));fs.writeFileSync(path.join(dir,'browser_results.json'),JSON.stringify(records,null,2));}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/New_York'});
await context.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'?r.continue():r.abort();});
const p=await context.newPage();p.setDefaultTimeout(10000);
const errors=[];p.on('pageerror',e=>errors.push(e.message));
async function nav(name){await p.getByRole('button',{name,exact:true}).first().click();}
async function login(password=(cfg.users.caregiverA.password||cfg.test_password)){
 await p.goto('http://127.0.0.1:5187/');
 if(await p.getByPlaceholder('you@example.com').isVisible()){await p.getByPlaceholder('you@example.com').fill(cfg.users.caregiverA.email);await p.getByPlaceholder('Your password').fill(password);await p.getByRole('button',{name:/sign in/i}).click();await p.getByText('Codex Audit Org Alpha',{exact:true}).first().waitFor({timeout:15000});return;}
 await p.getByRole('button',{name:'Sign In',exact:true}).first().click();
 if(!await p.getByPlaceholder('you@example.com').isVisible())await p.getByRole('button',{name:'Sign In',exact:true}).first().click();
 await p.getByPlaceholder('you@example.com').fill(cfg.users.caregiverA.email);await p.getByPlaceholder('Your password').fill(password);
 await p.getByRole('button',{name:/sign in/i}).click();await p.getByText('Codex Audit Org Alpha',{exact:true}).first().waitFor({timeout:15000});
}
try{
 await login();result('UI-REAL-LOGIN',true,{org:'Alpha',realAuth:true,optimized:true});
 await p.getByText('Incomplete Documentation',{exact:true}).waitFor();
 const incomplete=p.getByText('Incomplete Documentation',{exact:true}).locator('../..');const incompleteText=await incomplete.innerText();
 result('UI-H14-CATEGORIES',!incompleteText.toLowerCase().includes('unfinished'),{text:incompleteText,missingUnfinishedCategory:true});
 await nav('My Schedule');await p.getByText('Today only',{exact:true}).waitFor();await p.waitForTimeout(300);
 const todayCount=await p.getByRole('main').locator('li').count();const todayText=await p.getByRole('main').innerText();
 await p.getByLabel('Today only').uncheck();await p.waitForTimeout(100);const allCount=await p.getByRole('main').locator('li').count();
 result('UI-H06-DATE-FILTER',todayCount===2&&allCount>todayCount,{todayCount,allCount,timezone:'America/New_York',includesUtcNextDayBoundary:todayText.includes('10:30')});
 result('UI-H06-ADDRESS-MISSING',!todayText.includes('123 Synthetic Avenue'),{addressVisible:todayText.includes('123 Synthetic Avenue'),endOrTimezoneLabelsVisible:todayText.includes('EDT')});
 await nav('Care Communications');await p.getByText('AUDIT urgent latest',{exact:true}).waitFor();
 const routine=p.getByText('Routine',{exact:true}).locator('..');const routineText=await routine.innerText();
 result('UI-INBOX-READ-FOLLOWUP-MISCLASSIFIED',routineText.includes('AUDIT Followup Thread'),{routineText,unresolvedReadFollowup:'AUDIT Followup Thread'});
 const search=p.getByPlaceholder('Search by patient, subject, or message…');await search.fill('urgent latest');
 result('UI-C06-LATEST-SEARCH',await p.getByRole('main').locator('li').count()===1,{rows:await p.getByRole('main').locator('li').count()});
 await search.fill('historical-only-needle');await p.getByText('No conversations match this search.',{exact:true}).waitFor();
 result('UI-C06-HISTORICAL-SEARCH-MISSING',true,{historicalMessageExists:true,searchResult:'no matches'});
 await nav('My Organization');await p.getByText('AUDIT Dementia Care Certificate',{exact:true}).waitFor();
 result('UI-O02-ROLE-CREDENTIAL',await p.getByText(/Role: Caregiver.*1 credential/).isVisible(),{credential:'AUDIT Dementia Care Certificate',role:'Caregiver'});
 const task=p.getByText('Recent task updates',{exact:true}).locator('..');
 result('UI-O07-ACTIVITY',await task.getByText('AUDIT completed task',{exact:true}).isVisible(),{taskList:await task.innerText(),recentVisitsVisible:await p.getByText('Recent visits',{exact:true}).isVisible(),notesAreCountOnly:true});
 const gray=p.getByText('Signed in as AuditcaregiverA Synthetic',{exact:true});
 const target=await gray.count()?gray:p.getByText(/Role: Caregiver.*1 credential/);
 const before=await target.evaluate(e=>getComputedStyle(e).color);await p.screenshot({path:path.join(dir,'contrast_before.png')});
 await p.getByText('High contrast',{exact:true}).locator('..').locator('input').check();
 const after=await target.evaluate(e=>getComputedStyle(e).color);const filter=await p.evaluate(()=>getComputedStyle(document.documentElement).filter);await p.screenshot({path:path.join(dir,'contrast_after.png')});
 result('UI-O09-EFFECTIVE-CONTRAST',before!==after&&filter.includes('contrast'),{before,after,filter});
 await nav('My Patients');await p.getByRole('button',{name:/AlphaPatient/}).first().click();await p.getByText('Patient Intake Information',{exact:true}).waitFor();
 const intake=p.getByText('Patient Intake Information',{exact:true}).locator('../..');const intakeText=await intake.innerText();
 result('UI-P07-POPULATED-INTAKE',intakeText.includes('AUDIT Intake Hospital')&&intakeText.includes('AUDIT medication 5mg daily'),{text:intakeText,emergencyEmailRendered:intakeText.includes('emergency@audit.invalid')});
 await p.getByRole('button',{name:'Medical',exact:true}).click();await p.getByText('Medical Conditions & Diagnoses',{exact:true}).waitFor();
 const medText=await p.getByRole('main').innerText();result('UI-P11-MOOD-HISTORY-UNREACHABLE',!medText.includes('AUDIT mood')&&await p.getByRole('button',{name:'Load more',exact:true}).count()===0,{seededMoods:15,moodHistoryVisible:medText.includes('AUDIT mood'),loadMoreButtons:await p.getByRole('button',{name:'Load more',exact:true}).count()});
 await nav('Settings & Account');await p.getByPlaceholder('New password',{exact:true}).fill('AuditR7Changed!9');await p.getByPlaceholder('Confirm new password').fill('AuditR7Changed!9');await p.getByRole('button',{name:'Change Password',exact:true}).click();await p.getByText('Password changed.',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Secure Logout',exact:true}).click();await context.clearCookies();await p.evaluate(()=>{localStorage.clear();sessionStorage.clear()});await login('AuditR7Changed!9');result('UI-O10-PASSWORD-RELOGIN',true,{realAuthPasswordChanged:true,reloginSucceeded:true,mfaSessionsNotImplemented:true});
 for(const width of [320,375,768,1024,1440,1920]){
  await p.setViewportSize({width,height:950});if(width<1024)await p.getByRole('button',{name:'Open navigation',exact:true}).click();
  const names=['Dashboard','My Patients','My Schedule','Care Plans & Tasks','Patient Health Records','Care Communications','Care Notes & Observations','Shift Handoffs','Alerts & Incidents','Visits & Time Records','My Care Team','Documents','My Organization','Settings & Account'];
  let visible=0;for(const name of names)if(await p.getByRole('button',{name,exact:true}).first().isVisible())visible++;
  result('UI-NAV-WIDTH-'+width,visible===14,{visibleDestinations:visible,width});if(width<1024)await p.getByRole('button',{name:'Close navigation',exact:true}).click();
 }
 result('UI-RUNTIME-ERRORS',errors.length===0,{errors});
}catch(e){result('UI-HARNESS-STOP',false,{message:e.message});process.exitCode=1;}finally{await browser.close();}
