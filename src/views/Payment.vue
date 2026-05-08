<template>
  <section class="payment-page">
    <div class="payment-shell">
      <header class="payment-header">
        <div class="payment-brand">
          <img src="/favicon.png" alt="DPCC API" class="payment-logo" />
          <div>
            <h1>DPCC API</h1>
            <p class="payment-kicker">{{ pageKicker }}</p>
          </div>
        </div>

        <div class="payment-header-actions">
          <div class="payment-secure-pill">
            <i class="fa-solid fa-lock secure-icon" aria-hidden="true"></i>
            <span class="status-dot"></span>
            HTTPS + 服务端签名
          </div>
        </div>
      </header>

      <main class="payment-workspace">
        <section class="plan-area" aria-labelledby="payment-title">
          <div class="section-heading">
            <div>
              <h2 id="payment-title">{{ paymentTitle }}</h2>
              <p>{{ paymentDescription }}</p>
            </div>
            <span class="lock-pill" :class="{ expired: isOrderLockExpired }">{{ lockPillText }}</span>
          </div>

          <div class="product-switch" role="tablist" aria-label="支付类型">
            <button
              type="button"
              :class="{ active: productMode === 'subscription' }"
              :aria-selected="productMode === 'subscription'"
              role="tab"
              @click="selectProductMode('subscription')"
            >
              月卡订阅
            </button>
            <button
              type="button"
              :class="{ active: productMode === 'recharge' }"
              :aria-selected="productMode === 'recharge'"
              role="tab"
              @click="selectProductMode('recharge')"
            >
              额度充值
            </button>
          </div>

          <div v-if="isSubscriptionMode" class="plan-grid">
            <button
              v-for="plan in plans"
              :key="plan.id"
              type="button"
              class="plan-card"
              :class="{ selected: plan.id === selectedPlanId, 'has-plan-bonus': plan.hasPlanBonus }"
              :aria-pressed="plan.id === selectedPlanId"
              @click="selectPlan(plan.id)"
            >
              <span v-if="plan.recommended" class="recommend-badge">推荐款项</span>
              <span v-if="plan.hasPlanBonus" class="recharge-bonus-badge">{{ plan.bonusText }}</span>
              <span class="plan-name">{{ plan.name }}</span>
              <strong>{{ plan.priceText }}</strong>
              <span class="daily-quota">{{ plan.dailyQuota }}</span>
              <span
                v-if="plan.hasPlanBonus"
                class="stock-line"
                :class="{ empty: !plan.hasBonusStock }"
              >
                {{ plan.bonusStockText }}
              </span>
              <span class="plan-divider"></span>
              <span class="plan-feature" v-for="feature in plan.features" :key="feature">
                {{ feature }}
              </span>
            </button>
          </div>

          <div v-else class="recharge-scroller">
            <div class="recharge-scroll-hint">向右滑动查看更多额度</div>
            <div class="plan-grid recharge-grid" aria-label="额度充值规格，可横向滚动">
              <button
                v-for="pack in rechargePackages"
                :key="pack.id"
                type="button"
                class="plan-card"
                :class="{ selected: pack.id === selectedRechargePackageId }"
                :aria-pressed="pack.id === selectedRechargePackageId"
                @click="selectRechargePackage(pack.id)"
              >
                <span class="plan-name">{{ pack.name }}</span>
                <span v-if="pack.hasRechargeBonus" class="recharge-bonus-badge">{{ pack.bonusText }}</span>
                <strong>{{ pack.priceText }}</strong>
                <span class="daily-quota recharge-quota">
                  <span v-if="pack.hasRechargeBonus" class="quota-original">{{ pack.originalQuotaText }}</span>
                  <span class="quota-upgraded">{{ pack.quotaText }}</span>
                </span>
                <span class="stock-line" :class="{ empty: !pack.hasMainStock }">{{ pack.stockText }}</span>
                <span
                  v-if="pack.hasRechargeBonus"
                  class="stock-line"
                  :class="{ empty: !pack.hasBonusStock }"
                >
                  {{ pack.bonusStockText }}
                </span>
                <span class="plan-divider"></span>
                <span class="plan-feature">✅到账余额 · ⚡调用扣费</span>
                <span class="plan-feature">🔒服务端锁定金额和额度</span>
              </button>
            </div>
          </div>

          <div class="payment-config">
            <section v-if="isSubscriptionMode" class="config-panel" aria-labelledby="duration-title">
              <h3 id="duration-title">开通周期</h3>
              <div class="duration-options">
                <button
                  v-for="duration in durations"
                  :key="duration.id"
                  type="button"
                  :class="{ active: duration.id === selectedDurationId }"
                  @click="selectDuration(duration.id)"
                >
                  {{ duration.label }}
                </button>
              </div>
            </section>

            <section class="config-panel" aria-labelledby="method-title">
              <h3 id="method-title">支付方式</h3>
              <div class="payment-method-icons">
                <button
                  type="button"
                  class="method-tile active"
                  aria-pressed="true"
                  aria-label="支付宝支付"
                  title="支付宝支付"
                >
                  <i class="fa-brands fa-alipay alipay-icon" aria-hidden="true"></i>
                  <span class="method-label">支付宝</span>
                </button>
              </div>
            </section>
          </div>
        </section>

        <aside class="order-panel" aria-labelledby="order-title">
          <div class="order-head">
            <h2 id="order-title">订单确认</h2>
            <span>已校验</span>
          </div>

          <section class="amount-box">
            <span>支付宝应付金额</span>
            <strong>{{ orderAmountText }}</strong>
            <p>{{ orderSummaryText }}</p>
          </section>

          <section class="order-details">
            <h3>支付款项</h3>
            <dl>
              <div>
                <dt>商品</dt>
                <dd>{{ selectedProductName }}</dd>
              </div>
              <div v-if="isSubscriptionMode">
                <dt>周期</dt>
                <dd>{{ selectedDuration.label }}</dd>
              </div>
              <div v-if="isSubscriptionMode && selectedPlan.hasPlanBonus">
                <dt>赠送余额</dt>
                <dd>{{ selectedPlan.bonusQuotaText }}</dd>
              </div>
              <div v-if="isSubscriptionMode && selectedPlan.hasPlanBonus">
                <dt>赠送码库存</dt>
                <dd :class="{ 'stock-warning': !selectedPlan.hasBonusStock }">{{ selectedPlan.bonusStockText }}</dd>
              </div>
              <div v-if="!isSubscriptionMode">
                <dt>到账</dt>
                <dd>
                  <span class="recharge-quota order-recharge-quota">
                    <span v-if="selectedRechargePackage.hasRechargeBonus" class="quota-original">{{ selectedRechargePackage.originalQuotaText }}</span>
                    <span class="quota-upgraded">{{ selectedRechargePackage.quotaText }}</span>
                  </span>
                </dd>
              </div>
              <div v-if="!isSubscriptionMode">
                <dt>兑换码库存</dt>
                <dd :class="{ 'stock-warning': !selectedRechargePackage.hasMainStock }">{{ selectedRechargePackage.stockText }}</dd>
              </div>
              <div v-if="!isSubscriptionMode && selectedRechargePackage.hasRechargeBonus">
                <dt>赠送码库存</dt>
                <dd :class="{ 'stock-warning': !selectedRechargePackage.hasBonusStock }">{{ selectedRechargePackage.bonusStockText }}</dd>
              </div>
              <div>
                <dt>订单</dt>
                <dd>{{ orderId }}</dd>
              </div>
              <div>
                <dt>收款方</dt>
                <dd>DPCC API 官方支付宝</dd>
              </div>
            </dl>
          </section>

          <section class="order-footer-note">
            <h3>订单提示</h3>
            <p>{{ orderFooterText }}</p>
          </section>

          <button
            type="button"
            class="pay-button"
            :disabled="isPayDisabled"
            @click="redirectToAlipay"
          >
            {{ isCreatingOrder ? '正在创建订单...' : `跳转支付宝支付 ${orderAmountText}` }}
          </button>
          <p v-if="paymentError" class="payment-error">{{ paymentError }}</p>
        </aside>
      </main>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { apiCall } from '../utils/api'

