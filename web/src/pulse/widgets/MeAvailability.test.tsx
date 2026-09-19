import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {type ReactNode} from 'react';
import {setLocalePreference} from '../../i18n';
import {runtimeSnapshot,upstreamsSnapshot} from '../__fixtures__';
import type {RuntimeTopic,UpstreamsTopic} from '../../realtime/topics';
import type {TopicSnapshot} from '../../realtime/types';
import {MePoolWidget} from './MePoolWidget';
import {DcWidget} from './DcWidget';
import {DcPage} from '../diag/DcPage';
import {MePage} from '../diag/MePage';

const feed=vi.hoisted(()=>({topics:{} as Record<string,unknown>}));
vi.mock('../../realtime',()=>({useSnapshot:(topic:string)=>feed.topics[topic]}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:ReactNode})=><a>{children}</a>,useNavigate:()=>()=>{}}));
vi.mock('../sourceState',async importOriginal=>({...await importOriginal<typeof import('../sourceState')>(),useDetailSources:()=>({status:'disabled',freshnessMs:null})}));

function fixture(mode:'direct'|'middle'|'fallback'|'unknown',reason='source_unavailable',stale=false){
 const runtime:RuntimeTopic={...runtimeSnapshot,gates:mode==='unknown'?null:{...runtimeSnapshot.gates!,route_mode:mode==='middle'?'middle':'direct',use_middle_proxy:mode!=='direct',reroute_active:mode==='fallback'},me_pool_state:{enabled:false,reason}};
 const upstreams:UpstreamsTopic={...upstreamsSnapshot,dcs:{...upstreamsSnapshot.dcs!,middle_proxy_enabled:false,reason,dcs:[]}};
 const snap=<T,>(data:T):TopicSnapshot<T>=>({data,ts:1756000000,stale,error:null});
 feed.topics={runtime:snap(runtime),upstreams:snap(upstreams)};
}
afterEach(()=>setLocalePreference('ru'));
describe('ME-backed overview cards',()=>{
 it.each([['ME',MePage],['DC',DcPage]] as const)('%s detail explains Direct rather than an unavailable ME source',(_name,Page)=>{
   fixture('direct');const html=renderToStaticMarkup(<Page/>);expect(html).toContain('data-me-availability="direct"');expect(html).not.toContain('Выключено');expect(html).not.toContain('data-testid="me-readiness"');expect(html).not.toContain('data-testid="me-composition"');
 });
 it.each([['ME',MePoolWidget],['DC',DcWidget]] as const)('%s keeps available diagnostics but identifies active fallback',(_name,Card)=>{
   fixture('fallback');const runtime=feed.topics['runtime'] as TopicSnapshot<RuntimeTopic>;runtime.data!.me_pool_state=runtimeSnapshot.me_pool_state;
   (feed.topics['upstreams'] as TopicSnapshot<UpstreamsTopic>).data!.dcs=upstreamsSnapshot.dcs;
   const html=renderToStaticMarkup(<Card/>);expect(html).toContain('data-me-availability="fallback"');expect(html).toContain(_name==='DC'?'data-testid="dc-board"':'data-testid="me-quality"');
 });
 it('does not infer active fallback from stale gates when pool data remains available',()=>{
   fixture('fallback','source_unavailable',true);(feed.topics['runtime'] as TopicSnapshot<RuntimeTopic>).data!.me_pool_state=runtimeSnapshot.me_pool_state;
   const html=renderToStaticMarkup(<MePoolWidget/>);expect(html).not.toMatch(/fallback/i);expect(html).toContain('Данные устарели');
 });
 it('does not print a cached Direct route as current in ME details',()=>{
   fixture('direct','source_unavailable',true);(feed.topics['runtime'] as TopicSnapshot<RuntimeTopic>).data!.me_pool_state=runtimeSnapshot.me_pool_state;
   const html=renderToStaticMarkup(<MePage/>);expect(html).not.toContain('route_mode: direct');expect(html).toContain('Текущий режим неизвестен');
 });
 it.each([['ME',MePoolWidget],['DC',DcWidget]] as const)('%s identifies direct-only operation without configuration advice',(_name,Card)=>{
   fixture('direct');const html=renderToStaticMarkup(<Card/>);expect(html).toContain('Direct');expect(html).not.toContain('source_unavailable');expect(html).not.toContain('runtime_edge_enabled');expect(html).not.toContain('Как включить');
 });
 it.each([['ME',MePoolWidget],['DC',DcWidget]] as const)('%s distinguishes fallback from configured Direct',(_name,Card)=>{
   fixture('fallback');const html=renderToStaticMarkup(<Card/>);expect(html).toContain('Fallback');expect(html).not.toContain('Как включить');
 });
 it.each(['unknown','middle'] as const)('does not treat %s with an unavailable pool as a disabled flag',mode=>{
   fixture(mode);const html=renderToStaticMarkup(<MePoolWidget/>);expect(html).not.toContain('runtime_edge_enabled');expect(html).not.toContain('Как включить');expect(html).toContain('недоступ');
 });
 it('preserves an actual disabled minimal diagnostics hint for DCs',()=>{
   fixture('middle','feature_disabled');const html=renderToStaticMarkup(<DcWidget/>);expect(html).toContain('minimal_runtime_enabled');expect(html).not.toContain('runtime_edge_enabled');
 });
 it('does not present cached Direct as the current mode',()=>{
   fixture('direct','source_unavailable',true);const html=renderToStaticMarkup(<MePoolWidget/>);expect(html).not.toContain('runtime_edge_enabled');expect(html).toContain('недоступ');
 });
});
