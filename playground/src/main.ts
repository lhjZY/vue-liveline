import { createApp } from 'vue'
import App from './App.vue'

// 通过 package exports 映射到 dist/vue-liveline.css，用于验证发布后的样式子路径
import 'vue-liveline/dist/style.css'

createApp(App).mount('#app')
