<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { buildChefChart, buildDeadlineChart, buildDepartmentChart, buildPriorityChart } from '../chart-data';
import ChartCanvas from './ChartCanvas.vue';

const data = ref<any | null>(null);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true; error.value = '';
  try { data.value = (await api<{ data: any }>('/dashboard')).data; }
  catch (e: any) { error.value = e.message ?? 'Chargement du tableau de bord impossible.'; }
  finally { loading.value = false; }
}

const priorityChart = computed(() => buildPriorityChart(data.value?.byPriority ?? []));
const chefChart = computed(() => buildChefChart(data.value?.byChef ?? []));
const departmentChart = computed(() => buildDepartmentChart(data.value?.byDepartment ?? []));
const deadlineChart = computed(() => buildDeadlineChart(data.value?.kpis));

onMounted(load);
</script>
<template>
  <section class="stack dashboard-view">
    <p v-if="loading" class="empty-state">Chargement du tableau de bord...</p>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <template v-if="data">
      <div class="kpi-grid">
        <button class="kpi"><strong>{{ data.kpis.activeProjects }}</strong><span>Projets actifs</span></button>
        <button class="kpi"><strong>{{ data.kpis.archivedProjects }}</strong><span>Projets archivés</span></button>
        <button class="kpi"><strong>{{ data.kpis.highPriorityProjects }}</strong><span>Priorité haute</span></button>
        <button class="kpi danger"><strong>{{ data.kpis.overdueDeliverables }}</strong><span>Livrables en retard</span></button>
        <button class="kpi"><strong>{{ data.kpis.dueTodayDeliverables }}</strong><span>Aujourd'hui</span></button>
        <button class="kpi"><strong>{{ data.kpis.dueNext7DaysDeliverables }}</strong><span>7 prochains jours</span></button>
        <button class="kpi"><strong>{{ data.kpis.dueNext30DaysDeliverables }}</strong><span>30 prochains jours</span></button>
      </div>
      <div class="chart-grid">
        <section class="chart-card">
          <h2>Répartition des projets par priorité</h2>
          <ChartCanvas type="doughnut" :dataset="priorityChart" title="Répartition des projets par priorité" />
          <ul class="chart-legend">
            <li v-for="(label, i) in priorityChart.labels" :key="label"><i :style="{ background: priorityChart.colors[i] }"></i>{{ label }}<b>{{ priorityChart.values[i] }}</b></li>
          </ul>
        </section>
        <section class="chart-card">
          <h2>Projets par chef de projet</h2>
          <ChartCanvas type="bar" horizontal :dataset="chefChart" title="Projets par chef de projet" />
        </section>
        <section class="chart-card">
          <h2>Charge par département</h2>
          <ChartCanvas type="bar" :dataset="departmentChart" title="Charge par département" />
        </section>
        <section class="chart-card">
          <h2>Échéances des livrables</h2>
          <ChartCanvas type="bar" :dataset="deadlineChart" title="Échéances des livrables" />
        </section>
      </div>
    </template>
  </section>
</template>
