<template>
  <AdminLayout
    title="安全验证"
    kicker="Security"
    description="管理员操作需要独立的短时安全会话"
  >
    <section class="security-shell" aria-live="polite">
      <el-skeleton v-if="loading" :rows="5" animated />

      <div v-else-if="recoveryCodes.length" class="security-panel">
        <div class="security-heading">
          <i class="fa fa-key" aria-hidden="true"></i>
          <div>
            <h2>保存恢复码</h2>
            <p>每条恢复码只能使用一次。离开此页后将无法再次查看。</p>
          </div>
        </div>
        <div class="recovery-grid">
          <code v-for="item in recoveryCodes" :key="item">{{ item }}</code>
        </div>
        <div class="security-actions">
          <el-button @click="copyRecoveryCodes">复制恢复码</el-button>
          <el-button type="primary" @click="continueToAdmin">我已保存，继续</el-button>
        </div>
      </div>

      <div v-else-if="!status.enrolled && !setup.qrCodeDataUrl" class="security-panel">
        <div class="security-heading">
          <i class="fa fa-shield" aria-hidden="true"></i>
          <div>
            <h2>启用管理员验证器</h2>
            <p>先验证当前账号密码，再绑定支持 TOTP 的验证器应用。</p>
          </div>
        </div>
        <el-form label-position="top" @submit.prevent="beginSetup">
          <el-form-item label="当前账号密码">
            <el-input
              v-model="setup.password"
              type="password"
              autocomplete="current-password"
              maxlength="256"
              show-password
              @keyup.enter="beginSetup"
            />
          </el-form-item>
          <el-button type="primary" :loading="submitting" @click="beginSetup">继续配置</el-button>
        </el-form>
      </div>

      <div v-else-if="!status.enrolled" class="security-panel enrollment-panel">
        <div class="security-heading">
          <i class="fa fa-qrcode" aria-hidden="true"></i>
          <div>
            <h2>扫描二维码</h2>
            <p>二维码 10 分钟内有效。扫描后输入验证器当前显示的 6 位验证码。</p>
          </div>
        </div>
        <div class="enrollment-content">
          <img :src="setup.qrCodeDataUrl" alt="管理员 TOTP 配置二维码" class="totp-qr" />
          <div class="manual-secret">
            <span>无法扫码时手动输入</span>
            <code>{{ setup.secret }}</code>
          </div>
        </div>
        <el-form label-position="top" @submit.prevent="finishSetup">
          <el-form-item label="6 位验证码">
            <el-input
              v-model="setup.code"
              autocomplete="one-time-code"
              inputmode="numeric"
              maxlength="6"
              placeholder="000000"
              @keyup.enter="finishSetup"
            />
          </el-form-item>
          <div class="security-actions">
            <el-button @click="resetSetup">重新开始</el-button>
            <el-button type="primary" :loading="submitting" @click="finishSetup">确认启用</el-button>
          </div>
        </el-form>
      </div>

      <div v-else-if="!status.elevated" class="security-panel">
        <div class="security-heading">
          <i class="fa fa-lock" aria-hidden="true"></i>
          <div>
            <h2>验证管理员身份</h2>
            <p>安全会话闲置 15 分钟后失效，高风险操作会在 5 分钟后要求复验。</p>
          </div>
        </div>
        <el-form label-position="top" @submit.prevent="verify">
          <el-form-item label="验证码或恢复码">
            <el-input
              v-model="verificationCode"
              autocomplete="one-time-code"
              maxlength="64"
              show-password
              @keyup.enter="verify"
            />
          </el-form-item>
          <el-button type="primary" :loading="submitting" @click="verify">进入管理后台</el-button>
        </el-form>
      </div>

      <div v-else class="security-panel">
        <div class="security-heading">
          <i class="fa fa-check-circle" aria-hidden="true"></i>
          <div>
            <h2>安全会话已验证</h2>
            <p>当前会话可用至 {{ formatDate(status.expiresAt) }}，持续活动会延长闲置期限。</p>
          </div>
        </div>
        <div class="security-actions">
          <el-button type="danger" plain :loading="submitting" @click="revoke">结束安全会话</el-button>
          <el-button type="primary" @click="continueToAdmin">继续管理</el-button>
        </div>
      </div>
    </section>
  </AdminLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { apiCall } from '../../utils/api'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const submitting = ref(false)
const verificationCode = ref('')
const recoveryCodes = ref([])
const status = reactive({
  enrolled: false,
  setupPending: false,
  elevated: false,
  expiresAt: null,
  freshUntil: null
})
const setup = reactive({
  password: '',
  code: '',
  secret: '',
  qrCodeDataUrl: ''
})

const redirectTarget = computed(() => {
  const candidate = String(route.query.redirect || '/admin')
  if (!candidate.startsWith('/admin') || candidate.startsWith('/admin/security')) return '/admin'
  return candidate
})

