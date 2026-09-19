import {Link,useNavigate} from "@tanstack/react-router";
import {useContext,useState} from "react";
import {useStrings} from "../i18n";
import {PeopleContext} from "./PeopleContext";
import {UserFormSheet} from "./UserFormSheet";
import {useUserFormBlocker} from "./useUserFormBlocker";
import {PageHeader} from "../ui/PageHeader";
import {IconChevronLeft} from "../ui/icons";

export function NewUserPage() {
  const s=useStrings(),access=useContext(PeopleContext),navigate=useNavigate();
  const [created,setCreated]=useState<string|null>(null);
  const {setDirty,confirmation}=useUserFormBlocker();
  return <div className="user-detail-page"><PageHeader title={s.people.workspace.newUser} back={<Link to="/people" aria-label={s.people.workspace.back}><IconChevronLeft aria-hidden="true"/>{s.people.title}</Link>}/>
    <UserFormSheet inline open mode="create" disabled={access.readOnly} onDirtyChange={setDirty} onSaved={username=>{setCreated(username);setDirty(false);}} onClose={()=>{if(created)void navigate({to:"/people/$username",params:{username:created}});else void navigate({to:"/people"});}} onConfigureWeb={username=>void navigate({to:"/people/$username",params:{username},search:{tab:"access"}})}/>
    {confirmation}
  </div>;
}
