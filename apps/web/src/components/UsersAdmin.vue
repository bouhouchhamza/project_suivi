<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
import type { Role, User } from '../types';
const emit=defineEmits(['close']);
const users=ref<User[]>([]),name=ref(''),email=ref(''),password=ref(''),role=ref<Role>('viewer'),error=ref('');
async function load(){users.value=(await api<{data:User[]}>('/users')).data}
async function add(){error.value='';try{await api('/users',{method:'POST',body:JSON.stringify({name:name.value,email:email.value,password:password.value,role:role.value})});name.value='';email.value='';password.value='';role.value='viewer';await load()}catch(e:any){error.value=e.message}}
async function setRole(u:User,r:Role){error.value='';try{await api(`/users/${u.id}/role`,{method:'PATCH',body:JSON.stringify({role:r})});await load()}catch(e:any){error.value=e.message;await load()}}
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
      <div class="table-wrap compact"><table class="users-table"><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th></tr></thead><tbody><tr v-for="u in users" :key="u.id"><td>{{u.name}}</td><td>{{u.email}}</td><td><label class="sr-only" :for="`role-${u.id}`">Rôle de {{u.name}}</label><select :id="`role-${u.id}`" :value="u.role??''" @change="setRole(u,($event.target as HTMLSelectElement).value as Role)"><option disabled value="">Sans rôle</option><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select></td></tr></tbody></table></div>
    </div>
  </div>
</template>