const ORDER_LOCK_SECONDS = 5 * 60

const planPresentation = {
  bronze: {
    features: ['✅适合轻量试用', '🎉每日凌晨自动重制额度', '⚠️额度用完后按余额扣费','💰月等值150$']
  },
  gold: {
    recommended: true,
    features: ['✅适合日常编码', '🎉每日凌晨自动重制额度', '⚠️额度用完后按余额扣费','💰月等值450$']
  },
  platinum: {
    features: ['✅适合高频调用', '🎉每日凌晨自动重制额度', '⚠️额度用完后按余额扣费','💰月等值1500$']
  }
}

const formatMoney = (amount) => `¥${Number(amount || 0).toFixed(2)}`
const formatQuota = (quota) => `每日 $${Number(quota || 0).toFixed(0)} 免费额度`
const formatRechargeQuota = (quota) => `到账 $${Number(quota || 0).toFixed(0)} 普通额度`
const formatBonusQuota = (quota) => `赠送 $${Number(quota || 0).toFixed(0)} 普通余额`
const formatRechargeBonus = (quota, originalQuota) => `多赠送 $${Math.max(0, Number(quota || 0) - Number(originalQuota || 0)).toFixed(0)}`
const normalizeStock = (value) => {
  const count = Number(value || 0)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}
