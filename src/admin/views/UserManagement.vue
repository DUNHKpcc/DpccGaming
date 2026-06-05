<template>
  <AdminLayout
    title="用户管理"
    description="管理用户角色、状态和账号安全操作"
  >
    <template #actions>
      <el-button type="primary" @click="refreshUsers">
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
          placeholder="搜索用户名或用户ID"
        />
      </div>

      <el-table
        v-if="filteredUsers.length"
        :data="pagedUsers"
        class="admin-user-table"
        height="100%"
        row-key="id"
      >
        <el-table-column label="用户" min-width="260">
          <template #default="{ row }">
            <div class="admin-user-cell">
              <el-avatar :size="42">
                <i class="fa fa-user"></i>
              </el-avatar>
              <div>
                <strong class="admin-username-row">
                  <span>{{ row.username }}</span>
                </strong>
                <small class="admin-user-id-row">ID: {{ row.id }}</small>
                <small class="admin-user-email-row">{{ row.email || '未设置邮箱' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="130">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)" effect="light">{{ row.role_name || getRoleName(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">{{ row.status_name || getStatusName(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="180">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="角色管理" width="280">
          <template #default="{ row }">
            <el-button-group>
              <el-button
                v-for="role in roleOptions"
                :key="role.value"
                size="small"
                :type="row.role === role.value ? 'primary' : 'default'"
                :disabled="row.role === role.value || isUserPending(row.id)"
                @click="changeUserRole(row, role.value)"
              >
                {{ role.label }}
              </el-button>
            </el-button-group>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'active'"
              size="small"
              type="warning"
              plain
              :disabled="isUserPending(row.id)"
              @click="banUser(row)"
            >
              禁言
            </el-button>
            <el-button
              v-else-if="row.status === 'banned'"
              size="small"
              type="success"
              plain
              :disabled="isUserPending(row.id)"
              @click="unbanUser(row)"
            >
              解禁
            </el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="isUserPending(row.id)"
              @click="confirmDeleteUser(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else :description="emptyDescription">
        <el-button type="primary" @click="refreshUsers">刷新列表</el-button>
      </el-empty>

      <div v-if="totalPages > 1" class="admin-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          background
          layout="total, sizes, prev, pager, next"
          :page-sizes="adminPageSizeOptions"
          :total="totalUsers"
        />
      </div>
    </el-card>
  </AdminLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { ADMIN_PAGE_SIZE_OPTIONS, DEFAULT_ADMIN_PAGE_SIZE, useAdminPagination } from '../utils/pagination'
import { useNotificationStore } from '../../stores/notification'

const notificationStore = useNotificationStore()
const users = ref([])
const searchQuery = ref('')
const adminPageSizeOptions = ADMIN_PAGE_SIZE_OPTIONS

// 跟踪每个用户正在进行中的写操作，避免快速连点重复提交
const pendingUserIds = ref(new Set())
const isUserPending = (id) => pendingUserIds.value.has(id)
const setUserPending = (id, pending) => {
  const next = new Set(pendingUserIds.value)
  if (pending) next.add(id)
  else next.delete(id)
  pendingUserIds.value = next
}

const filteredUsers = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return users.value

  return users.value.filter((user) => (
    String(user.id || '').includes(keyword)
    || String(user.username || '').toLowerCase().includes(keyword)
  ))
})

const {
  currentPage,
  pageSize,
  totalItems: totalUsers,
  totalPages,
  pagedItems: pagedUsers,
  resetPage
} = useAdminPagination(filteredUsers, {
  pageSize: DEFAULT_ADMIN_PAGE_SIZE,
  resetOn: searchQuery
})

const emptyDescription = computed(() => (users.value.length ? '暂无匹配用户' : '暂无用户数据'))

const roleOptions = [
  { value: 'user', label: '普通用户' },
  { value: 'admin', label: '管理员' },
  { value: 'super_admin', label: '超级管理员' }
]

const fetchUsers = async () => {
  try {
    const response = await fetch('/api/admin/users', {
      credentials: 'include'
    })

    if (response.ok) {
      const data = await response.json()
      users.value = data.users || []
      resetPage()
    } else {
      const error = await response.json()
      notificationStore.error('获取失败', error.error || '获取用户列表失败')
    }
  } catch (error) {
    console.error('获取用户列表错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  }
}

const changeUserRole = async (user, newRole) => {
  if (user.role === newRole) return
  if (isUserPending(user.id)) return

  try {
    await ElMessageBox.confirm(
      `确定要将用户“${user.username}”的角色更改为“${getRoleName(newRole)}”吗？`,
      '角色变更确认',
      {
        confirmButtonText: '更改',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  setUserPending(user.id, true)
  try {
    const response = await fetch(`/api/admin/users/${user.id}/role`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: newRole })
    })

    const result = await response.json()

    if (response.ok) {
      notificationStore.success('角色更新成功', result.message)
      user.role = newRole
      user.role_name = getRoleName(newRole)
    } else {
      notificationStore.error('更新失败', result.error || '更新用户角色失败')
    }
  } catch (error) {
    console.error('更新用户角色错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  } finally {
    setUserPending(user.id, false)
  }
}

const getRoleName = (role) => {
  const roleNames = {
    user: '普通用户',
    admin: '管理员',
    super_admin: '超级管理员'
  }
  return roleNames[role] || role
}

const getStatusName = (status) => {
  const statusNames = {
    active: '正常',
    inactive: '未激活',
    banned: '已禁用'
  }
  return statusNames[status] || status
}

const roleTagType = (role) => {
  if (role === 'super_admin') return 'danger'
  if (role === 'admin') return 'success'
  return 'info'
}

const statusTagType = (status) => {
  if (status === 'banned') return 'danger'
  if (status === 'inactive') return 'warning'
  return 'success'
}

const refreshUsers = () => {
  fetchUsers()
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}

const banUser = async (user) => {
  if (isUserPending(user.id)) return

  try {
    await ElMessageBox.confirm(
      `确定要禁言用户“${user.username}”吗？禁言后用户将无法发表评论或上传游戏。`,
      '禁言确认',
      {
        confirmButtonText: '禁言',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  setUserPending(user.id, true)
  try {
    const response = await fetch(`/api/admin/users/${user.id}/ban`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'ban' })
    })

    const result = await response.json()

    if (response.ok) {
      notificationStore.success('禁言成功', result.message)
      user.status = 'banned'
      user.status_name = '已禁用'
    } else {
      notificationStore.error('禁言失败', result.error || '禁言用户失败')
    }
  } catch (error) {
    console.error('禁言用户错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  } finally {
    setUserPending(user.id, false)
  }
}

const unbanUser = async (user) => {
  if (isUserPending(user.id)) return

  try {
    await ElMessageBox.confirm(`确定要解禁用户“${user.username}”吗？`, '解禁确认', {
      confirmButtonText: '解禁',
      cancelButtonText: '取消',
      type: 'success'
    })
  } catch {
    return
  }

  setUserPending(user.id, true)
  try {
    const response = await fetch(`/api/admin/users/${user.id}/ban`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'unban' })
    })

    const result = await response.json()

    if (response.ok) {
      notificationStore.success('解禁成功', result.message)
      user.status = 'active'
      user.status_name = '正常'
    } else {
      notificationStore.error('解禁失败', result.error || '解禁用户失败')
    }
  } catch (error) {
    console.error('解禁用户错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  } finally {
    setUserPending(user.id, false)
  }
}

const deleteUser = async (user) => {
  if (isUserPending(user.id)) return

  setUserPending(user.id, true)
  try {
    const response = await fetch(`/api/admin/users/${user.id}/delete`, {
      method: 'DELETE',
      credentials: 'include'
    })

    const result = await response.json()

    if (response.ok) {
      notificationStore.success('删除成功', result.message)
      users.value = users.value.filter((item) => item.id !== user.id)
    } else {
      notificationStore.error('删除失败', result.error || '删除用户失败')
    }
  } catch (error) {
    console.error('删除用户错误:', error)
    notificationStore.error('网络错误', '请检查网络连接')
  } finally {
    setUserPending(user.id, false)
  }
}

const confirmDeleteUser = async (user) => {
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除用户“${user.username}”吗？此操作会删除用户账户、评论、上传游戏和相关通知，且不可撤销。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'error'
      }
    )
    deleteUser(user)
  } catch {
    // user cancelled
  }
}

onMounted(() => {
  fetchUsers()
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

.admin-user-table {
  flex: 1 1 auto;
  min-height: 0;
}

.admin-filter-bar {
  display: flex;
  flex: 0 0 auto;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid var(--admin-border);
}

.admin-search-input {
  max-width: 22rem;
}

.admin-user-cell,
.admin-username-row {
  display: flex;
  align-items: center;
}

.admin-user-cell {
  gap: 0.8rem;
}

.admin-username-row {
  gap: 0.4rem;
}

.admin-user-cell strong,
.admin-user-cell small {
  display: block;
}

.admin-user-cell small {
  margin-top: 0.2rem;
  color: var(--admin-muted);
}

.el-button i {
  margin-right: 0.35rem;
}

.admin-pagination {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  padding: 0.85rem 1rem;
  border-top: 1px solid var(--admin-border);
}

@media (max-width: 720px) {
  .admin-panel-card {
    height: calc(100svh - 84px - 1.5rem);
    min-height: 30rem;
  }

  .admin-search-input {
    width: 100%;
    max-width: none;
  }

  .admin-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>
