<template>
  <section class="payment-result-page">
    <main class="result-shell">
      <header class="result-header">
        <div>
          <p>DPCC API</p>
          <h1>{{ titleText }}</h1>
        </div>
        <RouterLink to="/payment" class="ghost-link">返回支付页</RouterLink>
      </header>

      <section class="status-band" :class="statusTone">
        <div class="status-mark">
          <i :class="statusIcon" aria-hidden="true"></i>
        </div>
        <div>
          <strong>{{ statusHeading }}</strong>
          <span>{{ statusDescription }}</span>
        </div>
      </section>

      <section class="result-grid">
        <div class="result-panel">
          <h2>订单信息</h2>
          <dl>
            <div>
              <dt>订单号</dt>
              <dd>{{ orderNo || '等待支付宝回传订单号' }}</dd>
            </div>
            <div>
              <dt>支付状态</dt>
              <dd>{{ paymentStatusText }}</dd>
            </div>
            <div v-if="orderResult.productName">
              <dt>商品</dt>
              <dd>{{ orderResult.productName }}</dd>
            </div>
            <div v-if="orderResult.amount">
              <dt>金额</dt>
              <dd>¥{{ orderResult.amount }}</dd>
            </div>
          </dl>
          <button type="button" class="primary-action" :disabled="isLoading || !orderNo" @click="loadOrderResult">
            {{ isLoading ? '正在检查...' : '重新检查支付结果' }}
          </button>
          <RouterLink v-if="isExpiredPending" to="/payment" class="secondary-action">重新发起支付</RouterLink>
        </div>

        <div class="result-panel redeem-panel">
          <h2>兑换码</h2>
          <div v-if="canRedeem" class="redeem-code-row">
            <code>{{ orderResult.redeemCode }}</code>
            <button type="button" @click="copyRedeemCode">复制</button>
          </div>
          <p v-else class="muted-copy">{{ redeemPlaceholderText }}</p>

          <a
            class="redeem-link"
            :href="redeemUrl"
            target="_blank"
            rel="noopener"
          >
            前往兑换网站
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </a>
        </div>

        <div class="support-panel">
          <h2>售后和技术支持</h2>
          <p>添加微信 {{ supportWechat }}，请同时提供订单号和兑换码。</p>
          <button type="button" @click="copySupportWechat">复制微信号</button>
        </div>
      </section>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </main>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { apiCall } from '../utils/api'

const route = useRoute()
const orderResult = ref({})
const errorMessage = ref('')
const isLoading = ref(false)
let pollTimerId = null

const queryOrderNo = computed(() => String(route.query.out_trade_no || route.query.orderNo || '').trim())
const orderNo = computed(() => queryOrderNo.value || sessionStorage.getItem('lastPaymentOrderNo') || '')
const supportWechat = computed(() => orderResult.value.supportWechat || '15160701051')
const redeemUrl = computed(() => orderResult.value.redeemUrl || 'https://api.dpccgaming.xyz/console/topup')
const canRedeem = computed(() => orderResult.value.status === 'paid' && Boolean(orderResult.value.redeemCode))
const isManualRequired = computed(() => orderResult.value.status === 'paid' && orderResult.value.fulfillmentStatus === 'manual_required')
const isExpiredPending = computed(() => {
  if (orderResult.value.status !== 'pending' || !orderResult.value.expiresAt) return false
  const expiresAt = new Date(orderResult.value.expiresAt).getTime()
  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
})

const titleText = computed(() => {
  if (canRedeem.value) return '支付成功'
  if (isManualRequired.value) return '支付成功，等待发码'
  if (isExpiredPending.value) return '支付未完成'
  return '检查支付结果'
})

const statusTone = computed(() => {
  if (canRedeem.value) return 'success'
  if (isManualRequired.value) return 'warning'
  if (isExpiredPending.value) return 'warning'
  if (errorMessage.value) return 'error'
  return 'pending'
})

const statusIcon = computed(() => {
  if (canRedeem.value) return 'fa-solid fa-check'
  if (isManualRequired.value) return 'fa-solid fa-headset'
  if (isExpiredPending.value) return 'fa-solid fa-clock-rotate-left'
  if (errorMessage.value) return 'fa-solid fa-triangle-exclamation'
  return 'fa-solid fa-spinner'
})

const statusHeading = computed(() => {
  if (canRedeem.value) return '已确认支付并发放兑换码'
  if (isManualRequired.value) return '已确认支付，库存待人工处理'
  if (isExpiredPending.value) return '订单未完成支付'
  if (errorMessage.value) return '暂时无法确认'
  return '正在等待支付宝确认'
})

const statusDescription = computed(() => {
  if (canRedeem.value) return '复制兑换码后前往外部兑换网站完成充值。'
  if (isManualRequired.value) return '请添加售后微信，我们会根据订单号补发兑换码。'
  if (isExpiredPending.value) return '这笔订单没有收到支付成功通知，请返回支付页重新下单。'
  if (errorMessage.value) return '请稍后重试，或添加微信联系售后。'
  return '支付宝异步通知可能延迟几秒，本页会自动刷新。'
})

