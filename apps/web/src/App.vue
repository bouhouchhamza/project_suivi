<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { api, getToken, setToken } from './api';
import { flushOutbox, outboxCount, queueAction, removeQueuedAction, type QueuedAction } from './offline';
import type { Manager, Priority, Project, User } from './types';
import LoginView from './components/LoginView.vue';
import UnauthorizedView from './components/UnauthorizedView.vue';
import TopBar from './components/TopBar.vue';
import StatusBanner from './components/StatusBanner.vue';
import FilterBar from './components/FilterBar.vue';
import ProjectTable from './components/ProjectTable.vue';
import ProjectPanel from './components/ProjectPanel.vue';
import ConflictDialog from './components/ConflictDialog.vue';
import ImportDialog from './components/ImportDialog.vue';
import UsersAdmin from './components/UsersAdmin.vue';

type ConflictState={
  server:Project;
  action:{path:string;method:'PUT'|'DELETE';body:any};
  queuedId?:string;
};

const user=ref<User|null>(null);
const projects=ref<Project[]>([]);
const managers=ref<Manager[]>([]);
const browserOnline=ref(navigator.onLine);
const pendingCount=ref(outboxCount());
const socketConnected=ref(false);
const selected=ref<Project|null>(null);
const panel=ref(false);
const importOpen=ref(false);
const usersOpen=ref(false);
const conflict=ref<ConflictState|null>(null);
const projectCount=ref(0);
const banner=ref({message:'',kind:'info' as 'info'|'success'|'error'});
const priorities=ref<Priority[]>([]);
const chef=ref('');
const department=ref('');
const search=ref('');
let socket:Socket|null=null;
let timer:ReturnType<typeof setTimeout>|undefined;

const canEdit=computed(()=>user.value?.role==='admin'||user.value?.role==='editor');
const synced=computed(()=>browserOnline.value&&socketConnected.value&&pendingCount.value===0);
const canSeed=computed(()=>user.value?.role==='admin'&&projectCount.value===0);

function say(message:string,kind:'info'|'success'|'error'='info'){
  banner.value={message,kind};
  if(timer)clearTimeout(timer);
  if(kind!=='error')timer=setTimeout(()=>banner.value.message='',6000);
}

async function load(){
  const [p,m]=await Promise.all([api<{data:Project[]}>('/projects'),api<{data:Manager[]}>('/managers')]);
  projects.value=p.data;
  managers.value=m.data;
  projectCount.value=p.data.length;
}

async function refreshAdminStatus(){
  if(user.value?.role!=='admin')return;
  try{const status=await api<{projectCount:number}>('/admin/status');projectCount.value=status.projectCount}catch{}
}

function connectSocket(){
  socket?.disconnect();
  socket=io(import.meta.env.VITE_SOCKET_URL||window.location.origin,{auth:{token:getToken()},reconnection:true});
  socket.on('connect',()=>socketConnected.value=true);
  socket.on('disconnect',()=>socketConnected.value=false);
  socket.on('connect_error',()=>socketConnected.value=false);
  ['project:created','project:updated','project:deleted','projects:reload'].forEach(event=>socket!.on(event,()=>load().catch(()=>{})));
  socket.on('managers:changed',async()=>{try{managers.value=(await api<{data:Manager[]}>('/managers')).data}catch{}});
}

async function afterLogin(u:User){
  user.value=u;
  if(!u.role)return;
  await load();
  await refreshAdminStatus();
  connectSocket();
  if(navigator.onLine)await replayQueue();
}

async function restore(){
  if(!getToken())return;
  try{const r=await api<{user:User}>('/auth/me');await afterLogin(r.user)}catch{setToken(null)}
}

const rows=computed(()=>{
  const out:{project:Project;line:Project['lignes'][number];firstVisible:boolean;order:number}[]=[];
  const q=search.value.trim().toLocaleLowerCase('fr');
  projects.value.forEach((p,order)=>{
    if(priorities.value.length&&(!p.priorite||!priorities.value.includes(p.priorite)))return;
    if(chef.value&&p.chef!==chef.value)return;
    if(q&&!`${p.numero} ${p.intitule}`.toLocaleLowerCase('fr').includes(q))return;
    const lines=p.lignes.filter(l=>!department.value||l.departement===department.value);
    lines.forEach((line,i)=>out.push({project:p,line,firstVisible:i===0,order}));
  });
  const rank:Record<string,number>={HAUTE:0,MOYENNE:1,BASSE:2,NONE:3};
  return out.sort((a,b)=>{
    const diff=rank[a.project.priorite??'NONE']-rank[b.project.priorite??'NONE'];
    return diff||a.order-b.order;
  });
});

function openProject(p:Project){selected.value=p;panel.value=true}
function newProject(){selected.value=null;panel.value=true}
function logout(){socket?.disconnect();socket=null;socketConnected.value=false;setToken(null);user.value=null;projects.value=[];managers.value=[];selected.value=null}

async function saveProject(p:Project,force=false){
  const creating=!selected.value;
  const path=creating?'/projects':`/projects/${selected.value!.id}`;
  const method=creating?'POST':'PUT';
  const projectBody={numero:Number(p.numero),intitule:p.intitule.trim(),priorite:p.priorite,chef:p.chef,lignes:p.lignes};
  const body=creating?projectBody:{baseUpdatedAt:selected.value!.updatedAt,force,project:projectBody};
  try{
    await api(path,{method,body:JSON.stringify(body)});
    panel.value=false;conflict.value=null;await load();await refreshAdminStatus();say('Projet enregistré.','success');
  }catch(e:any){
    if(!navigator.onLine||e instanceof TypeError){
      queueAction(path,method,body);pendingCount.value=outboxCount();panel.value=false;say(`Modification mise en attente (${pendingCount.value}).`,'info');return;
    }
    if(e.status===409&&!creating&&e.data?.serverProject){
      conflict.value={server:e.data.serverProject,action:{path,method:'PUT',body:{...body,force:false}}};return;
    }
    say(e.message,'error');
  }
}

