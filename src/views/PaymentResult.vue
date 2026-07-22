<template>
  <section class="payment-result-page">
    <main class="result-shell">
      <header class="result-header">
        <div>
          <p>DPCC API</p>
          <h1>{{ titleText }}</h1>
        </div>
        <RouterLink to="/payment" class="order-dialog-secondary">返回支付页</RouterLink>
      </header>

      <section class="amount-box result-status" :class="statusTone">
        <div class="result-status-mark">
          <i :class="statusIcon" aria-hidden="true"></i>
        </div>
        <div>
          <span>支付状态</span>
          <strong :class="{ 'needs-username-heading': needsApiUsername }">{{ paymentStatusText }}</strong>
          <p>{{ statusHeading }} · {{ statusDescription }}</p>
        </div>
      </section>

      <section class="order-details result-order-details">
        <h3>订单信息</h3>
        <dl>
          <div>
            <dt>订单号</dt>
            <dd class="order-number-value">
              <span>{{ orderNo || '等待支付宝回传订单号' }}</span>
              <button v-if="orderNo" type="button" @click="copyOrderNo">复制</button>
            </dd>
          </div>
          <div v-if="orderResult.productName">
            <dt>商品</dt>
            <dd>{{ orderResult.productName }}</dd>
          </div>
          <div v-if="orderResult.createdAt">
            <dt>下单时间</dt>
            <dd>{{ formattedCreatedAt }}</dd>
          </div>
          <div v-if="orderResult.amount">
            <dt>金额</dt>
            <dd>¥{{ orderResult.amount }}</dd>
          </div>
          <div v-if="isServiceOrder">
            <dt>{{ accountFieldTitle }}</dt>
            <dd>{{ apiUsernameText }}</dd>
          </div>
        </dl>

        <div class="result-section">
          <h3>{{ isServiceOrder ? accountPanelTitle : '兑换码' }}</h3>
          <template v-if="isServiceOrder">
            <form v-if="needsApiUsername" class="api-username-form" @submit.prevent="submitApiUsername">
              <label>
                {{ accountFieldTitle }}
                <input
                  v-model="apiUsernameInput"
                  type="text"
                  maxlength="96"
                  autocomplete="off"
                  :placeholder="accountInputPlaceholder"
                />
              </label>
              <button type="submit" :disabled="isSubmittingApiUsername">
                {{ isSubmittingApiUsername ? '提交中...' : accountSubmitText }}
              </button>
            </form>
            <p v-else-if="orderResult.apiUsername" class="muted-copy">{{ accountSubmittedText }}</p>
            <p v-else class="muted-copy">支付确认后可提交{{ accountFieldTitle }}。</p>
            <p v-if="apiUsernameMessage" class="success-message">{{ apiUsernameMessage }}</p>

            <div v-if="isSubscriptionPaid && subscriptionBonusRedeemCodes.length" class="subscription-bonus-codes">
              <div
                v-for="item in subscriptionBonusRedeemCodes"
                :key="item.label"
                class="redeem-code-row"
              >
                <span class="redeem-code-label">{{ item.label }}</span>
                <code>{{ item.code }}</code>
                <button type="button" @click="copyRedeemCode(item.code)">复制</button>
              </div>
            </div>
            <p v-else-if="isSubscriptionManualRequired" class="muted-copy">
              赠送码当前库存不足，订单已转入人工补发。请先提交 DPCC-API 用户名，并通过售后微信提供订单号。
            </p>
          </template>

          <template v-else>
            <template v-if="canRedeem">
              <div
                v-for="item in redeemCodes"
                :key="item.label"
                class="redeem-code-row"
              >
                <span class="redeem-code-label">{{ item.label }}</span>
                <code>{{ item.code }}</code>
                <button type="button" @click="copyRedeemCode(item.code)">复制</button>
              </div>
            </template>
            <p v-else class="muted-copy">{{ redeemPlaceholderText }}</p>
          </template>

          <a class="redeem-link" :href="redeemUrl" target="_blank" rel="noopener">
            前往兑换网站
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </a>
        </div>

        <div class="support-block">
          <div>
            <h3>售后和技术支持</h3>
            <p>{{ supportCopy }}</p>
          </div>
        </div>
      </section>

      <div class="order-dialog-actions">
        <RouterLink to="/payment" class="order-dialog-secondary">返回支付页</RouterLink>
        <button type="button" class="pay-button" :disabled="isLoading || !orderNo" @click="loadOrderResult">
          {{ isLoading ? '正在检查...' : '重新检查支付结果' }}
        </button>
      </div>
      <p v-if="errorMessage" class="payment-error">{{ errorMessage }}</p>
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
const apiUsernameInput = ref('')
const apiUsernameMessage = ref('')
const isSubmittingApiUsername = ref(false)
let pollTimerId = null
let pollStartedAt = 0
let pollDelayMs = 4000

