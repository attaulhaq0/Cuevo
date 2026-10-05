import type { ButtonHTMLAttributes } from 'react';
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
export function IconButton({label,icon,className='',type='button',onFocus,onMouseEnter,...props}:IconButtonProps){
 if(typeof label!=='string'||!label.trim())throw Error('A localized icon action label is required.');
 return <Button {...props} type={type} variant="quiet" className={`cuevo-icon-button ${className}`.trim()} aria-label={label} title={label} onFocus={event=>{positionTooltip(event.currentTarget);onFocus?.(event);}} onMouseEnter={event=>{positionTooltip(event.currentTarget);onMouseEnter?.(event);}}>
  <CuevoIcon name={icon} size={22} aria-hidden="true"/>
  <span className="cuevo-icon-button__tooltip" aria-hidden="true">{label}</span>
 </Button>;
}
