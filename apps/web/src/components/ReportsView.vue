<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { getApiMessage, reportCompanyTitle } from '../b2b-ui';

const report=ref<any|null>(null);
const loading=ref(false);
const error=ref('');
function printReport(){window.print()}
async function load(){
  loading.value=true;error.value='';
  try{report.value=(await api<{data:any}>('/reports/management')).data}
  catch(e:any){error.value=getApiMessage(e,'Chargement du rapport impossible.')}
  finally{loading.value=false}
}
onMounted(load);
</script>
<template>
  <section class="plain-panel report-view">
    <div class="section-head">
      <div>
        <h2>Rapport management</h2>
        <small v-if="report">{{reportCompanyTitle(report.company)}} · Généré le {{new Date(report.generatedAt).toLocaleString('fr-FR')}}</small>
      </div>
      <div class="report-actions">
        <button class="btn" type="button" :disabled="loading" @click="load">Actualiser</button>
        <button class="btn primary" type="button" :disabled="!report" @click="printReport">Imprimer / PDF</button>
      </div>
    </div>
    <p v-if="loading" class="empty-state">Chargement du rapport...</p>
    <p v-if="error" class="field-error" role="alert">{{error}}</p>
    <template v-if="report">
      <div class="report-brand">
        <img v-if="report.company.companyLogo" :src="report.company.companyLogo" alt="">
        <div>
          <strong>{{report.company.clientName}}</strong>
          <span>{{report.company.appDomain}} · {{report.company.supportEmail}}</span>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><strong>{{report.kpis.activeProjects}}</strong><span>Projets actifs</span></div>
        <div class="kpi"><strong>{{report.kpis.dueTodayDeliverables}}</strong><span>Livrables aujourd’hui</span></div>
        <div class="kpi danger"><strong>{{report.kpis.overdueDeliverables}}</strong><span>Livrables en retard</span></div>
        <div class="kpi"><strong>{{report.kpis.dueNext7DaysDeliverables}}</strong><span>Échéances 7 jours</span></div>
        <div class="kpi"><strong>{{report.kpis.highPriorityProjects}}</strong><span>Priorité haute</span></div>
        <div class="kpi"><strong>{{report.kpis.archivedProjects}}</strong><span>Archivés</span></div>
      </div>
      <div class="report-columns">
        <section>
          <h3>Projets priorité haute</h3>
          <p v-if="!report.highPriorityProjects.length" class="empty-state">Aucun projet actif en priorité haute.</p>
          <ul><li v-for="p in report.highPriorityProjects" :key="p.id"><strong>{{p.numero}}</strong> - {{p.intitule}}</li></ul>
        </section>
        <section>
          <h3>Projets avec retard</h3>
          <p v-if="!report.overdueProjects.length" class="empty-state">Aucun retard actif. Les livrables dus aujourd’hui ne sont pas comptés en retard.</p>
          <ul><li v-for="p in report.overdueProjects" :key="p.id"><strong>{{p.numero}}</strong> - {{p.intitule}}</li></ul>
        </section>
      </div>
    </template>
  </section>
</template>
