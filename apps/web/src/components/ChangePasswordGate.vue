<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api';
import type { User } from '../types';
defineProps<{user:User}>();
const emit=defineEmits<{done:[];logout:[]}>();
const currentPassword=ref(''),newPassword=ref(''),confirmPassword=ref(''),error=ref(''),loading=ref(false);
async function submit(){
  error.value='';
  if(newPassword.value!==confirmPassword.value){error.value='La confirmation ne correspond pas au nouveau mot de passe.';return}
  loading.value=true;
  try{
    await api('/auth/password',{method:'PATCH',body:JSON.stringify({currentPassword:currentPassword.value,newPassword:newPassword.value})});
    emit('done');
  }catch(e:any){error.value=e.message}
  finally{loading.value=false}
}
</script>
<template>
  <main class="login-page">
    <form class="login-card" aria-labelledby="change-password-title" @submit.prevent="submit">
      <div class="brand-mark">SP</div>
      <h1 id="change-password-title">Choisissez un nouveau mot de passe</h1>
      <p>Bonjour {{user.name}}. Pour des raisons de sécurité, vous devez remplacer votre mot de passe temporaire avant de continuer.</p>
      <label>Mot de passe actuel<input v-model="currentPassword" type="password" required autocomplete="current-password"></label>
      <label>Nouveau mot de passe<input v-model="newPassword" type="password" minlength="8" required autocomplete="new-password"></label>
      <label>Confirmer le nouveau mot de passe<input v-model="confirmPassword" type="password" minlength="8" required autocomplete="new-password"></label>
      <p v-if="error" class="field-error" role="alert">{{error}}</p>
      <button class="btn primary" :disabled="loading||!currentPassword||newPassword.length<8||confirmPassword.length<8">{{loading?'Validation...':'Valider le nouveau mot de passe'}}</button>
      <button class="btn" type="button" @click="emit('logout')">Se déconnecter</button>
    </form>
  </main>
</template>
