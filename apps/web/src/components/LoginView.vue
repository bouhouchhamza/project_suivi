<script setup lang="ts">
import { ref } from 'vue';
import { loginWithOptions, setToken } from '../api';
import type { ClientConfig, User } from '../types';

const emit=defineEmits<{done:[User]}>();
defineProps<{config?:ClientConfig|null}>();
const email=ref('');
const password=ref('');
const rememberMe=ref(false);
const error=ref('');
const loading=ref(false);

async function submit(){
  error.value=''; loading.value=true;
  try{
    const r=await loginWithOptions(email.value,password.value,rememberMe.value);
    setToken(r.token,rememberMe.value);
    emit('done',r.user);
  }catch(e:any){error.value=e.message}
  finally{loading.value=false}
}
</script>
<template>
  <main class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <img v-if="config?.companyLogo" class="brand-logo" :src="config.companyLogo" alt="">
      <div v-else class="brand-mark">{{(config?.clientName??'Suivi des Projets').slice(0,2).toUpperCase()}}</div>
      <h1>{{config?.clientName??'Suivi des Projets'}}</h1>
      <p>Connectez-vous pour accéder au tableau de suivi.</p>
      <label>Email<input v-model="email" type="email" required autocomplete="username"></label>
      <label>Mot de passe<input v-model="password" type="password" required autocomplete="current-password"></label>
      <label class="checkline"><input v-model="rememberMe" type="checkbox"> Rester connecté</label>
      <p v-if="error" class="field-error" role="alert">{{error}}</p>
      <button class="btn primary" :disabled="loading">{{loading?'Connexion...':'Se connecter'}}</button>
    </form>
  </main>
</template>
