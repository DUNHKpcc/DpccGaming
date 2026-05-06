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
      <el-table
        v-if="users.length"
        :data="users"
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
                  <UserLevelBadge :user-id="row.id" />
                </strong>
                <small>{{ row.email || '未设置邮箱' }}</small>
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
                :disabled="row.role === role.value"
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
              @click="banUser(row)"
            >
              禁言
            </el-button>
            <el-button
              v-else-if="row.status === 'banned'"
              size="small"
              type="success"
              plain
              @click="unbanUser(row)"
            >
              解禁
            </el-button>
            <el-button size="small" type="danger" @click="confirmDeleteUser(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无用户数据">
        <el-button type="primary" @click="refreshUsers">刷新列表</el-button>
      </el-empty>
    </el-card>
  </AdminLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import AdminLayout from '../layout/AdminLayout.vue'
import { useNotificationStore } from '../../stores/notification'
import UserLevelBadge from '../../components/UserLevelBadge.vue'

const notificationStore = useNotificationStore()
const users = ref([])

const roleOptions = [
  { value: 'user', label: '普通用户' },
  { value: 'admin', label: '管理员' },
  { value: 'super_admin', label: '超级管理员' }
]

const fetchUsers = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      notificationStore.error('未登录', '请先登录管理员账户')
      return
    }

    const response = await fetch('/api/admin/users', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      users.value = data.users || []
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

  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/admin/users/${user.id}/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
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

  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/admin/users/${user.id}/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
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
  }
}

const unbanUser = async (user) => {
  try {
    await ElMessageBox.confirm(`确定要解禁用户“${user.username}”吗？`, '解禁确认', {
      confirmButtonText: '解禁',
      cancelButtonText: '取消',
      type: 'success'
    })
  } catch {
    return
  }

  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/admin/users/${user.id}/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
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
  }
}

const deleteUser = async (user) => {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/admin/users/${user.id}/delete`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
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
  height: 100%;
  padding: 0;
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
  color: #64748b;
}

.el-button i {
  margin-right: 0.35rem;
}
</style>