const MAX_PAYMENT_RESULT_POLL_MS = 120000
const MAX_PAYMENT_RESULT_POLL_DELAY_MS = 30000
const PAYMENT_NOTIFY_GRACE_MS = 2 * 60 * 1000

const queryOrderNo = computed(() => String(route.query.out_trade_no || route.query.orderNo || '').trim())
const orderNo = computed(() => queryOrderNo.value || sessionStorage.getItem('lastPaymentOrderNo') || '')
const supportWechat = computed(() => orderResult.value.supportWechat || '15160701051')
const redeemUrl = computed(() => orderResult.value.redeemUrl || 'https://api.dpccgaming.xyz/console/topup')
const isPaid = computed(() => orderResult.value.status === 'paid')
const isSubscriptionOrder = computed(() => orderResult.value.productType === 'subscription')
const isAccountOrder = computed(() => orderResult.value.productType === 'account')
const isServiceOrder = computed(() => isSubscriptionOrder.value || isAccountOrder.value)
const isSubscriptionPaid = computed(() => isPaid.value && isSubscriptionOrder.value)
const isAccountPaid = computed(() => isPaid.value && isAccountOrder.value)
const isSubscriptionManualRequired = computed(() => isSubscriptionPaid.value && orderResult.value.fulfillmentStatus === 'manual_required')
const isBonusSkipped = computed(() => isPaid.value && orderResult.value.fulfillmentStatus === 'bonus_skipped')
const promotionPayerRejectReason = computed(() => String(orderResult.value.promotionPayerRejectReason || '').trim())
const bonusNoticeText = computed(() => {
  const note = String(orderResult.value.supportNote || '').trim()
  return note.includes('赠送兑换码')
    || note.includes('付款账号')
    || note.includes('支付ID')
    || note.includes('限购促销')
    ? note
    : ''
})
const isPromotionPayerMissing = computed(() => isPaid.value && promotionPayerRejectReason.value === 'payer_missing')
const isPromotionPayerAlreadyUsed = computed(() => isPaid.value && promotionPayerRejectReason.value === 'already_used')
const isPromotionPayerBlocked = computed(() => isPromotionPayerMissing.value || isPromotionPayerAlreadyUsed.value)
const needsApiUsername = computed(() => (isSubscriptionPaid.value || isAccountPaid.value) && !orderResult.value.apiUsername)
const redeemCodes = computed(() => {
  if (Array.isArray(orderResult.value.redeemCodes) && orderResult.value.redeemCodes.length) {
    return orderResult.value.redeemCodes.filter((item) => item?.code)
  }
  return orderResult.value.redeemCode
    ? [{ label: '原有额度', code: orderResult.value.redeemCode }]
    : []
})
const subscriptionBonusRedeemCodes = computed(() => (
  isSubscriptionPaid.value
    ? redeemCodes.value.filter((item) => String(item.label || '').includes('赠送'))
    : []
))
const canRedeem = computed(() => isPaid.value && orderResult.value.productType === 'recharge' && redeemCodes.value.length > 0)
const hasAllRedeemCodes = computed(() => canRedeem.value && orderResult.value.fulfillmentStatus === 'code_assigned')
const isManualRequired = computed(() => isPaid.value && orderResult.value.productType === 'recharge' && orderResult.value.fulfillmentStatus === 'manual_required')
const isExpiredPending = computed(() => {
  if (orderResult.value.status !== 'pending' || !orderResult.value.expiresAt) return false
  const expiresAt = new Date(orderResult.value.expiresAt).getTime()
  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
})
const isPaymentIncomplete = computed(() => orderResult.value.status === 'closed' || isExpiredPending.value)
const isPaymentInNotifyGrace = computed(() => {
  if (!isPaymentIncomplete.value || !orderResult.value.expiresAt) return false
  const expiresAt = new Date(orderResult.value.expiresAt).getTime()
  return Number.isFinite(expiresAt) && Date.now() <= expiresAt + PAYMENT_NOTIFY_GRACE_MS
})
const isPaymentFinalIncomplete = computed(() => isPaymentIncomplete.value && !isPaymentInNotifyGrace.value)
const formattedCreatedAt = computed(() => formatDateTime(orderResult.value.createdAt))
const accountFieldTitle = computed(() => (isAccountOrder.value ? '服务目标账号' : 'DPCC-API 用户名'))
const accountPanelTitle = computed(() => (isAccountOrder.value ? '账号/代充交付信息' : 'DPCC-API 平台用户名'))
const accountInputPlaceholder = computed(() => (
  isAccountOrder.value ? '请输入需要交付或代充的目标账号' : '请输入你在 DPCC-API 平台的用户名'
))
const accountSubmitText = computed(() => (isAccountOrder.value ? '提交目标账号' : '提交用户名'))
const accountSubmittedText = computed(() => (
  isAccountOrder.value
    ? `已提交 ${orderResult.value.apiUsername}，请等待售后核验与交付。`
    : `已提交 ${orderResult.value.apiUsername}，请等待 5 分钟。`
))
const apiUsernameText = computed(() => {
  if (orderResult.value.apiUsername) return orderResult.value.apiUsername
  if (isSubscriptionPaid.value || isAccountPaid.value) return '待填写'
  return '-'
})
const appendSupportWechat = (message = '') => {
  const normalizedMessage = String(message || '').trim()
  const contactText = `售后微信 ${supportWechat.value}`
  if (!normalizedMessage) return contactText
  if (normalizedMessage.includes(supportWechat.value)) return normalizedMessage
  return `${normalizedMessage} ${contactText}。`
}
const supportCopy = computed(() => (
  bonusNoticeText.value
    ? appendSupportWechat(bonusNoticeText.value)
    : isSubscriptionManualRequired.value
    ? `添加微信 ${supportWechat.value}，请同时提供订单号和 DPCC-API 用户名，售后会补发赠送码。`
    : isSubscriptionPaid.value
    ? `添加微信 ${supportWechat.value}，请同时提供订单号、DPCC-API 用户名和赠送金兑换码。`
    : isAccountPaid.value
    ? `添加微信 ${supportWechat.value}，请同时提供订单号和已提交的服务目标账号，等待售后核验与交付。`
    : `添加微信 ${supportWechat.value}，请同时提供订单号和兑换码。`
))

