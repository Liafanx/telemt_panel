import {test,expect} from './fixtures';

for(const [mode,available] of [['direct',false],['fallback',false],['fallback',true]] as const){
 test(`ME sources reflect ${mode} with available=${available} across overview, hub and details`,async({page,login},testInfo)=>{
   await login();
   await page.route('**/api/events?*',async route=>{
     const snapshot=await(await page.request.get('/api/snapshot?topics=runtime,upstreams,stats')).json();
     snapshot.runtime.gates={...snapshot.runtime.gates,use_middle_proxy:mode!=='direct',route_mode:'direct',reroute_active:mode==='fallback'};
     if(!available){
       snapshot.runtime.me_pool_state={enabled:false,reason:'source_unavailable'};
       snapshot.runtime.me_quality={enabled:false,reason:'source_unavailable'};
       snapshot.upstreams.dcs={...snapshot.upstreams.dcs,middle_proxy_enabled:false,reason:'source_unavailable',dcs:[]};
       snapshot.upstreams.me_writers={...snapshot.upstreams.me_writers,middle_proxy_enabled:false,reason:'source_unavailable',writers:[]};
     }
     const ts=Math.floor(Date.now()/1000);
     await route.fulfill({contentType:'text/event-stream',body:'retry: 60000\n\n'+Object.entries(snapshot).map(([topic,v])=>`event: ${topic}\ndata: ${JSON.stringify({ts,v})}\n\n`).join('')});
   });
   const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
   for(const width of [390,1280]){
     await page.setViewportSize({width,height:900});
     for(const url of ['/overview','/pulse','/pulse/diag/dc','/pulse/diag/me']){
       await page.goto(url);const notices=page.locator(`[data-me-availability="${mode}"]`);await expect(notices.first()).toBeVisible();
       await expect(notices).toHaveCount(url==='/overview'||url==='/pulse'?2:1);
       if(available&&url==='/overview')await expect(page.getByTestId('dc-board')).toBeVisible();
       if(mode==='direct'&&url==='/pulse/diag/me')await expect(page.getByTestId('me-readiness')).toHaveCount(0);
       expect(await notices.first().innerText()).not.toContain('Как включить');
       expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
       await page.screenshot({path:testInfo.outputPath(`${mode}-${url.split('/').pop()}-${width}.png`)});
     }
   }
   expect(errors).toEqual([]);
 });
}
