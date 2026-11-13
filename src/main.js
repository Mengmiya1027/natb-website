import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './styles/fonts.css'
import App from './App.vue'
import router from './router'
import { IconifyPlugin } from '@/utils/iconify'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(IconifyPlugin)

app.mount('#app')
