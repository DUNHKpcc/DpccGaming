<template>
  <div v-if="isOpen" 
    class="fixed inset-0 z-[30000] flex items-center justify-center p-4 opacity-100 pointer-events-auto transition-opacity duration-300"
    @click="handleBackdropClick">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-md"></div>
    <div
      class="relative bg-white/20 backdrop-blur-xl border border-white/30 rounded-2xl shadow-2xl w-full max-w-2xl p-8 transform scale-100 transition-transform duration-300"
      @click.stop>
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold text-white drop-shadow-lg">添加游戏</h3>
        <button @click="closeModal" class="text-white/80 hover:text-white text-2xl transition-colors duration-300 drop-shadow-lg">
          <i class="fa fa-times"></i>
        </button>
      </div>

      <form @submit.prevent="handleSubmit">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">游戏标题</label>
          <input v-model="form.title" type="text"
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800 placeholder-gray-500"
            placeholder="请输入游戏标题" required>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">游戏类型</label>
          <select v-model="form.category"
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800"
            required>
            <option value="">请选择游戏类型</option>
            <option value="action">动作</option>
            <option value="adventure">冒险</option>
            <option value="puzzle">谜题</option>
            <option value="racing">赛车</option>
            <option value="simulation">模拟</option> 
            <option value="strategy">策略</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">游戏描述</label>
          <textarea v-model="form.description" rows="3"
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800 placeholder-gray-500"
            placeholder="请描述您的游戏" required></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">游戏引擎</label>
          <select v-model="form.engine" required
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800">
            <option value="">请选择游戏引擎</option>
            <option value="Godot">Godot</option>
            <option value="Unity">Unity</option>
            <option value="Cocos">Cocos</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">游戏代码类型</label>
          <select v-model="form.codeType" required
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800">
            <option value="">请选择代码类型</option>
            <option value="TypeScript">TypeScript</option>
            <option value="JavaScript">JavaScript</option>
            <option value="C#">C#</option>
            <option value="其他">其他</option>8
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">游戏展示视频</label>
          <input type="file" accept="video/*" @change="onVideoChange"
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800 file:bg-white/80 file:border-0 file:rounded file:px-3 file:py-1 file:text-sm file:text-gray-700">
          <p class="text-xs text-white/70 mt-1">（可选）上传展示/预览视频，支持 mp4/webm 等格式</p>
        </div>
        <div class="mb-6">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">游戏文件 (HTML5)</label>
          <input ref="fileInput" type="file" accept=".html,.zip"
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800 file:bg-white/80 file:border-0 file:rounded file:px-3 file:py-1 file:text-sm file:text-gray-700"
            required>
          <p class="text-xs text-white/80 mt-1 drop-shadow-sm">上传包含游戏文件的 ZIP 压缩包，并且带有介绍视频或图片</p>
        </div>
        <div class="mb-6">
          <label class="block text-sm font-medium mb-1 text-white drop-shadow-sm">源码压缩包（用于 Coding 模式）</label>
          <input
            ref="codeFileInput"
            type="file"
            accept=".zip,.tar,.tar.gz,.rar"
            @change="onCodeArchiveChange"
            class="w-full px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-gray-800 file:bg-white/80 file:border-0 file:rounded file:px-3 file:py-1 file:text-sm file:text-gray-700"
          >
          <p class="text-xs text-white/70 mt-1 drop-shadow-sm">（可选）上传源码压缩包，让 Coding 模式可以展示完整代码。</p>
        </div>
        <button type="submit"
          class="w-full bg-white hover:bg-white/90 text-[#1d1d1f] border border-black/10 py-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl">
          上传游戏
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useModalStore } from '../stores/modal'
import { useNotificationStore } from '../stores/notification'

const modalStore = useModalStore()
const notificationStore = useNotificationStore()

const isOpen = computed(() => modalStore.activeModal === 'addGame')
const fileInput = ref(null)
const codeFileInput = ref(null)

