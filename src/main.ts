import './styles/global.css'

import { createApp } from 'vue' // imports the function used to create a vue application
import App from './App.vue' // imports your main website component

createApp(App).mount('#app') // creates your Vue app and attaches it to the HTML but attaches with the ID app
