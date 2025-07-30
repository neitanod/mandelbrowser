<script setup lang="ts">
import MandelbrotViewer from '../components/MandelbrotViewer.vue';
import { log } from '../utils/logger';

log('HomeView.vue: Setup executed.');
</script>

<template>
  <main>
    <MandelbrotViewer />
  </main>
</template>

<style scoped>
main {
  width: 100%;
  height: 100%;
}
</style>
