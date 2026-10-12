'use client';

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { Button } from './button';
import { CuevoIcon, type CuevoIconName } from './icon';

export type IconButtonProps=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'|'aria-label'|'title'>&{label:string;icon:CuevoIconName};
function positionTooltip(button:HTMLButtonElement){
 const tooltip=button.querySelector<HTMLElement>('.cuevo-icon-button__tooltip');if(!tooltip)return;
 tooltip.style.setProperty('--cuevo-tooltip-offset','0px');
 const rect=tooltip.getBoundingClientRect(),viewport=button.ownerDocument.documentElement.clientWidth;
 const shift=rect.left<8?8-rect.left:rect.right>viewport-8?viewport-8-rect.right:0;
 tooltip.style.setProperty('--cuevo-tooltip-offset',`${shift}px`);
}
/** Compact native action; owner retains callback, pending state and localized meaning. */
export function IconButton({label,icon,className='',type='button',onFocus,onBlur,onMouseEnter,onMouseLeave,onKeyDown,...props}:IconButtonProps){
 const [dismissed,setDismissed]=useState(false);
 const tooltip=useRef<HTMLSpanElement>(null);
 useEffect(()=>{const guidance=tooltip.current;if(!guidance)return;const ownerDocument=guidance.ownerDocument;function dismiss(event:KeyboardEvent){const current=tooltip.current;if(event.key==='Escape'&&current&&ownerDocument.defaultView?.getComputedStyle(current).visibility==='visible')setDismissed(true);}ownerDocument.addEventListener('keydown',dismiss);return()=>ownerDocument.removeEventListener('keydown',dismiss);},[]);
 if(typeof label!=='string'||!label.trim())throw Error('A localized icon action label is required.');
 return <Button {...props} type={type} variant="quiet" className={`cuevo-icon-button ${className}`.trim()} aria-label={label} data-tooltip-dismissed={dismissed ? 'true' : undefined} onFocus={event=>{setDismissed(false);positionTooltip(event.currentTarget);onFocus?.(event);}} onBlur={onBlur} onMouseEnter={event=>{if(event.currentTarget.ownerDocument.activeElement!==event.currentTarget)setDismissed(false);positionTooltip(event.currentTarget);onMouseEnter?.(event);}} onMouseLeave={onMouseLeave} onKeyDown={event=>{if(event.key==='Escape')setDismissed(true);onKeyDown?.(event);}}>
  <CuevoIcon name={icon} size={22} aria-hidden="true"/>
  <span ref={tooltip} className="cuevo-icon-button__tooltip" aria-hidden="true" onPointerDown={event=>event.preventDefault()} onClick={event=>{event.preventDefault();event.stopPropagation();}}>{label}</span>
 </Button>;
}