const titleText = computed(() => {
  if (isPromotionPayerBlocked.value) return '支付成功，限购待核验'
  if (isSubscriptionManualRequired.value && orderResult.value.apiUsername) return '支付成功，等待补发'
  if (isSubscriptionPaid.value && orderResult.value.apiUsername) return '支付成功，等待处理'
  if (isAccountPaid.value && orderResult.value.apiUsername) return '支付成功，等待交付'
  if (needsApiUsername.value) return isAccountOrder.value ? '支付成功，填写目标账号' : '支付成功，填写用户名'
  if (isBonusSkipped.value) return '支付成功'
  if (isManualRequired.value) return '支付成功，等待发码'
  if (hasAllRedeemCodes.value) return '支付成功'
  if (isPaymentFinalIncomplete.value) return '支付未完成'
  return '检查支付结果'
})

const statusTone = computed(() => {
  if (isPromotionPayerBlocked.value) return 'warning'
  if (isSubscriptionManualRequired.value) return 'warning'
  if (isSubscriptionPaid.value) return 'success'
  if (isAccountPaid.value) return 'success'
  if (isBonusSkipped.value) return 'success'
  if (hasAllRedeemCodes.value) return 'success'
  if (isManualRequired.value) return 'warning'
  if (isPaymentFinalIncomplete.value) return 'warning'
  if (errorMessage.value) return 'error'
  return 'pending'
})