const formatRedeemStock = (count, label = '兑换码') => {
  const normalized = normalizeStock(count)
  return normalized > 0 ? `${label}剩余 ${normalized} 个` : `${label}暂无库存，支付后人工处理`
}

const productMode = ref('subscription')
const plans = ref([])
const durations = ref([])
const rechargePackages = ref([])
const paymentError = ref('')
const isCreatingOrder = ref(false)
const orderExpiresAt = ref('')
const countdownNow = ref(Date.now())
let countdownTimerId = null
const emptyPlan = { name: '加载中', price: 0, dailyQuota: '正在加载额度', hasBonusStock: false, bonusStockText: '赠送码库存同步中' }
const emptyDuration = { label: '加载中', months: 1 }
const emptyRechargePackage = {
  name: '加载中',
  price: 0,
  quotaText: '正在加载额度',
  hasRechargeBonus: false,
  hasMainStock: false,
  hasBonusStock: false,
  stockText: '兑换码库存同步中',
  bonusStockText: '赠送码库存同步中'
}

const selectedPlanId = ref('gold')
const selectedDurationId = ref('1m')
const selectedRechargePackageId = ref('usd-25')

const selectProductMode = (mode) => {
  productMode.value = mode
  paymentError.value = ''
  clearOrderLock()
}

const selectPlan = (planId) => {
  selectedPlanId.value = planId
  clearOrderLock()
}

const selectDuration = (durationId) => {
  selectedDurationId.value = durationId
  clearOrderLock()
}

const selectRechargePackage = (packageId) => {
  selectedRechargePackageId.value = packageId
  clearOrderLock()
}

