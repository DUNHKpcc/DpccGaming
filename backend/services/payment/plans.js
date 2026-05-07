const PAYMENT_PLANS = Object.freeze([
  {
    id: 'bronze',
    name: '青铜月卡',
    price: '29.90',
    dailyQuotaUsd: '5.00',
    subject: 'DPCC API Bronze Monthly Card'
  },
  {
    id: 'gold',
    name: '黄金月卡',
    price: '69.90',
    dailyQuotaUsd: '15.00',
    subject: 'DPCC API Gold Monthly Card'
  },
  {
    id: 'platinum',
    name: '白金月卡',
    price: '199.90',
    dailyQuotaUsd: '50.00',
    subject: 'DPCC API Platinum Monthly Card'
  }
]);

const PAYMENT_DURATIONS = Object.freeze([
  { id: '1m', label: '1个月', months: 1 },
  { id: '3m', label: '3个月', months: 3 },
  { id: '12m', label: '12个月', months: 12 }
]);

const RECHARGE_BONUS_USD = 30;
const RECHARGE_BONUS_PACKAGE = Object.freeze({
  id: 'usd-30-bonus',
  name: '$30 赠送额度包',
  quotaUsd: '30.00',
  subject: 'DPCC API $30 Bonus Credit Pack'
});

const applyRechargeBonus = (pack) => ({
  ...pack,
  originalQuotaUsd: pack.quotaUsd,
  bonusQuotaUsd: RECHARGE_BONUS_PACKAGE.quotaUsd,
  quotaUsd: (Number(pack.quotaUsd) + RECHARGE_BONUS_USD).toFixed(2)
});

const RECHARGE_PACKAGES = Object.freeze([
  { id: 'usd-25', name: '$25 额度包', quotaUsd: '25.00', price: '19.90', subject: 'DPCC API $25 Credit Pack' },
  { id: 'usd-200', name: '$200 额度包', quotaUsd: '200.00', price: '149.90', subject: 'DPCC API $200 Credit Pack' },
  { id: 'usd-500', name: '$500 额度包', quotaUsd: '500.00', price: '299.90', subject: 'DPCC API $500 Credit Pack' },
  { id: 'usd-1000', name: '$1000 额度包', quotaUsd: '1000.00', price: '499.90', subject: 'DPCC API $1000 Credit Pack' },
  { id: 'usd-2000', name: '$2000 额度包', quotaUsd: '2000.00', price: '899.90', subject: 'DPCC API $2000 Credit Pack' }
].map(applyRechargeBonus));

const toCents = (amount) => Math.round(Number(amount) * 100);

const fromCents = (cents) => (Number(cents) / 100).toFixed(2);

const getPaymentPlan = (planId = '') => (
  PAYMENT_PLANS.find((plan) => plan.id === String(planId || '').trim()) || null
);

const getPaymentDuration = (durationId = '') => (
  PAYMENT_DURATIONS.find((duration) => duration.id === String(durationId || '').trim()) || null
);

const getRechargePackage = (packageId = '') => (
  RECHARGE_PACKAGES.find((pack) => pack.id === String(packageId || '').trim()) || null
);

const calculateOrderAmount = (plan, duration) => {
  if (!plan || !duration) return '0.00';
  return fromCents(toCents(plan.price) * duration.months);
};

const listPaymentPlans = () => PAYMENT_PLANS.map((plan) => ({ ...plan }));

const listPaymentDurations = () => PAYMENT_DURATIONS.map((duration) => ({ ...duration }));

const listRechargePackages = () => RECHARGE_PACKAGES.map((pack) => ({ ...pack }));

const getRechargeBonusPackage = () => ({ ...RECHARGE_BONUS_PACKAGE });

module.exports = {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  getRechargeBonusPackage,
  calculateOrderAmount,
  listPaymentPlans,
  listPaymentDurations,
  listRechargePackages
};