const statusIcon = computed(() => {
  if (isPromotionPayerBlocked.value) return 'fa-solid fa-circle-exclamation'
  if (isSubscriptionManualRequired.value) return 'fa-solid fa-headset'
  if (isSubscriptionPaid.value && orderResult.value.apiUsername) return 'fa-solid fa-clock'
  if (isAccountPaid.value && orderResult.value.apiUsername) return 'fa-solid fa-clock'
  if (needsApiUsername.value) return 'fa-solid fa-user'
  if (isBonusSkipped.value) return 'fa-solid fa-check'
  if (isManualRequired.value) return 'fa-solid fa-headset'
  if (hasAllRedeemCodes.value) return 'fa-solid fa-check'
  if (isPaymentFinalIncomplete.value) return 'fa-solid fa-clock-rotate-left'
  if (errorMessage.value) return 'fa-solid fa-triangle-exclamation'
  return 'fa-solid fa-spinner'
})

const statusHeading = computed(() => {
  if (isPromotionPayerMissing.value) return '未收到支付宝支付ID'
  if (isPromotionPayerAlreadyUsed.value) return '你的支付ID已购买过'
  if (isSubscriptionManualRequired.value && orderResult.value.apiUsername) return '用户名已提交，赠送码待补发'
  if (isSubscriptionManualRequired.value) return '已确认支付，赠送码待人工补发'
  if (isSubscriptionPaid.value && orderResult.value.apiUsername) return '用户名已提交，请等待 5 分钟'
  if (isAccountPaid.value && orderResult.value.apiUsername) return '目标账号已提交，等待人工交付'
  if (needsApiUsername.value) return isAccountOrder.value ? '已确认支付，请填写服务目标账号' : '已确认支付，请填写 DPCC-API 用户名'
  if (isBonusSkipped.value) return '已发放本次兑换码'
  if (isManualRequired.value) return '已确认支付，库存待人工处理'
  if (hasAllRedeemCodes.value) return '已确认支付并发放兑换码'
  if (isPaymentFinalIncomplete.value) return '订单未完成支付'
  if (errorMessage.value) return '暂时无法确认'
  return '正在等待支付宝确认'
})

const statusDescription = computed(() => {
  if (isPromotionPayerBlocked.value) return appendSupportWechat(bonusNoticeText.value || '你的支付ID已购买过本次限购促销，当前订单已支付但未自动发放，请联系售后补差价或退款。')
  if (isSubscriptionManualRequired.value && orderResult.value.apiUsername) return '我们会处理月卡订阅，并通过售后补发赠送码。'
  if (isSubscriptionManualRequired.value) return '请提交你在另一个平台的用户名，赠送码库存不足的部分会由人工补发。'
  if (isSubscriptionPaid.value && orderResult.value.apiUsername) return '我们会按你提交的平台用户名处理月卡订阅。'
  if (isAccountPaid.value && orderResult.value.apiUsername) return '售后将核验你提交的目标账号，并按所购档位人工交付。'
  if (needsApiUsername.value) return isAccountOrder.value
    ? '请提交需要交付或代充的目标账号；不要填写密码、验证码或其他敏感凭证。'
    : bonusNoticeText.value || '请提交你在另一个平台的用户名，赠送金兑换码可在本页领取。'
  if (isBonusSkipped.value) return bonusNoticeText.value || '主兑换码已发放，赠送兑换码本次不再重复发放。'
  if (hasAllRedeemCodes.value) return '复制原有额度和赠送额度两个兑换码后前往外部兑换网站完成充值。'
  if (isManualRequired.value) return canRedeem.value
    ? '已发放当前可用兑换码，缺失部分请添加售后微信补发。'
    : '请添加售后微信，我们会根据订单号补发兑换码。'
  if (isPaymentFinalIncomplete.value) return '这笔订单没有收到支付成功通知，请返回支付页重新下单。'
  if (errorMessage.value) return '请稍后重试，或添加微信联系售后。'
  return '支付宝异步通知可能延迟几秒，本页会自动刷新。'
})

const paymentStatusText = computed(() => {
  if (!orderResult.value.status) return '待检查'
  if (orderResult.value.status === 'paid') return '已支付'
  if (isPaymentFinalIncomplete.value) return '未完成'
  return '待确认'
})