const paymentStatusText = computed(() => {
  if (!orderResult.value.status) return '待检查'
  if (orderResult.value.status === 'paid') return '已支付'
  if (orderResult.value.status === 'closed') return '已关闭'
  if (isExpiredPending.value) return '未完成'
  return '待确认'
})

const redeemPlaceholderText = computed(() => (
  isManualRequired.value
    ? '当前档位兑换码库存不足，已转入人工发码。'
    : isExpiredPending.value
      ? '订单未完成支付，不会发放兑换码。'
    : '支付确认后这里会显示兑换码。'
))

const stopPolling = () => {
  if (pollTimerId) {
    window.clearInterval(pollTimerId)
    pollTimerId = null
  }
}

const startPolling = () => {
  stopPolling()
  pollTimerId = window.setInterval(() => {
    if (orderResult.value.status === 'paid') {
      stopPolling()
      return
    }
    loadOrderResult({ silent: true })
  }, 4000)
}

const loadOrderResult = async (options = {}) => {
  if (!orderNo.value) {
    errorMessage.value = '未找到订单号，请从支付页重新发起订单。'
    return
  }
  if (!options.silent) {
    errorMessage.value = ''
    isLoading.value = true
  }

  try {
    orderResult.value = await apiCall(`/payments/orders/${encodeURIComponent(orderNo.value)}`, {
      method: 'GET',
      suppressErrorLogging: true
    })
    if (orderResult.value.status === 'paid') {
      stopPolling()
    }
    if (isExpiredPending.value) {
      stopPolling()
    }
  } catch (error) {
    errorMessage.value = error.message || '查询支付结果失败'
  } finally {
    isLoading.value = false
  }
}

const copyText = async (text) => {
  if (!text) return
  await navigator.clipboard?.writeText(text)
}

const copyRedeemCode = () => copyText(orderResult.value.redeemCode)
const copySupportWechat = () => copyText(supportWechat.value)

onMounted(() => {
  loadOrderResult()
  startPolling()
})
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.payment-result-page {
  min-height: calc(100vh - 4rem);
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 3rem 1.5rem;
}

.result-shell {
  width: min(1080px, 100%);
  margin: 0 auto;
}

.result-header,
.status-band,
.result-grid,
.redeem-code-row,
.support-panel {
  display: flex;
}

.result-header {
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.result-header p,
.result-header h1,
.result-panel h2,
.support-panel h2,
.support-panel p {
  margin: 0;
}

.result-header p {
  color: var(--text-tertiary);
  font-weight: 900;
}

.result-header h1 {
  margin-top: 0.2rem;
  font-size: clamp(2rem, 5vw, 3.5rem);
  line-height: 1;
}

.ghost-link,
.primary-action,
.secondary-action,
.redeem-code-row button,
.support-panel button,
.redeem-link {
  border-radius: 0.5rem;
  font-weight: 900;
}

.ghost-link {
  border: 1px solid var(--border-primary);
  color: var(--text-primary);
  padding: 0.75rem 1rem;
  text-decoration: none;
}

.status-band {
  align-items: center;
  gap: 1rem;
  border: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  border-radius: 0.75rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.status-band.success {
  border-color: rgba(34, 197, 94, 0.45);
}

.status-band.warning {
  border-color: rgba(245, 158, 11, 0.5);
}

.status-band.error {
  border-color: rgba(239, 68, 68, 0.5);
}

.status-mark {
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  background: var(--text-primary);
  color: var(--bg-primary);
  display: grid;
  place-items: center;
}

.status-band strong,
.status-band span {
  display: block;
}

.status-band strong {
  font-size: 1.25rem;
}

.status-band span {
  margin-top: 0.25rem;
  color: var(--text-tertiary);
  font-weight: 700;
}

.result-grid {
  align-items: stretch;
  gap: 1rem;
  flex-wrap: wrap;
}

.result-panel,
.support-panel {
  border: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.result-panel {
  flex: 1 1 20rem;
}

.support-panel {
  flex: 1 1 100%;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.result-panel h2,
.support-panel h2 {
  font-size: 1rem;
}

.result-panel dl {
  margin: 1rem 0;
}

.result-panel dl div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid var(--border-primary);
  padding: 0.75rem 0;
}

.result-panel dt,
.muted-copy,
.support-panel p {
  color: var(--text-tertiary);
  font-weight: 700;
}

.result-panel dd {
  margin: 0;
  text-align: right;
  font-weight: 900;
  word-break: break-all;
}

.primary-action,
.secondary-action,
.redeem-code-row button,
.support-panel button,
.redeem-link {
  min-height: 2.75rem;
  border: 0;
  background: var(--text-primary);
  color: var(--bg-primary);
  padding: 0 1rem;
  cursor: pointer;
}

.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.75rem;
  border: 1px solid var(--border-primary);
  background: transparent;
  color: var(--text-primary);
  text-decoration: none;
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.redeem-code-row {
  align-items: center;
  gap: 0.75rem;
  margin: 1rem 0;
}

.redeem-code-row code {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  padding: 0.85rem;
  font-size: 1rem;
  word-break: break-all;
}

.redeem-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
}

.error-message {
  color: #ef4444;
  font-weight: 800;
}

@media (max-width: 720px) {
  .result-header,
  .support-panel {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
