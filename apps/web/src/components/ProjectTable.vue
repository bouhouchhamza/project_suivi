<script setup lang="ts">
import type { Project, ProjectLine } from '../types';
defineProps<{rows:{project:Project;line:ProjectLine;firstVisible:boolean}[]}>();
defineEmits<{open:[Project]}>();
const fd=(s:string|null)=>{if(!s)return '—';const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('fr-FR')};
const remain=(s:string|null)=>{if(!s)return null;const [y,m,d]=s.split('-').map(Number);const target=new Date(y,m-1,d);const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());return Math.round((target.getTime()-today.getTime())/86400000)};
const cls=(n:number|null)=>n===null?'neutral':n<=5?'danger':n<=10?'warn':'ok';
</script>
<template>
  <div class="table-wrap">
    <table>
      <thead><tr><th>N° Projet</th><th>Intitulé</th><th>Priorité</th><th>Chef de projet</th><th>Département</th><th>Phase</th><th>Délai (j)</th><th>Date livrable</th><th>J‑ restant</th><th>Commentaire</th></tr></thead>
      <tbody>
        <tr v-if="!rows.length"><td colspan="10" class="empty">Aucune ligne ne correspond aux filtres actuels.</td></tr>
        <tr v-for="r in rows" :key="r.project.id+r.line.departement" :class="{projectStart:r.firstVisible}" tabindex="0" @click="$emit('open',r.project)" @keydown.enter="$emit('open',r.project)" @keydown.space.prevent="$emit('open',r.project)">
          <td class="mono">{{r.firstVisible?r.project.numero:''}}</td>
          <td><span v-if="r.firstVisible" class="title" :title="r.project.intitule">{{r.project.intitule}}</span></td>
          <td><span v-if="r.firstVisible&&r.project.priorite" class="priority" :class="r.project.priorite.toLowerCase()">{{r.project.priorite}}</span></td>
          <td>{{r.firstVisible?(r.project.chef??''):''}}</td>
          <td><span class="dept">{{r.line.departement}}</span></td>
          <td>{{r.line.phase??'—'}}</td>
          <td>{{r.line.delaiJours??'—'}}</td>
          <td>{{fd(r.line.dateLivrable)}}</td>
          <td><span class="jpill" :class="cls(remain(r.line.dateLivrable))"><i></i>{{remain(r.line.dateLivrable)===null?'—':remain(r.line.dateLivrable)+' j'}}</span></td>
          <td class="comment">{{r.line.commentaire??''}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
