<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api';
import type { User } from '../types';
defineProps<{user:User}>();
const currentPassword=ref(''),newPassword=ref(''),confirmPassword=ref(''),message=ref(''),error=ref('');
async function changePassword(){
  message.value='';error.value='';
  if(newPassword.value!==confirmPassword.value){error.value='La confirmation ne correspond pas au nouveau mot de passe.';return}
  try{
    await api('/auth/password',{method:'PATCH',body:JSON.stringify({currentPassword:currentPassword.value,newPassword:newPassword.value})});
    currentPassword.value='';newPassword.value='';confirmPassword.value='';message.value='Mot de passe modifié.';
  }catch(e:any){error.value=e.message}
}
</script>
<template>
  <section class="plain-panel settings-form">
    <h2>Mon compte</h2>
    <p><b>{{user.name}}</b><br>{{user.email}} · {{user.role}}</p>
    <label>Mot de passe actuel<input v-model="currentPassword" type="password" autocomplete="current-password"></label>
    <label>Nouveau mot de passe<input v-model="newPassword" type="password" minlength="8" autocomplete="new-password"></label>
    <label>Confirmer le nouveau mot de passe<input v-model="confirmPassword" type="password" minlength="8" autocomplete="new-password"></label>
    <button class="btn primary" :disabled="!currentPassword||newPassword.length<8||confirmPassword.length<8" @click="changePassword">Changer le mot de passe</button>
    <p v-if="message" class="success-text">{{message}}</p><p v-if="error" class="field-error" role="alert">{{error}}</p>
  </section>
</template>
