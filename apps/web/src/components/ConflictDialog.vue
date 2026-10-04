<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
defineProps<{open:boolean}>();
const emit=defineEmits(['reload','overwrite','close']);
function keydown(e:KeyboardEvent){if(e.key==='Escape')emit('close')}
onMounted(()=>window.addEventListener('keydown',keydown));onBeforeUnmount(()=>window.removeEventListener('keydown',keydown));
</script>
<template>
  <div v-if="open" class="modal-backdrop" @mousedown.self="$emit('close')">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title">
      <h2 id="conflict-title">Conflit de modification</h2>
      <p>Un collègue a enregistré une version plus récente de ce projet. Votre travail ne sera pas remplacé silencieusement.</p>
      <div class="dialog-actions"><button class="btn" @click="$emit('reload')">Recharger leur version</button><button class="btn danger-btn" @click="$emit('overwrite')">Écraser avec ma version</button></div>
    </div>
  </div>
</template>
