<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { getApiMessage, removeSavedView, renameSavedView, selectSavedView, type SavedViewItem } from '../b2b-ui';

const props=defineProps<{filters:any}>();
const emit=defineEmits<{load:[any]}>();
const views=ref<SavedViewItem[]>([]);
const name=ref('');
const loading=ref(false);
const saving=ref(false);
const error=ref('');
const success=ref('');
const activeId=ref('');
const editingId=ref('');
const editingName=ref('');
const deleting=ref<SavedViewItem|null>(null);

async function load(){
  loading.value=true;error.value='';
  try{views.value=(await api<{data:SavedViewItem[]}>('/saved-views')).data}
  catch(e:any){error.value=getApiMessage(e,'Chargement des vues enregistrées impossible.')}
  finally{loading.value=false}
}
function clearFeedback(){error.value='';success.value=''}
async function save(){
  clearFeedback();
  const trimmed=name.value.trim();
  if(!trimmed){error.value='Nommez la vue avant de l’enregistrer.';return}
  saving.value=true;
  try{
    const saved=(await api<{data:SavedViewItem}>('/saved-views',{method:'POST',body:JSON.stringify({name:trimmed,filters:props.filters})})).data;
    const exists=views.value.some(view=>view.id===saved.id);
    views.value=exists?views.value.map(view=>view.id===saved.id?saved:view):[...views.value,saved].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
    activeId.value=saved.id;name.value='';success.value='Vue enregistrée.';
  }catch(e:any){error.value=getApiMessage(e,'Enregistrement impossible.')}
  finally{saving.value=false}
}
function apply(id:string){
  clearFeedback();
  const selected=selectSavedView(views.value,id);
  if(!selected){error.value='Vue enregistrée introuvable.';return}
  activeId.value=id;emit('load',selected.filters);success.value=`Vue « ${selected.name} » appliquée.`;
}
function startRename(view:SavedViewItem){clearFeedback();editingId.value=view.id;editingName.value=view.name}
async function rename(){
  const trimmed=editingName.value.trim();
  if(!editingId.value||!trimmed){error.value='Le nom de la vue est obligatoire.';return}
  saving.value=true;clearFeedback();
  try{
    const saved=(await api<{data:SavedViewItem}>(`/saved-views/${editingId.value}`,{method:'PATCH',body:JSON.stringify({name:trimmed})})).data;
    views.value=renameSavedView(views.value,saved.id,saved.name);
    editingId.value='';editingName.value='';success.value='Vue renommée.';
  }catch(e:any){error.value=getApiMessage(e,'Renommage impossible.')}
  finally{saving.value=false}
}
function cancelRename(){editingId.value='';editingName.value=''}
async function confirmDelete(){
  if(!deleting.value)return;
  saving.value=true;clearFeedback();
  const id=deleting.value.id;
  try{
    await api(`/saved-views/${id}`,{method:'DELETE'});
    views.value=removeSavedView(views.value,id);
    if(activeId.value===id)activeId.value='';
    deleting.value=null;success.value='Vue supprimée.';
  }catch(e:any){error.value=getApiMessage(e,'Suppression impossible.')}
  finally{saving.value=false}
}
onMounted(load);
</script>
<template>
  <section class="saved-views-panel" aria-labelledby="saved-views-title">
    <div class="saved-views-head">
      <h2 id="saved-views-title">Vues enregistrées</h2>
      <button class="link" type="button" :disabled="loading" @click="load">Actualiser</button>
    </div>
    <div class="saved-views-create">
      <label for="saved-view-name">Nom de la vue</label>
      <input id="saved-view-name" v-model="name" maxlength="120" placeholder="Ex. Priorités hautes STR" :disabled="saving">
      <button class="btn primary" type="button" :disabled="saving||!name.trim()" @click="save">{{saving?'Enregistrement...':'Enregistrer la vue'}}</button>
    </div>
    <p v-if="loading" class="empty-state">Chargement des vues...</p>
    <p v-if="error" class="field-error" role="alert">{{error}}</p>
    <p v-if="success" class="success-text" role="status">{{success}}</p>
    <p v-if="!loading&&!views.length" class="empty-state">Aucune vue enregistrée pour votre compte.</p>
    <div v-if="views.length" class="saved-view-list">
      <article v-for="view in views" :key="view.id" class="saved-view-row" :class="{active:view.id===activeId}">
        <div>
          <strong>{{view.name}}</strong>
          <small>{{view.id===activeId?'Vue active':'Vue personnelle'}}</small>
        </div>
        <div v-if="editingId===view.id" class="saved-view-edit">
          <label class="sr-only" :for="`rename-${view.id}`">Nouveau nom</label>
          <input :id="`rename-${view.id}`" v-model="editingName" maxlength="120" :disabled="saving">
          <button class="btn primary" type="button" :disabled="saving||!editingName.trim()" @click="rename">Valider</button>
          <button class="btn" type="button" :disabled="saving" @click="cancelRename">Annuler</button>
        </div>
        <div v-else class="saved-view-actions">
          <button class="btn" type="button" :disabled="saving" @click="apply(view.id)">Appliquer</button>
          <button class="btn" type="button" :disabled="saving" @click="startRename(view)">Renommer</button>
          <button class="btn danger-btn" type="button" :disabled="saving" @click="deleting=view">Supprimer</button>
        </div>
      </article>
    </div>
    <div v-if="deleting" class="modal-backdrop nested" @mousedown.self="deleting=null">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-view-title">
        <h2 id="delete-view-title">Supprimer la vue ?</h2>
        <p>La vue « {{deleting.name}} » sera supprimée uniquement pour votre compte.</p>
        <div class="dialog-actions">
          <button class="btn" type="button" :disabled="saving" @click="deleting=null">Annuler</button>
          <button class="btn danger-btn" type="button" :disabled="saving" @click="confirmDelete">{{saving?'Suppression...':'Supprimer'}}</button>
        </div>
      </div>
    </div>
  </section>
</template>
