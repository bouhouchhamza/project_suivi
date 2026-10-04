<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
import type { Role, User } from '../types';
const props=defineProps<{currentUserId:string}>();
const emit=defineEmits(['close']);
const users=ref<User[]>([]),name=ref(''),email=ref(''),password=ref(''),role=ref<Role>('viewer'),error=ref('');
const editingId=ref<string|null>(null),editName=ref(''),editEmail=ref('');
const toDelete=ref<User|null>(null);
async function load(){users.value=(await api<{data:User[]}>('/users')).data}
async function add(){error.value='';try{await api('/users',{method:'POST',body:JSON.stringify({name:name.value,email:email.value,password:password.value,role:role.value})});name.value='';email.value='';password.value='';role.value='viewer';await load()}catch(e:any){error.value=e.message}}
async function setRole(u:User,r:Role){error.value='';try{await api(`/users/${u.id}`,{method:'PATCH',body:JSON.stringify({role:r})});await load()}catch(e:any){error.value=e.message;await load()}}
function startEdit(u:User){error.value='';editingId.value=u.id;editName.value=u.name;editEmail.value=u.email}
function cancelEdit(){editingId.value=null}
async function saveEdit(u:User){
  error.value='';
  try{await api(`/users/${u.id}`,{method:'PATCH',body:JSON.stringify({name:editName.value.trim(),email:editEmail.value.trim()})});editingId.value=null;await load()}
  catch(e:any){error.value=e.message}
}
function askDelete(u:User){error.value='';toDelete.value=u}
async function confirmDelete(){
  if(!toDelete.value)return;
  error.value='';
  const id=toDelete.value.id;
  try{await api(`/users/${id}`,{method:'DELETE'});toDelete.value=null;await load()}
  catch(e:any){error.value=e.message;toDelete.value=null}
}
function keydown(e:KeyboardEvent){if(e.key==='Escape'){if(toDelete.value)toDelete.value=null;else emit('close')}}
onMounted(()=>{load();window.addEventListener('keydown',keydown)});onBeforeUnmount(()=>window.removeEventListener('keydown',keydown));
</script>
<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <div class="dialog users-dialog" role="dialog" aria-modal="true" aria-labelledby="users-title">
      <div class="dialog-head"><h2 id="users-title">Utilisateurs</h2><button aria-label="Fermer" @click="emit('close')">×</button></div>
      <div class="user-create">
        <label>Nom<input v-model="name" maxlength="120" autocomplete="name"></label>
        <label>Email<input v-model="email" type="email" autocomplete="email"></label>
        <label>Mot de passe<input v-model="password" type="password" minlength="8" autocomplete="new-password"></label>
        <label>Rôle<select v-model="role"><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select></label>
        <button class="btn primary" :disabled="!name||!email||password.length<8" @click="add">Créer</button>
      </div>
      <p v-if="error" class="field-error" role="alert">{{error}}</p>
      <div class="table-wrap compact">
        <table class="users-table">
          <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td><input v-if="editingId===u.id" v-model="editName" maxlength="120" aria-label="Nom"><span v-else>{{u.name}}</span></td>
              <td><input v-if="editingId===u.id" v-model="editEmail" type="email" aria-label="Email"><span v-else>{{u.email}}</span></td>
              <td>
                <label class="sr-only" :for="`role-${u.id}`">Rôle de {{u.name}}</label>
                <select :id="`role-${u.id}`" :value="u.role??''" @change="setRole(u,($event.target as HTMLSelectElement).value as Role)"><option disabled value="">Sans rôle</option><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select>
              </td>
              <td class="row-actions">
                <template v-if="editingId===u.id">
                  <button class="btn primary" :disabled="!editName.trim()||!editEmail.trim()" @click="saveEdit(u)">Enregistrer</button>
                  <button class="btn" @click="cancelEdit">Annuler</button>
                </template>
                <template v-else>
                  <button class="btn" @click="startEdit(u)">Modifier</button>
                  <button class="btn danger-btn" :disabled="u.id===props.currentUserId" :title="u.id===props.currentUserId?'Vous ne pouvez pas supprimer votre propre compte.':''" @click="askDelete(u)">Supprimer</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-if="toDelete" class="modal-backdrop nested" @mousedown.self="toDelete=null">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title">
        <h2 id="delete-user-title">Supprimer cet utilisateur ?</h2>
        <p>{{toDelete.name}} ({{toDelete.email}}) sera définitivement supprimé. Cette action est irréversible.</p>
        <div class="dialog-actions"><button class="btn" @click="toDelete=null">Annuler</button><button class="btn danger-btn" @click="confirmDelete">Supprimer</button></div>
      </div>
    </div>
  </div>
</template>
