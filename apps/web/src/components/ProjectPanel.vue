<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import type { Manager, Project } from '../types';
import { emptyProject } from '../types';

const props=defineProps<{open:boolean;project:Project|null;managers:Manager[];canEdit:boolean}>();
const emit=defineEmits<{close:[];save:[Project];remove:[Project];addManager:[string]}>();
const draft=ref<any>(emptyProject());
const baseline=ref('');
const newManager=ref('');
const confirmMode=ref<'close'|'delete'|null>(null);
const attempted=ref(false);
let opener:HTMLElement|null=null;

function resetDraft(){
  draft.value=structuredClone(toRaw(props.project ?? emptyProject()));
  if(!props.project)draft.value.numero='';
  baseline.value=JSON.stringify(draft.value);
  newManager.value=''; attempted.value=false; confirmMode.value=null;
}
watch(()=>[props.open,props.project] as const,()=>{if(props.open){opener=document.activeElement as HTMLElement|null;resetDraft()}},{immediate:true});
const dirty=computed(()=>JSON.stringify(draft.value)!==baseline.value);
const valid=computed(()=>String(draft.value.numero).trim()!==''&&Number.isInteger(Number(draft.value.numero))&&draft.value.intitule.trim().length>0&&draft.value.intitule.trim().length<=200);

function closePanel(){emit('close');setTimeout(()=>opener?.focus(),0)}
function requestClose(){if(dirty.value&&props.canEdit){confirmMode.value='close';return}closePanel()}
function confirmClose(){confirmMode.value=null;closePanel()}
function save(){attempted.value=true;if(valid.value){const out=structuredClone(toRaw(draft.value));out.numero=Number(out.numero);out.chef=out.chef||null;out.priorite=out.priorite||null;out.lignes=out.lignes.map((l:any)=>({...l,phase:l.phase||null,delaiJours:l.delaiJours === '' || l.delaiJours == null ? null : Number(l.delaiJours),dateLivrable:l.dateLivrable||null,commentaire:l.commentaire?.trim()?l.commentaire:null}));emit('save',out as Project)}}
function add(){const n=newManager.value.trim();if(n){emit('addManager',n);draft.value.chef=n;newManager.value=''}}
function requestDelete(){confirmMode.value='delete'}
function confirmDelete(){confirmMode.value=null;emit('remove',structuredClone(toRaw(draft.value)))}
function keydown(e:KeyboardEvent){if(e.key==='Escape'&&props.open){if(confirmMode.value){confirmMode.value=null}else requestClose()}}
onMounted(()=>window.addEventListener('keydown',keydown));
onBeforeUnmount(()=>window.removeEventListener('keydown',keydown));
</script>
<template>
  <div v-if="open" class="panel-layer" @mousedown.self="requestClose">
    <aside class="panel" role="dialog" aria-modal="true" :aria-label="project?'Modifier le projet':'Nouveau projet'">
      <header><h2>{{project?'Modifier le projet':'Nouveau projet'}}</h2><button @click="requestClose" aria-label="Fermer">×</button></header>
      <div class="panel-body">
        <label>N° Projet *<input v-model.number="draft.numero" type="number" required :disabled="!canEdit"></label>
        <label>Intitulé *<input v-model="draft.intitule" maxlength="200" required :disabled="!canEdit"></label>
        <div class="two">
          <label>Priorité<select v-model="draft.priorite" :disabled="!canEdit"><option :value="null">—</option><option value="HAUTE">HAUTE</option><option value="MOYENNE">MOYENNE</option><option value="BASSE">BASSE</option></select></label>
          <label>Chef de projet<select v-model="draft.chef" :disabled="!canEdit"><option :value="null">—</option><option v-for="m in managers" :key="m.id" :value="m.name">{{m.name}}</option></select></label>
        </div>
        <div v-if="canEdit" class="add-manager">
          <label class="sr-only" for="new-manager">Ajouter un nouveau chef de projet</label>
          <input id="new-manager" v-model="newManager" maxlength="120" placeholder="Ajouter un nouveau chef de projet…">
          <button class="btn" type="button" @click="add">Ajouter</button>
        </div>
        <h3>Suivi par département</h3>
        <section v-for="l in draft.lignes" :key="l.departement" class="dept-card">
          <strong>{{l.departement}}</strong>
          <div class="grid4">
            <label>Phase<select v-model="l.phase" :disabled="!canEdit"><option :value="null">—</option><option v-for="p in ['APS','APD','DCE','EXE']" :key="p" :value="p">{{p}}</option></select></label>
            <label>Délai livrable (jours)<input v-model.number="l.delaiJours" type="number" min="0" step="1" :disabled="!canEdit"></label>
            <label>Date livrable<input v-model="l.dateLivrable" type="date" :disabled="!canEdit"></label>
            <label class="wide">Commentaire<textarea v-model="l.commentaire" maxlength="2000" rows="3" :disabled="!canEdit"></textarea></label>
          </div>
        </section>
        <p v-if="attempted&&!valid" class="field-error" role="alert">Le numéro et l’intitulé sont obligatoires.</p>
      </div>
      <footer v-if="canEdit">
        <button v-if="project" class="btn danger-btn" @click="requestDelete">Archiver le projet</button><span></span>
        <button class="btn primary" :disabled="!valid" @click="save">Enregistrer</button>
      </footer>
    </aside>
    <div v-if="confirmMode" class="modal-backdrop nested" @mousedown.self="confirmMode=null">
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2>{{confirmMode==='delete'?'Archiver le projet ?':'Modifications non enregistrées'}}</h2>
        <p v-if="confirmMode==='delete'">Le projet sera déplacé dans les archives et pourra être restauré par un administrateur.</p>
        <p v-else>Des modifications ne sont pas enregistrées. Voulez-vous fermer sans enregistrer ?</p>
        <div class="dialog-actions">
          <button class="btn" @click="confirmMode=null">Annuler</button>
          <button v-if="confirmMode==='delete'" class="btn danger-btn" @click="confirmDelete">Archiver</button>
          <button v-else class="btn danger-btn" @click="confirmClose">Fermer sans enregistrer</button>
        </div>
      </div>
    </div>
  </div>
</template>
