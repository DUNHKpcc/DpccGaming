const paymentService = require('../services/payment/paymentService');
const { getPool } = require('../config/database');
const { recordAdminAuditLog } = require('../utils/adminAudit');

const buildAuditContext = (req) => ({
  adminUserId: req.user?.userId || null,
  ipAddress: req.ip || req.connection?.remoteAddress || '',
  userAgent: req.headers?.['user-agent'] || ''
});

const listOrders = async (req, res) => {
  try {
    const result = await paymentService.listAdminPaymentOrders({
      orderNo: req.query.orderNo,
      status: req.query.status,
      limit: req.query.limit
    });

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'payment_orders.list',
      resourceType: 'payment_order',
      resourceId: String(req.query.orderNo || ''),
      metadata: {
        orderNo: req.query.orderNo || '',
        status: req.query.status || '',
        limit: req.query.limit || '',
        returnedOrders: Array.isArray(result.orders) ? result.orders.length : 0
      }
    });

    res.json(result);
  } catch (error) {
    console.error('获取订单列表失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '获取订单列表失败'
    });
  }
};

const getOrderDetail = async (req, res) => {
  try {
    const result = await paymentService.getAdminPaymentOrderDetail({
      orderNo: req.params.orderNo
    });

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'payment_orders.detail',
      resourceType: 'payment_order',
      resourceId: String(result.orderNo || req.params.orderNo || ''),
      metadata: {
        userId: result.userId,
        productType: result.productType,
        status: result.status,
        fulfillmentStatus: result.fulfillmentStatus
      }
    });

    res.json(result);
  } catch (error) {
    console.error('获取订单详情失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '获取订单详情失败'
    });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const result = await paymentService.deleteAdminPaymentOrder({
      orderNo: req.params.orderNo
    });

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'payment_orders.delete',
      resourceType: 'payment_order',
      resourceId: String(result.order?.orderNo || req.params.orderNo || ''),
      metadata: {
        userId: result.order?.userId || null,
        productType: result.order?.productType || '',
        status: result.order?.status || '',
        fulfillmentStatus: result.order?.fulfillmentStatus || ''
      }
    });

    res.json({
      deleted: result.deleted,
      message: '订单已删除'
    });
  } catch (error) {
    console.error('删除订单失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '删除订单失败'
    });
  }
};

module.exports = {
  listOrders,
  getOrderDetail,
  deleteOrder
};
