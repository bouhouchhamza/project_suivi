<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
const data=ref<any|null>(null);
onMounted(async()=>{data.value=(await api<{data:any}>('/dashboard')).data});
</script>
<template>
  <section class="stack">
    <div class="kpi-grid" v-if="data">
      <button class="kpi"><strong>{{data.kpis.activeProjects}}</strong><span>Projets actifs</span></button>
      <button class="kpi"><strong>{{data.kpis.archivedProjects}}</strong><span>Projets archivés</span></button>
      <button class="kpi"><strong>{{data.kpis.highPriorityProjects}}</strong><span>Priorité haute</span></button>
      <button class="kpi danger"><strong>{{data.kpis.overdueDeliverables}}</strong><span>Livrables en retard</span></button>
      <button class="kpi"><strong>{{data.kpis.dueTodayDeliverables}}</strong><span>Aujourd'hui</span></button>
      <button class="kpi"><strong>{{data.kpis.dueNext7DaysDeliverables}}</strong><span>7 prochains jours</span></button>
      <button class="kpi"><strong>{{data.kpis.dueNext30DaysDeliverables}}</strong><span>30 prochains jours</span></button>
    </div>
    <div class="columns" v-if="data">
      <section class="plain-panel"><h2>Par chef de projet</h2><p v-for="x in data.byChef" :key="x.label"><b>{{x.label}}</b><span>{{x.count}}</span></p></section>
      <section class="plain-panel"><h2>Par priorité</h2><p v-for="x in data.byPriority" :key="x.label"><b>{{x.label}}</b><span>{{x.count}}</span></p></section>
      <section class="plain-panel"><h2>Par département</h2><p v-for="x in data.byDepartment" :key="x.label"><b>{{x.label}}</b><span>{{x.deliverables}}</span></p></section>
    </div>
  </section>
</template>