const isSubscriptionMode = computed(() => productMode.value === 'subscription')
const selectedPlan = computed(() => plans.value.find((plan) => plan.id === selectedPlanId.value) || plans.value[0] || emptyPlan)
const selectedDuration = computed(() => durations.value.find((duration) => duration.id === selectedDurationId.value) || durations.value[0] || emptyDuration)
const selectedRechargePackage = computed(() => (
  rechargePackages.value.find((pack) => pack.id === selectedRechargePackageId.value) || rechargePackages.value[0] || emptyRechargePackage
))
const pageKicker = computed(() => (isSubscriptionMode.value ? '月卡充值中心' : '普通额度充值中心'))
const paymentTitle = computed(() => (isSubscriptionMode.value ? '选择月卡款项' : '选择充值额度'))
const paymentDescription = computed(() => (
  isSubscriptionMode.value
    ? '月卡不支持退款，所有月卡用户均享受VIP渠道，PRO号池，最快的响应速度'
    : '普通额度一次性到账，按实际调用消耗，不改变当前月卡订阅状态'
))
const orderAmount = computed(() => (
  isSubscriptionMode.value
    ? Number(selectedPlan.value.price || 0) * Number(selectedDuration.value.months || 1)
    : Number(selectedRechargePackage.value.price || 0)
))
const orderAmountText = computed(() => formatMoney(orderAmount.value))
const selectedProductName = computed(() => (isSubscriptionMode.value ? selectedPlan.value.name : selectedRechargePackage.value.name))
const orderSummaryText = computed(() => (
  isSubscriptionMode.value
    ? `${selectedPlan.value.name} · ${selectedDuration.value.label} · ${selectedPlan.value.dailyQuota}`
    : `${selectedRechargePackage.value.name} · ${selectedRechargePackage.value.quotaText}`
))
const orderFooterText = computed(() => (
  isSubscriptionMode.value
    ? (selectedPlan.value.hasBonusStock
        ? '支付完成后请在结果页提交 DPCC-API 用户名，赠送码可在结果页领取。'
        : '当前赠送码暂无库存，支付后请提交用户名，赠送码会转入人工补发。')
    : (selectedRechargePackage.value.hasMainStock && selectedRechargePackage.value.hasBonusStock
        ? '支付完成后结果页会展示兑换码；复制后前往兑换网站完成充值。'
        : '当前有兑换码库存不足，支付后会转入人工发码，请凭订单号联系售后处理。')
))
const orderId = computed(() => `服务端创建后锁定`)
const isPayDisabled = computed(() => (
  isCreatingOrder.value
  || (isSubscriptionMode.value && (!selectedPlan.value.id || !selectedDuration.value.id))
  || (!isSubscriptionMode.value && !selectedRechargePackage.value.id)
))
const orderLockRemainingMs = computed(() => {
  if (!orderExpiresAt.value) return ORDER_LOCK_SECONDS * 1000
  const expiresAt = new Date(orderExpiresAt.value).getTime()
  if (!Number.isFinite(expiresAt)) return 0
  return Math.max(0, expiresAt - countdownNow.value)
})
const orderLockCountdownText = computed(() => {
  const totalSeconds = Math.ceil(orderLockRemainingMs.value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const isOrderLockExpired = computed(() => Boolean(orderExpiresAt.value) && orderLockRemainingMs.value <= 0)
const lockPillText = computed(() => {
  if (!orderExpiresAt.value) return `下单后锁价 ${orderLockCountdownText.value}`
  if (isOrderLockExpired.value) return '订单锁价已过期'
  return `订单已锁价 ${orderLockCountdownText.value}`
})

const stopCountdown = () => {
  if (countdownTimerId) {
    window.clearInterval(countdownTimerId)
    countdownTimerId = null
  }
}

const startCountdown = () => {
  stopCountdown()
  countdownNow.value = Date.now()
  countdownTimerId = window.setInterval(() => {
    countdownNow.value = Date.now()
    if (orderLockRemainingMs.value <= 0) {
      stopCountdown()
    }
  }, 1000)
}

const clearOrderLock = () => {
  orderExpiresAt.value = ''
  countdownNow.value = Date.now()
  stopCountdown()
}

const loadPaymentCatalog = async () => {
  try {
    const catalog = await apiCall('/payments/catalog', {
      method: 'GET',
      suppressErrorLogging: true
    })
    plans.value = (catalog.plans || []).map((plan) => ({
      ...plan,
      ...planPresentation[plan.id],
      priceText: formatMoney(plan.price),
      dailyQuota: formatQuota(plan.dailyQuotaUsd),
      hasPlanBonus: Number(plan.bonusQuotaUsd || 0) > 0,
      bonusText: Number(plan.bonusQuotaUsd || 0) > 0 ? formatRechargeBonus(plan.bonusQuotaUsd, 0) : '',
      bonusQuotaText: Number(plan.bonusQuotaUsd || 0) > 0 ? formatBonusQuota(plan.bonusQuotaUsd) : '',
      hasBonusStock: normalizeStock(plan.bonusRedeemCodesAvailable) > 0,
      bonusStockText: formatRedeemStock(plan.bonusRedeemCodesAvailable, '赠送码'),
      features: planPresentation[plan.id]?.features || []
    }))
    durations.value = catalog.durations || []
    rechargePackages.value = (catalog.rechargePackages || []).map((pack) => {
      const originalQuotaUsd = pack.originalQuotaUsd
      const hasRechargeBonus = Number(originalQuotaUsd || 0) > 0 && Number(originalQuotaUsd) < Number(pack.quotaUsd || 0)
      return {
        ...pack,
        priceText: formatMoney(pack.price),
        quotaText: formatRechargeQuota(pack.quotaUsd),
        hasRechargeBonus,
        originalQuotaText: hasRechargeBonus ? formatRechargeQuota(originalQuotaUsd) : '',
        bonusText: hasRechargeBonus ? formatRechargeBonus(pack.quotaUsd, originalQuotaUsd) : '',
        hasMainStock: normalizeStock(pack.availableRedeemCodes) > 0,
        hasBonusStock: normalizeStock(pack.bonusRedeemCodesAvailable) > 0,
        stockText: formatRedeemStock(pack.availableRedeemCodes, '兑换码'),
        bonusStockText: formatRedeemStock(pack.bonusRedeemCodesAvailable, '赠送码')
      }
    })
  } catch (error) {
    paymentError.value = error.message || '支付款项加载失败'
  }
}

const submitAlipayForm = (formHtml) => {
  const wrapper = document.createElement('div')
  wrapper.style.display = 'none'
  wrapper.innerHTML = formHtml
  const form = wrapper.querySelector('form')
  if (!form) {
    throw new Error('支付宝支付表单无效')
  }
  document.body.appendChild(wrapper)
  form.submit()
}

const redirectToAlipay = async () => {
  if (isCreatingOrder.value) return
  paymentError.value = ''
  isCreatingOrder.value = true

  try {
    const result = await apiCall('/payments/alipay/orders', {
      method: 'POST',
      body: JSON.stringify(isSubscriptionMode.value
        ? {
            productType: 'subscription',
            planId: selectedPlanId.value,
            durationId: selectedDurationId.value
          }
        : {
            productType: 'recharge',
            rechargePackageId: selectedRechargePackageId.value
          })
    })
    if (result.expiresAt) {
      orderExpiresAt.value = result.expiresAt
      startCountdown()
    }
    if (result.orderNo) {
      sessionStorage.setItem('lastPaymentOrderNo', result.orderNo)
    }
    submitAlipayForm(result.formHtml)
  } catch (error) {
    paymentError.value = error.message || '创建支付订单失败'
    isCreatingOrder.value = false
  }
}

onMounted(loadPaymentCatalog)
onBeforeUnmount(stopCountdown)
</script>

<style scoped>
.payment-page {
  --payment-plan-card-height: clamp(18.5rem, 38vh, 21rem);
  width: 100%;
  max-width: 100%;
  min-height: calc(100vh - 4rem);
  min-height: calc(100svh - 4rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: clamp(1rem, 3vh, 2.75rem) clamp(1rem, 3vw, 2.5rem) clamp(1.25rem, 3vh, 2.5rem);
}

:global([data-theme="light"]) .payment-page {
  --text-primary: #000000;
}

.payment-shell {
  width: min(1280px, 100%);
  max-width: 100%;
  min-height: 100%;
  margin: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.payment-header,
.payment-workspace,
.payment-header-actions,
.payment-brand,
.payment-config,
.product-switch,
.section-heading,
.order-head,
.payment-method-icons,
.payment-secure-pill {
  display: flex;
}

.payment-header {
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex: 0 0 auto;
  margin-bottom: clamp(0.75rem, 1.8vh, 1rem);
}

.payment-brand,
.payment-header-actions {
  align-items: center;
}

.payment-brand {
  gap: 0.875rem;
}

.payment-logo {
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
}

.payment-brand h1,
.payment-kicker,
.section-heading h2,
.config-panel h3,
.order-panel h2,
.order-panel h3 {
  margin: 0;
}

.payment-brand h1 {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 900;
  line-height: 1.12;
}

.payment-kicker {
  margin-top: 0.2rem;
  color: var(--text-tertiary);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0;
}

.payment-header-actions {
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.payment-secure-pill {
  align-items: center;
  border: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  border-radius: 999px;
}

.payment-secure-pill {
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 800;
}

.secure-icon {
  color: #4aed33;
  font-size: 0.8rem;
  line-height: 1;
}

.status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #4aed33;
}

.duration-options button,
.product-switch button,
.plan-card,
.method-tile,
.pay-button {
  cursor: pointer;
}

.duration-options button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  font-weight: 800;
}

.duration-options button.active {
  background: var(--text-primary);
  color: var(--bg-primary);
}

.product-switch {
  width: fit-content;
  max-width: 100%;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  background: var(--bg-secondary);
  padding: 0.3rem;
}

.product-switch button {
  min-width: 7rem;
  min-height: 2.55rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-tertiary);
  font-weight: 900;
}

.product-switch button.active {
  background: var(--text-primary);
  color: var(--bg-primary);
}

.payment-workspace {
  align-items: stretch;
  gap: clamp(1rem, 2vw, 1.5rem);
  flex: 1 1 auto;
  width: 100%;
  max-width: 100%;
  overflow: visible;
  min-height: 0;
}

.plan-area {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  width: 0;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: visible;
}

.section-heading {
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  flex: 0 0 auto;
  margin-bottom: 0.85rem;
}

.section-heading h2 {
  font-size: clamp(1.55rem, 2.4vw, 2rem);
  line-height: 1.08;
}

.section-heading p {
  color: var(--text-tertiary);
  line-height: 1.55;
}

.section-heading p {
  max-width: 42rem;
  margin: 0.35rem 0 0;
  font-weight: 700;
}

.lock-pill {
  flex: 0 0 auto;
  border: 1px solid var(--border-secondary);
  border-radius: 999px;
  padding: 0.55rem 0.8rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 800;
}

.lock-pill.expired {
  border-color: rgba(239, 68, 68, 0.35);
  color: #ef4444;
}

.plan-grid,
.duration-options {
  display: grid;
}

.plan-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  flex: 0 0 auto;
  margin-bottom: 0.85rem;
}

.recharge-scroller {
  flex: 0 0 auto;
}

.recharge-scroll-hint {
  margin: -0.2rem 0 0.45rem;
  color: var(--text-tertiary);
  font-size: 0.78rem;
  font-weight: 900;
}

.recharge-grid {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  gap: 1rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 0 0.55rem;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.recharge-grid::-webkit-scrollbar {
  display: none;
}

.plan-card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: var(--payment-plan-card-height);
  height: var(--payment-plan-card-height);
  padding: clamp(1.25rem, 2.5vh, 1.875rem) clamp(1rem, 2vw, 1.5rem) clamp(1rem, 2vh, 1.5rem);
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  text-align: left;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.plan-card.has-plan-bonus {
  padding-top: clamp(3.25rem, 5vh, 4rem);
}

.recharge-grid .plan-card {
  flex: 0 0 calc((100% - 2rem) / 3);
  scroll-snap-align: start;
}

.plan-card.selected {
  background: var(--text-primary);
  border-color: var(--text-primary);
  color: var(--bg-primary);
  box-shadow: inset 0 0 0 1px var(--text-primary);
}

.plan-card.selected .daily-quota,
.plan-card.selected .plan-feature,
.plan-card.selected .stock-line {
  color: var(--bg-primary);
}

.plan-card.selected .plan-divider {
  background: var(--bg-primary);
}

.plan-card.selected .recommend-badge {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.recommend-badge {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  max-width: calc(100% - 3rem);
  border-radius: 999px;
  background: var(--text-primary);
  color: var(--bg-primary);
  padding: 0.35rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 900;
  white-space: nowrap;
}

.plan-card.has-plan-bonus .recommend-badge {
  top: 1rem;
  right: auto;
  left: 1rem;
}

.plan-name {
  min-height: 1.7rem;
  font-size: 1.2rem;
  font-weight: 900;
}

.plan-card strong {
  margin-top: 0.7rem;
  font-size: clamp(1.95rem, 3.6vw, 2.75rem);
  line-height: 1;
}

.daily-quota {
  margin-top: 0.9rem;
  color: var(--text-secondary);
  font-weight: 900;
}

.stock-line {
  margin-top: 0.45rem;
  color: var(--text-tertiary);
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1.35;
}

.stock-line.empty,
.stock-warning {
  color: #f59e0b;
}

.recharge-bonus-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1;
  border-radius: 0.2rem 0.2rem 0.2rem 0;
  padding: 0.38rem 0.68rem;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #ffffff;
  box-shadow: 0 0.45rem 1rem rgba(239, 68, 68, 0.26);
  font-size: 0.74rem;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
  transform: rotate(2deg);
}

.recharge-bonus-badge::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -0.35rem;
  border-top: 0.35rem solid #b91c1c;
  border-left: 0.35rem solid transparent;
}

.recharge-grid .plan-name {
  display: block;
  max-width: calc(100% - 7.25rem);
}

.recharge-quota {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.28rem;
  line-height: 1.25;
}

.quota-original {
  color: inherit;
  font-size: 0.82rem;
  font-weight: 800;
  text-decoration: line-through;
  text-decoration-color: #f5b301;
  text-decoration-thickness: 2px;
  text-decoration-skip-ink: none;
}

.quota-upgraded {
  color: inherit;
  font-weight: 900;
}

.order-recharge-quota {
  margin-top: 0;
}

.plan-divider {
  width: 100%;
  height: 1px;
  margin: 1rem 0;
  background: var(--border-primary);
}

.plan-feature {
  color: var(--text-tertiary);
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.65;
}

.payment-config {
  gap: 1rem;
  flex: 0 0 auto;
  margin-top: 0;
  margin-bottom: 0;
}

.config-panel,
.order-panel {
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  background: var(--bg-secondary);
}

.config-panel {
  flex: 1 1 0;
  padding: 0.95rem 1rem;
}

.config-panel h3,
.order-panel h3 {
  font-size: 1rem;
}

.duration-options {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.625rem;
  margin-top: 0.65rem;
}

.duration-options button {
  min-height: 3rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
  font-size: 0.95rem;
}

.payment-method-icons {
  align-items: center;
  gap: 1.15rem;
  margin-top: 0.65rem;
}

.method-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 7.5rem;
  height: 3.5rem;
  border-radius: 0.375rem;
  border: 1px solid var(--border-primary);
  background: #ffffff;
  padding: 0 0.8rem;
}

.method-tile.active {
  border-color: var(--text-primary);
  box-shadow: inset 0 0 0 1px var(--text-primary);
}

.alipay-icon {
  font-size: 1.9rem;
  line-height: 1;
}

.alipay-icon {
  color: #1677ff;
}

.method-label {
  color: #111111;
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

:global([data-theme="light"]) .payment-page .method-label {
  color: #000000;
}

.order-head {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.order-head span {
  color: var(--text-tertiary);
  font-size: 0.78rem;
  font-weight: 900;
}

.order-panel {
  flex: 0 0 clamp(20.5rem, 31vw, 24.5rem);
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
  overflow: visible;
  padding: 1rem;
}

.amount-box,
.order-footer-note {
  background: var(--bg-tertiary);
  border-radius: 0.5rem;
  padding: 0.85rem 0.9rem;
}

.amount-box {
  border: 1px solid var(--text-primary);
}

.amount-box span,
.order-details dt {
  color: var(--text-tertiary);
}

.amount-box span {
  font-size: 0.8rem;
  font-weight: 900;
}

.amount-box strong {
  display: block;
  margin-top: 0.35rem;
  font-size: clamp(2rem, 3.6vw, 2.8rem);
  line-height: 1;
}

.amount-box p,
.order-footer-note p {
  margin: 0.42rem 0 0;
  color: var(--text-secondary);
  font-weight: 700;
  line-height: 1.5;
}

.order-details {
  border: 1px solid var(--border-primary);
  border-radius: 0.5rem;
  padding: 0.85rem 0.9rem;
}

.order-details dl {
  display: grid;
  gap: 0.46rem;
  margin: 0.65rem 0 0;
}

.order-details dl > div {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: 0.75rem;
}

.order-details dt,
.order-details dd {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
}

.order-details dd {
  color: var(--text-secondary);
  font-weight: 800;
  word-break: break-word;
}

.order-footer-note h3 {
  margin-bottom: 0.5rem;
}

.order-footer-note p {
  font-size: 0.84rem;
}

.pay-button {
  margin-top: 0;
  min-height: 3.1rem;
  border: 0;
  border-radius: 0.5rem;
  background: var(--text-primary);
  color: var(--bg-primary);
  font-size: 1rem;
  font-weight: 900;
}

.pay-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.payment-error {
  margin: -0.35rem 0 0;
  color: #ef4444;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.45;
}

@media (max-width: 860px) {
  .payment-page {
    padding: 1.5rem;
  }

  .payment-workspace {
    flex-direction: column;
  }

  .plan-area {
    flex: 0 0 auto;
    width: 100%;
  }

  .order-panel {
    flex-basis: auto;
  }
}

@media (max-height: 760px) and (min-width: 861px) {
  .payment-page {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  .payment-logo {
    width: 2.5rem;
    height: 2.5rem;
  }

  .payment-brand h1 {
    font-size: 1.45rem;
  }

  .section-heading p,
  .order-footer-note {
    display: none;
  }

  .plan-grid,
  .payment-config {
    gap: 0.75rem;
  }

  .plan-grid {
    margin-bottom: 0.7rem;
  }

  .plan-card {
    min-height: 17rem;
    height: 17rem;
  }

  .plan-divider {
    margin: 0.75rem 0;
  }

  .config-panel,
  .order-details,
  .amount-box {
    padding: 0.8rem;
  }

  .order-panel {
    gap: 0.65rem;
  }
}

@media (max-width: 760px) {
  .payment-page {
    padding: 1rem;
  }

  .payment-header,
  .section-heading,
  .payment-config {
    align-items: stretch;
    flex-direction: column;
  }

  .payment-header-actions {
    justify-content: flex-start;
  }

  .payment-secure-pill {
    width: 100%;
    justify-content: center;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }

  .product-switch {
    width: 100%;
  }

  .product-switch button {
    flex: 1 1 0;
    min-width: 0;
  }

  .duration-options {
    grid-template-columns: 1fr;
  }

  .plan-card {
    min-height: 0;
    height: auto;
  }

  .recharge-grid .plan-card {
    flex-basis: 100%;
  }
}
</style>
