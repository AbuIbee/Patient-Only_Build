const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {chromium}=require('playwright');
const origin=process.env.HCN_LOCAL_UI_URL,base=process.env.MMA_TEST_API_BASE;
for(const url of [origin,base])if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||''))throw Error('Local-only browser test requires explicit loopback URLs');
const anon=process.env.HCN_LOCAL_ANON_KEY,service=process.env.HCN_LOCAL_SERVICE_KEY;
if(!anon||!service)throw Error('Local CLI credentials missing');
const email=`hcn-ui-${crypto.randomUUID()}@example.invalid`,password=crypto.randomBytes(24).toString('hex');
const results=[];let browser,userId,phase='fixture creation';
async function check(name,fn){phase=name;await fn();results.push({test:name,status:'PASS'});}
(async()=>{
 const created=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{role:'patient',first_name:'Synthetic',last_name:'UI'}})});
 assert.ok([200,201].includes(created.status),`Local Auth fixture response ${created.status}`);userId=(await created.json()).id;
 browser=await chromium.launch();const context=await browser.newContext();
 await context.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'&&!u.pathname.includes('hcn-ai-assistants')?r.continue():r.abort();});
 const page=await context.newPage();
 await page.goto(origin+'/Professional',{waitUntil:'networkidle'});
 console.log(JSON.stringify({publicPreflight:{body:(await page.locator('body').innerText()).slice(0,600),
   controls:await page.locator('input').evaluateAll(xs=>xs.map(x=>({type:x.type,id:x.id,labels:[...(x.labels||[])].map(l=>l.textContent)})))}}));
 const emailInput=page.getByRole('textbox',{name:'Email Address',exact:true});
 const passwordInput=page.getByLabel(/^Password\s*\*?$/);
 await check('email and password have correct accessible names',async()=>{assert.equal(await emailInput.count(),1);assert.equal(await passwordInput.count(),1);});
 await check('label click focuses the corresponding input',async()=>{await page.locator('label').filter({hasText:'Email Address'}).click();assert.equal(await emailInput.evaluate(e=>e===document.activeElement),true);});
 await check('keyboard focus proceeds from email to password with visible focus ring',async()=>{await page.keyboard.press('Tab');assert.equal(await passwordInput.evaluate(e=>e===document.activeElement),true);assert.notEqual(await passwordInput.evaluate(e=>getComputedStyle(e).boxShadow),'none');});
 await check('empty submission associates and announces validation errors',async()=>{
   await page.getByRole('button',{name:'Sign In',exact:true}).click();
   assert.equal(await emailInput.getAttribute('aria-invalid'),'true');
   const errorId=await emailInput.getAttribute('aria-describedby');assert.ok(errorId);
   const error=page.locator(`[id="${errorId}"]`);assert.equal(await error.getAttribute('role'),'alert');assert.ok((await error.innerText()).trim());
 });
 await check('password visibility toggle is named and preserves entered value',async()=>{
   await passwordInput.fill(password);await page.getByRole('button',{name:'Show password',exact:true}).click();
   assert.equal(await passwordInput.getAttribute('type'),'text');await page.getByRole('button',{name:'Hide password',exact:true}).click();
   assert.equal(await passwordInput.getAttribute('type'),'password');assert.equal(await passwordInput.inputValue(),password);
 });
 await check('real disposable Auth sign-in succeeds without changing the form contract',async()=>{
   await emailInput.fill(email);await page.getByRole('button',{name:'Sign In',exact:true}).click();
   await page.waitForFunction(()=>Object.keys(sessionStorage).some(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')),{},{timeout:20000});
   // Verify user binding locally without returning session tokens into the log.
   assert.equal(await page.evaluate(id=>{const key=Object.keys(sessionStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));return JSON.parse(sessionStorage.getItem(key)||'{}').user?.id===id;},userId),true);
 });
 for(const [width,height] of [[1440,900],[390,844]]){
   const c=await browser.newContext({viewport:{width,height}}),p=await c.newPage();
   await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await p.goto(origin+'/Professional',{waitUntil:'networkidle'});
   await check(`sign-in fits viewport ${width}x${height}`,async()=>assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false));
   if(process.env.HCN_LOCAL_EVIDENCE_DIR)await p.screenshot({path:process.env.HCN_LOCAL_EVIDENCE_DIR+`/signin-${width}.png`,fullPage:true});await c.close();
 }
 console.log(JSON.stringify({results,tests:results.length,failed:0}));
})().catch(e=>{console.error(JSON.stringify({phase,error:e.message.split('\n')[0],passed:results.length}));process.exitCode=1;}).finally(async()=>{
 if(browser)await browser.close();
 if(userId)await fetch(base+'/auth/v1/admin/users/'+userId,{method:'DELETE',headers:{apikey:service,Authorization:`Bearer ${service}`}});
});