async function removeProject(p:Project,force=false){
  const base=selected.value??p;
  const path=`/projects/${p.id}`;
  const body={baseUpdatedAt:base.updatedAt,force};
  try{
    await api(path,{method:'DELETE',body:JSON.stringify(body)});
    panel.value=false;selected.value=null;conflict.value=null;await load();await refreshAdminStatus();say('Projet supprimé.','success');
  }catch(e:any){
    if(!navigator.onLine||e instanceof TypeError){queueAction(path,'DELETE',body);pendingCount.value=outboxCount();panel.value=false;say(`Suppression mise en attente (${pendingCount.value}).`,'info');return}
    if(e.status===409&&e.data?.serverProject){conflict.value={server:e.data.serverProject,action:{path,method:'DELETE',body}};return}
    say(e.message,'error');
  }
}

async function overwriteConflict(){
  if(!conflict.value)return;
  const c=conflict.value;
  try{
    await api(c.action.path,{method:c.action.method,body:JSON.stringify({...c.action.body,force:true})});
    if(c.queuedId){removeQueuedAction(c.queuedId);pendingCount.value=outboxCount();}
    conflict.value=null;panel.value=false;selected.value=null;await load();await refreshAdminStatus();say('Votre version a été enregistrée.','success');
    if(browserOnline.value)await replayQueue();
  }catch(e:any){say(e.message,'error')}
}

async function reloadConflict(){
  if(!conflict.value)return;
  if(conflict.value.queuedId){removeQueuedAction(conflict.value.queuedId);pendingCount.value=outboxCount();}
  selected.value=conflict.value.server;
  conflict.value=null;
  panel.value=true;
  if(browserOnline.value)await replayQueue();
}

async function addManager(name:string){
  try{await api('/managers',{method:'POST',body:JSON.stringify({name})});managers.value=(await api<{data:Manager[]}>('/managers')).data}
  catch(e:any){say(e.message,'error')}
}

async function doImport(payload:any){
  try{const r=await api<{count:number}>('/projects/import/bulk',{method:'POST',body:JSON.stringify(payload)});importOpen.value=false;await load();await refreshAdminStatus();say(`${r.count} projet(s) importé(s).`,'success')}
  catch(e:any){say(e.message,'error')}
}

async function doExport(){
  try{const { exportExcel }=await import('./excel');await exportExcel(projects.value)}
  catch(e:any){say(e.message??'Export Excel impossible.','error')}
}

async function seed(){
  try{const r=await api<{count:number}>('/admin/seed',{method:'POST'});await load();await refreshAdminStatus();say(`${r.count} projets initialisés.`,'success')}
  catch(e:any){say(e.message,'error')}
}

function reset(){priorities.value=[];chef.value='';department.value='';search.value=''}

async function replayQueue(){
  const left=await flushOutbox((action:QueuedAction,e:any)=>{
    if(e?.status===409&&e.data?.serverProject&&(action.method==='PUT'||action.method==='DELETE')){
      conflict.value={server:e.data.serverProject,action:{path:action.path,method:action.method,body:action.body},queuedId:action.id};
      say('Une modification hors ligne est en conflit avec une version plus récente.','error');
    }else say(e?.message??'La synchronisation hors ligne a échoué.','error');
  });
  pendingCount.value=left;
  if(left===0){await load();await refreshAdminStatus();say('Synchronisation terminée.','success')}
}

async function onOnline(){browserOnline.value=true;if(user.value?.role)await replayQueue()}
function onOffline(){browserOnline.value=false;socketConnected.value=false;say('Connexion perdue. Les modifications seront mises en attente.','info')}

onMounted(()=>{restore();window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline)});
onBeforeUnmount(()=>{socket?.disconnect();if(timer)clearTimeout(timer);window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline)});
</script>

<template>
  <LoginView v-if="!user" @done="afterLogin"/>
  <UnauthorizedView v-else-if="!user.role" :name="user.name" @logout="logout"/>
  <div v-else>
    <TopBar :user="user" :projects="projects.length" :lines="projects.length*6" :synced="synced" :can-edit="canEdit" :can-seed="canSeed" @logout="logout" @new="newProject" @import="importOpen=true" @export="doExport" @users="usersOpen=true" @seed="seed"/>
    <StatusBanner :message="banner.message" :kind="banner.kind" @close="banner.message=''"/>
    <main class="page">
      <FilterBar v-model:priorities="priorities" v-model:chef="chef" v-model:department="department" v-model:search="search" :managers="managers" :count="rows.length" @reset="reset"/>
      <ProjectTable :rows="rows" @open="openProject"/>
    </main>
    <ProjectPanel :open="panel" :project="selected" :managers="managers" :can-edit="canEdit" @close="panel=false" @save="saveProject" @remove="removeProject" @add-manager="addManager"/>
    <ConflictDialog :open="!!conflict" @close="conflict=null" @reload="reloadConflict" @overwrite="overwriteConflict"/>
    <ImportDialog v-if="importOpen" @close="importOpen=false" @import="doImport"/>
    <UsersAdmin v-if="usersOpen" @close="usersOpen=false"/>
  </div>
</template>