const applyStatus = (nextStatus) => {
  Object.assign(status, nextStatus)
}

const loadStatus = async () => {
  loading.value = true
  try {
    applyStatus(await apiCall('/admin/security/status', {
      method: 'GET',
      suppressErrorLogging: true
    }))
  } catch (error) {
    ElMessage.error(error.message || '无法读取管理员安全状态')
  } finally {
    loading.value = false
  }
}

const beginSetup = async () => {
  if (!setup.password) {
    ElMessage.warning('请输入当前账号密码')
    return
  }

  submitting.value = true
  try {
    const result = await apiCall('/admin/security/setup', {
      method: 'POST',
      body: JSON.stringify({ password: setup.password }),
      suppressErrorLogging: true
    })
    setup.password = ''
    setup.secret = result.secret
    setup.qrCodeDataUrl = result.qrCodeDataUrl
  } catch (error) {
    ElMessage.error(error.message || '无法开始配置验证器')
  } finally {
    submitting.value = false
  }
}

const finishSetup = async () => {
  if (!/^\d{6}$/.test(setup.code.trim())) {
    ElMessage.warning('请输入 6 位数字验证码')
    return
  }

  submitting.value = true
  try {
    const result = await apiCall('/admin/security/setup/confirm', {
      method: 'POST',
      body: JSON.stringify({ code: setup.code.trim() }),
      suppressErrorLogging: true
    })
    setup.code = ''
    setup.secret = ''
    setup.qrCodeDataUrl = ''
    status.enrolled = true
    status.elevated = true
    recoveryCodes.value = result.recoveryCodes || []
  } catch (error) {
    ElMessage.error(error.message || '验证码无效')
  } finally {
    submitting.value = false
  }
}

const verify = async () => {
  if (!verificationCode.value.trim()) {
    ElMessage.warning('请输入验证码或恢复码')
    return
  }

  submitting.value = true
  try {
    const result = await apiCall('/admin/security/verify', {
      method: 'POST',
      body: JSON.stringify({ code: verificationCode.value.trim() }),
      suppressErrorLogging: true
    })
    if (result.usedRecoveryCode) ElMessage.warning('已使用一条恢复码，该恢复码现已失效')
    verificationCode.value = ''
    await router.replace(redirectTarget.value)
  } catch (error) {
    ElMessage.error(error.message || '验证失败')
  } finally {
    submitting.value = false
  }
}

const copyRecoveryCodes = async () => {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    ElMessage.success('恢复码已复制')
  } catch (error) {
    ElMessage.error('复制失败，请手动保存恢复码')
  }
}

const resetSetup = () => {
  setup.code = ''
  setup.secret = ''
  setup.qrCodeDataUrl = ''
}

const continueToAdmin = () => router.replace(redirectTarget.value)

const revoke = async () => {
  submitting.value = true
  try {
    await apiCall('/admin/security/revoke', {
      method: 'POST',
      suppressErrorLogging: true
    })
    status.elevated = false
    status.expiresAt = null
    ElMessage.success('安全会话已结束')
  } catch (error) {
    ElMessage.error(error.message || '无法结束安全会话')
  } finally {
    submitting.value = false
  }
}

const formatDate = (value) => value
  ? new Date(value).toLocaleString('zh-CN')
  : '-'

onMounted(loadStatus)
</script>

<style scoped>
.security-shell {
  width: min(100%, 720px);
}

.security-panel {
  padding: 1.5rem;
  border: 1px solid var(--admin-border);
  border-radius: 0.5rem;
  background: var(--admin-surface);
}

.security-heading {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  margin-bottom: 1.4rem;
}

.security-heading > i {
  display: grid;
  flex: 0 0 2.5rem;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--admin-strong-border);
  border-radius: 0.5rem;
}

.security-heading h2,
.security-heading p {
  margin: 0;
}

.security-heading h2 {
  font-size: 1.1rem;
}

.security-heading p {
  margin-top: 0.35rem;
  color: var(--admin-muted);
  line-height: 1.55;
}

.enrollment-content {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
}

.totp-qr {
  width: 190px;
  height: 190px;
  border: 1px solid var(--admin-border);
  background: #fff;
  object-fit: contain;
}

.manual-secret {
  min-width: 0;
}

.manual-secret span {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--admin-muted);
  font-size: 0.85rem;
}

.manual-secret code {
  overflow-wrap: anywhere;
  font-size: 0.95rem;
}

.recovery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 1.25rem;
}

.recovery-grid code {
  padding: 0.7rem;
  border: 1px solid var(--admin-border);
  background: var(--admin-surface-soft);
  text-align: center;
}

.security-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
}

@media (max-width: 640px) {
  .security-panel {
    padding: 1rem;
  }

  .enrollment-content {
    align-items: flex-start;
    flex-direction: column;
  }

  .recovery-grid {
    grid-template-columns: 1fr;
  }

  .security-actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }
}
</style>
