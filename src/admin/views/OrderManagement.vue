<template>
  <AdminLayout
    title="订单管理"
    description="查看支付订单、支付状态和发放处理状态"
  >
    <template #actions>
      <el-button @click="fetchOrders">
        <i class="fa fa-refresh"></i>
        刷新
      </el-button>
    </template>

    <el-card class="admin-panel-card" shadow="never">
      <div class="order-filter-bar">
        <el-input
          v-model="searchOrderNo"
          class="order-search-input"
          clearable
          placeholder="搜索订单号"
          @keyup.enter="fetchOrdersFromFirstPage"
        />
        <el-select v-model="selectedStatus" class="order-status-select" placeholder="全部状态" clearable @change="fetchOrdersFromFirstPage">
          <el-option label="待支付" value="pending" />
          <el-option label="已支付" value="paid" />
          <el-option label="已关闭" value="closed" />
        </el-select>
        <el-button :loading="isLoading" @click="fetchOrdersFromFirstPage">查询</el-button>
      </div>

      <el-table
        v-if="orders.length"
        :data="pagedOrders"
        class="admin-order-table"
        height="100%"
        row-key="orderNo"
      >
        <el-table-column label="订单号" min-width="210">
          <template #default="{ row }">
            <button class="order-link" type="button" @click="openDetail(row.orderNo)">
              {{ row.orderNo }}
            </button>
          </template>
        </el-table-column>
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <strong>{{ row.username || `用户 ${row.userId}` }}</strong>
            <small>{{ row.email || '-' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="商品" min-width="170">
          <template #default="{ row }">
            <strong>{{ row.productName || row.skuId }}</strong>
            <small>{{ productTypeText(row.productType) }}</small>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column label="支付" width="100">
          <template #default="{ row }">
            <span :class="['status-pill', `is-${row.status || 'pending'}`]">{{ statusText(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发放" min-width="230">
          <template #default="{ row }">
            <div class="fulfillment-cell">
              <span :class="['fulfillment-pill', `is-${fulfillmentMeta(row).tone}`]">
                {{ fulfillmentMeta(row).title }}
              </span>
              <small>{{ fulfillmentMeta(row).detail }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.orderNo)">详情</el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="row.status === 'paid' || deletingOrderNo === row.orderNo"
              @click="confirmDeleteOrder(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无订单数据">
        <el-button @click="fetchOrders">刷新列表</el-button>
      </el-empty>

      <div v-if="totalPages > 1" class="admin-order-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          background
          layout="total, sizes, prev, pager, next"
          :page-sizes="adminPageSizeOptions"
          :total="totalOrders"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="订单详情" size="520px">
      <el-skeleton v-if="isDetailLoading" :rows="8" animated />
      <dl v-else-if="selectedOrder.orderNo" class="order-detail-list">
        <div>
          <dt>订单号</dt>
          <dd>{{ selectedOrder.orderNo }}</dd>
        </div>
        <div>
          <dt>用户</dt>
          <dd>{{ selectedOrder.username || `用户 ${selectedOrder.userId}` }}</dd>
        </div>
        <div>
          <dt>商品</dt>
          <dd>{{ selectedOrder.productName || selectedOrder.skuId }}</dd>
        </div>
        <div>
          <dt>订单类型</dt>
          <dd>{{ productTypeText(selectedOrder.productType) }}</dd>
        </div>
        <div>
          <dt>支付状态</dt>
          <dd>{{ statusText(selectedOrder.status) }}</dd>
        </div>
        <div>
          <dt>发放状态</dt>
          <dd>
            <span :class="['fulfillment-pill', `is-${fulfillmentMeta(selectedOrder).tone}`]">
              {{ fulfillmentMeta(selectedOrder).title }}
            </span>
            <p class="fulfillment-detail">{{ fulfillmentMeta(selectedOrder).detail }}</p>
          </dd>
        </div>
        <div v-if="selectedOrder.supportNote">
          <dt>发放说明</dt>
          <dd>{{ selectedOrder.supportNote }}</dd>
        </div>
        <div>
          <dt>金额</dt>
          <dd>¥{{ selectedOrder.amount }} {{ selectedOrder.currency || 'CNY' }}</dd>
        </div>
        <div v-if="selectedOrder.apiUsername">
          <dt>DPCC-API 用户名</dt>
          <dd>{{ selectedOrder.apiUsername }}</dd>
        </div>
        <div v-if="displayRedeemCodes(selectedOrder).length">
          <dt>兑换码明细</dt>
          <dd class="redeem-code-list">
            <span v-for="item in displayRedeemCodes(selectedOrder)" :key="item.label">
              <b>{{ item.label }}</b>
              <code>{{ item.code }}</code>
            </span>
          </dd>
        </div>
        <div v-if="selectedOrder.alipayTradeNo">
          <dt>支付宝交易号</dt>
          <dd>{{ selectedOrder.alipayTradeNo }}</dd>
        </div>
        <div>
          <dt>创建时间</dt>
          <dd>{{ formatDate(selectedOrder.createdAt) }}</dd>
        </div>
        <div>
          <dt>支付时间</dt>
          <dd>{{ formatDate(selectedOrder.paidAt) }}</dd>
        </div>
        <div>
          <dt>过期时间</dt>
          <dd>{{ formatDate(selectedOrder.expiresAt) }}</dd>
        </div>
      </dl>
      <div v-if="selectedOrder.orderNo" class="order-detail-actions">
        <el-button
          type="danger"
          :disabled="selectedOrder.status === 'paid' || deletingOrderNo === selectedOrder.orderNo"
          @click="confirmDeleteOrder(selectedOrder)"
        >
          删除订单
        </el-button>
      </div>
    </el-drawer>
  </AdminLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElDrawer, ElMessage, ElMessageBox, ElSkeleton } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { ADMIN_PAGE_SIZE_OPTIONS, DEFAULT_ADMIN_PAGE_SIZE, useAdminPagination } from '../utils/pagination'
import { apiCall } from '../../utils/api'

const route = useRoute()
const orders = ref([])
const searchOrderNo = ref('')
const selectedStatus = ref('')
const isLoading = ref(false)
const detailVisible = ref(false)
const isDetailLoading = ref(false)
const selectedOrder = ref({})
const deletingOrderNo = ref('')
const adminPageSizeOptions = ADMIN_PAGE_SIZE_OPTIONS

const {
  currentPage,
  pageSize,
  totalItems: totalOrders,
  totalPages,
  pagedItems: pagedOrders,
  resetPage
} = useAdminPagination(orders, { pageSize: DEFAULT_ADMIN_PAGE_SIZE })

const fetchOrders = async () => {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    params.set('limit', '100')
    if (searchOrderNo.value) params.set('orderNo', searchOrderNo.value.trim())
    if (selectedStatus.value) params.set('status', selectedStatus.value)
    const result = await apiCall(`/admin/payment-orders?${params.toString()}`, { method: 'GET' })
    orders.value = result.orders || []
  } catch (error) {
    ElMessage.error(error.message || '获取订单列表失败')
  } finally {
    isLoading.value = false
  }
}

const fetchOrdersFromFirstPage = async () => {
  resetPage()
  await fetchOrders()
}

const openDetail = async (orderNo) => {
  if (!orderNo) return
  detailVisible.value = true
  isDetailLoading.value = true
  selectedOrder.value = {}
  try {
    selectedOrder.value = await apiCall(`/admin/payment-orders/${encodeURIComponent(orderNo)}`, { method: 'GET' })
  } catch (error) {
    ElMessage.error(error.message || '获取订单详情失败')
  } finally {
    isDetailLoading.value = false
  }
}

const confirmDeleteOrder = async (order) => {
  if (!order?.orderNo || order.status === 'paid') return
  try {
    await ElMessageBox.confirm(
      `确认删除订单“${order.orderNo}”？已支付订单不会被允许删除。`,
      '删除订单',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  deletingOrderNo.value = order.orderNo
  try {
    const result = await apiCall(`/admin/payment-orders/${encodeURIComponent(order.orderNo)}`, {
      method: 'DELETE'
    })
    orders.value = orders.value.filter((item) => item.orderNo !== order.orderNo)
    if (selectedOrder.value.orderNo === order.orderNo) {
      selectedOrder.value = {}
      detailVisible.value = false
    }
    ElMessage.success(result.message || '订单已删除')
  } catch (error) {
    ElMessage.error(error.message || '删除订单失败')
  } finally {
    deletingOrderNo.value = ''
  }
}

const productTypeText = (value) => (value === 'recharge' ? '充值额度' : '订阅月卡')

const statusText = (value) => {
  if (value === 'paid') return '已支付'
  if (value === 'closed') return '已关闭'
  return '待支付'
}

const fulfillmentText = (value) => {
  if (value === 'code_assigned') return '已发码'
  if (value === 'bonus_skipped') return '赠送已跳过'
  if (value === 'manual_required') return '人工处理'
  if (value === 'username_required') return '待填用户名'
  if (value === 'username_submitted') return '用户名已提交'
  return '待处理'
}

const displayRedeemCodes = (order = {}) => {
  if (Array.isArray(order.maskedRedeemCodes) && order.maskedRedeemCodes.length) {
    return order.maskedRedeemCodes.filter((item) => item?.code)
  }
  return [
    order.maskedRedeemCode ? { label: '原有额度', code: order.maskedRedeemCode } : null,
    order.maskedBonusRedeemCode ? { label: '赠送 $30', code: order.maskedBonusRedeemCode } : null
  ].filter(Boolean)
}

const fulfillmentMeta = (order = {}) => {
  const fulfillmentStatus = typeof order === 'string' ? order : order.fulfillmentStatus
  const paymentStatus = typeof order === 'string' ? '' : order.status
  const productType = typeof order === 'string' ? '' : order.productType
  const apiUsername = typeof order === 'string' ? '' : String(order.apiUsername || '').trim()
  const supportNote = typeof order === 'string' ? '' : String(order.supportNote || '').trim()
  const redeemCodeCount = typeof order === 'string' ? 0 : displayRedeemCodes(order).length

  if (fulfillmentStatus === 'code_assigned') {
    return {
      title: '已自动发放',
      detail: redeemCodeCount > 1 ? '主兑换码和赠送码均已发放' : '兑换码已发放',
      tone: 'done'
    }
  }
  if (fulfillmentStatus === 'bonus_skipped') {
    return {
      title: '主码已发，赠送跳过',
      detail: supportNote || '赠送码已按用户或支付宝付款账号领取规则跳过',
      tone: 'warning'
    }
  }
  if (fulfillmentStatus === 'manual_required') {
    return {
      title: '需人工处理',
      detail: supportNote || '已支付但未自动发放完整权益，请人工核验库存、限购或付款账号',
      tone: 'danger'
    }
  }
  if (fulfillmentStatus === 'username_required') {
    return {
      title: '待提交用户名',
      detail: supportNote || '月卡已确认，等待用户提交 DPCC-API 平台用户名',
      tone: 'warning'
    }
  }
  if (fulfillmentStatus === 'username_submitted') {
    return {
      title: '用户名已提交',
      detail: apiUsername ? `已提交 ${apiUsername}，等待后台处理月卡权益` : '已提交用户名，等待后台处理月卡权益',
      tone: 'done'
    }
  }
  if (paymentStatus === 'closed') {
    return {
      title: '不发放',
      detail: '订单已关闭，未进入发放流程',
      tone: 'muted'
    }
  }
  if (paymentStatus === 'paid') {
    return {
      title: fulfillmentText(fulfillmentStatus),
      detail: productType === 'subscription' ? '月卡订单等待后续处理' : '已支付，等待兑换码处理',
      tone: 'warning'
    }
  }
  return {
    title: '待支付后发放',
    detail: '订单尚未支付，暂不发放权益',
    tone: 'muted'
  }
}

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN')
}

onMounted(async () => {
  const queryOrderNo = String(route.query.orderNo || '').trim()
  if (queryOrderNo) {
    searchOrderNo.value = queryOrderNo
  }
  await fetchOrders()
  if (queryOrderNo) {
    await openDetail(queryOrderNo)
  }
})
</script>

<style scoped>
.admin-panel-card {
  height: calc(100vh - 116px);
  border: 0;
}

.admin-panel-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
}

.order-filter-bar {
  display: flex;
  flex: 0 0 auto;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid var(--admin-border);
}

.order-search-input {
  max-width: 22rem;
}

.order-status-select {
  width: 12rem;
}

.admin-order-table {
  flex: 1 1 auto;
  min-height: 0;
}

.admin-order-pagination {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--admin-border);
}

.admin-order-table strong,
.admin-order-table small {
  display: block;
}

.admin-order-table small {
  margin-top: 0.2rem;
  color: var(--admin-muted);
}

.order-link {
  cursor: pointer;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--admin-text);
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-width: 3.9rem;
  justify-content: center;
  padding: 0.16rem 0.5rem;
  border: 1px solid var(--admin-primary);
  border-radius: 999px;
  color: var(--admin-text);
  font-size: 0.78rem;
  font-weight: 700;
}

.status-pill.is-paid {
  background: var(--admin-primary);
  color: var(--admin-primary-text);
}

.fulfillment-cell {
  display: grid;
  gap: 0.28rem;
}

.fulfillment-cell small,
.fulfillment-detail {
  color: var(--admin-muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.fulfillment-pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  justify-content: center;
  padding: 0.16rem 0.5rem;
  border: 1px solid var(--admin-primary);
  border-radius: 999px;
  color: var(--admin-text);
  font-size: 0.78rem;
  font-weight: 700;
}

.fulfillment-pill.is-done {
  background: var(--admin-primary);
  color: var(--admin-primary-text);
}

.fulfillment-pill.is-warning {
  border-color: var(--admin-warning-border);
  color: var(--admin-warning-text);
  background: var(--admin-warning-bg);
}

.fulfillment-pill.is-danger {
  border-color: var(--admin-danger-border);
  color: var(--admin-danger-text);
  background: var(--admin-danger-bg);
}

.fulfillment-pill.is-muted {
  border-color: var(--admin-border);
  color: var(--admin-muted);
  background: var(--admin-surface-soft);
}

.fulfillment-detail {
  margin: 0.4rem 0 0;
}

.redeem-code-list {
  display: grid;
  gap: 0.45rem;
}

.redeem-code-list span {
  display: grid;
  gap: 0.18rem;
}

.redeem-code-list b {
  color: var(--admin-muted);
  font-size: 0.78rem;
}

.redeem-code-list code {
  width: fit-content;
  max-width: 100%;
  padding: 0.24rem 0.38rem;
  border: 1px solid var(--admin-border);
  border-radius: 0.35rem;
  background: var(--admin-surface-soft);
  color: var(--admin-text);
  word-break: break-all;
}

.order-detail-list {
  display: grid;
  gap: 0.85rem;
  margin: 0;
}

.order-detail-list div {
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--admin-border);
}

.order-detail-list dt {
  color: var(--admin-muted);
  font-size: 0.78rem;
}

.order-detail-list dd {
  margin: 0.22rem 0 0;
  color: var(--admin-text);
  word-break: break-all;
}

.order-detail-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
}

.el-button i {
  margin-right: 0.35rem;
}

@media (max-width: 720px) {
  .order-filter-bar {
    flex-direction: column;
  }

  .order-search-input,
  .order-status-select {
    width: 100%;
    max-width: none;
  }

  .admin-order-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>
