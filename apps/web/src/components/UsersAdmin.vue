<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
import type { Role, User } from '../types';
const emit=defineEmits(['close']);
const users=ref<User[]>([]),name=ref(''),email=ref(''),password=ref(''),role=ref<Role>('viewer'),error=ref(''),resetPassword=ref<Record<string,string>>({});
const editingId=ref<string|null>(null),editName=ref(''),editEmail=ref('');
async function load(){users.value=(await api<{data:User[]}>('/users')).data}
async function add(){error.value='';try{await api('/users',{method:'POST',body:JSON.stringify({name:name.value,email:email.value,password:password.value,role:role.value})});name.value='';email.value='';password.value='';role.value='viewer';await load()}catch(e:any){error.value=e.message}}
async function setRole(u:User,r:Role){error.value='';try{await api(`/users/${u.id}/role`,{method:'PATCH',body:JSON.stringify({role:r})});await load()}catch(e:any){error.value=e.message;await load()}}
async function setStatus(u:User,isActive:boolean){error.value='';try{await api(`/users/${u.id}/status`,{method:'PATCH',body:JSON.stringify({isActive})});await load()}catch(e:any){error.value=e.message;await load()}}
async function resetUserPassword(u:User){const value=resetPassword.value[u.id];if(!value)return;error.value='';try{await api(`/users/${u.id}/password`,{method:'PATCH',body:JSON.stringify({password:value})});resetPassword.value[u.id]='';await load()}catch(e:any){error.value=e.message}}
function startEdit(u:User){error.value='';editingId.value=u.id;editName.value=u.name;editEmail.value=u.email}
function cancelEdit(){editingId.value=null}
async function saveEdit(u:User){
  error.value='';
  try{await api(`/users/${u.id}`,{method:'PATCH',body:JSON.stringify({name:editName.value.trim(),email:editEmail.value.trim()})});editingId.value=null;await load()}
  catch(e:any){error.value=e.message}
}
function keydown(e:KeyboardEvent){if(e.key==='Escape')emit('close')}
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
      <div class="table-wrap compact"><table class="users-table"><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Mot de passe</th><th>Actions</th></tr></thead><tbody>
        <tr v-for="u in users" :key="u.id">
          <td><input v-if="editingId===u.id" v-model="editName" maxlength="120" aria-label="Nom"><span v-else>{{u.name}}</span></td>
          <td><input v-if="editingId===u.id" v-model="editEmail" type="email" aria-label="Email"><span v-else>{{u.email}}</span></td>
          <td><select :value="u.role??''" @change="setRole(u,($event.target as HTMLSelectElement).value as Role)"><option disabled value="">Sans rôle</option><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select></td>
          <td><button class="btn" :class="{'danger-btn':u.isActive}" @click="setStatus(u,!u.isActive)">{{u.isActive?'Désactiver':'Réactiver'}}</button></td>
          <td>{{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString('fr-FR'):'Jamais'}}</td>
          <td class="reset-cell"><input v-model="resetPassword[u.id]" type="password" minlength="8" placeholder="Nouveau mot de passe"><button class="btn" :disabled="(resetPassword[u.id]??'').length<8" @click="resetUserPassword(u)">Réinitialiser</button></td>
          <td class="row-actions">
            <template v-if="editingId===u.id">
              <button class="btn primary" :disabled="!editName.trim()||!editEmail.trim()" @click="saveEdit(u)">Enregistrer</button>
              <button class="btn" @click="cancelEdit">Annuler</button>
            </template>
            <template v-else>
              <button class="btn" @click="startEdit(u)">Modifier</button>
            </template>
          </td>
        </tr>
      </tbody></table></div>
    </div>
  </div>
</template>