// 表单数据 增加 engine, codeType, video, codeArchive
const form = ref({
  title: '',
  category: '',
  description: '',
  engine: '',
  codeType: '',
  video: null,
  codeArchive: null
})

const handleSubmit = async () => {
  try {
    // 验证表单
    if (!form.value.title || !form.value.category || !form.value.description) {
      notificationStore.error('请填写完整信息', '游戏标题、类型和描述不能为空')
      return
    }

    if (!fileInput.value.files || fileInput.value.files.length === 0) {
      notificationStore.error('请选择文件', '请上传游戏ZIP文件')
      return
    }

    // 创建FormData
    const formData = new FormData()
    formData.append('title', form.value.title)
    formData.append('category', form.value.category)
    formData.append('description', form.value.description)
    formData.append('gameFile', fileInput.value.files[0])
    formData.append('engine', form.value.engine)
    formData.append('codeType', form.value.codeType)
    if(form.value.video) formData.append('video', form.value.video)
    
    // 🔍 源码文件上传调试
    console.log('🔍 前端源码文件检查:');
    console.log('  - form.value.codeArchive:', form.value.codeArchive);
    console.log('  - form.value.codeArchive.name:', form.value.codeArchive?.name);
    console.log('  - form.value.codeArchive.size:', form.value.codeArchive?.size);
    console.log('  - form.value.codeArchive.type:', form.value.codeArchive?.type);
    
    if (form.value.codeArchive) {
      formData.append('codeArchive', form.value.codeArchive)
      console.log('✅ 源码文件已添加到FormData:', form.value.codeArchive.name);
      
      // 验证FormData中是否包含该字段
      console.log('📋 FormData包含的字段:');
      for (let [key, value] of formData.entries()) {
        console.log(`  - ${key}: ${value.name || value}`);
      }
    } else {
      console.log('❌ 源码文件为空，跳过添加');
    }

    // 显示上传中状态
    notificationStore.info('正在上传...', '请稍候，正在处理您的游戏文件')

    // 发送请求
    console.log('🚀 准备发送请求到 /api/games');
    console.log('🔍 最终FormData字段列表:');
    const formDataEntries = [];
    for (let [key, value] of formData.entries()) {
      formDataEntries.push({ key, value: value.name || value });
      console.log(`  - ${key}: ${value.name || value}`);
    }
    
    const response = await fetch('/api/games', {
      method: 'POST',
      credentials: 'include',
      body: formData
    })

    const result = await response.json()

    if (response.ok) {
      closeModal()
      notificationStore.success('游戏上传成功！', '您的游戏已提交审核，审核通过后将会上架')
    } else {
      // 处理认证错误
      if (response.status === 401 || response.status === 403) {
        notificationStore.error('认证失败', '登录已过期，请重新登录')
        // 可以触发重新登录
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        notificationStore.error('上传失败', result.error || '上传过程中出现错误')
      }
    }

  } catch (error) {
    console.error('上传游戏错误:', error)
    notificationStore.error('上传失败', '网络错误，请检查网络连接后重试')
  }
}

const closeModal = () => {
  modalStore.closeModal()
  // 重置表单
  form.value = {
    title: '',
    category: '',
    description: '',
    engine: '',
    codeType: '',
    video: null,
    codeArchive: null
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  if (codeFileInput.value) {
    codeFileInput.value.value = ''
  }
}

const handleBackdropClick = (e) => {
  if (e.target === e.currentTarget) {
    closeModal()
  }
}

// 新增@change事件处理视频文件
const onVideoChange = (e) => {
  form.value.video = e.target.files && e.target.files[0] ? e.target.files[0] : null;
}

const onCodeArchiveChange = (e) => {
  form.value.codeArchive = e.target.files && e.target.files[0] ? e.target.files[0] : null;
  console.log('📁 源码文件已选择:', form.value.codeArchive?.name);
}
</script>
