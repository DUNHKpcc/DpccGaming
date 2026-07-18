<template>
  <section class="payment-page">
    <div class="payment-shell">
      <header class="payment-header">
        <div class="payment-brand">
          <img src="/favicon.png" alt="DPCC API" class="payment-logo" />
          <div>
            <h1>DPCC API</h1>
          </div>
        </div>

      </header>

      <main class="payment-workspace">
        <section class="plan-area">
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
            <button
              type="button"
              :class="{ active: productMode === 'account' }"
              :aria-selected="productMode === 'account'"
              role="tab"
              @click="selectProductMode('account')"
            >
              账号/代充
            </button>
          </div>

          <div class="plan-mode-frame">
            <div
              class="plan-mode-panel"
              :class="{ active: isSubscriptionMode }"
              :aria-hidden="!isSubscriptionMode"
            >
              <div class="tier-control-bar">
                <div class="recharge-scroll-hint">向右滑动查看更多档位</div>
                <div class="tier-nav-buttons" aria-label="月卡订阅档位切换">
                  <button
                    type="button"
                    class="tier-nav-button"
                    :disabled="!canMoveSubscriptionPrev"
                    aria-label="上一档月卡订阅规格"
                    @click="moveSubscriptionTier(-1)"
                  >
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="tier-nav-button"
                    :disabled="!canMoveSubscriptionNext"
                    aria-label="下一档月卡订阅规格"
                    @click="moveSubscriptionTier(1)"
                  >
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div ref="subscriptionTierGrid" class="plan-grid tier-scroll-grid subscription-grid" aria-label="月卡订阅规格，可横向滚动">
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
              :class="{ active: isRechargeMode }"
              :aria-hidden="!isRechargeMode"
            >
              <div class="tier-control-bar">
                <div class="recharge-scroll-hint">向右滑动查看更多额度</div>
                <div class="tier-nav-buttons" aria-label="额度充值档位切换">
                  <button
                    type="button"
                    class="tier-nav-button"
                    :disabled="!canMoveRechargePrev"
                    aria-label="上一档额度充值规格"
                    @click="moveRechargeTier(-1)"
                  >
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="tier-nav-button"
                    :disabled="!canMoveRechargeNext"
                    aria-label="下一档额度充值规格"
                    @click="moveRechargeTier(1)"
                  >
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div ref="rechargeTierGrid" class="plan-grid tier-scroll-grid recharge-grid" aria-label="额度充值规格，可横向滚动">
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

            <div
              class="plan-mode-panel"
              :class="{ active: isAccountMode }"
              :aria-hidden="!isAccountMode"
            >
              <div class="tier-control-bar">
                <div class="recharge-scroll-hint">向右滑动查看更多账号与代充服务</div>
                <div class="tier-nav-buttons" aria-label="账号代充档位切换">
                  <button
                    type="button"
                    class="tier-nav-button"
                    :disabled="!canMoveAccountPrev"
                    aria-label="上一档账号代充规格"
                    @click="moveAccountTier(-1)"
                  >
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="tier-nav-button"
                    :disabled="!canMoveAccountNext"
                    aria-label="下一档账号代充规格"
                    @click="moveAccountTier(1)"
                  >
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div ref="accountTierGrid" class="plan-grid tier-scroll-grid" aria-label="账号代充规格，可横向滚动">
                <button
                  v-for="service in accountProducts"
                  :key="service.id"
                  type="button"
                  class="plan-card"
                  :class="{ selected: service.id === selectedAccountProductId, 'has-card-badges': service.badgeText || service.promotionBadgeText }"
                  :aria-pressed="service.id === selectedAccountProductId"
                  @click="selectAccountProduct(service.id)"
                >
                  <span v-if="service.badgeText" class="recommend-badge">{{ service.badgeText }}</span>
                  <span v-if="service.promotionBadgeText" class="bonus-badge-stack">
                    <span class="recharge-bonus-badge">{{ service.promotionBadgeText }}</span>
                  </span>
                  <span class="plan-name">{{ service.name }}</span>
                  <span class="plan-price">
                    <span v-if="service.hasPromotionPrice" class="promotion-original-price">{{ service.originalPriceText }}</span>
                    <strong>{{ service.priceText }}</strong>
                  </span>
                  <span class="daily-quota">{{ service.serviceText }}</span>
                  <span class="stock-line" :class="{ empty: !service.available }">{{ service.availabilityText }}</span>
                  <span class="plan-divider"></span>
                  <span v-for="feature in service.features" :key="feature" class="plan-feature">
                    {{ feature }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            class="checkout-trigger"
            :disabled="isPayDisabled"
            @click="openOrderDialog"
          >
            <i class="fa-brands fa-alipay" aria-hidden="true"></i>
            <span>确认支付 {{ orderAmountText }}</span>
          </button>
        </section>
      </main>
    </div>

    <Teleport to="body">
      <Transition name="order-dialog">
        <div
          v-if="isOrderDialogOpen"
          ref="orderDialogRef"
          class="order-dialog-backdrop"
          tabindex="-1"
          @click.self="closeOrderDialog"
          @keydown.esc="closeOrderDialog"
        >
          <aside
            class="order-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-title"
          >
            <div class="order-head">
              <h2 id="order-title">订单确认</h2>
              <button
                type="button"
                class="order-dialog-close"
                aria-label="关闭订单确认"
                title="关闭订单确认"
                @click="closeOrderDialog"
              >
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
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
                <div v-if="isRechargeMode">
                  <dt>到账</dt>
                  <dd>
                    <span class="recharge-quota order-recharge-quota">
                      <span v-if="selectedRechargePackage.hasRechargeBonus" class="quota-original">{{ selectedRechargePackage.originalQuotaText }}</span>
                      <span class="quota-upgraded">{{ selectedRechargePackage.quotaText }}</span>
                    </span>
                  </dd>
                </div>
                <div v-if="isRechargeMode">
                  <dt>兑换码库存</dt>
                  <dd :class="{ 'stock-warning': !selectedRechargePackage.hasMainStock }">{{ selectedRechargePackage.stockText }}</dd>
                </div>
                <div v-if="isRechargeMode && selectedRechargePackage.hasRechargeBonus">
                  <dt>赠送码库存</dt>
                  <dd :class="{ 'stock-warning': !selectedRechargePackage.hasBonusStock }">{{ selectedRechargePackage.bonusStockText }}</dd>
                </div>
                <div v-if="isRechargeMode && selectedRechargePackage.bonusRedeemCodeUsed">
                  <dt>赠送限制</dt>
                  <dd class="stock-warning">你已领取过赠送兑换码，本次不重复赠送</dd>
                </div>
                <div v-if="isAccountMode">
                  <dt>服务</dt>
                  <dd>{{ selectedAccountProduct.serviceText }}</dd>
                </div>
                <div v-if="isAccountMode">
                  <dt>交付</dt>
                  <dd :class="{ 'stock-warning': !selectedAccountProduct.available }">{{ selectedAccountProduct.availabilityText }}</dd>
                </div>
                <div v-if="selectedPromotionLimitNotice">
                  <dt>限购说明</dt>
                  <dd class="stock-warning">{{ selectedPromotionLimitNotice }}</dd>
                </div>
              </dl>
            </section>

            <section v-if="isSubscriptionMode" class="order-duration" aria-labelledby="duration-title">
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

            <section class="order-payment-method" aria-labelledby="method-title">
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

            <div class="order-dialog-actions">
              <button type="button" class="order-dialog-secondary" @click="closeOrderDialog">
                返回修改
              </button>
              <button
                type="button"
                class="pay-button"
                :disabled="isPayDisabled"
                @click="redirectToAlipay"
              >
                {{ payButtonText }}
              </button>
            </div>
            <p v-if="paymentError" class="payment-error">{{ paymentError }}</p>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { apiCall } from '../utils/api'

const DEFAULT_DURATIONS = [
  { id: '1m', label: '1个月', months: 1 },
  { id: '3m', label: '3个月', months: 3 },
  { id: '12m', label: '12个月', months: 12 }
]

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
const ALIPAY_GATEWAY_HOSTS = new Set([
  'openapi.alipay.com',
  'openapi-sandbox.dl.alipaydev.com'
])
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
const normalizeDurations = (items = []) => (
  Array.isArray(items) && items.length
    ? items
    : DEFAULT_DURATIONS.map((duration) => ({ ...duration }))
)

const productMode = ref('subscription')
const plans = ref([])
const durations = ref(DEFAULT_DURATIONS.map((duration) => ({ ...duration })))
const rechargePackages = ref([])
const accountProducts = ref([])
const paymentError = ref('')
const isCreatingOrder = ref(false)
const isOrderDialogOpen = ref(false)
const orderDialogRef = ref(null)
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
const emptyAccountProduct = {
  name: '加载中',
  price: 0,
  serviceText: '正在加载服务',
  availabilityText: '正在同步交付状态',
  available: false
}

const selectedPlanId = ref('')
const selectedDurationId = ref('1m')
const selectedRechargePackageId = ref('')
const selectedAccountProductId = ref('')
const subscriptionTierGrid = ref(null)
const rechargeTierGrid = ref(null)
const accountTierGrid = ref(null)

const selectProductMode = (mode) => {
  productMode.value = mode
  paymentError.value = ''
}

const selectPlan = (planId) => {
  selectedPlanId.value = planId
}

const selectDuration = (durationId) => {
  selectedDurationId.value = durationId
}

const selectRechargePackage = (packageId) => {
  selectedRechargePackageId.value = packageId
}

const selectAccountProduct = (productId) => {
  selectedAccountProductId.value = productId
}

const openOrderDialog = async () => {
  if (isPayDisabled.value) return
  paymentError.value = ''
  isOrderDialogOpen.value = true
  await nextTick()
  orderDialogRef.value?.focus()
}

const closeOrderDialog = () => {
  if (isCreatingOrder.value) return
  isOrderDialogOpen.value = false
  paymentError.value = ''
}

const isSubscriptionMode = computed(() => productMode.value === 'subscription')
const isRechargeMode = computed(() => productMode.value === 'recharge')
const isAccountMode = computed(() => productMode.value === 'account')
const selectedPlan = computed(() => plans.value.find((plan) => plan.id === selectedPlanId.value) || plans.value[0] || emptyPlan)
const selectedDuration = computed(() => durations.value.find((duration) => duration.id === selectedDurationId.value) || durations.value[0] || emptyDuration)
const selectedRechargePackage = computed(() => (
  rechargePackages.value.find((pack) => pack.id === selectedRechargePackageId.value) || rechargePackages.value[0] || emptyRechargePackage
))
const selectedAccountProduct = computed(() => (
  accountProducts.value.find((product) => product.id === selectedAccountProductId.value) || accountProducts.value[0] || emptyAccountProduct
))
const selectedProduct = computed(() => {
  if (isSubscriptionMode.value) return selectedPlan.value
  if (isRechargeMode.value) return selectedRechargePackage.value
  return selectedAccountProduct.value
})
const selectedSubscriptionIndex = computed(() => plans.value.findIndex((plan) => plan.id === selectedPlanId.value))
const selectedRechargeIndex = computed(() => rechargePackages.value.findIndex((pack) => pack.id === selectedRechargePackageId.value))
const selectedAccountIndex = computed(() => accountProducts.value.findIndex((product) => product.id === selectedAccountProductId.value))
const canMoveSubscriptionPrev = computed(() => selectedSubscriptionIndex.value > 0)
const canMoveSubscriptionNext = computed(() => selectedSubscriptionIndex.value >= 0 && selectedSubscriptionIndex.value < plans.value.length - 1)
const canMoveRechargePrev = computed(() => selectedRechargeIndex.value > 0)
const canMoveRechargeNext = computed(() => selectedRechargeIndex.value >= 0 && selectedRechargeIndex.value < rechargePackages.value.length - 1)
const canMoveAccountPrev = computed(() => selectedAccountIndex.value > 0)
const canMoveAccountNext = computed(() => selectedAccountIndex.value >= 0 && selectedAccountIndex.value < accountProducts.value.length - 1)
const selectedActivePromotion = computed(() => selectedProduct.value.activePromotion)
const orderAmount = computed(() => (
  isSubscriptionMode.value
    ? Number(selectedPlan.value.price || 0) * Number(selectedDuration.value.months || 1)
    : Number(selectedProduct.value.price || 0)
))
const orderOriginalAmount = computed(() => {
  const product = selectedProduct.value
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
const selectedProductName = computed(() => selectedProduct.value.name)
const orderSummaryText = computed(() => {
  if (isSubscriptionMode.value) {
    return `${selectedPlan.value.name} · ${selectedDuration.value.label} · ${selectedPlan.value.dailyQuota}`
  }
  if (isRechargeMode.value) {
    return `${selectedRechargePackage.value.name} · ${selectedRechargePackage.value.quotaText}`
  }
  return `${selectedAccountProduct.value.name} · ${selectedAccountProduct.value.serviceText}`
})
const selectedPromotionLimitNotice = computed(() => (
  selectedActivePromotion.value?.limitOnce
    ? '本促销同一站内账号和同一支付宝支付ID限购一次；重复支付不会自动发放权益，请联系售后补差价或退款。'
    : ''
))
const isPayDisabled = computed(() => (
  isCreatingOrder.value
  || (isSubscriptionMode.value && (!selectedPlan.value.id || !selectedDuration.value.id))
  || (isRechargeMode.value && !selectedRechargePackage.value.id)
  || (isAccountMode.value && (!selectedAccountProduct.value.id || !selectedAccountProduct.value.available))
  || selectedProduct.value.isPurchasable === false
))
const payButtonText = computed(() => {
  if (isCreatingOrder.value) return '正在创建订单...'
  return `跳转支付宝支付 ${orderAmountText.value}`
})
const getTierTargetIndex = (items, currentIndex, direction) => {
  if (!items.length || currentIndex < 0) return -1
  return Math.min(Math.max(currentIndex + direction, 0), items.length - 1)
}

const scrollTierCardIntoView = async (gridRef, index) => {
  await nextTick()
  const targetCard = gridRef.value?.children?.item(index)
  if (targetCard && typeof targetCard.scrollIntoView === 'function') {
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }
}

const moveSubscriptionTier = (direction) => {
  const targetIndex = getTierTargetIndex(plans.value, selectedSubscriptionIndex.value, direction)
  if (targetIndex < 0) return
  selectPlan(plans.value[targetIndex].id)
  scrollTierCardIntoView(subscriptionTierGrid, targetIndex)
}

const moveRechargeTier = (direction) => {
  const targetIndex = getTierTargetIndex(rechargePackages.value, selectedRechargeIndex.value, direction)
  if (targetIndex < 0) return
  selectRechargePackage(rechargePackages.value[targetIndex].id)
  scrollTierCardIntoView(rechargeTierGrid, targetIndex)
}

const moveAccountTier = (direction) => {
  const targetIndex = getTierTargetIndex(accountProducts.value, selectedAccountIndex.value, direction)
  if (targetIndex < 0) return
  selectAccountProduct(accountProducts.value[targetIndex].id)
  scrollTierCardIntoView(accountTierGrid, targetIndex)
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
    durations.value = normalizeDurations(catalog.durations)
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
    const accountProductList = catalog.accountProducts || []
    accountProducts.value = accountProductList.map((product) => {
      const priceMeta = buildPromotionPriceMeta(product)
      return {
        ...product,
        ...priceMeta,
        priceText: formatMoney(product.price),
        serviceText: product.serviceText || product.description || '账号与代充服务',
        availabilityText: product.availabilityText || '支付后提交目标账号，由售后人工交付',
        available: product.available !== false && product.isPurchasable !== false,
        badgeText: normalizeCardBadge(product.badgeText || product.cardBadge),
        promotionBadgeText: buildPromotionBadgeText(product),
        features: Array.isArray(product.features) ? product.features : []
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
    if (!accountProducts.value.some((product) => product.id === selectedAccountProductId.value)) {
      selectedAccountProductId.value = (accountProducts.value.find((product) => product.recommended) || accountProducts.value[0])?.id || ''
    }
  } catch (error) {
    paymentError.value = error.message || '支付款项加载失败'
  }
}

const submitAlipayForm = (alipayForm) => {
  if (!alipayForm?.action || !alipayForm?.params || typeof alipayForm.params !== 'object') {
    throw new Error('支付宝支付表单无效')
  }
  const actionUrl = new URL(alipayForm.action)
  if (actionUrl.protocol !== 'https:' || !ALIPAY_GATEWAY_HOSTS.has(actionUrl.hostname.toLowerCase())) {
    throw new Error('支付宝支付地址无效')
  }
  if (!alipayForm.params.app_id || !alipayForm.params.sign || !alipayForm.params.biz_content) {
    throw new Error('支付宝支付参数不完整')
  }

  const form = document.createElement('form')
  form.style.display = 'none'
  form.action = actionUrl.href
  form.method = 'post'
  form.acceptCharset = 'utf-8'
  form.referrerPolicy = 'no-referrer'
  Object.entries(alipayForm.params).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = String(value ?? '')
    form.appendChild(input)
  })
  document.body.appendChild(form)
  form.submit()
}

const redirectToAlipay = async () => {
  if (isCreatingOrder.value) return
  paymentError.value = ''
  isCreatingOrder.value = true

  try {
    const result = await apiCall('/payments/alipay/orders', {
      method: 'POST',
      body: JSON.stringify(
        isSubscriptionMode.value
          ? {
            productType: 'subscription',
            productId: selectedPlan.value.id,
            planId: selectedPlan.value.skuId || selectedPlan.value.id,
            durationId: selectedDurationId.value
          }
          : isRechargeMode.value
            ? {
            productType: 'recharge',
            productId: selectedRechargePackage.value.id,
            rechargePackageId: selectedRechargePackage.value.skuId || selectedRechargePackage.value.id
          }
            : {
              productType: 'account',
              productId: selectedAccountProduct.value.id,
              accountProductId: selectedAccountProduct.value.skuId || selectedAccountProduct.value.id
            }
      )
    })
    if (result.orderNo) {
      sessionStorage.setItem('lastPaymentOrderNo', result.orderNo)
    }
    submitAlipayForm(result.alipayForm)
  } catch (error) {
    paymentError.value = error.message || '创建支付订单失败'
    isCreatingOrder.value = false
  }
}

onMounted(loadPaymentCatalog)
</script>

<style scoped src="../styles/payment.css"></style>
