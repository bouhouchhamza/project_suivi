<script setup lang="ts">
import type { User } from '../types';
defineProps<{user:User;projects:number;lines:number;synced:boolean;canEdit:boolean;canSeed:boolean}>();
defineEmits(['logout','new','import','export','users','seed']);
</script>
<template>
  <header class="topbar">
    <div>
      <h1>Suivi des Projets</h1>
      <small>{{projects}} projets · {{lines}} lignes</small>
    </div>
    <div class="top-actions">
      <span class="sync" :class="{off:!synced}">● {{synced?'Synchronisé':'Hors ligne'}}</span>
      <button v-if="canEdit" class="btn ghost" @click="$emit('import')">Importer un fichier Excel</button>
      <button class="btn ghost" @click="$emit('export')">Exporter en Excel</button>
      <button v-if="canEdit" class="btn primary" @click="$emit('new')">+ Nouveau projet</button>
      <details class="user-menu">
        <summary>{{user.name}} · {{user.role}}</summary>
        <div>
          <button v-if="user.role==='admin'" @click="$emit('users')">Utilisateurs</button>
          <button v-if="canSeed" @click="$emit('seed')">Initialiser les données</button>
          <button @click="$emit('logout')">Se déconnecter</button>
        </div>
      </details>
    </div>
  </header>
</template>
