const paymentService = require('../services/payment/paymentService');
const { getPool } = require('../config/database');
const { recordAdminAuditLog } = require('../utils/adminAudit');

const buildAuditContext = (req) => ({
  adminUserId: req.user?.userId || null,
  ipAddress: req.ip || req.connection?.remoteAddress || '',
  userAgent: req.headers?.['user-agent'] || ''
});

const getRedeemCodeCatalog = async (req, res) => {
  try {
    res.json(await paymentService.getRedeemCodeCatalog());
  } catch (error) {
    console.error('获取兑换码档位失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '获取兑换码档位失败'
    });
  }
};

const listRedeemCodes = async (req, res) => {
  try {
    const result = await paymentService.listRedeemCodes({
      productType: req.query.productType,
      skuId: req.query.skuId,
      status: req.query.status
    });

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'redeem_codes.list',
      resourceType: 'redeem_code',
      resourceId: `${req.query.productType || ''}:${req.query.skuId || ''}`,
      metadata: {
        productType: req.query.productType || '',
        skuId: req.query.skuId || '',
        status: req.query.status || '',
        returnedCodes: Array.isArray(result.codes) ? result.codes.length : 0
      }
    });

    res.json(result);
  } catch (error) {
    console.error('获取兑换码列表失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '获取兑换码列表失败'
    });
  }
};

const importRedeemCodes = async (req, res) => {
  try {
    const result = await paymentService.importRedeemCodes({
      productType: req.body?.productType,
      skuId: req.body?.skuId,
      codes: req.body?.codes
    });

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'redeem_codes.import',
      resourceType: 'redeem_code',
      resourceId: `${result.productType}:${result.skuId}`,
      metadata: {
        total: result.total,
        inserted: result.inserted,
        duplicate: result.duplicate
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('导入兑换码失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '导入兑换码失败'
    });
  }
};

const deleteRedeemCode = async (req, res) => {
  try {
    const result = await paymentService.deleteRedeemCode({
      id: req.params.id
    });

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'redeem_codes.delete',
      resourceType: 'redeem_code',
      resourceId: String(req.params.id || ''),
      metadata: result
    });

    res.json(result);
  } catch (error) {
    console.error('删除兑换码失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '删除兑换码失败'
    });
  }
};

const getRedeemCodeSecret = async (req, res) => {
  try {
    const result = await paymentService.getRedeemCodeSecret({
      id: req.params.id
    });
    const purpose = req.query?.purpose === 'copy' ? 'copy' : 'reveal';

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: `redeem_codes.${purpose}`,
      resourceType: 'redeem_code',
      resourceId: String(result.id || req.params.id || ''),
      metadata: {
        productType: result.productType,
        skuId: result.skuId,
        status: result.status
      }
    });

    res.json(result);
  } catch (error) {
    console.error('读取兑换码明文失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '读取兑换码明文失败'
    });
  }
};

const batchDeleteRedeemCodes = async (req, res) => {
  try {
    const result = await paymentService.deleteRedeemCodes({
      ids: req.body?.ids
    });

    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'redeem_codes.batch_delete',
      resourceType: 'redeem_code',
      resourceId: '',
      metadata: {
        requestedIds: Array.isArray(req.body?.ids) ? req.body.ids : [],
        ...result
      }
    });

    res.json(result);
  } catch (error) {
    console.error('批量删除兑换码失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '批量删除兑换码失败'
    });
  }
};

module.exports = {
  getRedeemCodeCatalog,
  listRedeemCodes,
  importRedeemCodes,
  getRedeemCodeSecret,
  deleteRedeemCode,
  batchDeleteRedeemCodes
};
