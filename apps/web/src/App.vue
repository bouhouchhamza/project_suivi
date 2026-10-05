<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { api, apiGetBinary, apiPutBinary, getToken, publicApi, setToken } from './api';
import { flushOutbox, outboxCount, queueAction, removeQueuedAction, type QueuedAction } from './offline';
import type { ClientConfig, Manager, Priority, Project, User } from './types';
import LoginView from './components/LoginView.vue';
import UnauthorizedView from './components/UnauthorizedView.vue';
import ChangePasswordGate from './components/ChangePasswordGate.vue';
import TopBar from './components/TopBar.vue';
import StatusBanner from './components/StatusBanner.vue';
import FilterBar from './components/FilterBar.vue';
import ProjectTable from './components/ProjectTable.vue';
import ProjectPanel from './components/ProjectPanel.vue';
import ConflictDialog from './components/ConflictDialog.vue';
import ImportDialog from './components/ImportDialog.vue';
import UsersAdmin from './components/UsersAdmin.vue';
import DashboardView from './components/DashboardView.vue';
import NotificationsView from './components/NotificationsView.vue';
import AuditLogView from './components/AuditLogView.vue';
import CompanySettingsView from './components/CompanySettingsView.vue';
import AccountView from './components/AccountView.vue';
import ReportsView from './components/ReportsView.vue';
import SavedViews from './components/SavedViews.vue';

type View='projects'|'dashboard'|'archives'|'notifications'|'reports'|'audit'|'settings'|'account';
type ConflictState={server:Project;action:{path:string;method:'PUT'|'DELETE';body:any};queuedId?:string};

const user=ref<User|null>(null);
const config=ref<ClientConfig|null>(null);
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
const permanentDelete=ref<Project|null>(null);
const permanentConfirmation=ref('');
const projectCount=ref(0);
const unreadNotifications=ref(0);
const view=ref<View>('projects');
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
const activeView=computed(()=>view.value==='projects'||view.value==='archives');
const filters=computed(()=>({priorities:priorities.value,chef:chef.value||null,department:department.value||null,search:search.value,archived:view.value==='archives'}));

function applyBranding(next:ClientConfig|null){
  config.value=next;
  if(next?.primaryColor)document.documentElement.style.setProperty('--primary',next.primaryColor);
}
function say(message:string,kind:'info'|'success'|'error'='info'){
  banner.value={message,kind};
  if(timer)clearTimeout(timer);
  if(kind!=='error')timer=setTimeout(()=>banner.value.message='',6000);
}
async function loadBranding(){try{applyBranding((await publicApi<{data:ClientConfig}>('/company/config')).data)}catch{}}
async function load(){
  const archived=view.value==='archives';
  const [p,m]=await Promise.all([api<{data:Project[]}>(`/projects${archived?'?archived=true':''}`),api<{data:Manager[]}>('/managers')]);
  projects.value=p.data;
  managers.value=m.data;
  if(!archived)projectCount.value=p.data.length;
}
async function refreshAdminStatus(){if(user.value?.role!=='admin')return;try{const status=await api<{projectCount:number}>('/admin/status');projectCount.value=status.projectCount}catch{}}
async function refreshNotifications(){if(!user.value?.role)return;try{const r=await api<{data:any[]}>('/notifications');unreadNotifications.value=r.data.filter(n=>!n.readAt).length}catch{}}
function connectSocket(){
  socket?.disconnect();
  socket=io(import.meta.env.VITE_SOCKET_URL||window.location.origin,{auth:{token:getToken()},reconnection:true});
  socket.on('connect',()=>socketConnected.value=true);
  socket.on('disconnect',()=>socketConnected.value=false);
  socket.on('connect_error',()=>socketConnected.value=false);
  ['project:created','project:updated','project:deleted','project:archived','project:restored','projects:reload'].forEach(event=>socket!.on(event,()=>load().catch(()=>{})));
  socket.on('managers:changed',async()=>{try{managers.value=(await api<{data:Manager[]}>('/managers')).data}catch{}});
}
async function enterApp(){await load();await refreshAdminStatus();await refreshNotifications();connectSocket();if(navigator.onLine)await replayQueue()}
async function afterLogin(u:User){user.value=u;if(!u.role||u.mustChangePassword)return;await enterApp()}
async function onPasswordChanged(){if(user.value)user.value={...user.value,mustChangePassword:false};await enterApp()}
async function restore(){if(!getToken())return;try{const r=await api<{user:User}>('/auth/me');await afterLogin(r.user)}catch{setToken(null)}}
function logout(){socket?.disconnect();socket=null;socketConnected.value=false;setToken(null);user.value=null;projects.value=[];managers.value=[];selected.value=null}

