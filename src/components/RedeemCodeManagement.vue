<template>
  <div class="redeem-admin-page">
    <main class="redeem-admin-shell">
      <header class="redeem-admin-header">
        <div>
          <p>Admin</p>
          <h1>兑换码管理</h1>
        </div>
        <nav>
          <router-link to="/admin">审核管理</router-link>
          <router-link to="/admin/users">用户管理</router-link>
          <router-link to="/admin/games">游戏管理</router-link>
        </nav>
      </header>

      <section class="warehouse-layout">
        <form class="import-panel" @submit.prevent="importCodes">
          <h2>批量导入</h2>
          <label>
            档位
            <select v-model="selectedProductKey">
              <option v-for="product in catalogProducts" :key="product.key" :value="product.key">
                {{ product.label }}
              </option>
            </select>
          </label>
          <label>
            兑换码
            <textarea
              v-model="codesText"
              rows="10"
              placeholder="一行一个兑换码"
            ></textarea>
          </label>
          <button type="submit" :disabled="isImporting">
            {{ isImporting ? '导入中...' : '导入兑换码' }}
          </button>
          <p v-if="importMessage" class="import-message">{{ importMessage }}</p>
        </form>

        <section class="inventory-panel">
          <div class="inventory-toolbar">
            <div>
              <h2>库存列表</h2>
              <p>最多显示最近 300 条兑换码</p>
            </div>
            <div class="filters">
              <select v-model="filterProductKey" @change="fetchCodes">
                <option value="">全部档位</option>
                <option v-for="product in catalogProducts" :key="product.key" :value="product.key">
                  {{ product.label }}
                </option>
              </select>
              <select v-model="filterStatus" @change="fetchCodes">
                <option value="">全部状态</option>
                <option value="available">未使用</option>
                <option value="assigned">已分配</option>
              </select>
              <button type="button" @click="fetchCodes">刷新</button>
            </div>
          </div>

          <div class="stats-strip">
            <div v-for="item in visibleStats" :key="item.key">
              <span>{{ item.label }}</span>
              <strong>{{ item.available }}</strong>
              <small>可用 / {{ item.total }} 总数</small>
            </div>
          </div>

          <div class="code-table">
            <div class="table-head">
              <span>兑换码</span>
              <span>档位</span>
              <span>状态</span>
              <span>订单</span>
            </div>
            <div v-for="code in codes" :key="code.id" class="table-row">
              <code>{{ code.code }}</code>
              <span>{{ productLabel(code.productType, code.skuId) }}</span>
              <span :class="['status-pill', code.status]">{{ code.status === 'assigned' ? '已分配' : '未使用' }}</span>
              <span>{{ code.assignedOrderNo || '-' }}</span>
            </div>
            <p v-if="!codes.length" class="empty-copy">暂无兑换码</p>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiCall } from '../utils/api'

const catalogProducts = ref([])
const selectedProductKey = ref('')
const filterProductKey = ref('')
const filterStatus = ref('')
const codesText = ref('')
const codes = ref([])
const stats = ref([])
const importMessage = ref('')
const isImporting = ref(false)

const splitProductKey = (key = '') => {
  const [productType = '', skuId = ''] = String(key || '').split(':')
  return { productType, skuId }
}

const productLabel = (productType, skuId) => {
  const key = `${productType}:${skuId}`
  return catalogProducts.value.find((item) => item.key === key)?.label || skuId
}

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
  return [...groups.values()].filter((item) => item.total > 0 || !filterProductKey.value || item.key === filterProductKey.value)
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

onMounted(async () => {
  await fetchCatalog()
  await fetchCodes()
})
</script>

<style scoped>
.redeem-admin-page {
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
  min-height: 100vh;
  background: #0b0b0b;
  color: #f8fafc;
  padding: clamp(1rem, 3vw, 2.5rem);
  overflow-x: hidden;
}

.redeem-admin-shell {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
}

