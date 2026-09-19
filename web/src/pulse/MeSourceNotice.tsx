import {useStrings} from '../i18n';
import {meAvailabilityText,type MeAvailability} from './meAvailability';

export function MeSourceNotice({state,available=false}:{state:MeAvailability;available?:boolean}){
  const text=meAvailabilityText(state,useStrings(),available);
  return <div className="rounded-lg bg-bg px-3.5 py-3" data-me-availability={state}>
    <p className={`text-meta font-semibold ${state==='fallback'?'text-warn':'text-text-muted'}`}>{text.title}</p>
    <p className="mt-1 text-meta leading-relaxed text-text-muted">{text.description}</p>
  </div>;
}
