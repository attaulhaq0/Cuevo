export type NavigationIntent = {view:'learning';source:'assessment'|'course';id:string}|{view:'academic';source:'marking'|'result';id:string}|{view:'improvement';source:'intervention';id:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseNavigationIntent(view:string|null,source:string|null,id:string|null):NavigationIntent|null{
 if(!id||!uuid.test(id))return null;
 if(view==='learning'&&(source==='assessment'||source==='course')||view==='academic'&&(source==='marking'||source==='result')||view==='improvement'&&source==='intervention')return{view,source,id}as NavigationIntent;
 return null;
}
export function navigationParameters(intent:NavigationIntent):URLSearchParams{return new URLSearchParams({view:intent.view,source:intent.source,id:intent.id});}
