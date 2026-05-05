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

const RECHARGE_PACKAGES = Object.freeze([
  { id: 'usd-6', name: '$6 额度包', quotaUsd: '6.00', price: '10.00', subject: 'DPCC API $6 Credit Pack' },
  { id: 'usd-33', name: '$33 额度包', quotaUsd: '33.00', price: '50.00', subject: 'DPCC API $33 Credit Pack' },
  { id: 'usd-45', name: '$45 额度包', quotaUsd: '45.00', price: '80.00', subject: 'DPCC API $45 Credit Pack' },
  { id: 'usd-100', name: '$100 额度包', quotaUsd: '100.00', price: '150.00', subject: 'DPCC API $100 Credit Pack' },
  { id: 'usd-180', name: '$180 额度包', quotaUsd: '180.00', price: '200.00', subject: 'DPCC API $180 Credit Pack' },
  { id: 'usd-230', name: '$230 额度包', quotaUsd: '230.00', price: '300.00', subject: 'DPCC API $230 Credit Pack' },
  { id: 'usd-350', name: '$350 额度包', quotaUsd: '350.00', price: '400.00', subject: 'DPCC API $350 Credit Pack' },
  { id: 'usd-450', name: '$450 额度包', quotaUsd: '450.00', price: '500.00', subject: 'DPCC API $450 Credit Pack' }
]);

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

module.exports = {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  calculateOrderAmount,
  listPaymentPlans,
  listPaymentDurations,
  listRechargePackages
};
