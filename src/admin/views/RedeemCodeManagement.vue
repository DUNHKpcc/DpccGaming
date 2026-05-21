<template>
  <AdminLayout
    title="兑换码管理"
    description="批量导入兑换码并查看最近库存分配状态"
  >
    <template #actions>
      <el-button type="primary" @click="fetchCodes">
        <i class="fa fa-refresh"></i>
        刷新
      </el-button>
    </template>

    <div class="redeem-admin-grid">
      <el-card class="redeem-import-card" shadow="never">
        <template #header>
          <div class="redeem-card-header">
            <strong>批量导入</strong>
            <span>一行一个兑换码</span>
          </div>
        </template>

        <el-form label-position="top" @submit.prevent>
          <el-form-item label="档位">
            <el-select v-model="selectedProductKey" class="redeem-full-control">
              <el-option
                v-for="product in catalogProducts"
                :key="product.key"
                :label="product.label"
                :value="product.key"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="兑换码">
            <el-input
              v-model="codesText"
              type="textarea"
              :rows="12"
              resize="vertical"
              placeholder="一行一个兑换码"
            />
          </el-form-item>

          <el-button
            class="redeem-full-control"
            type="primary"
            :loading="isImporting"
            @click="importCodes"
          >
            导入兑换码
          </el-button>

          <el-alert
            v-if="importMessage"
            class="redeem-import-message"
            :title="importMessage"
            type="info"
            :closable="false"
            show-icon
          />
        </el-form>
      </el-card>

      <el-card class="redeem-inventory-card" shadow="never">
        <div class="redeem-inventory-toolbar">
          <div>
            <strong>库存列表</strong>
            <span>{{ activeProductLabel }}，最多显示最近 300 条兑换码</span>
          </div>
          <div class="redeem-filters">
            <el-select v-model="filterStatus" placeholder="全部状态" clearable @change="fetchCodes">
              <el-option label="未使用" value="available" />
              <el-option label="已分配" value="assigned" />
            </el-select>
            <el-button
              type="danger"
              plain
              :disabled="selectedAvailableIds.length === 0"
              :loading="isDeleting"
              @click="batchDeleteSelectedCodes"
            >
              批量删除 {{ selectedAvailableIds.length || '' }}
            </el-button>
          </div>
        </div>

        <div class="redeem-stats-strip">
          <button
            v-for="item in visibleStats"
            :key="item.key"
            class="redeem-stat-item"
            :class="{ active: item.key === filterProductKey }"
            type="button"
            @click="selectProductFilter(item.key)"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.available }}</strong>
            <small>可用 / {{ item.total }} 总数</small>
          </button>
        </div>

        <div class="redeem-table-shell">
          <el-table
            :data="pagedCodes"
            height="100%"
            row-key="id"
            empty-text="暂无兑换码"
            @selection-change="handleSelectionChange"
          >
            <el-table-column type="selection" width="48" :selectable="isCodeSelectable" />
            <el-table-column label="兑换码" min-width="240">
              <template #default="{ row }">
                <code class="redeem-code-text">{{ displayCode(row) }}</code>
              </template>
            </el-table-column>
            <el-table-column label="档位" min-width="160">
              <template #default="{ row }">{{ productLabel(row.productType, row.skuId) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="row.status === 'assigned' ? 'info' : 'success'" effect="light">
                  {{ row.status === 'assigned' ? '已分配' : '未使用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="订单" min-width="190">
              <template #default="{ row }">
                <RouterLink
                  v-if="row.assignedOrderNo"
                  class="redeem-order-link"
                  :to="{ path: '/admin/orders', query: { orderNo: row.assignedOrderNo } }"
                >
                  {{ row.assignedOrderNo }}
                </RouterLink>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button
                  size="small"
                  type="primary"
                  link
                  :loading="secretLoadingId === row.id"
                  @click="toggleSecret(row)"
                >
                  {{ revealedCodes[row.id] ? '隐藏' : '显示' }}
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  link
                  :loading="secretLoadingId === row.id"
                  @click="copySecret(row)"
                >
                  复制
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  link
                  :disabled="row.status !== 'available' || isDeleting"
                  @click="deleteSingleCode(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="totalPages > 1" class="redeem-pagination">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            background
            layout="total, sizes, prev, pager, next"
            :page-sizes="adminPageSizeOptions"
            :total="codeTotal"
          />
        </div>
      </el-card>
    </div>
  </AdminLayout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { ADMIN_PAGE_SIZE_OPTIONS, DEFAULT_ADMIN_PAGE_SIZE, useAdminPagination } from '../utils/pagination'
import { apiCall } from '../../utils/api'

const catalogProducts = ref([])
const selectedProductKey = ref('')
const filterProductKey = ref('')
const filterStatus = ref('')
const codesText = ref('')
const codes = ref([])
const stats = ref([])
const importMessage = ref('')
const isImporting = ref(false)
const isDeleting = ref(false)
const selectedCodes = ref([])
const revealedCodes = ref({})
const secretLoadingId = ref(null)
const adminPageSizeOptions = ADMIN_PAGE_SIZE_OPTIONS

const splitProductKey = (key = '') => {
  const [productType = '', skuId = ''] = String(key || '').split(':')
  return { productType, skuId }
}

const productLabel = (productType, skuId) => {
  const key = `${productType}:${skuId}`
  return catalogProducts.value.find((item) => item.key === key)?.label || skuId
}

const displayCode = (row) => revealedCodes.value[row.id] || row.maskedCode || ''

const activeProductLabel = computed(() => (
  catalogProducts.value.find((item) => item.key === filterProductKey.value)?.label || '请选择额度包'
))

const selectedAvailableIds = computed(() => selectedCodes.value
  .filter((item) => item.status === 'available')
  .map((item) => item.id))

const {
  currentPage,
  pageSize,
  totalItems: codeTotal,
  totalPages,
  pagedItems: pagedCodes,
  resetPage
} = useAdminPagination(codes, {
  pageSize: DEFAULT_ADMIN_PAGE_SIZE
})

watch(currentPage, () => {
  selectedCodes.value = []
})

const visibleStats = computed(() => {
  const groups = new Map()
  for (const product of catalogProducts.value) {
    groups.set(product.key, {
      key: product.key,
      label: product.label,
      available: 0,
      total: 0
    })
  }
  for (const item of stats.value) {
    const key = `${item.productType}:${item.skuId}`
    if (!groups.has(key)) {
      groups.set(key, { key, label: item.skuId, available: 0, total: 0 })
    }
    const group = groups.get(key)
    group.total += Number(item.count || 0)
    if (item.status === 'available') {
      group.available += Number(item.count || 0)
    }
  }
  return [...groups.values()]
})

const fetchCatalog = async () => {
  const catalog = await apiCall('/admin/redeem-codes/catalog', { method: 'GET' })
  catalogProducts.value = (catalog.products || []).map((product) => ({
    ...product,
    key: `${product.productType}:${product.skuId}`
  }))
  if (!selectedProductKey.value && catalogProducts.value[0]) {
    selectedProductKey.value = catalogProducts.value[0].key
  }
  if (!filterProductKey.value && catalogProducts.value[0]) {
    filterProductKey.value = catalogProducts.value[0].key
  }
}

const fetchCodes = async () => {
  const product = splitProductKey(filterProductKey.value)
  const params = new URLSearchParams()
  if (product.productType && product.skuId) {
    params.set('productType', product.productType)
    params.set('skuId', product.skuId)
  }
  if (filterStatus.value) {
    params.set('status', filterStatus.value)
  }
  const result = await apiCall(`/admin/redeem-codes?${params.toString()}`, { method: 'GET' })
  codes.value = result.codes || []
  stats.value = result.stats || []
  resetPage()
  selectedCodes.value = []
  revealedCodes.value = {}
}

const selectProductFilter = async (productKey) => {
  filterProductKey.value = productKey
  await fetchCodes()
}

const importCodes = async () => {
  const product = splitProductKey(selectedProductKey.value)
  isImporting.value = true
  importMessage.value = ''
  try {
    const result = await apiCall('/admin/redeem-codes/import', {
      method: 'POST',
      body: JSON.stringify({
        productType: product.productType,
        skuId: product.skuId,
        codes: codesText.value
      })
    })
    importMessage.value = `导入 ${result.inserted} 条，重复 ${result.duplicate} 条`
    codesText.value = ''
    await fetchCodes()
  } catch (error) {
    importMessage.value = error.message || '导入失败'
  } finally {
    isImporting.value = false
  }
}

const isCodeSelectable = (row) => row.status === 'available'

const handleSelectionChange = (selection) => {
  selectedCodes.value = selection
}

const fetchSecret = async (row, purpose) => {
  secretLoadingId.value = row.id
  try {
    const params = new URLSearchParams({ purpose })
    const result = await apiCall(`/admin/redeem-codes/${row.id}/secret?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-DPCC-Admin-Action': 'redeem-code-secret'
      }
    })
    return result.code || ''
  } finally {
    secretLoadingId.value = null
  }
}

const toggleSecret = async (row) => {
  if (revealedCodes.value[row.id]) {
    const next = { ...revealedCodes.value }
    delete next[row.id]
    revealedCodes.value = next
    return
  }

  try {
    const code = await fetchSecret(row, 'reveal')
    revealedCodes.value = { ...revealedCodes.value, [row.id]: code }
  } catch (error) {
    ElMessage.error(error.message || '读取兑换码失败')
  }
}

const copySecret = async (row) => {
  try {
    const code = await fetchSecret(row, 'copy')
    await navigator.clipboard.writeText(code)
    ElMessage.success('兑换码已复制')
  } catch (error) {
    ElMessage.error(error.message || '复制兑换码失败')
  }
}

const deleteCodes = async (ids = [], title = '删除兑换码') => {
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(
      `确认删除 ${ids.length} 个未使用兑换码？已分配兑换码不会被删除。`,
      title,
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  isDeleting.value = true
  try {
    const result = ids.length === 1
      ? await apiCall(`/admin/redeem-codes/${ids[0]}`, { method: 'DELETE' })
      : await apiCall('/admin/redeem-codes/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      })
    ElMessage.success(`已删除 ${result.deleted || 0} 个兑换码`)
    await fetchCodes()
  } catch (error) {
    ElMessage.error(error.message || '删除兑换码失败')
  } finally {
    isDeleting.value = false
  }
}

const deleteSingleCode = async (row) => {
  if (row.status !== 'available') return
  await deleteCodes([row.id], '删除兑换码')
}

const batchDeleteSelectedCodes = async () => {
  await deleteCodes(selectedAvailableIds.value, '批量删除兑换码')
}

onMounted(async () => {
  await fetchCatalog()
  await fetchCodes()
})
</script>

<style scoped>
.redeem-admin-grid {
  display: grid;
  grid-template-columns: minmax(20rem, 0.75fr) minmax(0, 1.75fr);
  gap: 1rem;
  height: calc(100vh - 116px);
  min-height: 0;
  overflow: hidden;
}

.redeem-import-card,
.redeem-inventory-card {
  min-width: 0;
  border: 0;
}

.redeem-import-card :deep(.el-card__body) {
  padding: 1rem;
}

.redeem-inventory-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
}

.redeem-card-header,
.redeem-inventory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.redeem-card-header span,
.redeem-inventory-toolbar span,
.redeem-stat-item span,
.redeem-stat-item small {
  color: var(--admin-muted);
}

.redeem-card-header strong,
.redeem-card-header span,
.redeem-inventory-toolbar strong,
.redeem-inventory-toolbar span,
.redeem-stat-item span,
.redeem-stat-item small {
  display: block;
}

.redeem-card-header span,
.redeem-inventory-toolbar span {
  margin-top: 0.15rem;
  font-size: 0.82rem;
}

.redeem-full-control {
  width: 100%;
}

.redeem-import-message {
  margin-top: 1rem;
}

.redeem-inventory-toolbar {
  flex: 0 0 auto;
  padding: 1rem;
  border-bottom: 1px solid var(--admin-border);
}

.redeem-filters {
  display: flex;
  gap: 0.6rem;
}

.redeem-filters .el-select {
  width: 12rem;
}

.redeem-filters .el-button {
  flex: 0 0 auto;
}

.redeem-stats-strip {
  display: flex;
  flex: 0 0 auto;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  overflow-x: auto;
  border-bottom: 1px solid var(--admin-border);
}

.redeem-stat-item {
  flex: 0 0 10rem;
  cursor: pointer;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--admin-border);
  border-radius: 0.45rem;
  background: var(--admin-surface-soft);
  color: inherit;
  font: inherit;
  text-align: left;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.redeem-stat-item.active {
  border-color: var(--admin-primary);
  background: var(--admin-surface);
  box-shadow: inset 0 0 0 1px var(--admin-primary);
}

.redeem-stat-item strong {
  display: block;
  margin: 0.2rem 0;
  font-size: 1.6rem;
  line-height: 1.1;
}

.redeem-table-shell {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.redeem-pagination {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  padding: 0.85rem 1rem;
  border-top: 1px solid var(--admin-border);
}

.redeem-code-text {
  color: var(--admin-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}

.redeem-order-link {
  color: var(--admin-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.el-button i {
  margin-right: 0.35rem;
}

@media (max-width: 920px) {
  .redeem-admin-grid {
    grid-template-columns: 1fr;
    height: auto;
    overflow: visible;
  }

  .redeem-inventory-card {
    height: min(38rem, 65vh);
  }

  .redeem-inventory-toolbar,
  .redeem-filters {
    align-items: stretch;
    flex-direction: column;
  }

  .redeem-filters .el-select {
    width: 100%;
  }

  .redeem-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>
