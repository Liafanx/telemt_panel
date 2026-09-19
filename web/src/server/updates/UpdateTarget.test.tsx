import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,expect,it} from 'vitest';
import {UpdateTarget,type UpdateTargetProps} from './UpdateTarget';

let root:Root|undefined,container:HTMLDivElement,client:QueryClient,props:UpdateTargetProps;
const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.replace(/[→⌄]/g,'').trim()===name)!;
async function click(name:string){await act(async()=>button(name).click());}
async function render(){await act(async()=>root!.render(<QueryClientProvider client={client}><UpdateTarget {...props}/></QueryClientProvider>));}
async function setup(){
 client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});container=document.createElement('div');document.body.append(container);root=createRoot(container);
 props={target:'panel',data:{target:'panel',current_version:'1.0.0',releases:[{version:'1.0.1',published_at:'2026-09-19T00:00:00Z',prerelease:false,newer:true}]},lockHeld:false,hostCaps:{self_update:true,restart_telemt:true,restart_panel:true,log_tail:true,log_stream:true},manualCommands:undefined,sseEvent:null,streamFallback:false,onApplied:()=>{}};
 await render();await click('Выбрать версию');await act(async()=>document.querySelector<HTMLInputElement>('input[type=radio]')!.click());await click('Выбрать');await click('Продолжить');
}
afterEach(()=>{if(root)act(()=>root!.unmount());container?.remove();client?.clear();root=undefined;});

describe('release confirmation stays bound to what the operator reviewed',()=>{
 it('blocks a changed installed version',async()=>{await setup();props={...props,data:{...props.data,current_version:'1.0.2'}};await render();expect(button('Обновить панель').disabled).toBe(true);expect(document.body.textContent).toContain('Выберите версию заново');});
 it('blocks a removed release',async()=>{await setup();props={...props,data:{...props.data,releases:[]}};await render();expect(button('Обновить панель').disabled).toBe(true);});
 it('blocks a newly held lock',async()=>{await setup();props={...props,lockHeld:true};await render();expect(button('Обновить панель').disabled).toBe(true);});
 it('requires a new confirmation if the release becomes a prerelease',async()=>{await setup();props={...props,data:{...props.data,releases:props.data.releases.map(r=>({...r,prerelease:true}))}};await render();expect(button('Обновить панель').disabled).toBe(true);});
});