const rows=computed(()=>{
  const out:{project:Project;line:Project['lignes'][number];firstVisible:boolean}[]=[];
  const q=search.value.trim().toLocaleLowerCase('fr');
  projects.value.forEach(p=>{
    if(priorities.value.length&&(!p.priorite||!priorities.value.includes(p.priorite)))return;
    if(chef.value&&p.chef!==chef.value)return;
    if(q&&!`${p.numero} ${p.intitule}`.toLocaleLowerCase('fr').includes(q))return;
    const lines=p.lignes.filter(l=>!department.value||l.departement===department.value);
    lines.forEach((line,i)=>out.push({project:p,line,firstVisible:i===0}));
  });
  return out;
});
const filteredProjects=computed(()=>Array.from(new Map(rows.value.map(row=>[row.project.id,row.project])).values()));
function setView(next:View){view.value=next;selected.value=null;panel.value=false}
function openProject(p:Project){selected.value=p;panel.value=true}
function newProject(){selected.value=null;panel.value=true}
function reset(){priorities.value=[];chef.value='';department.value='';search.value=''}
function loadSavedView(saved:any){priorities.value=saved.priorities??[];chef.value=saved.chef??'';department.value=saved.department??'';search.value=saved.search??'';view.value=saved.archived?'archives':'projects'}

