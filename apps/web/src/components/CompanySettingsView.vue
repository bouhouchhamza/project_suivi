<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import { getApiMessage, getFieldErrors } from '../b2b-ui';
import type { ClientConfig } from '../types';

const emit=defineEmits<{saved:[ClientConfig]}>();
const form=reactive<ClientConfig>({clientName:'',clientSlug:'',appDomain:'',supportEmail:'',companyLogo:'',primaryColor:'#2F6B60',timezone:'Africa/Casablanca'});
const loading=ref(false);
const saving=ref(false);
const message=ref('');
const error=ref('');
const fieldErrors=ref<Record<string,string>>({});
async function load(){
  loading.value=true;error.value='';
  try{Object.assign(form,(await api<{data:ClientConfig}>('/company/settings')).data)}
  catch(e:any){error.value=getApiMessage(e,'Chargement des paramètres impossible.')}
  finally{loading.value=false}
}
async function save(){
  message.value='';error.value='';fieldErrors.value={};saving.value=true;
  try{
    const saved=(await api<{data:ClientConfig}>('/company/settings',{method:'PUT',body:JSON.stringify(form)})).data;
    Object.assign(form,saved);emit('saved',saved);message.value='Paramètres enregistrés.';
  }catch(e:any){fieldErrors.value=getFieldErrors(e);error.value=getApiMessage(e,'Enregistrement impossible.')}
  finally{saving.value=false}
}
onMounted(load);
</script>
<template>
  <section class="plain-panel settings-form">
    <div class="section-head">
      <div><h2>Paramètres de l’entreprise</h2><small>Ces valeurs alimentent l’écran de connexion, l’en-tête et les rapports.</small></div>
      <button class="btn" type="button" :disabled="loading||saving" @click="load">Recharger</button>
    </div>
    <p v-if="loading" class="empty-state">Chargement des paramètres...</p>
    <p v-if="error" class="field-error" role="alert">{{error}}</p>
    <label>Nom affiché<input v-model="form.clientName" :disabled="saving"><span v-if="fieldErrors.clientName" class="field-error">{{fieldErrors.clientName}}</span></label>
    <label>Slug client<input v-model="form.clientSlug" :disabled="saving"><span v-if="fieldErrors.clientSlug" class="field-error">{{fieldErrors.clientSlug}}</span></label>
    <label>Domaine<input v-model="form.appDomain" :disabled="saving"><span v-if="fieldErrors.appDomain" class="field-error">{{fieldErrors.appDomain}}</span></label>
    <label>Email support<input v-model="form.supportEmail" type="email" :disabled="saving"><span v-if="fieldErrors.supportEmail" class="field-error">{{fieldErrors.supportEmail}}</span></label>
    <label>Logo public<input v-model="form.companyLogo" placeholder="https://..." :disabled="saving"><span v-if="fieldErrors.companyLogo" class="field-error">{{fieldErrors.companyLogo}}</span></label>
    <label>Couleur principale<input v-model="form.primaryColor" type="color" :disabled="saving"><span v-if="fieldErrors.primaryColor" class="field-error">{{fieldErrors.primaryColor}}</span></label>
    <label>Fuseau horaire<input v-model="form.timezone" :disabled="saving"><span v-if="fieldErrors.timezone" class="field-error">{{fieldErrors.timezone}}</span></label>
    <div class="settings-actions">
      <button class="btn primary" type="button" :disabled="saving||loading" @click="save">{{saving?'Enregistrement...':'Enregistrer'}}</button>
      <p v-if="message" class="success-text" role="status">{{message}}</p>
    </div>
  </section>
</template>
