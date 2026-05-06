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
            :data="codes"
            height="100%"
            row-key="id"
            empty-text="暂无兑换码"
            @selection-change="handleSelectionChange"
          >
            <el-table-column type="selection" width="48" :selectable="isCodeSelectable" />
            <el-table-column label="兑换码" min-width="240">
              <template #default="{ row }">
                <code class="redeem-code-text">{{ row.code }}</code>
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
              <template #default="{ row }">{{ row.assignedOrderNo || '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="96" fixed="right">
              <template #default="{ row }">
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
      </el-card>
    </div>
  </AdminLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
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

const splitProductKey = (key = '') => {
  const [productType = '', skuId = ''] = String(key || '').split(':')
  return { productType, skuId }
}

const productLabel = (productType, skuId) => {
  const key = `${productType}:${skuId}`
  return catalogProducts.value.find((item) => item.key === key)?.label || skuId
}

const activeProductLabel = computed(() => (
  catalogProducts.value.find((item) => item.key === filterProductKey.value)?.label || '请选择额度包'
))

const selectedAvailableIds = computed(() => selectedCodes.value
  .filter((item) => item.status === 'available')
  .map((item) => item.id))

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
  selectedCodes.value = []
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
  color: #64748b;
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
  border-bottom: 1px solid #eef2f7;
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
  border-bottom: 1px solid #eef2f7;
}

.redeem-stat-item {
  flex: 0 0 10rem;
  cursor: pointer;
  padding: 0.7rem 0.8rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.45rem;
  background: #f8fafc;
  color: inherit;
  font: inherit;
  text-align: left;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.redeem-stat-item.active {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px #2563eb;
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

.redeem-code-text {
  color: #111827;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
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
}
</style>
