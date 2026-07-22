<template>
  <el-dialog
    :model-value="modelValue"
    title="管理员身份复验"
    width="min(92vw, 420px)"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="code = ''"
  >
    <p class="reauth-copy">输入验证器中的 6 位验证码，或使用一条未使用的恢复码。</p>
    <el-input
      v-model="code"
      autocomplete="one-time-code"
      maxlength="64"
      placeholder="验证码或恢复码"
      show-password
      @keyup.enter="submit"
    />
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">验证</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiCall } from '../../utils/api'

defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'verified'])
const code = ref('')
const submitting = ref(false)

const submit = async () => {
  if (!code.value.trim()) {
    ElMessage.warning('请输入验证码或恢复码')
    return
  }

  submitting.value = true
  try {
    const result = await apiCall('/admin/security/verify', {
      method: 'POST',
      body: JSON.stringify({ code: code.value.trim() }),
      suppressErrorLogging: true
    })
    code.value = ''
    emit('update:modelValue', false)
    emit('verified', result)
  } catch (error) {
    ElMessage.error(error.message || '验证失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.reauth-copy {
  margin: 0 0 1rem;
  color: var(--admin-muted, var(--text-tertiary));
  line-height: 1.6;
}
</style>