.redeem-admin-header,
.warehouse-layout,
.inventory-toolbar,
.filters,
.stats-strip,
.support-row {
  display: flex;
}

.redeem-admin-header {
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  width: 100%;
}

.redeem-admin-header p,
.redeem-admin-header h1,
.import-panel h2,
.inventory-panel h2,
.inventory-toolbar p,
.empty-copy {
  margin: 0;
}

.redeem-admin-header p,
.inventory-toolbar p,
.empty-copy {
  color: rgba(248, 250, 252, 0.64);
  font-weight: 700;
}

.redeem-admin-header h1 {
  margin-top: 0.25rem;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1;
}

.redeem-admin-header nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.65rem;
  max-width: 100%;
}

.redeem-admin-header a,
.filters button,
.import-panel button {
  border-radius: 0.5rem;
  background: #f8fafc;
  color: #0b0b0b;
  font-weight: 900;
  text-decoration: none;
}

.redeem-admin-header a {
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  padding: 0.75rem 1rem;
}

.warehouse-layout {
  align-items: flex-start;
  gap: 1rem;
  display: grid;
  grid-template-columns: minmax(20rem, 0.9fr) minmax(0, 1.6fr);
  width: 100%;
}

.import-panel,
.inventory-panel {
  border: 1px solid #1f2937;
  background: #111827;
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.import-panel {
  min-width: 0;
}

.inventory-panel {
  min-width: 0;
  overflow: hidden;
}

.import-panel label,
.import-panel select,
.import-panel textarea,
.filters select {
  display: block;
  width: 100%;
}

.import-panel label {
  margin-top: 1rem;
  color: rgba(248, 250, 252, 0.72);
  font-weight: 900;
}

.import-panel select,
.import-panel textarea,
.filters select {
  margin-top: 0.45rem;
  border: 1px solid #273244;
  border-radius: 0.5rem;
  background: #0b1220;
  color: #f8fafc;
  padding: 0.75rem;
}

.import-panel textarea {
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.import-panel button,
.filters button {
  min-height: 2.65rem;
  border: 0;
  padding: 0 1rem;
  cursor: pointer;
}

.import-panel button {
  width: 100%;
  margin-top: 1rem;
}

.import-panel button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.import-message {
  color: #93c5fd;
  font-weight: 800;
}

.inventory-toolbar {
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.filters {
  align-items: end;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
}

.filters select {
  width: min(11rem, 100%);
}

.stats-strip {
  gap: 0.75rem;
  overflow-x: auto;
  padding: 1rem 0;
}

.stats-strip div {
  flex: 0 0 11rem;
  border: 1px solid #273244;
  border-radius: 0.5rem;
  padding: 0.85rem;
}

.stats-strip span,
.stats-strip small {
  display: block;
  color: rgba(248, 250, 252, 0.62);
  font-weight: 800;
}

.stats-strip strong {
  display: block;
  margin: 0.35rem 0;
  font-size: 2rem;
}

.code-table {
  overflow-x: auto;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: minmax(16rem, 1.4fr) minmax(9rem, 0.8fr) 6rem minmax(13rem, 1fr);
  gap: 1rem;
  align-items: center;
  min-width: 760px;
  border-top: 1px solid #273244;
  padding: 0.8rem 0;
}

.table-head {
  color: rgba(248, 250, 252, 0.58);
  font-weight: 900;
}

.table-row code {
  word-break: break-all;
}

.status-pill {
  width: fit-content;
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 900;
}

.status-pill.available {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}

.status-pill.assigned {
  background: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

@media (max-width: 880px) {
  .redeem-admin-header,
  .inventory-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .redeem-admin-header nav,
  .filters {
    justify-content: flex-start;
  }

  .warehouse-layout {
    grid-template-columns: 1fr;
  }

  .import-panel,
  .inventory-panel {
    width: 100%;
    flex-basis: auto;
  }
}
</style>
