<template>
  <AdminLayout
    title="游戏库管理"
    description="查看已审核游戏并处理下架删除"
  >
    <template #actions>
      <el-button type="primary" @click="refreshGames">
        <i class="fa fa-refresh"></i>
        刷新
      </el-button>
    </template>

    <el-card class="admin-panel-card" shadow="never">
      <div class="admin-filter-bar">
        <el-input
          v-model="searchQuery"
          class="admin-search-input"
          clearable
          placeholder="搜索游戏标题"
        />
        <el-select v-model="selectedCategory" class="admin-category-select" placeholder="所有类型" clearable>
          <el-option label="动作" value="action" />
          <el-option label="冒险" value="adventure" />
          <el-option label="谜题" value="puzzle" />
          <el-option label="赛车" value="racing" />
          <el-option label="模拟" value="simulation" />
          <el-option label="策略" value="strategy" />
        </el-select>
      </div>

      <el-table
        v-if="filteredGames.length"
        :data="filteredGames"
        class="admin-game-table"
        height="100%"
        row-key="game_id"
      >
        <el-table-column label="游戏" min-width="320">
          <template #default="{ row }">
            <div class="admin-game-cell">
              <img
                v-if="row.thumbnail_url"
                :src="row.thumbnail_url"
                :alt="row.title"
                class="admin-game-cover"
              />
              <div v-else class="admin-game-cover admin-game-cover-empty">
                <i class="fa fa-gamepad"></i>
              </div>
              <div>
                <strong>{{ row.title }}</strong>
                <p>{{ row.description || '暂无简介' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ categoryToZh(row.category) }}</template>
        </el-table-column>
        <el-table-column label="评分" width="95">
          <template #default="{ row }">{{ row.average_rating || '0.0' }}</template>
        </el-table-column>
        <el-table-column label="游玩" width="95">
          <template #default="{ row }">{{ row.play_count || 0 }}</template>
        </el-table-column>
        <el-table-column label="评论" width="95">
          <template #default="{ row }">{{ row.comment_count || 0 }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="previewGame(row)">
              <i class="fa fa-external-link"></i>
              预览
            </el-button>
            <el-button size="small" type="danger" @click="confirmDeleteGame(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无游戏数据">
        <el-button type="primary" @click="refreshGames">刷新列表</el-button>
      </el-empty>

      <div v-if="totalPages > 1" class="admin-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          background
          layout="prev, pager, next"
          :page-size="pageSize"
          :total="filteredTotal"
        />
      </div>
    </el-card>
  </AdminLayout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { useNotificationStore } from '../../stores/notification'
import { categoryToCode, categoryToZh } from '../../utils/category'

const notificationStore = useNotificationStore()
const games = ref([])
const searchQuery = ref('')
const selectedCategory = ref('')
const currentPage = ref(1)
const pageSize = 10

const filteredAllGames = computed(() => {
  let filtered = games.value

  if (searchQuery.value) {
    const keyword = searchQuery.value.toLowerCase()
    filtered = filtered.filter((game) => String(game.title || '').toLowerCase().includes(keyword))
  }

  if (selectedCategory.value) {
    filtered = filtered.filter((game) => categoryToCode(game.category) === selectedCategory.value)
  }

  return filtered
})

const filteredGames = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredAllGames.value.slice(start, start + pageSize)
})

const filteredTotal = computed(() => filteredAllGames.value.length)
const totalPages = computed(() => Math.ceil(filteredTotal.value / pageSize))

watch([searchQuery, selectedCategory], () => {
  currentPage.value = 1
})

const fetchGames = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      notificationStore.error('未登录', '请先登录管理员账户')
      return
    }

    const response = await fetch('/api/admin/games/all', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      games.value = data.games || []
    } else {
      const error = await response.json()
      notificationStore.error('获取失败', error.error || '获取游戏列表失败')
    }
  } catch (error) {
    console.error('获取游戏列表错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  }
}

const deleteGame = async (game) => {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/admin/games/${game.game_id}/delete`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const result = await response.json()

    if (response.ok) {
      notificationStore.success('删除成功', result.message)
      games.value = games.value.filter((item) => item.game_id !== game.game_id)
    } else {
      notificationStore.error('删除失败', result.error || '删除游戏失败')
    }
  } catch (error) {
    console.error('删除游戏错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  }
}

const confirmDeleteGame = async (game) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除游戏“${game.title}”吗？此操作会删除游戏文件、评论和相关通知，且不可撤销。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'error'
      }
    )
    deleteGame(game)
  } catch {
    // user cancelled
  }
}

const previewGame = (game) => {
  if (game.game_url) {
    window.open(game.game_url, '_blank', 'noopener,noreferrer')
  }
}

const refreshGames = () => {
  fetchGames()
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}

onMounted(async () => {
  const token = localStorage.getItem('token')
  if (!token) {
    notificationStore.error('未登录', '请先登录管理员账户')
    window.location.href = '/'
    return
  }

  try {
    const response = await fetch('/api/admin/check-permission', {
      headers: {
        Authorization: `Bearer ${token}`
      }
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

    fetchGames()
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
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
}

.admin-filter-bar {
  display: flex;
  flex: 0 0 auto;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid #eef2f7;
}

.admin-search-input {
  max-width: 22rem;
}

.admin-category-select {
  width: 12rem;
}

.admin-game-table {
  flex: 1 1 auto;
  min-height: 0;
}

.admin-game-cell {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.admin-game-cover {
  flex: 0 0 auto;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 0.6rem;
  object-fit: cover;
}

.admin-game-cover-empty {
  display: grid;
  place-items: center;
  background: #eef2ff;
  color: #4f46e5;
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
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-pagination {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  padding: 0.85rem 1rem;
  border-top: 1px solid #eef2f7;
}

.el-button i {
  margin-right: 0.35rem;
}

@media (max-width: 720px) {
  .admin-filter-bar {
    flex-direction: column;
  }

  .admin-search-input,
  .admin-category-select {
    width: 100%;
    max-width: none;
  }
}
</style>
