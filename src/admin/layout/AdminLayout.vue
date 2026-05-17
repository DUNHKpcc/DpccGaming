<template>
  <div class="admin-layout">
    <el-container class="admin-container">
      <el-aside class="admin-sidebar" width="248px">
        <div class="admin-brand">
          <span class="admin-brand-mark">D</span>
          <div>
            <strong>DPCC Admin</strong>
            <small>运营管理后台</small>
          </div>
        </div>

        <el-menu
          class="admin-menu"
          :default-active="route.path"
          router
        >
          <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
            <i :class="item.icon"></i>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-container class="admin-workspace">
        <el-header class="admin-topbar" height="76px">
          <div>
            <p>{{ kicker }}</p>
            <h1>{{ title }}</h1>
            <small v-if="description">{{ description }}</small>
          </div>
          <div class="admin-topbar-actions">
            <slot name="actions"></slot>
          </div>
        </el-header>

        <el-main class="admin-main">
          <slot></slot>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import 'element-plus/dist/index.css'
import { useRoute } from 'vue-router'

defineProps({
  title: {
    type: String,
    required: true
  },
  kicker: {
    type: String,
    default: 'Admin'
  },
  description: {
    type: String,
    default: ''
  }
})

const route = useRoute()

const menuItems = [
  { path: '/admin', label: '审核管理', icon: 'fa fa-check-circle' },
  { path: '/admin/users', label: '用户管理', icon: 'fa fa-users' },
  { path: '/admin/games', label: '游戏管理', icon: 'fa fa-gamepad' },
  { path: '/admin/content', label: '内容管理', icon: 'fa fa-newspaper' },
  { path: '/admin/orders', label: '订单管理', icon: 'fa fa-receipt' },
  { path: '/admin/payment-products', label: '支付档位', icon: 'fa fa-credit-card' },
  { path: '/admin/redeem-codes', label: '兑换码管理', icon: 'fa fa-ticket' }
]
</script>

<style scoped>
.admin-layout {
  --el-color-primary: #000000;
  --el-color-primary-dark-2: #000000;
  --el-color-primary-light-3: #333333;
  --el-color-primary-light-5: #666666;
  --el-color-primary-light-7: #999999;
  --el-color-primary-light-8: #cccccc;
  --el-color-primary-light-9: #f2f2f2;
  min-height: 100vh;
  background: #f5f5f5;
  color: #111111;
  overflow: hidden;
}

.admin-container {
  min-height: 100vh;
}

.admin-sidebar {
  display: flex;
  flex-direction: column;
  background: #111111;
  color: #ffffff;
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 76px;
  padding: 0 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.admin-brand-mark {
  display: inline-grid;
  place-items: center;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 0.65rem;
  background: #ffffff;
  color: #000000;
  font-weight: 900;
}

.admin-brand strong,
.admin-brand small,
.admin-topbar p,
.admin-topbar h1,
.admin-topbar small {
  display: block;
}

.admin-brand strong {
  line-height: 1.2;
}

.admin-brand small {
  margin-top: 0.2rem;
  color: rgba(255, 255, 255, 0.58);
}

.admin-menu {
  flex: 1;
  border-right: 0;
  background: transparent;
}

.admin-menu :deep(.el-menu-item) {
  height: 46px;
  margin: 0.25rem 0.75rem;
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.72);
}

.admin-menu :deep(.el-menu-item.is-active),
.admin-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.admin-menu i {
  width: 1.2rem;
  margin-right: 0.65rem;
  text-align: center;
}

.admin-workspace {
  min-width: 0;
  min-height: 100vh;
}

.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid #dddddd;
  background: #ffffff;
}

.admin-topbar p,
.admin-topbar h1,
.admin-topbar small {
  margin: 0;
}

.admin-topbar p {
  color: #666666;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.admin-topbar h1 {
  margin-top: 0.2rem;
  font-size: 1.35rem;
  line-height: 1.2;
}

.admin-topbar small {
  margin-top: 0.15rem;
  color: #666666;
}

.admin-topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.admin-main {
  height: calc(100vh - 76px);
  padding: 1.25rem;
  overflow: auto;
}

@media (max-width: 820px) {
  .admin-container {
    display: block;
  }

  .admin-sidebar {
    width: 100% !important;
  }

  .admin-brand {
    min-height: 64px;
  }

  .admin-menu {
    display: flex;
    overflow-x: auto;
  }

  .admin-menu :deep(.el-menu-item) {
    flex: 0 0 auto;
  }

  .admin-topbar {
    min-height: 88px;
    height: auto !important;
    align-items: flex-start;
    flex-direction: column;
    padding: 0.9rem 1rem;
  }

  .admin-main {
    height: auto;
    min-height: calc(100vh - 152px);
    padding: 1rem;
  }
}
</style>
