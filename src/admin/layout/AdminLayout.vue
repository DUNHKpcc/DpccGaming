<template>
  <div class="admin-layout">
    <el-container class="admin-container">
      <el-aside class="admin-sidebar" width="248px">
        <div class="admin-brand">
          <img class="admin-brand-mark" src="/favicon.png" alt="DPCC GAMING" />
          <div>
            <strong>DPCC GAMING</strong>
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
            <button
              type="button"
              class="admin-theme-toggle"
              :aria-label="themeToggleLabel"
              :title="themeToggleLabel"
              @click="toggleTheme"
            >
              <i :class="themeToggleIcon" aria-hidden="true"></i>
            </button>
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
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useThemeStore } from '../../stores/theme'

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
const themeStore = useThemeStore()

const themeToggleLabel = computed(() => {
  if (themeStore.themeMode === 'system') return '当前跟随系统，点击切换到亮色模式'
  if (themeStore.themeMode === 'light') return '当前亮色模式，点击切换到暗色模式'
  return '当前暗色模式，点击切换到跟随系统'
})

const themeToggleIcon = computed(() => {
  if (themeStore.themeMode === 'system') return 'fa fa-desktop'
  if (themeStore.themeMode === 'light') return 'fa fa-sun'
  return 'fa fa-moon'
})

const toggleTheme = () => {
  themeStore.toggleTheme()
}

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
  --admin-bg: var(--bg-secondary);
  --admin-surface: var(--bg-primary);
  --admin-surface-soft: var(--bg-tertiary);
  --admin-text: var(--text-primary);
  --admin-muted: var(--text-tertiary);
  --admin-border: var(--border-primary);
  --admin-strong-border: var(--border-secondary);
  --admin-primary: var(--btn-primary-bg);
  --admin-primary-text: var(--btn-primary-text);
  --admin-control-bg: var(--btn-secondary-bg);
  --admin-control-hover: var(--btn-secondary-hover-bg);
  --admin-warning-bg: #fef3c7;
  --admin-warning-text: #854d0e;
  --admin-warning-border: #a16207;
  --admin-danger-bg: #fee2e2;
  --admin-danger-text: #991b1b;
  --admin-danger-border: #b91c1c;
  --el-color-primary: var(--admin-primary);
  --el-color-primary-dark-2: var(--admin-primary);
  --el-color-primary-light-3: color-mix(in srgb, var(--admin-primary) 70%, var(--admin-surface));
  --el-color-primary-light-5: color-mix(in srgb, var(--admin-primary) 45%, var(--admin-surface));
  --el-color-primary-light-7: color-mix(in srgb, var(--admin-primary) 25%, var(--admin-surface));
  --el-color-primary-light-8: color-mix(in srgb, var(--admin-primary) 16%, var(--admin-surface));
  --el-color-primary-light-9: var(--admin-surface-soft);
  --el-bg-color: var(--admin-surface);
  --el-bg-color-overlay: var(--admin-surface);
  --el-fill-color-blank: var(--admin-surface);
  --el-fill-color-light: var(--admin-surface-soft);
  --el-fill-color-lighter: var(--admin-surface-soft);
  --el-text-color-primary: var(--admin-text);
  --el-text-color-regular: var(--admin-text);
  --el-text-color-secondary: var(--admin-muted);
  --el-border-color: var(--admin-border);
  --el-border-color-light: var(--admin-border);
  --el-border-color-lighter: var(--admin-border);
  min-height: 100vh;
  background: var(--admin-bg);
  color: var(--admin-text);
  overflow: hidden;
}

:global([data-theme="dark"]) .admin-layout {
  --admin-warning-bg: rgba(161, 98, 7, 0.18);
  --admin-warning-text: #facc15;
  --admin-warning-border: #a16207;
  --admin-danger-bg: rgba(185, 28, 28, 0.2);
  --admin-danger-text: #fca5a5;
  --admin-danger-border: #b91c1c;
}

.admin-container {
  min-height: 100vh;
}

.admin-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--admin-border);
  background: var(--admin-surface);
  color: var(--admin-text);
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 76px;
  padding: 0 1.25rem;
  border-bottom: 1px solid var(--admin-border);
}

.admin-brand-mark {
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 0.65rem;
  background: var(--admin-surface-soft);
  object-fit: cover;
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
  color: var(--admin-muted);
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
  color: var(--admin-muted);
}

.admin-menu :deep(.el-menu-item.is-active),
.admin-menu :deep(.el-menu-item:hover) {
  background: var(--admin-surface-soft);
  color: var(--admin-text);
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
  border-bottom: 1px solid var(--admin-border);
  background: var(--admin-surface);
}

.admin-topbar p,
.admin-topbar h1,
.admin-topbar small {
  margin: 0;
}

