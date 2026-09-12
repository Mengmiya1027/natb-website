import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { IconifyPlugin } from '@/plugins/iconify'

const app = createApp(App)

app.use(createPinia())
app.use(IconifyPlugin)

app.mount('#app')
