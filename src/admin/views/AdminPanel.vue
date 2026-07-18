<template>
  <AdminLayout
    title="游戏审核管理"
    description="处理开发者提交的待审核游戏"
  >
    <template #actions>
      <el-button type="primary" @click="refreshPendingGames">
        <i class="fa fa-refresh"></i>
        刷新
      </el-button>
    </template>

    <el-card class="admin-panel-card" shadow="never">
      <el-table
        v-if="pendingGames.length"
        :data="pendingGames"
        height="100%"
        row-key="game_id"
      >
        <el-table-column label="游戏" min-width="300">
          <template #default="{ row }">
            <div class="admin-game-cell">
              <div class="admin-game-thumb">
                <i class="fa fa-gamepad"></i>
              </div>
              <div>
                <strong>{{ row.title }}</strong>
                <p>{{ row.description || '暂无简介' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ categoryToZh(row.category) }}</template>
        </el-table-column>
        <el-table-column label="上传者" min-width="180">
          <template #default="{ row }">
            <span class="admin-username-row">
              <span>{{ row.uploaded_by_username || '-' }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">{{ formatDate(row.uploaded_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="previewGame(row)">
              <i class="fa fa-external-link"></i>
              预览
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :disabled="isGamePending(row.game_id)"
              @click="rejectGame(row)"
            >
              拒绝
            </el-button>
            <el-button
              size="small"
              type="success"
              :disabled="isGamePending(row.game_id)"
              @click="approveGame(row)"
            >
              通过
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无待审核游戏">
        <el-button type="primary" @click="refreshPendingGames">刷新列表</el-button>
      </el-empty>
    </el-card>
  </AdminLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { useNotificationStore } from '../../stores/notification'
import { categoryToZh } from '../../utils/category'

const notificationStore = useNotificationStore()
const pendingGames = ref([])

// 跟踪正在审核中的游戏，避免快速连点重复提交
const pendingReviewIds = ref(new Set())
const isGamePending = (id) => pendingReviewIds.value.has(id)
const setGamePending = (id, pending) => {
  const next = new Set(pendingReviewIds.value)
  if (pending) next.add(id)
  else next.delete(id)
  pendingReviewIds.value = next
}

const fetchPendingGames = async () => {
  try {
    const response = await fetch('/api/admin/games/pending', {
      credentials: 'include'
    })

    if (response.ok) {
      const data = await response.json()
      pendingGames.value = data.games || []
    } else {
      const error = await response.json()
      notificationStore.error('获取失败', error.error || '获取待审核游戏失败')
    }
  } catch (error) {
    console.error('获取待审核游戏错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  }
}

const reviewGame = async (gameId, status, reviewNotes = '') => {
  if (isGamePending(gameId)) return

  setGamePending(gameId, true)
  try {
    const response = await fetch(`/api/admin/games/${gameId}/review`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status, reviewNotes })
    })

    const result = await response.json()

    if (response.ok) {
      notificationStore.success(
        `游戏${status === 'approved' ? '审核通过' : '审核拒绝'}`,
        result.message
      )
      pendingGames.value = pendingGames.value.filter((game) => game.game_id !== gameId)
    } else {
      notificationStore.error('审核失败', result.error || '审核过程中出现错误')
    }
  } catch (error) {
    console.error('审核游戏错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  } finally {
    setGamePending(gameId, false)
  }
}

const approveGame = async (game) => {
  try {
    await ElMessageBox.confirm(`确定要通过游戏“${game.title}”吗？`, '审核确认', {
      confirmButtonText: '通过',
      cancelButtonText: '取消',
      type: 'success'
    })
    reviewGame(game.game_id, 'approved')
  } catch {
    // user cancelled
  }
}

const rejectGame = async (game) => {
  try {
    const { value } = await ElMessageBox.prompt(`请输入拒绝游戏“${game.title}”的原因`, '拒绝审核', {
      confirmButtonText: '拒绝',
      cancelButtonText: '取消',
      inputType: 'textarea'
    })
    reviewGame(game.game_id, 'rejected', value || '')
  } catch {
    // user cancelled
  }
}

const previewGame = (game) => {
  if (game.game_url) {
    window.open(game.game_url, '_blank', 'noopener,noreferrer')
  }
}

const refreshPendingGames = () => {
  fetchPendingGames()
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}

onMounted(async () => {
  try {
    const response = await fetch('/api/admin/check-permission', {
      credentials: 'include'
    })

    if (!response.ok) {
      const error = await response.json()
      notificationStore.error('权限不足', error.message || '只有管理员才能访问此页面')
      localStorage.removeItem('token')
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
      return
    }

    const data = await response.json()
    if (!['admin', 'super_admin'].includes(data.user.role)) {
      notificationStore.error('权限不足', '您的账户没有管理员权限')
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
      return
    }

    fetchPendingGames()
  } catch (error) {
    console.error('权限检查失败:', error)
    notificationStore.error('权限检查失败', '网络错误，请检查网络连接')
    setTimeout(() => {
      window.location.href = '/'
    }, 2000)
  }
})
</script>

<style scoped>
.admin-panel-card {
  height: calc(100vh - 116px);
  border: 0;
}

.admin-panel-card :deep(.el-card__body) {
  height: 100%;
  padding: 0;
}

.admin-game-cell {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.admin-game-thumb {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.6rem;
  background: var(--admin-surface-soft);
  color: var(--admin-text);
}

.admin-game-cell strong,
.admin-game-cell p {
  display: block;
  margin: 0;
}

.admin-game-cell p {
  max-width: 34rem;
  margin-top: 0.25rem;
  overflow: hidden;
  color: var(--admin-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-username-row {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.el-button i {
  margin-right: 0.35rem;
}

@media (max-width: 820px) {
  .admin-panel-card {
    height: calc(100svh - 84px - 1.5rem);
    min-height: 30rem;
  }
}
</style>
