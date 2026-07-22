import { onMounted, onUnmounted, ref, watch } from 'vue'
import { apiCall } from '../utils/api'

export const useAccountFriends = ({
  route,
  isLoggedIn,
  notificationStore,
  openLoginModal
}) => {
  const friends = ref([])
  const friendsLoading = ref(false)
  const friendModalVisible = ref(false)
  const friendSearchKeyword = ref('')
  const friendSearching = ref(false)
  const friendSearchResults = ref([])
  const friendActionLoading = ref({})
  const inviteExpireMinutes = ref(60)
  const inviteGenerating = ref(false)
  const generatedInviteLink = ref('')
  const inviteCodeInput = ref('')
  const inviteRedeeming = ref(false)
  const friendRequestsLoading = ref(false)
  const incomingRequests = ref([])
  const outgoingRequests = ref([])

  const dispatchFriendsChanged = () => {
    window.dispatchEvent(new CustomEvent('friends:changed'))
  }

  const loadFriends = async () => {
    if (!isLoggedIn.value) {
      friends.value = []
      return
    }

    friendsLoading.value = true
    try {
      const data = await apiCall('/discussion/friends')
      friends.value = Array.isArray(data?.friends) ? data.friends : []
    } catch (error) {
      console.error('加载好友失败:', error)
      friends.value = []
    } finally {
      friendsLoading.value = false
    }
  }

  const loadFriendRequests = async () => {
    if (!isLoggedIn.value) {
      incomingRequests.value = []
      outgoingRequests.value = []
      return
    }

    friendRequestsLoading.value = true
    try {
      const data = await apiCall('/discussion/friends/requests')
      incomingRequests.value = Array.isArray(data?.incoming) ? data.incoming : []
      outgoingRequests.value = Array.isArray(data?.outgoing) ? data.outgoing : []
    } catch (error) {
      console.error('加载好友申请失败:', error)
      incomingRequests.value = []
      outgoingRequests.value = []
    } finally {
      friendRequestsLoading.value = false
    }
  }

  const refreshFriendData = async () => {
    await Promise.all([
      loadFriends(),
      loadFriendRequests()
    ])
  }

  const openFriendModal = async () => {
    if (!isLoggedIn.value) {
      openLoginModal()
      return
    }
    friendModalVisible.value = true
    await loadFriendRequests()
  }

  const closeFriendModal = () => {
    friendModalVisible.value = false
    friendSearchKeyword.value = ''
    friendSearchResults.value = []
  }

  const searchFriendUsers = async () => {
    const keyword = friendSearchKeyword.value.trim()
    if (!keyword) {
      friendSearchResults.value = []
      return
    }

    friendSearching.value = true
    try {
      const data = await apiCall(`/discussion/friends/search?q=${encodeURIComponent(keyword)}`)
      friendSearchResults.value = Array.isArray(data?.users) ? data.users : []
    } catch (error) {
      console.error('搜索用户失败:', error)
      friendSearchResults.value = []
      notificationStore.error('搜索失败', error.message || '请稍后重试')
    } finally {
      friendSearching.value = false
    }
  }

  const sendFriendRequestByUser = async (user) => {
    if (!user?.id) return
    const key = String(user.id)
    friendActionLoading.value[key] = true
    try {
      const data = await apiCall('/discussion/friends/request', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: user.id })
      })
      notificationStore.success('已发送好友申请', data?.message || `已向 ${user.username} 发送申请`)
      await refreshFriendData()
      await searchFriendUsers()
      dispatchFriendsChanged()
    } catch (error) {
      notificationStore.warning('发送失败', error.message || '请稍后重试')
    } finally {
      friendActionLoading.value[key] = false
    }
  }

  const respondFriendRequest = async (requestId, action) => {
    const requestKey = Number.parseInt(requestId, 10)
    if (!requestKey) return
    try {
      await apiCall(`/discussion/friends/requests/${requestKey}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action })
      })
      notificationStore.success('处理成功', action === 'accept' ? '已同意好友申请' : '已拒绝好友申请')
      await refreshFriendData()
      await searchFriendUsers()
      dispatchFriendsChanged()
    } catch (error) {
      notificationStore.error('处理失败', error.message || '请稍后重试')
    }
  }

  const generateFriendInvite = async () => {
    inviteGenerating.value = true
    try {
      const data = await apiCall('/discussion/friends/invite-links', {
        method: 'POST',
        body: JSON.stringify({ expiresInMinutes: inviteExpireMinutes.value })
      })
      generatedInviteLink.value = data?.invite_link || data?.invite_code || ''
      notificationStore.success('邀请链接已生成', '可复制后发送给好友')
    } catch (error) {
      notificationStore.error('生成失败', error.message || '请稍后重试')
    } finally {
      inviteGenerating.value = false
    }
  }

  const copyInviteLink = async () => {
    if (!generatedInviteLink.value) return
    try {
      await navigator.clipboard.writeText(generatedInviteLink.value)
      notificationStore.success('复制成功', '邀请链接已复制到剪贴板')
    } catch (error) {
      notificationStore.warning('复制失败', '请手动复制邀请链接')
    }
  }

  const redeemFriendInvite = async () => {
    const code = inviteCodeInput.value.trim()
    if (!code) {
      notificationStore.warning('请输入邀请码', '可输入完整邀请链接或邀请码')
      return
    }

    inviteRedeeming.value = true
    try {
      const data = await apiCall('/discussion/friends/invite-links/redeem', {
        method: 'POST',
        body: JSON.stringify({ code })
      })
      inviteCodeInput.value = ''
      notificationStore.success('添加成功', data?.message || '已通过邀请链接添加好友')
      await refreshFriendData()
      await searchFriendUsers()
      dispatchFriendsChanged()
    } catch (error) {
      notificationStore.error('兑换失败', error.message || '请确认链接有效后重试')
    } finally {
      inviteRedeeming.value = false
    }
  }

  const syncFriendInviteFromRoute = (rawValue = '') => {
    const inviteFromQuery = String(rawValue || '').trim()
    if (!inviteFromQuery) return
    inviteCodeInput.value = inviteFromQuery
    if (isLoggedIn.value) {
      friendModalVisible.value = true
    }
  }

  const resetFriendState = () => {
    friends.value = []
    friendsLoading.value = false
    incomingRequests.value = []
    outgoingRequests.value = []
    friendModalVisible.value = false
    friendSearchKeyword.value = ''
    friendSearchResults.value = []
    friendSearching.value = false
    friendActionLoading.value = {}
    friendRequestsLoading.value = false
  }

  onMounted(() => {
    syncFriendInviteFromRoute(route.query?.friendInvite)
    if (isLoggedIn.value) {
      loadFriends()
      loadFriendRequests()
    }
    window.addEventListener('friends:changed', refreshFriendData)
  })

  onUnmounted(() => {
    window.removeEventListener('friends:changed', refreshFriendData)
  })

  watch(() => route.query?.friendInvite, (nextInvite) => {
    syncFriendInviteFromRoute(nextInvite)
  })

  watch(isLoggedIn, (loggedIn) => {
    if (!loggedIn) {
      resetFriendState()
      return
    }

    loadFriends()
    loadFriendRequests()
    if (inviteCodeInput.value) {
      friendModalVisible.value = true
    }
  })

  return {
    friends,
    friendsLoading,
    friendModalVisible,
    friendSearchKeyword,
    friendSearching,
    friendSearchResults,
    friendActionLoading,
    inviteExpireMinutes,
    inviteGenerating,
    generatedInviteLink,
    inviteCodeInput,
    inviteRedeeming,
    friendRequestsLoading,
    incomingRequests,
    outgoingRequests,
    loadFriends,
    loadFriendRequests,
    refreshFriendData,
    openFriendModal,
    closeFriendModal,
    searchFriendUsers,
    sendFriendRequestByUser,
    respondFriendRequest,
    generateFriendInvite,
    copyInviteLink,
    redeemFriendInvite
  }
}
