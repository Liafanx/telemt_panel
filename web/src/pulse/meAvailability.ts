import type {Dict} from '../i18n';
import type {RuntimeTopic} from '../realtime/topics';
import type {TopicSnapshot} from '../realtime/types';
import {gatedStatus} from './sourceState';

export type MeAvailability = 'direct'|'fallback'|'unavailable'|'minimal_disabled'|'unsupported';

// A missing ME source is not a disabled diagnostics switch. Only fresh
// runtime gates can establish Direct/fallback; cached config is insufficient.
export function meAvailability(runtime:TopicSnapshot<RuntimeTopic>,available:boolean,reason?:string,minimal=false):MeAvailability|null {
  const gates=!runtime.stale&&!runtime.error?runtime.data?.gates:null;
  if(gates?.route_mode==='direct'&&gates.use_middle_proxy===false&&gates.reroute_active===false)return 'direct';
  if(gates?.route_mode==='direct'&&gates.reroute_active===true)return 'fallback';
  if(available)return null;
  if(gatedStatus({enabled:false,reason})==='unsupported')return 'unsupported';
  if(minimal&&reason==='feature_disabled')return 'minimal_disabled';
  return 'unavailable';
}

export function meAvailabilityText(state:MeAvailability,s:Dict,available=false){
  const t=s.pulse.meAvailability;
  return {title:t[state],label:state==='direct'?'Direct':state==='fallback'?'Fallback':t[state],description:state==='fallback'&&available?t.fallbackAvailableNote:t[`${state}Note`]};
}
