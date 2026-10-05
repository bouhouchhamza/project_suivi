<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ChartDataset } from '../chart-data';
import { chartSummary } from '../chart-data';

const props = defineProps<{ type: 'doughnut' | 'bar'; dataset: ChartDataset; title: string; horizontal?: boolean }>();

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: any = null;

async function render() {
  if (!canvas.value || props.dataset.isEmpty) return;
  const { Chart, ArcElement, BarElement, CategoryScale, LinearScale, DoughnutController, BarController, Tooltip, Legend } = await import('chart.js');
  Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, DoughnutController, BarController, Tooltip, Legend);
  chart?.destroy();
  chart = new Chart(canvas.value, {
    type: props.type,
    data: {
      labels: props.dataset.labels,
      datasets: [{ data: props.dataset.values, backgroundColor: props.dataset.colors, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: props.horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: props.type === 'doughnut', position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { enabled: true },
      },
      scales: props.type === 'bar' ? { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { beginAtZero: true, ticks: { precision: 0 } } } : undefined,
    },
  });
}

watch(() => props.dataset, render, { deep: true });
onMounted(render);
onBeforeUnmount(() => chart?.destroy());
</script>
<template>
  <div class="chart-body">
    <p v-if="dataset.isEmpty" class="empty-state chart-empty">Aucune donnée disponible.</p>
    <canvas v-else ref="canvas" role="img" :aria-label="`${title} — ${chartSummary(dataset)}`"></canvas>
  </div>
</template>