async function saveProject(p:Project,force=false){
  const creating=!selected.value;
  const path=creating?'/projects':`/projects/${selected.value!.id}`;
  const method=creating?'POST':'PUT';
  const projectBody={numero:Number(p.numero),intitule:p.intitule.trim(),priorite:p.priorite,chef:p.chef,lignes:p.lignes};
  const body=creating?projectBody:{baseUpdatedAt:selected.value!.updatedAt,force,project:projectBody};
  try{await api(path,{method,body:JSON.stringify(body)});panel.value=false;conflict.value=null;await load();await refreshAdminStatus();say('Projet enregistré.','success')}
  catch(e:any){
    if(!navigator.onLine||e instanceof TypeError){queueAction(path,method,body);pendingCount.value=outboxCount();panel.value=false;say(`Modification mise en attente (${pendingCount.value}).`,'info');return}
    if(e.status===409&&!creating&&e.data?.serverProject){conflict.value={server:e.data.serverProject,action:{path,method:'PUT',body:{...body,force:false}}};return}
    say(e.message,'error');
  }
}
async function removeProject(p:Project,force=false){
  const base=selected.value??p;
  const path=`/projects/${p.id}`;
  const body={baseUpdatedAt:base.updatedAt,force};
  try{await api(path,{method:'DELETE',body:JSON.stringify(body)});panel.value=false;selected.value=null;conflict.value=null;await load();await refreshAdminStatus();say('Projet archivé.','success')}
  catch(e:any){
    if(!navigator.onLine||e instanceof TypeError){queueAction(path,'DELETE',body);pendingCount.value=outboxCount();panel.value=false;say(`Archivage mis en attente (${pendingCount.value}).`,'info');return}
    if(e.status===409&&e.data?.serverProject){conflict.value={server:e.data.serverProject,action:{path,method:'DELETE',body}};return}
    say(e.message,'error');
  }
}
async function restoreProject(p:Project){try{await api(`/projects/${p.id}/restore`,{method:'POST'});await load();say('Projet restauré.','success')}catch(e:any){say(e.message,'error')}}
function openProjectFromNotification(p:Project){view.value=p.archivedAt?'archives':'projects';selected.value=p;panel.value=true}
async function permanentlyDeleteProject(){
  if(!permanentDelete.value)return;
  try{
    await api(`/projects/${permanentDelete.value.id}/permanent`,{method:'DELETE',body:JSON.stringify({confirmation:permanentConfirmation.value})});
    permanentDelete.value=null;permanentConfirmation.value='';
    await load();say('Projet supprimé définitivement.','success');
  }catch(e:any){say(e.message,'error')}
}
async function overwriteConflict(){if(!conflict.value)return;const c=conflict.value;try{await api(c.action.path,{method:c.action.method,body:JSON.stringify({...c.action.body,force:true})});if(c.queuedId){removeQueuedAction(c.queuedId);pendingCount.value=outboxCount()}conflict.value=null;panel.value=false;selected.value=null;await load();await refreshAdminStatus();say('Votre version a été enregistrée.','success');if(browserOnline.value)await replayQueue()}catch(e:any){say(e.message,'error')}}
async function reloadConflict(){if(!conflict.value)return;if(conflict.value.queuedId){removeQueuedAction(conflict.value.queuedId);pendingCount.value=outboxCount()}selected.value=conflict.value.server;conflict.value=null;panel.value=true;if(browserOnline.value)await replayQueue()}
async function addManager(name:string){try{await api('/managers',{method:'POST',body:JSON.stringify({name})});managers.value=(await api<{data:Manager[]}>('/managers')).data}catch(e:any){say(e.message,'error')}}
async function doImport(payload:{mode:'replace'|'merge';projects:any[];managers:string[];fileBuffer:ArrayBuffer|null;fileName:string}){
  try{
    const body={mode:payload.mode,projects:payload.projects,managers:payload.managers};
    const r=await api<{count:number}>('/projects/import/bulk',{method:'POST',body:JSON.stringify(body)});
    importOpen.value=false;await load();await refreshAdminStatus();say(`${r.count} projet(s) importé(s).`,'success');
    if(payload.fileBuffer){
      await apiPutBinary('/excel-template',payload.fileBuffer,payload.fileName).catch(()=>say("Le modèle Excel n'a pas pu être enregistré ; l'export utilisera la mise en forme par défaut.",'info'));
    }
  }catch(e:any){say(e.message,'error')}
}
async function doExport(){
  try{
    const { exportExcel }=await import('./excel');
    const template=await apiGetBinary('/excel-template').catch(()=>null);
    await exportExcel(filteredProjects.value.length?filteredProjects.value:projects.value,template);
  }catch(e:any){say(e.message??'Export Excel impossible.','error')}
}
async function seed(){try{const r=await api<{count:number}>('/admin/seed',{method:'POST'});await load();await refreshAdminStatus();say(`${r.count} projets initialisés.`,'success')}catch(e:any){say(e.message,'error')}}
async function replayQueue(){
  const left=await flushOutbox((action:QueuedAction,e:any)=>{if(e?.status===409&&e.data?.serverProject&&(action.method==='PUT'||action.method==='DELETE')){conflict.value={server:e.data.serverProject,action:{path:action.path,method:action.method,body:action.body},queuedId:action.id};say('Une modification hors ligne est en conflit avec une version plus récente.','error')}else say(e?.message??'La synchronisation hors ligne a échoué.','error')});
  pendingCount.value=left;
  if(left===0){await load();await refreshAdminStatus();say('Synchronisation terminée.','success')}
}
async function onOnline(){browserOnline.value=true;if(user.value?.role)await replayQueue()}
function onOffline(){browserOnline.value=false;socketConnected.value=false;say('Connexion perdue. Les modifications seront mises en attente.','info')}
function onSessionExpired(event:any){logout();say(event.detail||'Votre session a expiré. Veuillez vous reconnecter.','error')}

