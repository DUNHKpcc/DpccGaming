export const paymentStatusText = (value = '') => {
  if (value === 'paid') return '已支付'
  if (value === 'closed') return '已关闭'
  return '待支付'
}

export const paymentStatusTone = (value = '') => {
  if (value === 'paid') return 'paid'
  if (value === 'closed') return 'closed'
  return 'pending'
}

export const productTypeText = (value = '') => (value === 'recharge' ? '额度充值' : '月卡订阅')

export const fulfillmentStatusText = (value = '') => {
  if (value === 'code_assigned') return '已发放'
  if (value === 'bonus_skipped') return '赠送跳过'
  if (value === 'manual_required') return '人工处理'
  if (value === 'username_required') return '待填用户名'
  if (value === 'username_submitted') return '用户名已提交'
  return '待处理'
}

export const formatPaymentDateTime = (value = '') => {
  if (!value) return '-'
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

export const buildPaymentResultRoute = (orderNo = '') => ({
  name: 'PaymentResult',
  query: { orderNo }
})
