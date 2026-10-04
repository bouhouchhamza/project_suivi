<script setup lang="ts">
import { ref } from 'vue';
import { login, setToken } from '../api';
import type { User } from '../types';
const emit=defineEmits<{done:[User]}>();
const email=ref('');
const password=ref('');
const error=ref('');
const loading=ref(false);
async function submit(){
  error.value=''; loading.value=true;
  try{const r=await login(email.value,password.value);setToken(r.token);emit('done',r.user)}
  catch(e:any){error.value=e.message}
  finally{loading.value=false}
}
</script>
<template>
  <main class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <div class="brand-mark">SP</div>
      <h1>Suivi des Projets</h1>
      <p>Connectez-vous pour accéder au tableau de suivi.</p>
      <label>Email<input v-model="email" type="email" required autocomplete="username"></label>
      <label>Mot de passe<input v-model="password" type="password" required autocomplete="current-password"></label>
      <p v-if="error" class="field-error" role="alert">{{error}}</p>
      <button class="btn primary" :disabled="loading">{{loading?'Connexion…':'Se connecter'}}</button>
    </form>
  </main>
</template>
