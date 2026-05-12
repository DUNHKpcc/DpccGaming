<template>
  <div
    v-if="isOpen"
    class="register-modal-mask"
    @click="handleBackdropClick"
  >
    <div class="register-modal-shell" @click.stop>
      <section class="register-panel-left">
        <div class="register-panel-inner">
          <div class="register-brand-row">
            <img src="/logo_light.png" alt="DpccGaming" class="register-brand-icon" />
            <h2>注册</h2>
          </div>

          <p class="register-welcome">Welcome DpccGaming</p>
          <h1 class="register-title">Sign Up</h1>

          <form class="register-form" @submit.prevent="handleRegister">
            <label class="register-label">用户名</label>
            <input
              v-model="username"
              type="text"
              class="register-input"
              placeholder="输入你的用户名"
              required
            >

            <label class="register-label register-label-spaced">邮箱（可选）</label>
            <input
              v-model="email"
              type="email"
              class="register-input"
              placeholder="输入你的邮箱"
            >

            <label class="register-label register-label-spaced">密码</label>
            <div class="password-input-wrap">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="register-input"
                placeholder="*************"
                required
              >
              <button
                type="button"
                class="password-ghost-btn"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="togglePasswordVisibility"
              >
                <i :class="showPassword ? 'fa fa-eye' : 'fa fa-eye-slash'"></i>
              </button>
            </div>

            <button type="submit" class="register-submit-btn">
              <span>REGiSTER</span>
              <i class="fa fa-long-arrow-right"></i>
            </button>

            <p class="register-switch-row">
              已经拥有账户？
              <button type="button" @click="switchToLogin" class="switch-link">登录</button>
            </p>
          </form>
        </div>
      </section>

      <section class="register-panel-right" aria-hidden="true"></section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useModalStore } from '../stores/modal'
import { useNotificationStore } from '../stores/notification'

const modalStore = useModalStore()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const isOpen = computed(() => modalStore.activeModal === 'register')
const username = ref('')
const email = ref('')
const password = ref('')
const showPassword = ref(false)

const handleRegister = async () => {
  const result = await authStore.register(username.value, password.value, email.value)

  if (result.success) {
    modalStore.closeModal()
    notificationStore.success('注册成功', result.message)
  } else {
    notificationStore.error('注册失败', result.message)
  }
}

const switchToLogin = () => {
  modalStore.closeModal()
  setTimeout(() => {
    modalStore.openModal('login')
  }, 300)
}

const handleBackdropClick = (event) => {
  if (event.target === event.currentTarget) {
    modalStore.closeModal()
  }
}

const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value
}
</script>

<style scoped>
.register-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(2px);
}

.register-modal-shell {
  width: min(1050px, 94vw);
  height: min(650px, 86vh);
  border-radius: 26px;
  overflow: hidden;
  background: #f1f1f1;
  display: flex;
  position: relative;
  isolation: isolate;
  z-index: 1;
}

.register-panel-left {
  width: 57%;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.register-panel-inner {
  width: min(360px, calc(100% - 48px));
  padding-top: 20px;
  color: #111111;
  transform: translate(-16px, 10px);
}

.register-brand-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.register-brand-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: grayscale(1) contrast(3);
}

.register-brand-row h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.register-welcome {
  margin: 16px 0 0;
  font-size: 14px;
  line-height: 1.35;
  color: #1e1e1e;
}

.register-title {
  margin: 12px 0 0;
  font-size: 28px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #050505;
}

.register-form {
  margin-top: 20px;
}

.register-label {
  display: block;
  font-size: 10px;
  line-height: 1.25;
  color: #2a2a2a;
  margin-bottom: 4px;
}

.register-label-spaced {
  margin-top: 12px;
}

.register-input {
  width: 100%;
  height: 41px;
  border-radius: 8px;
  border: none;
  background: #d3d3d5;
  color: #111111;
  font-size: 15px;
  line-height: 1.2;
  padding: 0 13px;
  outline: none;
}

.register-input::placeholder {
  color: #242424;
  opacity: 0.95;
}

.password-input-wrap {
  position: relative;
}

.password-input-wrap .register-input {
  padding-right: 37px;
}

.password-ghost-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #b3b3b3;
  font-size: 13px;
  padding: 0;
  cursor: pointer;
}

.register-submit-btn {
  margin: 18px auto 0;
  width: 140px;
  height: 37px;
  border-radius: 999px;
  border: none;
  background: #050505;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.register-submit-btn:hover {
  background: #1a1a1a;
  transform: translateY(-1px);
}

.register-submit-btn:active {
  transform: scale(0.97);
}

.register-switch-row {
  margin: 22px 0 0;
  text-align: center;
  font-size: 13px;
  color: #8f8f8f;
}

.switch-link {
  border: none;
  background: transparent;
  padding: 0;
  color: #111111;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.16s ease;
}

.switch-link:hover {
  opacity: 0.72;
}

.register-panel-right {
  width: 43%;
  min-width: 0;
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  z-index: 3;
  background-color: #12163d;
  pointer-events: none;
}

.register-panel-right::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: calc(100% + clamp(120px, 10vw, 180px));
  height: 100%;
  z-index: 1;
  background-image: url('/Ai/LoginBackground.webp');
  background-repeat: no-repeat;
  background-position: 96% center;
  transform: scale(1.05);
  transform-origin: center right;
  background-size: cover;
  pointer-events: none;
}

@media (max-width: 1200px) {
  .register-panel-right {
    width: 40%;
  }

  .register-panel-left {
    width: 60%;
  }
}

@media (max-width: 980px) {
  .register-modal-shell {
    width: min(560px, 96vw);
    height: min(560px, 94vh);
    border-radius: 16px;
  }

  .register-panel-right {
    display: none;
  }

  .register-panel-left {
    width: 100%;
    align-items: flex-start;
    overflow: auto;
  }

  .register-panel-inner {
    width: min(420px, 100%);
    padding: 24px 18px 20px;
    transform: translate(-8px, 6px);
  }

  .register-brand-row h2 {
    font-size: 20px;
  }

  .register-brand-icon {
    width: 14px;
    height: 14px;
  }

  .register-welcome {
    margin-top: 8px;
    font-size: 13px;
  }

  .register-title {
    margin-top: 6px;
    font-size: 26px;
  }

  .register-label {
    font-size: 14px;
  }

  .register-input {
    height: 40px;
    font-size: 14px;
  }

  .password-ghost-btn {
    font-size: 12px;
  }

  .register-submit-btn {
    width: 124px;
    height: 34px;
    margin-top: 14px;
    font-size: 13px;
  }

  .register-switch-row {
    margin-top: 16px;
    font-size: 12px;
  }

  .switch-link {
    font-size: 12px;
  }
}
</style>
