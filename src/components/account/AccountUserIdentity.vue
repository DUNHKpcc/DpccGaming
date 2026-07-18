<template>
  <div :class="['account-user-identity', `is-${size}`]">
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      :alt="avatarAlt"
      class="account-user-identity-avatar-image"
      @error="$emit('avatar-error', $event)"
    />
    <div v-else class="account-user-identity-avatar-fallback">
      {{ initial }}
    </div>

    <div class="account-user-identity-meta">
      <div class="account-user-identity-summary">
        <strong :title="nameText">{{ nameText }}</strong>
      </div>
      <small :title="subtitleText">{{ subtitleText }}</small>
    </div>

    <slot name="after"></slot>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  avatarUrl: {
    type: String,
    default: ''
  },
  avatarAlt: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'md'
  }
})

defineEmits(['avatar-error'])

const nameText = computed(() => String(props.name || '?').trim() || '?')
const subtitleText = computed(() => String(props.subtitle || '未设置邮箱').trim() || '未设置邮箱')
const initial = computed(() => nameText.value.charAt(0).toUpperCase() || '?')
</script>

<style scoped>
.account-user-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex: 1;
}

.account-user-identity-avatar-fallback,
.account-user-identity-avatar-image {
  flex-shrink: 0;
  border-radius: 999px;
}

.account-user-identity-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--account-icon-bg);
  color: var(--account-icon-text);
  border: 1px solid var(--account-upload-border);
  font-weight: 700;
}

.account-user-identity-avatar-image {
  object-fit: cover;
  display: block;
  border: 1px solid var(--account-upload-border);
}

.account-user-identity.is-md .account-user-identity-avatar-fallback,
.account-user-identity.is-md .account-user-identity-avatar-image {
  width: 36px;
  height: 36px;
}

.account-user-identity.is-md .account-user-identity-avatar-fallback {
  font-size: 0.85rem;
}

.account-user-identity.is-sm .account-user-identity-avatar-fallback,
.account-user-identity.is-sm .account-user-identity-avatar-image {
  width: 32px;
  height: 32px;
}

.account-user-identity.is-sm .account-user-identity-avatar-fallback {
  font-size: 0.8rem;
}

.account-user-identity-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.account-user-identity-summary {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.account-user-identity-summary strong,
.account-user-identity-meta small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-user-identity.is-md .account-user-identity-summary strong {
  font-size: 0.9rem;
}

.account-user-identity.is-md .account-user-identity-meta small {
  font-size: 0.75rem;
}

.account-user-identity.is-sm .account-user-identity-summary strong {
  min-width: 0;
  flex: 1;
  font-size: 0.84rem;
}

.account-user-identity.is-sm .account-user-identity-meta small {
  font-size: 0.72rem;
}

.account-user-identity-meta small {
  color: var(--account-text-soft);
}
</style>