.admin-topbar p {
  color: var(--admin-muted);
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
  color: var(--admin-muted);
}

.admin-topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.admin-theme-toggle {
  display: inline-grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  cursor: pointer;
  border: 1px solid var(--admin-border);
  border-radius: 0.5rem;
  background: var(--admin-control-bg);
  color: var(--admin-text);
}

.admin-theme-toggle:hover {
  background: var(--admin-control-hover);
}

.admin-main {
  height: calc(100vh - 76px);
  padding: 1.25rem;
  overflow: auto;
}

.admin-layout :deep(.el-card),
.admin-layout :deep(.el-table),
.admin-layout :deep(.el-drawer),
.admin-layout :deep(.el-dialog),
.admin-layout :deep(.el-message-box) {
  background: var(--admin-surface);
  color: var(--admin-text);
}

.admin-layout :deep(.el-card) {
  border-color: var(--admin-border);
}

.admin-layout :deep(.el-table th.el-table__cell),
.admin-layout :deep(.el-table tr),
.admin-layout :deep(.el-table td.el-table__cell) {
  border-color: var(--admin-border);
  background: var(--admin-surface);
  color: var(--admin-text);
}

.admin-layout :deep(.el-table__inner-wrapper::before) {
  background: var(--admin-border);
}

.admin-layout :deep(.el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell) {
  background: var(--admin-surface-soft);
}

.admin-layout :deep(.el-input__wrapper),
.admin-layout :deep(.el-textarea__inner),
.admin-layout :deep(.el-select__wrapper) {
  border-color: var(--admin-border);
  background: var(--admin-surface);
  box-shadow: 0 0 0 1px var(--admin-border) inset;
}

.admin-layout :deep(.el-input__inner),
.admin-layout :deep(.el-textarea__inner),
.admin-layout :deep(.el-select__placeholder),
.admin-layout :deep(.el-select__selected-item),
.admin-layout :deep(.el-form-item__label),
.admin-layout :deep(.el-empty__description),
.admin-layout :deep(.el-pagination__total),
.admin-layout :deep(.el-pagination__goto),
.admin-layout :deep(.el-pagination__classifier) {
  color: var(--admin-text);
}

.admin-layout :deep(.el-input__inner::placeholder),
.admin-layout :deep(.el-textarea__inner::placeholder) {
  color: var(--admin-muted);
}

.admin-layout :deep(.el-pagination button),
.admin-layout :deep(.el-pager li) {
  background: var(--admin-control-bg);
  color: var(--admin-text);
}

.admin-layout :deep(.el-pager li.is-active) {
  background: var(--admin-primary);
  color: var(--admin-primary-text);
}

.admin-layout :deep(.admin-panel-card),
.admin-layout :deep(.content-panel-card),
.admin-layout :deep(.redeem-import-card),
.admin-layout :deep(.redeem-inventory-card) {
  background: var(--admin-surface);
  color: var(--admin-text);
}

.admin-layout :deep(.admin-filter-bar),
.admin-layout :deep(.order-filter-bar),
.admin-layout :deep(.redeem-inventory-toolbar),
.admin-layout :deep(.redeem-stats-strip),
.admin-layout :deep(.admin-pagination),
.admin-layout :deep(.admin-order-pagination),
.admin-layout :deep(.redeem-pagination),
.admin-layout :deep(.product-dialog-header),
.admin-layout :deep(.product-dialog-actions) {
  border-color: var(--admin-border);
}

.admin-layout :deep(.admin-game-cell p),
.admin-layout :deep(.admin-user-cell small),
.admin-layout :deep(.admin-order-table small),
.admin-layout :deep(.fulfillment-cell small),
.admin-layout :deep(.fulfillment-detail),
.admin-layout :deep(.redeem-card-header span),
.admin-layout :deep(.redeem-inventory-toolbar span),
.admin-layout :deep(.redeem-stat-item span),
.admin-layout :deep(.redeem-stat-item small),
.admin-layout :deep(.content-title-cell small),
.admin-layout :deep(form small),
.admin-layout :deep(.product-table small),
.admin-layout :deep(.promotion-cell small) {
  color: var(--admin-muted);
}

:global([data-theme="dark"] .el-popper),
:global([data-theme="dark"] .el-select-dropdown),
:global([data-theme="dark"] .el-picker-panel) {
  --el-bg-color-overlay: var(--bg-secondary);
  --el-fill-color-light: var(--bg-tertiary);
  --el-fill-color-blank: var(--bg-secondary);
  --el-text-color-primary: var(--text-primary);
  --el-text-color-regular: var(--text-secondary);
  --el-text-color-secondary: var(--text-tertiary);
  --el-border-color: var(--border-primary);
  --el-border-color-light: var(--border-primary);
  background: var(--bg-secondary);
  color: var(--text-primary);
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
