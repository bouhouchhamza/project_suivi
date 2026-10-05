<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { getApiMessage, unreadCount } from '../b2b-ui';
import type { Project } from '../types';

const props=defineProps<{projects?:Project[]}>();
const emit=defineEmits<{changed:[number];openProject:[Project]}>();
const items=ref<any[]>([]);
const loading=ref(false);
const busy=ref('');
const error=ref('');
const info=ref('');
const unread=computed(()=>unreadCount(items.value));
function syncUnread(){emit('changed',unread.value)}
async function load(){
  loading.value=true;error.value='';info.value='';
  try{items.value=(await api<{data:any[]}>('/notifications')).data;syncUnread()}
  catch(e:any){error.value=getApiMessage(e,'Chargement des notifications impossible.')}
  finally{loading.value=false}
}
async function read(id:string){
  error.value='';info.value='';busy.value=id;
  try{await api(`/notifications/${id}/read`,{method:'PATCH'});await load()}
  catch(e:any){error.value=getApiMessage(e,'Impossible de marquer la notification comme lue.')}
  finally{busy.value=''}
}
async function readAll(){
  error.value='';info.value='';busy.value='all';
  try{await api('/notifications/read-all',{method:'POST'});await load();info.value='Toutes les notifications sont marquées comme lues.'}
  catch(e:any){error.value=getApiMessage(e,'Impossible de marquer les notifications comme lues.')}
  finally{busy.value=''}
}
function openLinkedProject(n:any){
  if(!n.projectId)return;
  const project=props.projects?.find(p=>p.id===n.projectId);
  if(!project){info.value='Projet introuvable ou supprimé. Actualisez la liste des projets.';return}
  emit('openProject',project);
}
onMounted(load);
</script>
<template>
  <section class="plain-panel">
    <div class="section-head">
      <div><h2>Notifications</h2><small>{{unread}} non lue(s)</small></div>
      <button class="btn" :disabled="!unread||!!busy" @click="readAll">{{busy==='all'?'Mise à jour...':'Tout marquer comme lu'}}</button>
    </div>
    <p v-if="loading" class="empty-state">Chargement des notifications...</p>
    <p v-if="error" class="field-error" role="alert">{{error}}</p>
    <p v-if="info" class="success-text" role="status">{{info}}</p>
    <div v-if="items.length" class="list">
      <article v-for="n in items" :key="n.id" class="list-row notification-row" :class="{unread:!n.readAt}">
        <div class="notification-main">
          <span class="read-dot" aria-hidden="true"></span>
          <div>
            <strong>{{n.title}}</strong>
            <span>{{n.message}}</span>
            <small>{{new Date(n.createdAt).toLocaleString('fr-FR')}} · {{n.readAt?'Lue':'Non lue'}}</small>
          </div>
        </div>
        <div class="notification-actions">
          <button v-if="n.projectId" class="btn" type="button" @click="openLinkedProject(n)">Voir le projet</button>
          <button class="btn" type="button" :disabled="!!n.readAt||busy===n.id" @click="read(n.id)">{{busy===n.id?'Mise à jour...':'Marquer comme lue'}}</button>
        </div>
      </article>
    </div>
    <p v-if="!loading&&!items.length" class="empty-state">Aucune notification.</p>
  </section>
</template>
