<script setup lang="ts">
import { RouterView } from 'vue-router'
import { log } from './utils/logger';

log('App.vue: Setup executed.');
</script>

<template>
  <RouterView />
</template>

<style scoped>
/* Global styles for the app can go here */
</style>
