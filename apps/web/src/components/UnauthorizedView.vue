<script setup lang="ts">
defineProps<{name:string}>();
defineEmits<{logout:[]}>();
</script>
<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="unauthorized-title">
      <div class="brand-mark">SP</div>
      <h1 id="unauthorized-title">Accès non autorisé</h1>
      <p>Le compte de {{ name }} est authentifié, mais aucun rôle ne lui a été attribué. Contactez un administrateur.</p>
      <button class="btn primary" @click="$emit('logout')">Se déconnecter</button>
    </section>
  </main>
</template>
