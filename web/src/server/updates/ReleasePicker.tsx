import {useState} from 'react';
import {useStrings} from '../../i18n';
import {Button} from '../../ui/Button';
import {Sheet} from '../../ui/Sheet';
import type {ReleaseItem} from './releases.helpers';
import type {TargetName} from './UpdateTarget';
import './releasePicker.css';

interface PickerProps {
 target:TargetName;
 current:string;
 releases:ReleaseItem[];
 selected:string|null;
 blocked:boolean;
 error:boolean;
 onChoose:(release:ReleaseItem)=>void;
 onClose:()=>void;
}

export function ReleasePicker({target,current,releases,selected,blocked,error,onChoose,onClose}:PickerProps){
 const s=useStrings(),t=s.releasePicker;
 const [draft,setDraft]=useState(selected),[pre,setPre]=useState(()=>!!releases.find(r=>r.version===selected)?.prerelease);
 const visible=releases.filter(r=>pre||!r.prerelease),choice=visible.find(r=>r.version===draft);
 const date=(value:string)=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(s.locale,{day:'numeric',month:'short',year:'numeric'}).format(new Date(value)):'—';
 return <Sheet open onClose={onClose} title={t.choose} eyebrow={`${s.server.updates.targetNames[target]} · ${t.installed} ${current||'—'}`} className="uv-sheet" bodyClassName="uv-sheet-body">
   <div className="uv-scroll"><p className="uv-note">{t.intro}</p><label className="uv-pre-filter"><input type="checkbox" checked={pre} disabled={blocked||error} onChange={e=>{setPre(e.target.checked);if(!e.target.checked&&choice?.prerelease)setDraft(null);}}/>{t.preFilter}</label>
     {error?<p className="uv-warning" role="alert">{t.catalogError}</p>:<fieldset className="uv-options" disabled={blocked}><legend className="sr-only">{t.choose}</legend>
       {([true,false] as const).map(newer=>{
         const items=visible.filter(r=>Boolean(r.newer)===newer);return items.length?<section key={String(newer)}><h3>{newer?t.newer:t.older}</h3>{items.map(release=><label key={release.version} className="uv-option"><input type="radio" name={`release-${target}`} checked={release.version===draft} onChange={()=>setDraft(release.version)}/><span className="uv-option-info"><span><strong>{release.version}</strong>{release.prerelease&&<b className="uv-prerelease">{t.pre}</b>}</span><small>{date(release.published_at)} · {release.prerelease?t.preRelease:t.stable}</small></span><span className={`uv-direction ${newer?'':'older'}`}>{newer?'↑':'↓'} {newer?t.update:t.downgrade}</span></label>)}</section>:null;
       })}
       {!visible.length&&<p className="uv-note">{t.emptyFilter}</p>}
     </fieldset>}
     {blocked&&<p role="status" className="uv-warning">{t.busy}</p>}
     <p className="uv-note uv-limit">{target==='panel'?t.panelLine:t.olderNote}</p>
   </div>
   <footer className="uv-footer"><span><small>{t.selected}</small><strong>{choice?.version??'—'}</strong></span><div><Button variant="secondary" onClick={onClose}>{s.common.cancel}</Button><Button disabled={!choice||blocked||error} onClick={()=>{if(choice&&!blocked&&!error)onChoose(choice);}}>{t.select}</Button></div></footer>
 </Sheet>;
}

export function ReleaseConfirmation({target,current,release,blocked,changed,pending,error,onClose,onConfirm}:{target:TargetName;current:string;release:ReleaseItem;blocked:boolean;changed:boolean;pending:boolean;error:string|null;onClose:()=>void;onConfirm:()=>void}){
 const s=useStrings(),t=s.releasePicker,[consent,setConsent]=useState(false),older=!release.newer;
 return <Sheet open onClose={()=>{if(!pending)onClose();}} title={older?t.confirmDowngrade:t.confirmUpdate} eyebrow={s.server.updates.targetNames[target]} className="uv-sheet" bodyClassName="uv-sheet-body">
   <div className="uv-scroll">
     <div className={`uv-flow ${older?'older':''}`}><div><small>{t.now}</small><strong>{current||'—'}</strong></div><span aria-hidden="true">→</span><div><small>{t.after}</small><strong>{release.version}</strong></div></div>
     {release.prerelease&&<div className="uv-warning"><strong>{t.preRelease}</strong><p>{t.preWarning}</p></div>}
     {older&&<><div className="uv-warning"><strong>{t.downgradeTitle}</strong><p>{t.downgradeWarning}</p></div><label className="uv-consent"><input type="checkbox" checked={consent} disabled={pending} onChange={e=>setConsent(e.target.checked)}/><span>{t.consent}</span></label></>}
     <p className="uv-note">{target==='telemt'?t.telemtRestart:t.panelRestart}</p><p className="uv-note">{t.backupNote}</p>
     {changed&&<p className="uv-warning" role="alert">{t.changed}</p>}{blocked&&!pending&&<p className="uv-warning" role="status">{t.busy}</p>}{error&&<p className="uv-warning" role="alert">{error}</p>}
   </div>
   <footer className="uv-footer"><span className="uv-note">{older?t.downgrade:t.update}</span><div><Button variant="secondary" disabled={pending} onClick={onClose}>{s.common.cancel}</Button><Button className={older?'uv-downgrade-button':''} disabled={pending||blocked||changed||older&&!consent||!current} onClick={onConfirm}>{pending?s.common.loading:older?(target==='telemt'?t.rollbackTelemt:t.rollbackPanel):(target==='telemt'?t.confirmTelemt:t.confirmPanel)}</Button></div></footer>
 </Sheet>;
}
