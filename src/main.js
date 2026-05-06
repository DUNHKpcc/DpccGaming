import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import {
  ElAlert,
  ElAside,
  ElAvatar,
  ElButton,
  ElButtonGroup,
  ElCard,
  ElContainer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag
} from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'
import { useThemeStore } from './stores/theme'

const app = createApp(App)
const pinia = createPinia()
const adminElementComponents = [
  ElAlert,
  ElAside,
  ElAvatar,
  ElButton,
  ElButtonGroup,
  ElCard,
  ElContainer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag
]

app.use(pinia)
app.use(router)
adminElementComponents.forEach((component) => {
  app.use(component)
})

// 初始化主题
const themeStore = useThemeStore()
themeStore.initTheme()

app.mount('#app')
