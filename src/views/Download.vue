<template>
  <div class="dl-page">
    <main>
      <section class="dl-hero">
        <div class="dl-hero-copy">
          <h1>简单、迅捷、氛围十足！</h1>
          <p>PccAgent将最强大的 AI Agents 与现有工具链结合，让你在熟悉的流程中完成规划、编码、评审与上线。</p>
        </div>

        <div class="dl-download-cta">
          <div class="dl-download-actions">
            <a :href="primaryDownload.href" class="dl-primary-download" target="_blank" rel="noopener noreferrer">
              <span class="dl-primary-download-icon" aria-hidden="true">
                <i :class="primaryDownload.icon"></i>
              </span>
              <span>
                <strong>立即下载 PccAgent</strong>
                <small>{{ primaryDownload.caption }}</small>
              </span>
            </a>

            <a :href="switchDownload.href" class="dl-switch-download" target="_blank" rel="noopener noreferrer">
              <span class="dl-switch-download-icon" aria-hidden="true">
                <i :class="switchDownload.icon"></i>
              </span>
              <span>
                <strong>下载 DPCC SWITCH</strong>
                <small>{{ switchDownload.caption }}</small>
              </span>
            </a>
          </div>
          <a class="dl-all-link" href="#all-downloads">查看全部下载</a>
        </div>

        <section class="dl-app-window" aria-label="产品界面预览">
          <aside class="dl-app-sidebar">
            <div class="dl-macbar">
              <span class="dl-dot dl-dot--red"></span>
              <span class="dl-dot dl-dot--yellow"></span>
              <span class="dl-dot dl-dot--green"></span>
              <button class="dl-sidebar-toggle" aria-label="切换侧边栏">
                <i class="fa fa-columns" aria-hidden="true"></i>
              </button>
              <button class="dl-add-project">
                <i class="fa fa-plus" aria-hidden="true"></i>
                添加项目
              </button>
            </div>

            <div class="dl-search">
              <i class="fa fa-search" aria-hidden="true"></i>
              <span>搜索聊天...</span>
            </div>

            <div class="dl-session-list">
              <div class="dl-group-head">
                <i class="fa fa-angle-down" aria-hidden="true"></i>
                <i class="fa fa-mobile" aria-hidden="true"></i>
                <strong>微信</strong>
                <small>1</small>
              </div>
              <div class="dl-session"><i class="fa fa-sun-o" aria-hidden="true"></i><span>你好</span></div>

              <div class="dl-group-head">
                <i class="fa fa-angle-down" aria-hidden="true"></i>
                <i class="fa fa-folder-o" aria-hidden="true"></i>
                <strong>ocsjs</strong>
              </div>
              <div class="dl-session"><i class="fa fa-sun-o" aria-hidden="true"></i><span>hi</span></div>
              <div class="dl-session"><i class="fa fa-circle-o-notch" aria-hidden="true"></i><span>Greeting Chat Title</span></div>
              <div class="dl-session"><i class="fa fa-sun-o" aria-hidden="true"></i><span>中文问候与对话开始</span></div>
              <div class="dl-session"><i class="fa fa-circle-o-notch" aria-hidden="true"></i><span>Greeting Chat Title</span></div>

              <div class="dl-group-head">
                <i class="fa fa-angle-down" aria-hidden="true"></i>
                <i class="fa fa-folder-o" aria-hidden="true"></i>
                <strong>NeusoftMall0910</strong>
              </div>
              <div class="dl-session dl-session--active"><i class="fa fa-sun-o" aria-hidden="true"></i><span>确认最新改动状态</span></div>
              <div class="dl-session"><i class="fa fa-sun-o" aria-hidden="true"></i><span>Chinese greeting opening chat</span></div>
              <div class="dl-session"><i class="fa fa-circle-o-notch" aria-hidden="true"></i><span>执行一下这个sql</span></div>

              <div class="dl-group-head">
                <i class="fa fa-angle-down" aria-hidden="true"></i>
                <i class="fa fa-folder-o" aria-hidden="true"></i>
                <strong>harnss</strong>
              </div>
              <div class="dl-session"><i class="fa fa-sun-o" aria-hidden="true"></i><span>询问模型身份</span></div>
              <div class="dl-session"><i class="fa fa-sun-o" aria-hidden="true"></i><span>这个报错什么意思 {"error":{"mes...</span></div>
              <div class="dl-session"><i class="fa fa-sun-o" aria-hidden="true"></i><span>当前配置有几个相关我需要你跟我...</span></div>
            </div>

            <div class="dl-sidebar-footer">
              <img src="/favicon.png" alt="DpccGaming" class="dl-sidebar-brand-icon" />
              <span>PccAgent 处于早期测试阶段 · 反馈问题</span>
              <i class="fa fa-plus" aria-hidden="true"></i>
            </div>
          </aside>

          <div class="dl-workspace">
            <header class="dl-titlebar">
              <h2>确认最新改动状态</h2>
              <div class="dl-titlebar-tools">
                <button aria-label="面板"><i class="fa fa-columns" aria-hidden="true"></i></button>
                <button aria-label="信息"><i class="fa fa-info-circle" aria-hidden="true"></i></button>
              </div>
            </header>

            <div class="dl-workspace-body">
              <section class="dl-chat">
                <div class="dl-faded-context">
                  <p>• B. 让它继续跑着，你打开 Docker Desktop 后我执行 <code>docker compose up -d mysql</code>，devtools 会自动恢复（数据库恢复后下一次请求就 200）。</p>
                  <p>哪个?</p>
                </div>

                <div class="dl-work-divider"><span>Worked for 2m 31s</span></div>

                <div class="dl-message">
                  <p>这是 <strong>Monitor</strong> 工具超时的系统通知，不是你发的消息——之前那个 60 秒的等待 monitor 自然到点退出了，跟当前的应用状态无关。</p>
                  <p>目前的状态没有变化：</p>
                  <ul>
                    <li><strong>Spring Boot</strong> 在 8082 跑着（PID b3q0hfuxk 后台进程）</li>
                    <li>请求返回 500，原因是 <strong>Docker Desktop 没启动 → MySQL 容器连不上 → Connection refused</strong></li>
                  </ul>
                  <p>等你打开 Docker Desktop，告诉我一声，我就 <code>docker compose up -d mysql</code> 把数据库拉起来，应用不用重启，下一次请求就会恢复 200。</p>
                  <p>或者你想现在先把应用停掉也行，说一声就行。</p>
                </div>

                <div class="dl-user-bubble">我都弄好了，可以停掉了</div>

                <div class="dl-composer">
                  <div class="dl-composer-placeholder">随便问，@ 引用文件，/ 输入命令</div>
                  <div class="dl-composer-tools">
                    <span><i class="fa fa-paperclip" aria-hidden="true"></i></span>
                    <span><i class="fa fa-microphone" aria-hidden="true"></i></span>
                    <span><i class="fa fa-sun-o" aria-hidden="true"></i></span>
                    <span><i class="fa fa-map-o" aria-hidden="true"></i> Plan</span>
                    <span><i class="fa fa-briefcase" aria-hidden="true"></i> Codex</span>
                    <button aria-label="发送"><i class="fa fa-arrow-up" aria-hidden="true"></i></button>
                  </div>
                </div>
                <div class="dl-model-row">opus-4.8 · high <span>全部允许</span></div>
              </section>

              <aside class="dl-tasks-panel">
                <div class="dl-task-head">
                  <span><i class="fa fa-list-ul" aria-hidden="true"></i> 任务</span>
                  <small>2/2</small>
                </div>
                <div class="dl-task-progress"></div>
                <div class="dl-check-item">
                  <i class="fa fa-check" aria-hidden="true"></i>
                  <span>Start the Spring Boot app and verify it runs</span>
                </div>
                <div class="dl-check-item">
                  <i class="fa fa-check" aria-hidden="true"></i>
                  <span>HTTP probe the index page to confirm dynamic shop name renders</span>
                </div>
                <div class="dl-time-pop">03:38:06</div>
              </aside>
            </div>
          </div>
        </section>
      </section>

      <section class="dl-features" aria-labelledby="features-title">
        <div class="dl-section-head">
          <p>产品能力</p>
          <h2 id="features-title">保持在技术前沿</h2>
          <span>无论是理清遗留系统还是交付实时特性，DpccGaming 都能让团队保持高效和稳健。</span>
        </div>

        <div class="dl-feature-grid">
          <article class="dl-feature-card">
            <div class="dl-feature-visual">
              <img src="/download-assets/feature-wechat-link.webp" alt="微信链接项目与聊天入口" />
            </div>
            <div class="dl-feature-copy">
              <h3>微信链接</h3>
              <p>通过微信远程唤起 DpccGaming，让任务随时进入执行状态。</p>
            </div>
          </article>

          <article class="dl-feature-card">
            <div class="dl-feature-visual">
              <img src="/download-assets/feature-deep-integration.webp" alt="Agent 商店与深度集成" />
            </div>
            <div class="dl-feature-copy">
              <h3>深度集成</h3>
              <p>针对模型能力深度优化，在推理、编码和多 Agent 协作中释放更强表现。</p>
            </div>
          </article>

          <article class="dl-feature-card">
            <div class="dl-feature-visual">
              <img src="/download-assets/feature-long-task.webp" alt="长任务进度面板" />
            </div>
            <div class="dl-feature-copy">
              <h3>长任务</h3>
              <p>用 Goal 管理复杂目标，持续规划、执行与验证，让多步骤工作稳步推进。</p>
            </div>
          </article>
        </div>
      </section>

      <section id="all-downloads" class="dl-downloads" aria-labelledby="downloads-title">
        <div class="dl-section-head">
          <h2 id="downloads-title">全部下载</h2>
          <span>PccAgent支持的所有平台安装包</span>
        </div>

        <div class="dl-download-grid">
          <article class="dl-download-column">
            <div class="dl-platform-title">
              <i class="fa-brands fa-apple" aria-hidden="true"></i>
              <h3>MacOS</h3>
            </div>
            <a :href="DOWNLOAD_LINKS.macArm" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>macOS（Apple 芯片）</strong>
                <small>.dmg · 官方镜像</small>
              </span>
              <em>v2.0.7</em>
            </a>
            <a :href="DOWNLOAD_RELEASE_URL" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>macOS（Intel 芯片）</strong>
                <small>.dmg · GitHub Release</small>
              </span>
              <em>v2.0.7</em>
            </a>
          </article>

          <article class="dl-download-column">
            <div class="dl-platform-title">
              <i class="fa-brands fa-windows" aria-hidden="true"></i>
              <h3>Windows</h3>
            </div>
            <a :href="DOWNLOAD_LINKS.windowsX64" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>Windows（64 位）</strong>
                <small>.exe · 官方镜像</small>
              </span>
              <em>v2.0.7</em>
            </a>
            <a :href="DOWNLOAD_RELEASE_URL" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>Windows（ARM64）</strong>
                <small>.exe · GitHub Release</small>
              </span>
              <em>v2.0.7</em>
            </a>
          </article>

          <article class="dl-download-column">
            <div class="dl-platform-title">
              <i class="fa-brands fa-linux" aria-hidden="true"></i>
              <h3>Linux</h3>
              <b>Beta</b>
            </div>
            <a :href="DOWNLOAD_RELEASE_URL" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>Linux x64</strong>
                <small>.deb · GitHub Release</small>
              </span>
              <em>v2.0.7</em>
            </a>
            <a :href="DOWNLOAD_RELEASE_URL" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>Linux x64</strong>
                <small>.AppImage · GitHub Release</small>
              </span>
              <em>v2.0.7</em>
            </a>
            <a :href="DOWNLOAD_RELEASE_URL" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>Linux ARM64</strong>
                <small>.deb · GitHub Release</small>
              </span>
              <em>v2.0.7</em>
            </a>
            <a :href="DOWNLOAD_RELEASE_URL" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>Linux ARM64</strong>
                <small>.AppImage · GitHub Release</small>
              </span>
              <em>v2.0.7</em>
            </a>
          </article>

          <article class="dl-download-column">
            <div class="dl-platform-title">
              <i class="fa-solid fa-toggle-on" aria-hidden="true"></i>
              <h3>DPCC SWITCH</h3>
            </div>
            <a :href="SWITCH_DOWNLOAD_LINKS.windows" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>Windows Setup</strong>
                <small>.exe · 官方镜像</small>
              </span>
              <em>v3.13</em>
            </a>
            <a :href="SWITCH_DOWNLOAD_LINKS.macos" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>macOS ARM</strong>
                <small>.dmg · 官方镜像</small>
              </span>
              <em>v3.13</em>
            </a>
            <a :href="SWITCH_DOWNLOAD_LINKS.official" class="dl-download-row" target="_blank" rel="noopener noreferrer">
              <span>
                <strong>官方版本</strong>
                <small>GitHub Releases</small>
              </span>
              <em>更多</em>
            </a>
          </article>
        </div>
      </section>
    </main>

    <Footer />
    <BrandRevealSection />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import BrandRevealSection from '../components/BrandRevealSection.vue'
import Footer from '../components/Footer.vue'

const DOWNLOAD_RELEASE_URL = 'https://github.com/DUNHKpcc/dpcc-harness/releases/tag/v2.1.1'
const DOWNLOAD_LINKS = {
  macArm: 'https://dpccgaming.xyz/downloads/harnss/updates/PccAgent-2.1.1-mac-arm64.dmg',
  windowsX64: 'https://dpccgaming.xyz/downloads/harnss/updates/PccAgent-2.1.1-windows-x64-setup.exe'
}
const SWITCH_DOWNLOAD_BASE_URL = import.meta.env.VITE_DOWNLOAD_BASE_URL || 'https://dpccgaming.xyz/downloads/dpcc-switch'
const SWITCH_DOWNLOAD_LINKS = {
  windows: `${SWITCH_DOWNLOAD_BASE_URL}/DPCC-SWITCH-3.13.0-release-setup.exe`,
  macos: `${SWITCH_DOWNLOAD_BASE_URL}/DPCC-SWITCH_3.13.0_aarch64.dmg`,
  official: 'https://github.com/farion1231/cc-switch/releases'
}

const PRIMARY_DOWNLOAD_OPTIONS = {
  mac: {
    href: DOWNLOAD_LINKS.macArm,
    icon: 'fa-brands fa-apple',
    label: 'macOS Apple Silicon',
    caption: '适用于 macOS Apple Silicon · ZIP'
  },
  windows: {
    href: DOWNLOAD_LINKS.windowsX64,
    icon: 'fa-brands fa-windows',
    label: 'Windows 64 位',
    caption: '适用于 Windows 64 位 · EXE'
  },
  fallback: {
    href: DOWNLOAD_RELEASE_URL,
    icon: 'fa-brands fa-github',
    label: 'GitHub Release',
    caption: '选择适合你系统的安装包'
  }
}

const getClientPlatform = () => {
  if (typeof navigator === 'undefined') return 'fallback'

  const platform = [
    navigator.userAgentData?.platform,
    navigator.platform,
    navigator.userAgent
  ].filter(Boolean).join(' ').toLowerCase()

  if (platform.includes('win')) return 'windows'
  if (platform.includes('mac')) return 'mac'
  return 'fallback'
}

const primaryDownload = computed(() => {
  const platform = getClientPlatform()
  return PRIMARY_DOWNLOAD_OPTIONS[platform] || PRIMARY_DOWNLOAD_OPTIONS.fallback
})

const switchDownload = computed(() => {
  const platform = getClientPlatform()

  if (platform === 'windows') {
    return {
      href: SWITCH_DOWNLOAD_LINKS.windows,
      icon: 'fa-brands fa-windows',
      caption: '适用于 Windows · Setup'
    }
  }

  if (platform === 'mac') {
    return {
      href: SWITCH_DOWNLOAD_LINKS.macos,
      icon: 'fa-brands fa-apple',
      caption: '适用于 macOS ARM · DMG'
    }
  }

  return {
    href: SWITCH_DOWNLOAD_LINKS.official,
    icon: 'fa-brands fa-github',
    caption: '选择适合你系统的版本'
  }
})

onMounted(() => {
  document.body.classList.add('dl-download-page-active')
})

onBeforeUnmount(() => {
  document.body.classList.remove('dl-download-page-active')
})
</script>

<style>
body.dl-download-page-active .main-content,
body.dl-download-page-active .main-content[style] {
  margin-left: 0 !important;
}
</style>

<style scoped>
.dl-page {
  min-height: 100vh;
  overflow-x: hidden;
  background: #fff;
  color: #0b0b0f;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.dl-hero {
  width: min(1280px, calc(100% - 160px));
  margin: 0 auto;
  padding: 88px 16px 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.dl-hero-copy {
  width: min(900px, 100%);
  margin-top: 0;
  text-align: center;
}

.dl-hero-copy h1 {
  margin: 0;
  padding-left: 60px;
  color: #050505;
  font-size: clamp(44px, 4.8vw, 72px);
  line-height: 1.05;
  font-weight: 760;
  letter-spacing: 0;
  white-space: nowrap;
}

.dl-hero-copy p {
  margin: 18px auto 0;
  color: rgba(5, 5, 5, 0.62);
  font-size: 18px;
  line-height: 1.55;
}

.dl-download-cta {
  margin-top: 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.dl-download-actions {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 12px;
}

.dl-primary-download,
.dl-switch-download {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  width: 250px;
  height: 62px;
  padding: 0 20px;
  border-radius: 14px;
  background: #090909;
  color: #fff;
  text-decoration: none;
  box-sizing: border-box;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.16);
  transition: transform 0.2s ease, background-color 0.2s ease;
}

.dl-primary-download:hover,
.dl-switch-download:hover {
  transform: translateY(-2px);
  background: #242424;
}

.dl-primary-download-icon,
.dl-switch-download-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  line-height: 1;
}

.dl-primary-download-icon i,
.dl-switch-download-icon i {
  line-height: 1;
}

.dl-primary-download span:last-child,
.dl-switch-download span:last-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dl-primary-download strong,
.dl-switch-download strong {
  display: block;
  overflow: hidden;
  font-size: 15px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl-primary-download small,
.dl-switch-download small {
  display: block;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl-all-link {
  color: rgba(0, 0, 0, 0.58);
  font-size: 14px;
  text-decoration: none;
}

.dl-all-link:hover {
  color: #000;
}

.dl-app-window {
  width: 100%;
  height: 820px;
  margin-top: 80px;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(83, 72, 55, 0.08);
  border-radius: 18px;
  background: #faf9f5;
  color: #2f2b26;
  box-shadow: 0 36px 90px rgba(52, 45, 32, 0.16);
  font-family: Georgia, 'Songti SC', STSong, 'Noto Serif SC', serif;
  text-align: left;
}

.dl-app-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 20px 14px 18px;
  border-right: 1px solid rgba(83, 72, 55, 0.1);
  background: #f7f5ef;
}

.dl-macbar {
  height: 38px;
  display: grid;
  grid-template-columns: 13px 13px 13px 1fr auto;
  align-items: center;
  gap: 10px;
}

.dl-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
}

.dl-dot--red { background: #ff5f57; }
.dl-dot--yellow { background: #febc2e; }
.dl-dot--green { background: #28c840; }

.dl-sidebar-toggle,
.dl-add-project {
  border: 0;
  background: transparent;
  color: rgba(47, 43, 38, 0.78);
  font-family: inherit;
}

.dl-sidebar-toggle {
  justify-self: center;
  width: 28px;
  height: 28px;
  font-size: 16px;
}

.dl-add-project {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.dl-search {
  height: 42px;
  margin: 18px 0 28px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 14px;
  background: #e7e3da;
  color: rgba(47, 43, 38, 0.42);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.44);
  font-size: 15px;
  font-weight: 700;
}

.dl-session-list {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dl-group-head,
.dl-session {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 0;
  background: transparent;
  color: rgba(47, 43, 38, 0.72);
}

.dl-group-head {
  height: 34px;
  padding: 0 10px;
  font-size: 15px;
  font-weight: 700;
}

.dl-group-head i {
  width: 15px;
  color: rgba(47, 43, 38, 0.58);
}

.dl-group-head small {
  margin-left: auto;
  color: rgba(47, 43, 38, 0.42);
}

.dl-session {
  min-height: 32px;
  padding: 5px 10px 5px 26px;
  border-radius: 9px;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.2;
}

.dl-session i {
  width: 15px;
  color: rgba(47, 43, 38, 0.52);
}

.dl-session span {
  min-width: 0;
  flex: 1;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl-session--active {
  border: 1px solid rgba(215, 125, 96, 0.58);
  background: rgba(239, 184, 164, 0.18);
  color: #1f1d19;
}

.dl-sidebar-footer {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: rgba(47, 43, 38, 0.42);
  font-size: 12px;
}

.dl-sidebar-brand-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.dl-sidebar-footer span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl-sidebar-footer i {
  flex: 0 0 auto;
  color: rgba(47, 43, 38, 0.5);
}

.dl-workspace {
  min-width: 0;
  position: relative;
  background: #fffefa;
}

.dl-titlebar {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 0 20px;
}

.dl-titlebar h2 {
  margin: 0;
  color: #28231f;
  font-size: 17px;
  line-height: 1;
  font-weight: 800;
}

.dl-titlebar-tools {
  display: flex;
  gap: 12px;
}

.dl-titlebar-tools button {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: rgba(47, 43, 38, 0.35);
  font-size: 16px;
}

.dl-workspace-body {
  height: calc(100% - 58px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
}

.dl-chat {
  position: relative;
  min-width: 0;
  padding: 0 18px 20px;
  overflow: hidden;
  border-right: 1px solid rgba(83, 72, 55, 0.08);
}

.dl-faded-context {
  padding: 0 2px 20px;
  color: rgba(47, 43, 38, 0.2);
  font-size: 16px;
  line-height: 1.75;
}

.dl-faded-context p {
  margin: 0 0 8px;
}

.dl-faded-context code,
.dl-message code {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(47, 43, 38, 0.08);
  color: #2e2a25;
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 0.86em;
}

.dl-work-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 4px 0 22px;
  color: rgba(47, 43, 38, 0.42);
  font-size: 13px;
  font-weight: 800;
}

.dl-work-divider::before,
.dl-work-divider::after {
  content: '';
  height: 1px;
  flex: 1;
  background: rgba(83, 72, 55, 0.09);
}

.dl-message {
  width: min(720px, 100%);
  color: #2e2a25;
  font-size: 16px;
  line-height: 1.75;
  font-weight: 650;
}

.dl-message p {
  margin: 0 0 20px;
}

.dl-message ul {
  margin: 0 0 20px 22px;
  padding: 0;
}

.dl-message li {
  margin: 8px 0;
}

.dl-user-bubble {
  width: fit-content;
  margin: 8px 0 96px auto;
  padding: 10px 18px;
  border-radius: 18px;
  background: #efede8;
  color: #2e2a25;
  font-size: 15px;
  font-weight: 700;
}

.dl-short-answer {
  margin: 0;
  color: #2e2a25;
  font-size: 16px;
  font-weight: 700;
}

.dl-composer {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 44px;
  height: 112px;
  padding: 22px 26px;
  border: 1px solid rgba(83, 72, 55, 0.08);
  border-radius: 22px;
  background: #f3f1eb;
  box-shadow: 0 18px 42px rgba(52, 45, 32, 0.08);
}

.dl-composer-placeholder {
  color: rgba(47, 43, 38, 0.28);
  font-size: 15px;
  font-weight: 700;
}

.dl-composer-tools {
  position: absolute;
  left: 26px;
  right: 22px;
  bottom: 18px;
  display: flex;
  align-items: center;
  gap: 18px;
  color: rgba(47, 43, 38, 0.7);
  font-size: 14px;
  font-weight: 700;
}

.dl-composer-tools button {
  margin-left: auto;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 50%;
  background: #ecb39f;
  color: #fff;
  font-size: 18px;
}

.dl-model-row {
  position: absolute;
  left: 28px;
  bottom: 16px;
  color: rgba(47, 43, 38, 0.62);
  font-size: 13px;
  font-weight: 700;
}

.dl-model-row span {
  margin-left: 22px;
}

.dl-tasks-panel {
  position: relative;
  padding: 12px 14px;
  background: #fffefa;
  color: rgba(47, 43, 38, 0.58);
}

.dl-task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(47, 43, 38, 0.55);
  font-size: 15px;
  font-weight: 800;
}

.dl-task-head span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dl-task-head i {
  color: #3f8cff;
}

.dl-task-progress {
  height: 1px;
  margin: 14px 0 18px;
  background: #70e0b3;
}

.dl-check-item {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 10px;
  margin: 18px 0;
  color: rgba(47, 43, 38, 0.46);
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
}

.dl-check-item i {
  width: 15px;
  height: 15px;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #70d8ae;
  border-radius: 50%;
  color: #70d8ae;
  font-size: 9px;
}

.dl-time-pop {
  position: absolute;
  left: -18px;
  top: 320px;
  padding: 10px 16px;
  border-radius: 9px;
  background: #10100f;
  color: #fff;
  font-family: Arial, sans-serif;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.dl-features,
.dl-downloads {
  width: min(1280px, calc(100% - 160px));
  margin: 0 auto;
}

.dl-features {
  padding: 32px 16px 112px;
}

.dl-section-head {
  max-width: 1200px;
}

.dl-section-head p {
  margin: 0 0 12px;
  color: rgba(0, 0, 0, 0.58);
  font-size: 14px;
}

.dl-section-head h2 {
  margin: 0;
  color: #080808;
  font-size: 36px;
  line-height: 1.12;
  font-weight: 720;
  letter-spacing: 0;
}

.dl-section-head span {
  display: block;
  margin-top: 12px;
  max-width: 768px;
  color: rgba(0, 0, 0, 0.62);
  font-size: 18px;
  line-height: 1.45;
}

.dl-feature-grid {
  margin-top: 40px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.dl-feature-card {
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  background: #fff;
}

.dl-feature-visual {
  position: relative;
  height: 286px;
  overflow: hidden;
  background: #f5f5f3;
}

.dl-feature-visual img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: top left;
}

.dl-feature-copy {
  min-height: 124px;
  padding: 22px 24px 24px;
}

.dl-feature-copy h3 {
  margin: 0 0 8px;
  color: #0a0a0a;
  font-size: 22px;
  line-height: 1.25;
  font-weight: 700;
}

.dl-feature-copy p {
  margin: 0;
  color: rgba(0, 0, 0, 0.62);
  font-size: 14px;
  line-height: 1.5;
}

.dl-downloads {
  padding: 0 16px 80px;
  scroll-margin-top: 80px;
}

.dl-download-grid {
  margin-top: 32px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 32px;
}

.dl-download-column {
  min-height: 292px;
}

.dl-platform-title {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.dl-platform-title i {
  width: 24px;
  color: #111;
  font-size: 24px;
  text-align: center;
}

.dl-platform-title h3 {
  margin: 0;
  color: #111;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
}

.dl-platform-title b {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.58);
  font-size: 12px;
}

.dl-download-row {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  color: #111;
  text-decoration: none;
}

.dl-download-row:last-child {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.dl-download-row span {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.dl-download-row strong {
  font-size: 14px;
  font-weight: 600;
}

.dl-download-row small,
.dl-download-row em {
  color: rgba(0, 0, 0, 0.48);
  font-size: 13px;
  font-style: normal;
}

.dl-download-row:hover strong {
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 1100px) {
  .dl-hero,
  .dl-features,
  .dl-downloads {
    width: min(100% - 40px, 1280px);
  }

  .dl-app-window {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .dl-download-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dl-workspace-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .dl-tasks-panel {
    display: none;
  }
}

@media (max-width: 820px) {
  .dl-hero {
    padding-top: 56px;
  }

  .dl-app-window {
    height: 620px;
    grid-template-columns: 1fr;
  }

  .dl-app-sidebar {
    display: none;
  }

  .dl-feature-grid,
  .dl-download-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .dl-hero,
  .dl-features,
  .dl-downloads {
    width: 100%;
  }

  .dl-hero {
    padding: 44px 20px 64px;
  }

  .dl-hero-copy h1 {
    font-size: 42px;
    white-space: normal;
  }

  .dl-hero-copy p {
    font-size: 16px;
  }

  .dl-primary-download,
  .dl-switch-download {
    width: 100%;
  }

  .dl-download-actions {
    width: 100%;
    flex-direction: column;
  }

  .dl-app-window {
    margin-top: 56px;
    border-radius: 12px;
  }

  .dl-chat {
    padding: 0 14px 20px;
  }

  .dl-features,
  .dl-downloads {
    padding-left: 20px;
    padding-right: 20px;
  }

  .dl-section-head h2 {
    font-size: 32px;
  }

}
</style>
