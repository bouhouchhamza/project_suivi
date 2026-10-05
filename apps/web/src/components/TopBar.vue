<script setup lang="ts">
import type { ClientConfig, User } from '../types';
defineProps<{user:User;config?:ClientConfig|null;projects:number;lines:number;synced:boolean;canEdit:boolean;canSeed:boolean;view:string;unread:number}>();
defineEmits(['logout','new','import','export','users','seed','view']);
</script>
<template>
  <header class="topbar">
    <div class="brand-head">
      <img v-if="config?.companyLogo" class="top-logo" :src="config.companyLogo" alt="">
      <div>
        <h1>{{config?.clientName??'Suivi des Projets'}}</h1>
        <small>{{projects}} projets · {{lines}} lignes</small>
      </div>
    </div>
    <nav class="top-nav" aria-label="Navigation principale">
      <button :class="{active:view==='projects'}" @click="$emit('view','projects')">Projets</button>
      <button :class="{active:view==='dashboard'}" @click="$emit('view','dashboard')">Tableau de bord</button>
      <button :class="{active:view==='archives'}" @click="$emit('view','archives')">Archives</button>
      <button :class="{active:view==='notifications'}" @click="$emit('view','notifications')">Notifications <span v-if="unread" class="count">{{unread}}</span></button>
      <button :class="{active:view==='reports'}" @click="$emit('view','reports')">Rapports</button>
      <button v-if="user.role==='admin'" :class="{active:view==='audit'}" @click="$emit('view','audit')">Historique</button>
      <button v-if="user.role==='admin'" :class="{active:view==='settings'}" @click="$emit('view','settings')">Paramètres</button>
    </nav>
    <div class="top-actions">
      <span class="sync" :class="{off:!synced}">● {{synced?'Synchronisé':'Hors ligne'}}</span>
      <button v-if="canEdit&&view==='projects'" class="btn ghost" @click="$emit('import')">Importer un fichier Excel</button>
      <button class="btn ghost" @click="$emit('export')">Exporter en Excel</button>
      <button v-if="canEdit&&view==='projects'" class="btn primary" @click="$emit('new')">+ Nouveau projet</button>
      <details class="user-menu">
        <summary>{{user.name}} · {{user.role}}</summary>
        <div>
          <button @click="$emit('view','account')">Mon compte</button>
          <button v-if="user.role==='admin'" @click="$emit('users')">Utilisateurs</button>
          <button v-if="canSeed" @click="$emit('seed')">Initialiser les données</button>
          <button @click="$emit('logout')">Se déconnecter</button>
        </div>
      </details>
    </div>
  </header>
</template>
