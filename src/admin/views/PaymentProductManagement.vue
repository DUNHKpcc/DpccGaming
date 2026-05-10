<template>
  <AdminLayout
    title="支付档位"
    description="维护前台支付卡片、金额、赠送额度和限时促销"
  >
    <template #actions>
      <el-button @click="fetchProducts">
        <i class="fa fa-refresh"></i>
        刷新
      </el-button>
      <el-button type="primary" @click="openProductDrawer()">
        <i class="fa fa-plus"></i>
        新增档位
      </el-button>
    </template>

    <el-card class="admin-panel-card" shadow="never">
      <div class="product-toolbar">
        <el-input
          v-model="filters.keyword"
          class="product-search-input"
          clearable
          placeholder="搜索名称或 SKU"
          @keyup.enter="fetchProducts"
        />
        <el-select v-model="filters.productType" class="product-filter-select" clearable placeholder="全部类型" @change="fetchProducts">
          <el-option label="订阅月卡" value="subscription" />
          <el-option label="充值额度" value="recharge" />
        </el-select>
        <el-select v-model="filters.status" class="product-filter-select" clearable placeholder="全部状态" @change="fetchProducts">
          <el-option label="上架" value="active" />
          <el-option label="下架" value="inactive" />
        </el-select>
        <el-button :loading="isLoading" @click="fetchProducts">查询</el-button>
      </div>

      <el-table
        :data="products"
        class="product-table"
        height="100%"
        row-key="id"
        empty-text="暂无支付档位"
      >
        <el-table-column label="档位" min-width="230">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <small>{{ row.skuId }} · {{ productTypeText(row.productType) }}</small>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <strong>¥{{ row.basePrice }}</strong>
            <small v-if="row.activePromotion">促销 ¥{{ row.activePromotion.promotionPrice || row.basePrice }}</small>
          </template>
        </el-table-column>
        <el-table-column label="额度" min-width="190">
          <template #default="{ row }">
            <span v-if="row.productType === 'subscription'">每日 ${{ row.dailyQuotaUsd }}</span>
            <span v-else>到账 ${{ row.baseQuotaUsd }}</span>
            <small>赠送 ${{ row.bonusQuotaUsd || '0.00' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="促销" min-width="220">
          <template #default="{ row }">
            <div v-if="row.activePromotion" class="promotion-cell">
              <el-tag type="warning" effect="light">{{ row.activePromotion.badgeText || row.activePromotion.title }}</el-tag>
              <small>{{ promotionPeriod(row.activePromotion) }}</small>
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="库存" width="150">
          <template #default="{ row }">
            <span v-if="row.productType === 'recharge'">主码 {{ row.availableRedeemCodes }}</span>
            <span v-else>赠送码 {{ row.bonusRedeemCodesAvailable }}</span>
            <small v-if="row.productType === 'recharge'">赠送码 {{ row.bonusRedeemCodesAvailable }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="light">
              {{ row.status === 'active' ? '上架' : '下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openProductDrawer(row)">编辑</el-button>
            <el-button size="small" @click="copyProduct(row)">复制</el-button>
            <el-button size="small" type="primary" @click="openPromotionDialog(row)">促销</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer
      v-model="productDrawerVisible"
      :title="editingProductId ? '编辑档位' : '新增档位'"
      size="560px"
    >
      <el-form label-position="top" @submit.prevent>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="类型">
              <el-select v-model="productForm.productType" :disabled="Boolean(editingProductId)" class="product-full-control">
                <el-option label="订阅月卡" value="subscription" />
                <el-option label="充值额度" value="recharge" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="SKU">
              <el-input v-model="productForm.skuId" :disabled="Boolean(editingProductId)" placeholder="bronze 或 usd-25" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="名称">
          <el-input v-model="productForm.name" placeholder="黄金月卡" />
        </el-form-item>
        <el-form-item label="支付宝标题">
          <el-input v-model="productForm.subject" placeholder="DPCC API Gold Monthly Card" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="productForm.description" type="textarea" :rows="2" resize="vertical" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="金额 CNY">
              <el-input-number v-model="productForm.basePrice" class="product-full-control" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="productForm.sortOrder" class="product-full-control" :precision="0" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item :label="productForm.productType === 'subscription' ? '月卡赠送额度 USD' : '到账额度 USD'">
              <el-input-number v-model="productForm.baseQuotaUsd" class="product-full-control" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
          <el-col v-if="productForm.productType === 'subscription'" :span="12">
            <el-form-item label="每日额度 USD">
              <el-input-number v-model="productForm.dailyQuotaUsd" class="product-full-control" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
          <el-col v-else :span="12">
            <el-form-item label="主兑换码 SKU">
              <el-input v-model="productForm.mainRedeemSkuId" placeholder="默认同 SKU" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="赠送码 SKU">
              <el-input v-model="productForm.bonusRedeemSkuId" placeholder="usd-30-bonus" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="赠送额度 USD">
              <el-input-number v-model="productForm.bonusQuotaUsd" class="product-full-control" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="卡片角标">
          <el-input v-model="productForm.cardBadge" placeholder="推荐款项 / 限时优惠" />
        </el-form-item>
        <el-form-item label="卡片文案">
          <el-input v-model="productForm.cardFeaturesText" type="textarea" :rows="4" resize="vertical" placeholder="一行一个卖点" />
        </el-form-item>
        <el-form-item label="下单提示">
          <el-input v-model="productForm.orderNote" type="textarea" :rows="2" resize="vertical" />
        </el-form-item>

        <div class="product-form-switches">
          <el-switch v-model="productForm.recommended" active-text="推荐" />
          <el-switch
            v-model="productForm.status"
            active-value="active"
            inactive-value="inactive"
            active-text="上架"
            inactive-text="下架"
          />
        </div>

        <div class="drawer-actions">
          <el-button @click="productDrawerVisible = false">取消</el-button>
          <el-button type="primary" :loading="isSavingProduct" @click="saveProduct">保存</el-button>
        </div>
      </el-form>
    </el-drawer>

    <el-dialog v-model="promotionDialogVisible" title="促销设置" width="560px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="所属档位">
          <el-input :model-value="selectedProduct?.name || ''" disabled />
        </el-form-item>
        <el-form-item label="促销名称">
          <el-input v-model="promotionForm.title" placeholder="限时首购优惠" />
        </el-form-item>
        <el-form-item label="角标文案">
          <el-input v-model="promotionForm.badgeText" placeholder="限时优惠" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="促销价 CNY">
              <el-input-number v-model="promotionForm.promotionPrice" class="product-full-control" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="促销赠送额度 USD">
              <el-input-number v-model="promotionForm.promotionBonusQuotaUsd" class="product-full-control" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开始时间">
              <el-date-picker v-model="promotionForm.startsAt" class="product-full-control" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间">
              <el-date-picker v-model="promotionForm.endsAt" class="product-full-control" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="product-form-switches">
          <el-switch v-model="promotionForm.limitOnce" active-text="同一用户限购一次" />
          <el-switch
            v-model="promotionForm.status"
            active-value="active"
            inactive-value="inactive"
            active-text="启用"
            inactive-text="停用"
          />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="promotionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="isSavingPromotion" @click="savePromotion">保存促销</el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { apiCall } from '../../utils/api'

const emptyProductForm = () => ({
  productType: 'subscription',
  skuId: '',
  name: '',
  subject: '',
  description: '',
  basePrice: 0,
  baseQuotaUsd: 0,
  dailyQuotaUsd: 0,
  mainRedeemSkuId: '',
  bonusRedeemSkuId: 'usd-30-bonus',
  bonusQuotaUsd: 30,
  recommended: false,
  cardBadge: '',
  cardFeaturesText: '',
  orderNote: '',
  sortOrder: 0,
  status: 'active'
})

const emptyPromotionForm = () => ({
  id: null,
  title: '',
  badgeText: '',
  startsAt: '',
  endsAt: '',
  promotionPrice: 0,
  promotionBonusQuotaUsd: 0,
  limitOnce: false,
  status: 'active'
})

const products = ref([])
const isLoading = ref(false)
const isSavingProduct = ref(false)
const isSavingPromotion = ref(false)
const productDrawerVisible = ref(false)
const promotionDialogVisible = ref(false)
const editingProductId = ref(null)
const selectedProduct = ref(null)
const productForm = reactive(emptyProductForm())
const promotionForm = reactive(emptyPromotionForm())
const filters = reactive({
  keyword: '',
  productType: '',
  status: ''
})

const resetReactive = (target, source) => {
  Object.keys(target).forEach((key) => delete target[key])
  Object.assign(target, source)
}

const productTypeText = (value) => (value === 'recharge' ? '充值额度' : '订阅月卡')

const promotionPeriod = (promotion = {}) => {
  if (!promotion.startsAt && !promotion.endsAt) return '长期有效'
  return `${formatDate(promotion.startsAt)} - ${formatDate(promotion.endsAt)}`
}

const formatDate = (value) => {
  if (!value) return '不限'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN')
}

const activePromotionByProduct = computed(() => {
  const map = new Map()
  products.value.forEach((product) => {
    const active = (product.promotions || []).find((item) => item.status === 'active')
    if (active) map.set(product.id, active)
  })
  return map
})

const normalizeProductFromApi = (product = {}) => ({
  ...product,
  activePromotion: product.activePromotion || activePromotionByProduct.value.get(product.id) || null
})

const fetchProducts = async () => {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    if (filters.keyword) params.set('keyword', filters.keyword.trim())
    if (filters.productType) params.set('productType', filters.productType)
    if (filters.status) params.set('status', filters.status)
    const result = await apiCall(`/admin/payment-products?${params.toString()}`, { method: 'GET' })
    products.value = (result.products || []).map(normalizeProductFromApi)
  } catch (error) {
    ElMessage.error(error.message || '获取支付档位失败')
  } finally {
    isLoading.value = false
  }
}

const openProductDrawer = (product = null) => {
  editingProductId.value = product?.id || null
  resetReactive(productForm, product ? {
    productType: product.productType || 'subscription',
    skuId: product.skuId || '',
    name: product.name || '',
    subject: product.subject || '',
    description: product.description || '',
    basePrice: Number(product.basePrice || 0),
    baseQuotaUsd: Number(product.baseQuotaUsd || 0),
    dailyQuotaUsd: Number(product.dailyQuotaUsd || 0),
    mainRedeemSkuId: product.mainRedeemSkuId || '',
    bonusRedeemSkuId: product.bonusRedeemSkuId || '',
    bonusQuotaUsd: Number(product.bonusQuotaUsd || 0),
    recommended: Boolean(product.recommended),
    cardBadge: product.cardBadge || '',
    cardFeaturesText: (product.features || []).join('\n'),
    orderNote: product.orderNote || '',
    sortOrder: Number(product.sortOrder || 0),
    status: product.status || 'active'
  } : emptyProductForm())
  productDrawerVisible.value = true
}

const buildProductPayload = () => ({
  ...productForm,
  basePrice: String(productForm.basePrice || 0),
  baseQuotaUsd: String(productForm.baseQuotaUsd || 0),
  dailyQuotaUsd: productForm.productType === 'subscription' ? String(productForm.dailyQuotaUsd || 0) : null,
  mainRedeemSkuId: productForm.productType === 'recharge' ? productForm.mainRedeemSkuId || productForm.skuId : '',
  bonusQuotaUsd: String(productForm.bonusQuotaUsd || 0),
  cardFeatures: String(productForm.cardFeaturesText || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
})

const saveProduct = async () => {
  isSavingProduct.value = true
  try {
    const payload = buildProductPayload()
    const endpoint = editingProductId.value
      ? `/admin/payment-products/${editingProductId.value}`
      : '/admin/payment-products'
    const result = await apiCall(endpoint, {
      method: editingProductId.value ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    })
    const saved = result.product
    if (editingProductId.value) {
      products.value = products.value.map((item) => (item.id === saved.id ? normalizeProductFromApi(saved) : item))
    } else {
      products.value = [normalizeProductFromApi(saved), ...products.value]
    }
    productDrawerVisible.value = false
    ElMessage.success('支付档位已保存')
    await fetchProducts()
  } catch (error) {
    ElMessage.error(error.message || '保存支付档位失败')
  } finally {
    isSavingProduct.value = false
  }
}

const copyProduct = async (product) => {
  if (!product?.id) return
  try {
    const result = await apiCall(`/admin/payment-products/${product.id}/copy`, { method: 'POST' })
    products.value = [normalizeProductFromApi(result.product), ...products.value]
    ElMessage.success('已复制为下架副本')
  } catch (error) {
    ElMessage.error(error.message || '复制支付档位失败')
  }
}

const openPromotionDialog = (product) => {
  selectedProduct.value = product
  const promotion = product.activePromotion || (product.promotions || [])[0] || null
  resetReactive(promotionForm, promotion ? {
    id: promotion.id,
    title: promotion.title || '',
    badgeText: promotion.badgeText || '',
    startsAt: promotion.startsAt || '',
    endsAt: promotion.endsAt || '',
    promotionPrice: Number(promotion.promotionPrice || product.basePrice || 0),
    promotionBonusQuotaUsd: Number(promotion.promotionBonusQuotaUsd || product.bonusQuotaUsd || 0),
    limitOnce: Boolean(promotion.limitOnce),
    status: promotion.status || 'active'
  } : {
    ...emptyPromotionForm(),
    promotionPrice: Number(product.basePrice || 0),
    promotionBonusQuotaUsd: Number(product.bonusQuotaUsd || 0)
  })
  promotionDialogVisible.value = true
}

const savePromotion = async () => {
  if (!selectedProduct.value?.id) return
  isSavingPromotion.value = true
  try {
    const payload = {
      ...promotionForm,
      promotionPrice: String(promotionForm.promotionPrice || 0),
      promotionBonusQuotaUsd: String(promotionForm.promotionBonusQuotaUsd || 0)
    }
    const endpoint = promotionForm.id
      ? `/admin/payment-promotions/${promotionForm.id}`
      : `/admin/payment-products/${selectedProduct.value.id}/promotions`
    await apiCall(endpoint, {
      method: promotionForm.id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    })
    promotionDialogVisible.value = false
    ElMessage.success('促销已保存')
    await fetchProducts()
  } catch (error) {
    ElMessage.error(error.message || '保存促销失败')
  } finally {
    isSavingPromotion.value = false
  }
}

onMounted(fetchProducts)
</script>

<style scoped>
.admin-panel-card {
  height: calc(100vh - 116px);
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.admin-panel-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.product-toolbar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.product-search-input {
  max-width: 320px;
}

.product-filter-select {
  width: 150px;
}

.product-table {
  flex: 1;
}

.product-table strong,
.product-table small {
  display: block;
}

.product-table small,
.promotion-cell small {
  margin-top: 0.25rem;
  color: #64748b;
}

.promotion-cell {
  display: grid;
  gap: 0.25rem;
  justify-items: start;
}

.product-full-control {
  width: 100%;
}

.product-form-switches {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin: 0.5rem 0 1.25rem;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 0.75rem;
}

@media (max-width: 820px) {
  .admin-panel-card {
    height: auto;
    min-height: 640px;
  }

  .product-toolbar {
    display: grid;
  }

  .product-search-input,
  .product-filter-select {
    width: 100%;
    max-width: none;
  }
}
</style>
