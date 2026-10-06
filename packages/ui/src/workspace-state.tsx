import { type ReactNode } from 'react';
import { CuevoIcon, type CuevoIconName } from './icon';

export type WorkspaceStateKind = 'empty' | 'loading' | 'unavailable' | 'denied' | 'unknown' | 'review';
/** Source meaning, copy, recovery and actions remain with the current owner. */
export function WorkspaceState({kind,icon,title,description,actions,children,headingLevel,role,className='',id}:{kind:WorkspaceStateKind;icon?:CuevoIconName;title?:ReactNode;description?:ReactNode;actions?:ReactNode;children?:ReactNode;headingLevel?:2|3|4;role?:'status'|'alert';className?:string;id?:string}) {
 const Heading=headingLevel===2?'h2':headingLevel===3?'h3':headingLevel===4?'h4':'strong';
 return <div id={id} className={`cuevo-workspace-state ${className}`.trim()} data-state={kind} role={role}>
  {icon?<span className="cuevo-workspace-state__icon" aria-hidden="true"><CuevoIcon name={icon} size={32}/></span>:null}
  <div className="cuevo-workspace-state__body">{title?<Heading className="cuevo-workspace-state__title">{title}</Heading>:null}{description?<div className="cuevo-workspace-state__description">{typeof description==='string'?<p>{description}</p>:description}</div>:null}{children}{actions?<div className="cuevo-workspace-state__actions">{actions}</div>:null}</div>
 </div>;
}
