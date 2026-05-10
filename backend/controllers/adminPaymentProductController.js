const paymentService = require('../services/payment/paymentService');
const { getPool } = require('../config/database');
const { recordAdminAuditLog } = require('../utils/adminAudit');

const buildAuditContext = (req) => ({
  adminUserId: req.user?.userId || null,
  ipAddress: req.ip || req.connection?.remoteAddress || '',
  userAgent: req.headers?.['user-agent'] || ''
});

const writeAuditLog = (req, payload = {}) => recordAdminAuditLog(getPool(), {
  ...buildAuditContext(req),
  ...payload
});

const listProducts = async (req, res) => {
  try {
    const result = await paymentService.listAdminPaymentProducts({
      productType: req.query.productType,
      status: req.query.status,
      keyword: req.query.keyword
    });

    await writeAuditLog(req, {
      action: 'payment_products.list',
      resourceType: 'payment_product',
      resourceId: '',
      metadata: {
        productType: req.query.productType || '',
        status: req.query.status || '',
        keyword: req.query.keyword || '',
        returnedProducts: Array.isArray(result.products) ? result.products.length : 0
      }
    });

    res.json(result);
  } catch (error) {
    console.error('获取支付档位失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '获取支付档位失败'
    });
  }
};

const createProduct = async (req, res) => {
  try {
    const result = await paymentService.createAdminPaymentProduct(req.body || {});

    await writeAuditLog(req, {
      action: 'payment_products.create',
      resourceType: 'payment_product',
      resourceId: String(result.product?.id || ''),
      metadata: {
        productType: result.product?.productType || '',
        skuId: result.product?.skuId || '',
        name: result.product?.name || ''
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('创建支付档位失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '创建支付档位失败'
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const result = await paymentService.updateAdminPaymentProduct({
      ...req.body,
      id: req.params.id
    });

    await writeAuditLog(req, {
      action: 'payment_products.update',
      resourceType: 'payment_product',
      resourceId: String(result.product?.id || req.params.id || ''),
      metadata: {
        productType: result.product?.productType || '',
        skuId: result.product?.skuId || '',
        status: result.product?.status || ''
      }
    });

    res.json(result);
  } catch (error) {
    console.error('更新支付档位失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '更新支付档位失败'
    });
  }
};

const copyProduct = async (req, res) => {
  try {
    const result = await paymentService.copyAdminPaymentProduct({
      id: req.params.id
    });

    await writeAuditLog(req, {
      action: 'payment_products.copy',
      resourceType: 'payment_product',
      resourceId: String(req.params.id || ''),
      metadata: {
        copiedProductId: result.product?.id || null,
        copiedSkuId: result.product?.skuId || ''
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('复制支付档位失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '复制支付档位失败'
    });
  }
};

const createPromotion = async (req, res) => {
  try {
    const result = await paymentService.createAdminPaymentPromotion({
      ...req.body,
      productId: req.params.productId
    });

    await writeAuditLog(req, {
      action: 'payment_promotions.create',
      resourceType: 'payment_promotion',
      resourceId: String(result.promotion?.id || ''),
      metadata: {
        productId: result.promotion?.productId || Number(req.params.productId || 0),
        title: result.promotion?.title || '',
        limitOnce: Boolean(result.promotion?.limitOnce)
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('创建促销失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '创建促销失败'
    });
  }
};

const updatePromotion = async (req, res) => {
  try {
    const result = await paymentService.updateAdminPaymentPromotion({
      ...req.body,
      id: req.params.id
    });

    await writeAuditLog(req, {
      action: 'payment_promotions.update',
      resourceType: 'payment_promotion',
      resourceId: String(result.promotion?.id || req.params.id || ''),
      metadata: {
        productId: result.promotion?.productId || null,
        status: result.promotion?.status || '',
        limitOnce: Boolean(result.promotion?.limitOnce)
      }
    });

    res.json(result);
  } catch (error) {
    console.error('更新促销失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '更新促销失败'
    });
  }
};

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  copyProduct,
  createPromotion,
  updatePromotion
};
