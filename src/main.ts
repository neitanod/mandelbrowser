import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { log } from './utils/logger';

log('main.ts: Creating Vue app...');
const app = createApp(App)

log('main.ts: Using Pinia...');
app.use(createPinia())
log('main.ts: Using Vue Router...');
app.use(router)

log('main.ts: Mounting app to #app...');
app.mount('#app')
