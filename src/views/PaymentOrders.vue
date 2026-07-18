<template>
  <section class="payment-orders-page">
    <main class="payment-orders-shell">
      <header class="payment-orders-header">
        <div>
          <p>DPCC API</p>
          <h1>历史订单</h1>
        </div>
        <RouterLink to="/payment" class="payment-orders-action">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          购买 CDK
        </RouterLink>
      </header>

      <section class="payment-orders-toolbar">
        <div class="payment-orders-summary">
          <strong>{{ orders.length }}</strong>
          <span>笔订单</span>
        </div>
        <button type="button" class="payment-orders-refresh" :disabled="isLoading" @click="loadOrders">
          <i class="fa fa-refresh" :class="{ 'fa-spin': isLoading }" aria-hidden="true"></i>
          {{ isLoading ? '刷新中' : '刷新' }}
        </button>
      </section>

      <section class="payment-orders-panel">
        <div v-if="isLoading" class="payment-orders-state">订单加载中...</div>
        <div v-else-if="errorMessage" class="payment-orders-state is-error">{{ errorMessage }}</div>
        <div v-else-if="!orders.length" class="payment-orders-state">
          <strong>暂无历史订单</strong>
          <span>购买月卡、额度或账号代充服务后，订单会显示在这里。</span>
        </div>
        <div v-else class="payment-orders-list">
          <RouterLink
            v-for="order in orders"
            :key="order.orderNo"
            :to="buildPaymentResultRoute(order.orderNo)"
            class="payment-order-row"
          >
            <span class="payment-order-product">
              <strong>{{ order.productName || order.skuId || '支付订单' }}</strong>
              <small>{{ productTypeText(order.productType) }} · {{ order.orderNo }}</small>
            </span>
            <span class="payment-order-amount">¥{{ order.amount }}</span>
            <span :class="['payment-order-status', `is-${paymentStatusTone(order.status)}`]">
              {{ paymentStatusText(order.status) }}
            </span>
            <span class="payment-order-fulfillment">{{ fulfillmentStatusText(order.fulfillmentStatus) }}</span>
            <span class="payment-order-time">
              <strong>{{ formatPaymentDateTime(order.createdAt) }}</strong>
              <small>{{ order.paidAt ? `支付 ${formatPaymentDateTime(order.paidAt)}` : '未支付' }}</small>
            </span>
            <i class="fa fa-chevron-right payment-order-arrow" aria-hidden="true"></i>
          </RouterLink>
        </div>
      </section>
    </main>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { apiCall } from '../utils/api'
import {
  buildPaymentResultRoute,
  formatPaymentDateTime,
  fulfillmentStatusText,
  paymentStatusText,
  paymentStatusTone,
  productTypeText
} from '../utils/paymentOrders'

const orders = ref([])
const isLoading = ref(false)
const errorMessage = ref('')

const loadOrders = async () => {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const payload = await apiCall('/payments/orders?limit=100', {
      method: 'GET',
      suppressErrorLogging: true
    })
    orders.value = Array.isArray(payload?.orders) ? payload.orders : []
  } catch (error) {
    orders.value = []
    errorMessage.value = error?.message || '历史订单加载失败'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadOrders)
</script>

<style scoped>
.payment-orders-page {
  min-height: calc(100vh - 4rem);
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: clamp(1.25rem, 4vw, 3rem);
}

.payment-orders-shell {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.payment-orders-header,
.payment-orders-toolbar,
.payment-order-row {
  display: flex;
  align-items: center;
}

.payment-orders-header {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.payment-orders-header p,
.payment-orders-header h1 {
  margin: 0;
}

.payment-orders-header p {
  color: var(--text-tertiary);
  font-weight: 900;
}

.payment-orders-header h1 {
  margin-top: 0.2rem;
  font-size: clamp(2rem, 5vw, 3.3rem);
  line-height: 1;
}

.payment-orders-action,
.payment-orders-refresh {
  border-radius: 0.5rem;
  font-weight: 900;
}

.payment-orders-action {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid var(--border-primary);
  color: var(--text-primary);
  padding: 0.75rem 1rem;
  text-decoration: none;
}

.payment-orders-toolbar {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
}

.payment-orders-summary {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  color: var(--text-secondary);
}

.payment-orders-summary strong {
  color: var(--text-primary);
  font-size: 1.4rem;
}

.payment-orders-refresh {
  border: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 0.62rem 0.85rem;
  cursor: pointer;
}

.payment-orders-refresh:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.payment-orders-panel {
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.payment-orders-state {
  min-height: 260px;
  display: grid;
  place-content: center;
  gap: 0.35rem;
  color: var(--text-tertiary);
  text-align: center;
}

.payment-orders-state strong {
  color: var(--text-primary);
}

.payment-orders-state.is-error {
  color: #f87171;
}

.payment-orders-list {
  display: grid;
}

.payment-order-row {
  gap: 1rem;
  min-height: 5.25rem;
  border-bottom: 1px solid var(--border-primary);
  color: var(--text-primary);
  padding: 0.9rem 1rem;
  text-decoration: none;
  transition: background 0.18s ease;
}

.payment-order-row:last-child {
  border-bottom: 0;
}

.payment-order-row:hover {
  background: color-mix(in srgb, var(--bg-primary) 60%, var(--text-primary) 5%);
}

.payment-order-product,
.payment-order-time {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.payment-order-product {
  flex: 1 1 16rem;
}

.payment-order-product strong,
.payment-order-product small,
.payment-order-time strong,
.payment-order-time small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.payment-order-product small,
.payment-order-time small,
.payment-order-fulfillment {
  color: var(--text-tertiary);
  font-size: 0.78rem;
}

.payment-order-amount {
  min-width: 5rem;
  font-weight: 900;
}

.payment-order-status {
  min-width: 4.5rem;
  border-radius: 999px;
  padding: 0.28rem 0.6rem;
  text-align: center;
  font-size: 0.74rem;
  font-weight: 900;
}

.payment-order-status.is-paid {
  background: rgba(74, 237, 51, 0.16);
  color: #4aed33;
}

.payment-order-status.is-closed {
  background: rgba(248, 113, 113, 0.16);
  color: #f87171;
}

.payment-order-status.is-pending {
  background: rgba(250, 204, 21, 0.18);
  color: #facc15;
}

.payment-order-fulfillment {
  min-width: 5.5rem;
}

.payment-order-time {
  flex: 0 1 12rem;
  text-align: right;
}

.payment-order-time strong {
  font-size: 0.82rem;
}

.payment-order-arrow {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

@media (max-width: 760px) {
  .payment-orders-header,
  .payment-orders-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .payment-orders-action,
  .payment-orders-refresh {
    justify-content: center;
  }

  .payment-order-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
  }

  .payment-order-amount,
  .payment-order-status,
  .payment-order-fulfillment,
  .payment-order-time {
    min-width: 0;
  }

  .payment-order-time {
    grid-column: 1 / 3;
    text-align: left;
  }

  .payment-order-arrow {
    display: none;
  }
}
</style>