const redeemPlaceholderText = computed(() => (
  isPromotionPayerBlocked.value
    ? appendSupportWechat('你的支付ID已购买过本次限购促销，当前订单已支付但未自动发放，请联系售后补差价或退款。')
    : isManualRequired.value
    ? '当前档位兑换码库存不足，已转入人工发码。'
    : isPaymentFinalIncomplete.value
      ? '订单未完成支付，不会发放兑换码。'
    : '支付确认后这里会显示兑换码。'
))

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const stopPolling = () => {
  if (pollTimerId) {
    window.clearTimeout(pollTimerId)
    pollTimerId = null
  }
}

const shouldStopPolling = () => {
  if (document.hidden) return true
  if (orderResult.value.status === 'paid') return true
  if (isPaymentFinalIncomplete.value) return true
  return pollStartedAt > 0 && Date.now() - pollStartedAt >= MAX_PAYMENT_RESULT_POLL_MS
}

const schedulePolling = () => {
  stopPolling()
  if (shouldStopPolling()) return
  pollTimerId = window.setTimeout(async () => {
    await loadOrderResult({ silent: true })
    pollDelayMs = Math.min(Math.round(pollDelayMs * 1.5), MAX_PAYMENT_RESULT_POLL_DELAY_MS)
    schedulePolling()
  }, pollDelayMs)
}

const startPolling = () => {
  pollStartedAt = Date.now()
  pollDelayMs = 4000
  schedulePolling()
}

const handleVisibilityChange = async () => {
  if (document.hidden) {
    stopPolling()
    return
  }
  await loadOrderResult({ silent: true })
  startPolling()
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
    apiUsernameInput.value = orderResult.value.apiUsername || apiUsernameInput.value
    if (orderResult.value.status === 'paid') {
      stopPolling()
    }
    if (isPaymentFinalIncomplete.value) {
      stopPolling()
    }
  } catch (error) {
    errorMessage.value = error.message || '查询支付结果失败'
  } finally {
    isLoading.value = false
  }
}

const submitApiUsername = async () => {
  const apiUsername = apiUsernameInput.value.trim()
  if (!apiUsername) {
    errorMessage.value = isAccountOrder.value ? '请输入服务目标账号' : '请输入 DPCC-API 平台用户名'
    return
  }

  errorMessage.value = ''
  apiUsernameMessage.value = ''
  isSubmittingApiUsername.value = true
  try {
    const result = await apiCall(`/payments/orders/${encodeURIComponent(orderNo.value)}/api-username`, {
      method: 'POST',
      body: JSON.stringify({ apiUsername })
    })
    orderResult.value = {
      ...orderResult.value,
      apiUsername: result.apiUsername,
      fulfillmentStatus: result.fulfillmentStatus
    }
    apiUsernameMessage.value = result.message || (isAccountOrder.value ? '目标账号已提交，请等待售后核验与交付' : '已提交，请等待 5 分钟')
  } catch (error) {
    errorMessage.value = error.message || (isAccountOrder.value ? '保存服务目标账号失败' : '保存 DPCC-API 平台用户名失败')
  } finally {
    isSubmittingApiUsername.value = false
  }
}

const copyText = async (text) => {
  if (!text) return
  await navigator.clipboard?.writeText(text)
}

const copyOrderNo = () => copyText(orderNo.value)
const copyRedeemCode = (code) => copyText(code)

onMounted(() => {
  loadOrderResult()
  startPolling()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopPolling()
})
</script>

<style scoped>
.payment-result-page {
  min-height: calc(100vh - 4rem);
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: clamp(1.25rem, 4vw, 3rem);
}

.result-shell {
  width: min(30rem, 100%);
  margin: 3.65rem auto 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.15rem;
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  background: var(--bg-secondary);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.12);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.result-header p,
.result-header h1 {
  margin: 0;
}

.result-header p {
  color: var(--text-tertiary);
  font-size: 0.78rem;
  font-weight: 900;
}

.result-header h1 {
  margin-top: 0.2rem;
  font-size: 1.25rem;
  line-height: 1.2;
}

