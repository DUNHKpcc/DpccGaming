<template>
  <div class="account-history-panel">
    <section class="account-history-section">
      <div class="account-history-head">
        <div>
          <h3>订单历史</h3>
          <p>最近支付订单和发放状态</p>
        </div>
        <RouterLink to="/payment/orders" class="account-history-link">查看全部</RouterLink>
      </div>

      <div class="account-history-list">
        <div v-if="ordersLoading" class="account-history-empty">订单加载中...</div>
        <div v-else-if="ordersError" class="account-history-empty">{{ ordersError }}</div>
        <div v-else-if="!recentOrders.length" class="account-history-empty">暂无历史订单</div>
        <template v-else>
          <RouterLink
            v-for="order in recentOrders"
            :key="order.orderNo"
            :to="buildPaymentResultRoute(order.orderNo)"
            class="account-history-row"
          >
            <span class="account-history-row-main">
              <strong>{{ order.productName || order.skuId || '支付订单' }}</strong>
              <small>{{ order.orderNo }} · {{ formatPaymentDateTime(order.createdAt) }}</small>
            </span>
            <span :class="['account-history-status', `is-${paymentStatusTone(order.status)}`]">
              {{ paymentStatusText(order.status) }}
            </span>
          </RouterLink>
        </template>
      </div>
    </section>

    <section class="account-history-section">
      <div class="account-history-head">
        <div>
          <h3>蓝图创造历史</h3>
          <p>最近保存过的蓝图种子</p>
        </div>
        <RouterLink to="/blueprint" class="account-history-link">进入蓝图</RouterLink>
      </div>

      <div class="account-history-list">
        <div v-if="blueprintsLoading" class="account-history-empty">蓝图加载中...</div>
        <div v-else-if="blueprintsError" class="account-history-empty">{{ blueprintsError }}</div>
        <div v-else-if="!recentBlueprints.length" class="account-history-empty">暂无蓝图记录</div>
        <template v-else>
          <RouterLink
            v-for="blueprint in recentBlueprints"
            :key="blueprint.seed"
            :to="{ name: 'BlueprintMode', query: { seed: blueprint.seed } }"
            class="account-history-row"
          >
            <span class="account-history-row-main">
              <strong>{{ blueprint.title || blueprint.name || '未命名蓝图' }}</strong>
              <small>{{ blueprint.seed }} · {{ formatPaymentDateTime(blueprint.updatedAt || blueprint.createdAt) }}</small>
            </span>
            <span class="account-history-chip">{{ blueprint.ownership === 'source' ? '原创' : '副本' }}</span>
          </RouterLink>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { apiCall } from '../../utils/api'
import {
  buildPaymentResultRoute,
  formatPaymentDateTime,
  paymentStatusText,
  paymentStatusTone
} from '../../utils/paymentOrders'

const props = defineProps({
  isLoggedIn: {
    type: Boolean,
    default: false
  }
})

const orders = ref([])
const ordersLoading = ref(false)
const ordersError = ref('')
const blueprints = ref([])
const blueprintsLoading = ref(false)
const blueprintsError = ref('')

const recentOrders = computed(() => orders.value.slice(0, 5))
const recentBlueprints = computed(() => blueprints.value.slice(0, 5))

const loadOrders = async () => {
  if (!props.isLoggedIn) {
    orders.value = []
    return
  }

  ordersLoading.value = true
  ordersError.value = ''
  try {
    const payload = await apiCall('/payments/orders?limit=5', {
      method: 'GET',
      suppressErrorLogging: true
    })
    orders.value = Array.isArray(payload?.orders) ? payload.orders : []
  } catch (error) {
    orders.value = []
    ordersError.value = error?.message || '订单历史暂时不可用'
  } finally {
    ordersLoading.value = false
  }
}

const loadBlueprints = async () => {
  if (!props.isLoggedIn) {
    blueprints.value = []
    return
  }

  blueprintsLoading.value = true
  blueprintsError.value = ''
  try {
    const payload = await apiCall('/blueprints/recent?limit=5', {
      method: 'GET',
      suppressErrorLogging: true
    })
    blueprints.value = Array.isArray(payload?.blueprints) ? payload.blueprints : []
  } catch (error) {
    blueprints.value = []
    blueprintsError.value = error?.message || '蓝图历史暂时不可用'
  } finally {
    blueprintsLoading.value = false
  }
}

watch(
  () => props.isLoggedIn,
  () => {
    loadOrders()
    loadBlueprints()
  },
  { immediate: true }
)
</script>

<style scoped>
.account-history-panel {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: clamp(240px, 35vh, 360px) minmax(0, 1fr);
  gap: 0.9rem;
}

.account-history-section {
  min-height: 0;
  border: 1px solid var(--account-recent-border);
  background: var(--account-card-bg);
  border-radius: 8px;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
}

.account-history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.account-history-head h3,
.account-history-head p {
  margin: 0;
}

.account-history-head h3 {
  font-size: 1rem;
  font-weight: 800;
  color: var(--account-text);
}

.account-history-head p {
  margin-top: 0.18rem;
  font-size: 0.74rem;
  color: var(--account-text-soft);
}

.account-history-link {
  flex-shrink: 0;
  border: 1px solid var(--account-upload-border);
  border-radius: 5px;
  color: var(--account-text);
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.28rem 0.55rem;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.account-history-link:hover {
  background: var(--account-upload-bg);
  color: var(--account-upload-text);
}

.account-history-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-right: 0.2rem;
}

.account-history-empty {
  border: 1px dashed var(--account-recent-border);
  background: var(--account-recent-bg);
  border-radius: 7px;
  color: var(--account-text-soft);
  font-size: 0.82rem;
  padding: 0.85rem;
}

.account-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  border: 1px solid var(--account-recent-border);
  border-radius: 7px;
  background: var(--account-recent-bg);
  padding: 0.65rem 0.7rem;
  color: var(--account-text);
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.account-history-row:hover {
  background: color-mix(in srgb, var(--account-card-bg-hover) 88%, var(--account-icon-bg) 12%);
  border-color: color-mix(in srgb, var(--account-icon-bg) 50%, var(--account-recent-border) 50%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--account-icon-bg) 24%, transparent);
}

.account-history-row-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.account-history-row-main strong,
.account-history-row-main small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-history-row-main strong {
  font-size: 0.86rem;
  font-weight: 800;
}

.account-history-row-main small {
  font-size: 0.72rem;
  color: var(--account-text-soft);
}

.account-history-status,
.account-history-chip {
  flex-shrink: 0;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.22rem 0.5rem;
}

.account-history-status.is-paid {
  background: rgba(74, 237, 51, 0.16);
  color: #4aed33;
}

.account-history-status.is-closed {
  background: rgba(248, 113, 113, 0.16);
  color: #f87171;
}

.account-history-status.is-pending,
.account-history-chip {
  background: color-mix(in srgb, var(--account-icon-bg) 16%, transparent);
  color: var(--account-text-soft);
}
</style>
