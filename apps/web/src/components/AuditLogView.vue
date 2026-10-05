<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { getApiMessage } from '../b2b-ui';

const logs=ref<any[]>([]);
const filters=ref({action:'',user:'',project:'',from:'',to:''});
const loading=ref(false);
const error=ref('');
function buildQuery(){
  const params=new URLSearchParams();
  Object.entries(filters.value).forEach(([key,value])=>{if(value)params.set(key,value)});
  const query=params.toString();
  return query?`?${query}`:'';
}
function formatMetadata(value:any){
  if(!value)return '—';
  try{return JSON.stringify(value)}
  catch{return String(value)}
}
async function load(){
  loading.value=true;error.value='';
  try{logs.value=(await api<{data:any[]}>(`/audit-logs${buildQuery()}`)).data}
  catch(e:any){error.value=getApiMessage(e,'Chargement de l’historique impossible.')}
  finally{loading.value=false}
}
function reset(){filters.value={action:'',user:'',project:'',from:'',to:''};load()}
onMounted(load);
</script>
<template>
  <section class="plain-panel">
    <div class="section-head">
      <div><h2>Historique d’activité</h2><small>Accès administrateur</small></div>
      <button class="btn" type="button" :disabled="loading" @click="reset">Réinitialiser</button>
    </div>
    <div class="audit-filters">
      <label>Action<input v-model="filters.action" placeholder="project_archived" @change="load"></label>
      <label>Utilisateur<input v-model="filters.user" placeholder="ID utilisateur" @change="load"></label>
      <label>Projet<input v-model="filters.project" placeholder="ID projet" @change="load"></label>
      <label>Du<input v-model="filters.from" type="date" @change="load"></label>
      <label>Au<input v-model="filters.to" type="date" @change="load"></label>
      <button class="btn primary" type="button" :disabled="loading" @click="load">{{loading?'Chargement...':'Filtrer'}}</button>
    </div>
    <p v-if="error" class="field-error" role="alert">{{error}}</p>
    <p v-if="loading" class="empty-state">Chargement de l’historique...</p>
    <p v-if="!loading&&!logs.length" class="empty-state">Aucune activité ne correspond aux filtres.</p>
    <div v-if="logs.length" class="table-wrap compact">
      <table>
        <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Élément</th><th>Détails</th></tr></thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{new Date(log.createdAt).toLocaleString('fr-FR')}}</td>
            <td><strong>{{log.actorName||'Système'}}</strong><br><small>{{log.actorEmail||log.actorId||'—'}}</small></td>
            <td><span class="jpill">{{log.action}}</span></td>
            <td>{{log.entityType}}<br><small>{{log.entityId||'—'}}</small></td>
            <td><code class="metadata">{{formatMetadata(log.metadata)}}</code></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
