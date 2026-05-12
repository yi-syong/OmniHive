import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Quasar, Notify, Dialog } from 'quasar'

// Import Quasar css
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'

// Import Leaflet css
import 'leaflet/dist/leaflet.css'

// Import app styles
import './style.css'

import App from './App.vue'

const app = createApp(App)

app.use(createPinia())

app.use(Quasar, {
  plugins: { Notify, Dialog },
  config: {
    dark: true,
    brand: {
      primary: '#FF9800',
      secondary: '#26A69A',
      accent: '#9C27B0',
      positive: '#4CAF50',
      negative: '#F44336',
      info: '#2196F3',
      warning: '#FFC107',
      dark: '#1a1a2e',
      'dark-page': '#0f0f23',
    }
  }
})

app.mount('#app')