watch(view,async()=>{if(activeView.value&&user.value?.role)await load()});
onMounted(()=>{loadBranding();restore();window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);window.addEventListener('suivi:session-expired',onSessionExpired as EventListener)});
onBeforeUnmount(()=>{socket?.disconnect();if(timer)clearTimeout(timer);window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);window.removeEventListener('suivi:session-expired',onSessionExpired as EventListener)});
</script>

<template>
  <LoginView v-if="!user" :config="config" @done="afterLogin"/>
  <UnauthorizedView v-else-if="!user.role" :name="user.name" @logout="logout"/>
  <ChangePasswordGate v-else-if="user.mustChangePassword" :user="user" @done="onPasswordChanged" @logout="logout"/>
  <div v-else>
    <TopBar :user="user" :config="config" :projects="projectCount" :lines="projectCount*6" :synced="synced" :can-edit="canEdit" :can-seed="canSeed" :view="view" :unread="unreadNotifications" @logout="logout" @new="newProject" @import="importOpen=true" @export="doExport" @users="usersOpen=true" @seed="seed" @view="setView"/>
    <StatusBanner :message="banner.message" :kind="banner.kind" @close="banner.message=''"/>
    <main class="page">
      <template v-if="activeView">
        <FilterBar v-model:priorities="priorities" v-model:chef="chef" v-model:department="department" v-model:search="search" :managers="managers" :count="rows.length" @reset="reset"/>
        <SavedViews :filters="filters" @load="loadSavedView"/>
        <ProjectTable :rows="rows" @open="openProject"/>
        <section v-if="view==='archives'&&user.role==='admin'" class="archive-actions">
          <button v-for="p in filteredProjects" :key="p.id" class="btn" @click="restoreProject(p)">Restaurer {{p.numero}}</button>
          <button v-for="p in filteredProjects" :key="`${p.id}-delete`" class="btn danger-btn" @click="permanentDelete=p">Supprimer définitivement {{p.numero}}</button>
        </section>
      </template>
      <DashboardView v-else-if="view==='dashboard'"/>
      <NotificationsView v-else-if="view==='notifications'" :projects="projects" @changed="unreadNotifications=$event" @open-project="openProjectFromNotification"/>
      <ReportsView v-else-if="view==='reports'"/>
      <AuditLogView v-else-if="view==='audit'&&user.role==='admin'"/>
      <CompanySettingsView v-else-if="view==='settings'&&user.role==='admin'" @saved="applyBranding"/>
      <AccountView v-else-if="view==='account'" :user="user"/>
    </main>
    <ProjectPanel :open="panel" :project="selected" :managers="managers" :can-edit="canEdit&&view==='projects'" @close="panel=false" @save="saveProject" @remove="removeProject" @add-manager="addManager"/>
    <ConflictDialog :open="!!conflict" @close="conflict=null" @reload="reloadConflict" @overwrite="overwriteConflict"/>
    <ImportDialog v-if="importOpen" @close="importOpen=false" @import="doImport"/>
    <UsersAdmin v-if="usersOpen" @close="usersOpen=false"/>
    <div v-if="permanentDelete" class="modal-backdrop" @mousedown.self="permanentDelete=null">
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2>Suppression définitive</h2>
        <p>Cette action efface définitivement le projet archivé {{permanentDelete.numero}} - {{permanentDelete.intitule}}.</p>
        <label>Tapez SUPPRIMER DEFINITIVEMENT<input v-model="permanentConfirmation"></label>
        <div class="dialog-actions">
          <button class="btn" @click="permanentDelete=null;permanentConfirmation=''">Annuler</button>
          <button class="btn danger-btn" :disabled="permanentConfirmation!=='SUPPRIMER DEFINITIVEMENT'" @click="permanentlyDeleteProject">Supprimer définitivement</button>
        </div>
      </div>
    </div>
  </div>
</template>
