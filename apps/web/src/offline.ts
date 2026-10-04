import { api } from './api';
export type QueuedAction={id:string;path:string;method:'POST'|'PUT'|'DELETE';body:any;createdAt:number};
type ReplayFailureHandler=(a:QueuedAction,e:any)=>void;
const KEY='suivi_outbox';
const read=():QueuedAction[]=>{try{return JSON.parse(localStorage.getItem(KEY)??'[]')}catch{return[]}};
const write=(v:QueuedAction[])=>localStorage.setItem(KEY,JSON.stringify(v));
let activeFlush:Promise<number>|null=null;
export const outboxCount=()=>read().length;
export function queueAction(path:string,method:QueuedAction['method'],body:any){const q=read();const id=crypto.randomUUID();q.push({id,path,method,body,createdAt:Date.now()});write(q);return id;}
export function removeQueuedAction(id:string){write(read().filter(a=>a.id!==id));}
export async function flushQueuedActions(send:(a:QueuedAction)=>Promise<unknown>, onFailure?:ReplayFailureHandler){
  const q=read();
  const keep:QueuedAction[]=[];
  for(let i=0;i<q.length;i++){
    const a=q[i];
    try{await send(a);}
    catch(e:any){
      keep.push(a,...q.slice(i+1));
      onFailure?.(a,e);
      break;
    }
  }
  write(keep);
  return keep.length;
}
export async function flushOutbox(onFailure?:ReplayFailureHandler){
  if(activeFlush)return activeFlush;
  activeFlush=flushQueuedActions(a=>api(a.path,{method:a.method,body:JSON.stringify(a.body)}),onFailure)
    .finally(()=>{activeFlush=null});
  return activeFlush;
}