.result-header .order-dialog-secondary {
  min-height: 2.5rem;
  flex: 0 0 auto;
  padding: 0 0.8rem;
  white-space: nowrap;
}

.amount-box {
  border: 1px solid var(--text-primary);
  border-radius: 0.5rem;
  background: var(--bg-tertiary);
  padding: 0.85rem 0.9rem;
}

.result-status {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.result-status.success {
  border-color: rgba(34, 197, 94, 0.55);
}

.result-status.warning {
  border-color: rgba(245, 158, 11, 0.6);
}

.result-status.error {
  border-color: rgba(239, 68, 68, 0.6);
}

.result-status-mark {
  width: 2.6rem;
  height: 2.6rem;
  flex: 0 0 2.6rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--text-primary);
  color: var(--bg-primary);
}

.result-status span {
  display: block;
  color: var(--text-tertiary);
  font-size: 0.8rem;
  font-weight: 900;
}

.result-status strong {
  display: block;
  margin-top: 0.2rem;
  font-size: 1.35rem;
  line-height: 1.2;
}

.result-status strong.needs-username-heading {
  color: #ef4444;
}

.result-status p {
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1.5;
}

.order-details {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  padding: 0.85rem 0.9rem;
}

.result-order-details h3 {
  margin: 0;
  font-size: 1rem;
}

.result-order-details dl {
  display: grid;
  gap: 0.46rem;
  margin: 0.65rem 0 0;
}

.result-order-details dl > div {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: 0.75rem;
}

.result-order-details dt,
.result-order-details dd {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
}

.result-order-details dt {
  color: var(--text-tertiary);
}

.result-order-details dd {
  color: var(--text-secondary);
  font-weight: 800;
  text-align: right;
  word-break: break-word;
}

.result-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-primary);
}

.order-number-value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.order-number-value button,
.redeem-code-row button,
.api-username-form button {
  min-height: 2.4rem;
  border: 0;
  border-radius: 0.5rem;
  background: var(--text-primary);
  color: var(--bg-primary);
  padding: 0 0.7rem;
  cursor: pointer;
  font-weight: 900;
}

.redeem-code-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.75rem;
}

.redeem-code-label {
  width: 4.5rem;
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-size: 0.8rem;
  font-weight: 900;
}

.redeem-code-row code {
  min-width: 0;
  flex: 1;
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  padding: 0.65rem;
  font-size: 0.86rem;
  word-break: break-all;
}

.api-username-form {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.75rem;
}

.api-username-form label {
  display: grid;
  gap: 0.45rem;
  color: var(--text-tertiary);
  font-size: 0.84rem;
  font-weight: 800;
}

.api-username-form input {
  width: 100%;
  min-height: 2.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 0 0.85rem;
  font: inherit;
}

.api-username-form button:disabled,
.pay-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.muted-copy,
.support-block p {
  margin: 0.75rem 0 0;
  color: var(--text-tertiary);
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1.5;
}

.success-message {
  margin: 0.75rem 0 0;
  color: #22c55e;
  font-size: 0.84rem;
  font-weight: 800;
}

.redeem-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.75rem;
  color: var(--text-secondary);
  text-decoration: underline;
  text-underline-offset: 0.2rem;
  font-size: 0.84rem;
  font-weight: 800;
}

.redeem-link:hover {
  color: var(--text-primary);
}

.support-block {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-primary);
}

.order-dialog-actions {
  display: grid;
  grid-template-columns: 0.75fr 1.5fr;
  gap: 0.65rem;
}

.order-dialog-secondary,
.pay-button {
  min-height: 3.1rem;
  border-radius: 0.5rem;
  font-weight: 900;
}

.order-dialog-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  text-decoration: none;
}

.pay-button {
  border: 0;
  background: var(--text-primary);
  color: var(--bg-primary);
  cursor: pointer;
}

.payment-error {
  margin: 0;
  color: #ef4444;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.45;
}

@media (max-width: 720px) {
  .payment-result-page {
    padding: 1rem;
  }

  .result-shell {
    margin-top: 3.65rem;
    padding: 1rem;
  }

  .result-header {
    align-items: center;
  }

  .order-dialog-actions {
    grid-template-columns: 1fr;
  }
}
</style>
