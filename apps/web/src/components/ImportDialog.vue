<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
const emit=defineEmits<{close:[];import:[{mode:'replace'|'merge';projects:any[];managers:string[]}]}>();
const mode=ref<'replace'|'merge'>('merge');
const payload=ref<any>(null);
const error=ref('');
const confirmReplace=ref(false);
let opener:HTMLElement|null=null;
async function pick(e:Event){
  error.value=''; payload.value=null;
  const f=(e.target as HTMLInputElement).files?.[0]; if(!f)return;
  try{const { parseImport }=await import('../excel');payload.value=await parseImport(await f.arrayBuffer())}catch(err:any){error.value=err.message}
}
function go(){if(!payload.value)return;if(mode.value==='replace'){confirmReplace.value=true;return}submit()}
function submit(){if(payload.value)emit('import',{mode:mode.value,...payload.value})}
function closeDialog(){emit('close');setTimeout(()=>opener?.focus(),0)}
function keydown(e:KeyboardEvent){if(e.key==='Escape'){if(confirmReplace.value)confirmReplace.value=false;else closeDialog()}}
onMounted(()=>{opener=document.activeElement as HTMLElement|null;window.addEventListener('keydown',keydown)});onBeforeUnmount(()=>window.removeEventListener('keydown',keydown));
</script>
<template>
  <div class="modal-backdrop" @mousedown.self="closeDialog">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div class="dialog-head"><h2 id="import-title">Importer un fichier Excel</h2><button aria-label="Fermer" @click="closeDialog">×</button></div>
      <label>Fichier Excel<input type="file" accept=".xlsx,.xls" @change="pick"></label>
      <div class="radio" role="radiogroup" aria-label="Mode d'import">
        <label><input v-model="mode" type="radio" value="merge"> Fusionner (N° + intitulé)</label>
        <label><input v-model="mode" type="radio" value="replace"> Remplacer</label>
      </div>
      <p v-if="payload">{{payload.projects.length}} projet(s) détecté(s) · {{payload.managers.length}} chef(s)</p>
      <p v-if="error" class="field-error" role="alert">{{error}}</p>
      <div class="dialog-actions"><button class="btn" @click="closeDialog">Annuler</button><button class="btn primary" :disabled="!payload" @click="go">Importer</button></div>
    </div>
    <div v-if="confirmReplace" class="modal-backdrop nested" @mousedown.self="confirmReplace=false">
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2>Remplacer les données ?</h2>
        <p>Les projets actuels seront remplacés par {{payload.projects.length}} projet(s). Cette opération est définitive.</p>
        <div class="dialog-actions"><button class="btn" @click="confirmReplace=false">Annuler</button><button class="btn danger-btn" @click="submit">Remplacer</button></div>
      </div>
    </div>
  </div>
</template>
