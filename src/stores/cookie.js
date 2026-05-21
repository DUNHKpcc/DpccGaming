import { defineStore } from 'pinia';

const defaultPreferences = () => ({
  necessary: true,
  analytics: false,
  marketing: false,
  functional: false,
  theme: 'system'
});

const normalizeThemePreference = (theme) => (
  ['system', 'light', 'dark'].includes(theme) ? theme : 'system'
);

export const useCookieStore = defineStore('cookie', {
  state: () => ({
    consentStatus: null,
    cookieId: null,
    preferences: defaultPreferences(),
    bannerVisible: false,
    showPreferences: false,
    loading: false,
    error: null,
    initialized: false,
    lastSyncedAt: null
  }),
  getters: {
    needsPrompt: (state) => !state.consentStatus && state.bannerVisible
  },
  actions: {
    init() {
      if (this.initialized) return;
      this.initialized = true;

      if (typeof window === 'undefined') {
        this.bannerVisible = true;
        return;
      }

      try {
        const stored = localStorage.getItem('cookiePreferences');
        if (stored) {
          const parsed = JSON.parse(stored);
          this.consentStatus = parsed.consentStatus || null;
          this.cookieId = parsed.cookieId || null;
          this.preferences = { ...defaultPreferences(), ...(parsed.preferences || {}) };
          this.lastSyncedAt = parsed.lastSyncedAt || null;
          this.bannerVisible = false;
        } else {
          this.bannerVisible = true;
        }
      } catch (error) {
        console.warn('读取本地 Cookie 偏好失败:', error);
        this.bannerVisible = true;
      }
    },
    openBanner(forcePreferences = false) {
      this.bannerVisible = true;
      this.showPreferences = forcePreferences || this.showPreferences;
    },
    openPreferences() {
      this.bannerVisible = true;
      this.showPreferences = true;
    },
    closeBanner() {
      if (!this.consentStatus) return;
      this.bannerVisible = false;
      this.showPreferences = false;
    },
    async acceptAll() {
      await this.saveConsent('accepted', {
        analytics: true,
        marketing: true,
        functional: true
      });
    },
    async rejectOptional() {
      await this.saveConsent('rejected', {
        analytics: false,
        marketing: false,
        functional: false
      });
    },
    async saveCustom(preferences) {
      await this.saveConsent('customized', preferences);
    },
    async saveConsent(status, overrides = {}) {
      const normalized = {
        ...defaultPreferences(),
        ...this.preferences,
        ...overrides,
        necessary: true
      };

      this.loading = true;
      this.error = null;

      try {
        const payload = {
          consentStatus: status,
          preferences: normalized,
          cookieId: this.cookieId
        };

        const response = await fetch('/api/cookies/consent', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || '无法保存 Cookie 偏好');
        }

        this.cookieId = data.cookieId;
        this.consentStatus = data.consentStatus;
        this.preferences = normalized;
        this.lastSyncedAt = data.updatedAt || new Date().toISOString();
        this.bannerVisible = false;
        this.showPreferences = false;
        this.persistLocal();
      } catch (error) {
        console.error('保存 Cookie 偏好失败:', error);
        this.error = error.message || '保存失败，请稍后再试';
        this.bannerVisible = true;
      } finally {
        this.loading = false;
      }
    },
    resetConsent() {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cookiePreferences');
      }
      this.consentStatus = null;
      this.cookieId = null;
      this.preferences = defaultPreferences();
      this.bannerVisible = true;
      this.showPreferences = true;
    },
    persistLocal() {
      if (typeof window === 'undefined') return;
      const snapshot = {
        cookieId: this.cookieId,
        consentStatus: this.consentStatus,
        preferences: this.preferences,
        lastSyncedAt: this.lastSyncedAt
      };
      localStorage.setItem('cookiePreferences', JSON.stringify(snapshot));
    },
    async setThemePreference(theme, options = {}) {
      const normalized = normalizeThemePreference(theme);
      this.preferences = { ...this.preferences, theme: normalized };
      const shouldSync =
        options.sync !== false && this.consentStatus && this.preferences.functional;
      if (shouldSync) {
        await this.saveConsent(this.consentStatus, { theme: normalized });
      }
    }
  }
});
