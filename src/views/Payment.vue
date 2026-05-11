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

          <div class="plan-mode-frame">
            <div
              class="plan-mode-panel"
              :class="{ active: isSubscriptionMode }"
              :aria-hidden="!isSubscriptionMode"
            >
              <div class="recharge-scroll-hint">向右滑动查看更多档位</div>
              <div class="plan-grid tier-scroll-grid" aria-label="月卡订阅规格，可横向滚动">
                <button
                  v-for="plan in plans"
                  :key="plan.id"
                  type="button"
                  class="plan-card"
                  :class="{ selected: plan.id === selectedPlanId, 'has-card-badges': plan.promotionBadgeText || plan.hasPlanBonus }"
                  :aria-pressed="plan.id === selectedPlanId"
                  @click="selectPlan(plan.id)"
                >
                  <span v-if="plan.badgeText" class="recommend-badge">{{ plan.badgeText }}</span>
                  <span v-if="plan.promotionBadgeText || plan.hasPlanBonus" class="bonus-badge-stack">
                    <span v-if="plan.promotionBadgeText" class="recharge-bonus-badge">{{ plan.promotionBadgeText }}</span>
                    <span v-if="plan.hasPlanBonus" class="recharge-bonus-badge">{{ plan.bonusText }}</span>
                  </span>
                  <span class="plan-name">{{ plan.name }}</span>
                  <span class="plan-price">
                    <span v-if="plan.hasPromotionPrice" class="promotion-original-price">{{ plan.originalPriceText }}</span>
                    <strong>{{ plan.priceText }}</strong>
                  </span>
                  <span class="daily-quota">{{ plan.dailyQuota }}</span>
                  <span
                    v-if="plan.hasPlanBonus"
                    class="stock-line"
                    :class="{ empty: !plan.hasBonusStock }"
                  >
                    {{ plan.bonusStockText }}
                  </span>
                  <span v-if="plan.bonusRedeemCodeUsed" class="stock-line used">已领取过赠送码，本次不重复赠送</span>
                  <span class="plan-divider"></span>
                  <span class="plan-feature" v-for="feature in plan.features" :key="feature">
                    {{ feature }}
                  </span>
                </button>
              </div>
            </div>

            <div
              class="plan-mode-panel"
              :class="{ active: !isSubscriptionMode }"
              :aria-hidden="isSubscriptionMode"
            >
              <div class="recharge-scroll-hint">向右滑动查看更多额度</div>
              <div class="plan-grid tier-scroll-grid recharge-grid" aria-label="额度充值规格，可横向滚动">
                <button
                  v-for="pack in rechargePackages"
                  :key="pack.id"
                  type="button"
                  class="plan-card"
                  :class="{ selected: pack.id === selectedRechargePackageId, 'has-card-badges': pack.promotionBadgeText || pack.hasRechargeBonus }"
                  :aria-pressed="pack.id === selectedRechargePackageId"
                  @click="selectRechargePackage(pack.id)"
                >
                  <span v-if="pack.badgeText" class="recommend-badge">{{ pack.badgeText }}</span>
                  <span class="plan-name">{{ pack.name }}</span>
                  <span v-if="pack.promotionBadgeText || pack.hasRechargeBonus" class="bonus-badge-stack">
                    <span v-if="pack.promotionBadgeText" class="recharge-bonus-badge">{{ pack.promotionBadgeText }}</span>
                    <span v-if="pack.hasRechargeBonus" class="recharge-bonus-badge">{{ pack.bonusText }}</span>
                  </span>
                  <span class="plan-price">
                    <span v-if="pack.hasPromotionPrice" class="promotion-original-price">{{ pack.originalPriceText }}</span>
                    <strong>{{ pack.priceText }}</strong>
                  </span>
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
                  <span v-if="pack.bonusRedeemCodeUsed" class="stock-line used">已领取过赠送码，本次不重复赠送</span>
                  <span class="plan-divider"></span>
                  <span class="plan-feature" v-for="feature in pack.features" :key="feature">
                    {{ feature }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div class="payment-config" :class="{ 'recharge-mode': !isSubscriptionMode }">
            <section
              class="config-panel duration-panel"
              :class="{ 'is-hidden': !isSubscriptionMode }"
              :aria-hidden="!isSubscriptionMode"
              aria-labelledby="duration-title"
            >
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
            <span v-if="hasOrderPromotionPrice" class="promotion-original-price amount-original-price">{{ orderOriginalAmountText }}</span>
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
              <div v-if="isSubscriptionMode && selectedPlan.bonusRedeemCodeUsed">
                <dt>赠送限制</dt>
                <dd class="stock-warning">你已领取过赠送兑换码，本次不重复赠送</dd>
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
              <div v-if="!isSubscriptionMode && selectedRechargePackage.bonusRedeemCodeUsed">
                <dt>赠送限制</dt>
                <dd class="stock-warning">你已领取过赠送兑换码，本次不重复赠送</dd>
              </div>
              <div v-if="selectedPromotionLimitNotice">
                <dt>限购说明</dt>
                <dd class="stock-warning">{{ selectedPromotionLimitNotice }}</dd>
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
            {{ payButtonText }}
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

const formatMoney = (amount) => `¥${Number(amount || 0).toFixed(2)}`
const formatUsdAmount = (value) => {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '0'
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}
const formatQuota = (quota) => `每日 $${formatUsdAmount(quota)} 免费额度`
const formatRechargeQuota = (quota) => `到账 $${formatUsdAmount(quota)} 普通额度`
const formatBonusQuota = (quota) => `赠送 $${formatUsdAmount(quota)} 普通余额`
const formatRechargeBonus = (quota, originalQuota) => `多赠送 $${formatUsdAmount(Math.max(0, Number(quota || 0) - Number(originalQuota || 0)))}`
const normalizeCardBadge = (badge) => {
  const normalized = String(badge || '').trim()
  return normalized === '推荐款项' ? '' : normalized
}
const buildPromotionPriceMeta = (product = {}) => {
  const currentPrice = Number(product.price ?? product.displayPrice ?? product.basePrice ?? 0)
  const originalPrice = Number(product.originalPrice ?? product.basePrice ?? currentPrice)
  const hasPromotionPrice = Boolean(product.activePromotion)
    && Number.isFinite(currentPrice)
    && Number.isFinite(originalPrice)
    && currentPrice < originalPrice

  return {
    hasPromotionPrice,
    originalPrice,
    originalPriceText: hasPromotionPrice ? formatMoney(originalPrice) : ''
  }
}
const normalizeStock = (value) => {
  const count = Number(value || 0)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}
const formatRedeemStock = (count, label = '兑换码') => {
  const normalized = normalizeStock(count)
  return normalized > 0 ? `${label}剩余 ${normalized} 个` : `${label}暂无库存，支付后人工处理`
}
const buildPromotionBadgeText = (product = {}) => {
  const promotion = product.activePromotion
  if (!promotion) return ''

  const promotionPrice = Number(promotion.promotionPrice ?? product.price)
  const originalPrice = Number(product.originalPrice ?? product.basePrice ?? product.price)
  const promotionBonusQuota = Number(promotion.promotionBonusQuotaUsd || 0)
  if (promotionBonusQuota > 0) {
    return promotion.badgeText || promotion.title || `促销赠送 $${formatUsdAmount(promotionBonusQuota)}`
  }
  if (Number.isFinite(promotionPrice) && Number.isFinite(originalPrice) && promotionPrice < originalPrice) {
    return promotion.badgeText || promotion.title || '限时优惠'
  }
  return promotion.badgeText || promotion.title || '限时促销'
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
const emptyPlan = { name: '加载中', price: 0, dailyQuota: '正在加载额度', hasBonusStock: false, bonusRedeemCodeUsed: false, bonusStockText: '赠送码库存同步中' }
const emptyDuration = { label: '加载中', months: 1 }
const emptyRechargePackage = {
  name: '加载中',
  price: 0,
  quotaText: '正在加载额度',
  hasRechargeBonus: false,
  bonusRedeemCodeUsed: false,
  hasMainStock: false,
  hasBonusStock: false,
  stockText: '兑换码库存同步中',
  bonusStockText: '赠送码库存同步中'
}

const selectedPlanId = ref('')
const selectedDurationId = ref('1m')
const selectedRechargePackageId = ref('')

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
const selectedActivePromotion = computed(() => (
  isSubscriptionMode.value
    ? selectedPlan.value.activePromotion
    : selectedRechargePackage.value.activePromotion
))
const orderAmount = computed(() => (
  isSubscriptionMode.value
    ? Number(selectedPlan.value.price || 0) * Number(selectedDuration.value.months || 1)
    : Number(selectedRechargePackage.value.price || 0)
))
const orderOriginalAmount = computed(() => {
  const product = isSubscriptionMode.value ? selectedPlan.value : selectedRechargePackage.value
  const originalPrice = Number(product.originalPrice ?? product.basePrice ?? product.price ?? 0)
  return isSubscriptionMode.value
    ? originalPrice * Number(selectedDuration.value.months || 1)
    : originalPrice
})
const hasOrderPromotionPrice = computed(() => (
  Boolean(selectedActivePromotion.value)
  && Number.isFinite(orderOriginalAmount.value)
  && orderOriginalAmount.value > orderAmount.value
))
const orderAmountText = computed(() => formatMoney(orderAmount.value))
const orderOriginalAmountText = computed(() => formatMoney(orderOriginalAmount.value))
const selectedProductName = computed(() => (isSubscriptionMode.value ? selectedPlan.value.name : selectedRechargePackage.value.name))
const orderSummaryText = computed(() => (
  isSubscriptionMode.value
    ? `${selectedPlan.value.name} · ${selectedDuration.value.label} · ${selectedPlan.value.dailyQuota}`
    : `${selectedRechargePackage.value.name} · ${selectedRechargePackage.value.quotaText}`
))
const selectedBonusRedeemCodeUsed = computed(() => (
  isSubscriptionMode.value
    ? selectedPlan.value.bonusRedeemCodeUsed
    : selectedRechargePackage.value.bonusRedeemCodeUsed
))
const selectedPromotionLimitNotice = computed(() => (
  selectedActivePromotion.value?.limitOnce
    ? '本促销同一站内账号和同一支付宝支付ID限购一次；重复支付不会自动发放权益，请联系售后补差价或退款。'
    : ''
))
const orderFooterText = computed(() => (
  selectedPromotionLimitNotice.value
    ? selectedPromotionLimitNotice.value
    : selectedBonusRedeemCodeUsed.value
    ? '赠送兑换码按站内账号和支付宝付款账号各限领取一次，本次只处理所选款项，不再重复赠送。'
    : isSubscriptionMode.value
    ? (selectedPlan.value.hasBonusStock
        ? '支付完成后请在结果页提交 DPCC-API 用户名，赠送码按站内账号和支付宝付款账号各限领取一次。'
        : '当前赠送码暂无库存，支付后请提交用户名，赠送码会转入人工补发。')
    : (selectedRechargePackage.value.hasMainStock && selectedRechargePackage.value.hasBonusStock
        ? '支付完成后结果页会展示兑换码；赠送码按站内账号和支付宝付款账号各限领取一次。'
        : '当前有兑换码库存不足，支付后会转入人工发码，请凭订单号联系售后处理。')
))
const orderId = computed(() => `服务端创建后锁定`)
const isPayDisabled = computed(() => (
  isCreatingOrder.value
  || (isSubscriptionMode.value && (!selectedPlan.value.id || !selectedDuration.value.id))
  || (!isSubscriptionMode.value && !selectedRechargePackage.value.id)
))
const payButtonText = computed(() => {
  if (isCreatingOrder.value) return '正在创建订单...'
  return `跳转支付宝支付 ${orderAmountText.value}`
})
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
    const subscriptionProducts = catalog.subscriptionProducts || catalog.plans || []
    plans.value = subscriptionProducts.map((plan) => {
      const bonusRedeemCodeUsed = Boolean(plan.bonusRedeemCodeUsed)
      const hasPlanBonus = Number(plan.bonusQuotaUsd || 0) > 0 && !bonusRedeemCodeUsed
      const features = Array.isArray(plan.features) ? plan.features : []
      const priceMeta = buildPromotionPriceMeta(plan)
      return {
        ...plan,
        ...priceMeta,
        priceText: formatMoney(plan.price),
        dailyQuota: formatQuota(plan.dailyQuotaUsd),
        hasPlanBonus,
        bonusText: hasPlanBonus ? formatRechargeBonus(plan.bonusQuotaUsd, 0) : '',
        bonusQuotaText: hasPlanBonus ? formatBonusQuota(plan.bonusQuotaUsd) : '',
        bonusRedeemCodeUsed,
        hasBonusStock: normalizeStock(plan.bonusRedeemCodesAvailable) > 0,
        bonusStockText: formatRedeemStock(plan.bonusRedeemCodesAvailable, '赠送码'),
        promotionBadgeText: buildPromotionBadgeText(plan),
        badgeText: normalizeCardBadge(plan.cardBadge),
        features
      }
    })
    durations.value = catalog.durations || []
    const rechargeProducts = catalog.rechargeProducts || catalog.rechargePackages || []
    rechargePackages.value = rechargeProducts.map((pack) => {
      const originalQuotaUsd = pack.originalQuotaUsd || pack.baseQuotaUsd
      const bonusRedeemCodeUsed = Boolean(pack.bonusRedeemCodeUsed)
      const hasRechargeBonus = !bonusRedeemCodeUsed && Number(pack.bonusQuotaUsd || 0) > 0
      const quotaUsd = bonusRedeemCodeUsed && originalQuotaUsd ? originalQuotaUsd : pack.quotaUsd
      const priceMeta = buildPromotionPriceMeta(pack)
      return {
        ...pack,
        ...priceMeta,
        priceText: formatMoney(pack.price),
        quotaText: formatRechargeQuota(quotaUsd),
        hasRechargeBonus,
        bonusRedeemCodeUsed,
        originalQuotaText: hasRechargeBonus ? formatRechargeQuota(originalQuotaUsd) : '',
        bonusText: hasRechargeBonus ? formatRechargeBonus(pack.quotaUsd, originalQuotaUsd) : '',
        hasMainStock: normalizeStock(pack.availableRedeemCodes) > 0,
        hasBonusStock: normalizeStock(pack.bonusRedeemCodesAvailable) > 0,
        stockText: formatRedeemStock(pack.availableRedeemCodes, '兑换码'),
        bonusStockText: formatRedeemStock(pack.bonusRedeemCodesAvailable, '赠送码'),
        promotionBadgeText: buildPromotionBadgeText(pack),
        badgeText: normalizeCardBadge(pack.cardBadge),
        features: Array.isArray(pack.features) && pack.features.length
          ? pack.features
          : ['✅到账余额 · ⚡调用扣费', '🔒服务端锁定金额和额度']
      }
    })
    if (!plans.value.some((plan) => plan.id === selectedPlanId.value)) {
      selectedPlanId.value = (plans.value.find((plan) => plan.recommended) || plans.value[0])?.id || ''
    }
    if (!durations.value.some((duration) => duration.id === selectedDurationId.value)) {
      selectedDurationId.value = durations.value[0]?.id || ''
    }
    if (!rechargePackages.value.some((pack) => pack.id === selectedRechargePackageId.value)) {
      selectedRechargePackageId.value = rechargePackages.value[0]?.id || ''
    }
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
            productId: selectedPlan.value.id,
            planId: selectedPlan.value.skuId || selectedPlan.value.id,
            durationId: selectedDurationId.value
          }
        : {
            productType: 'recharge',
            productId: selectedRechargePackage.value.id,
            rechargePackageId: selectedRechargePackage.value.skuId || selectedRechargePackage.value.id
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

<style scoped src="../styles/payment.css"></style>
