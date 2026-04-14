import { getCurrentUser, signIn, signUp, signOut, verifyEmail } from './auth.js'
import { parseDocxFile, extractSentences, extractEnglishWords } from './docx-parser.js'
import { rankWords, findExampleSentence, aggregateFrequencies } from './word-ranker.js'
import {
  getCachedFile, getCachedFileByHash, saveProcessedFile, getCachedWordEntries,
  saveWordEntries, getProcessedFiles, deleteProcessedFile, checkFilesExistence,
  computeFileHash, uploadFileToStorage, getAllWordEntries, getWordFrequencyMap,
  createExtractionJob, getExtractionJobs, getExtractionJob, triggerJobProcessing, cancelExtractionJob,
} from './db.js'

let currentUser = null

export async function initApp() {
  currentUser = await getCurrentUser()
  if (currentUser) {
    showUploadView()
  } else {
    showAuthView()
  }
}

// --- Auth Views ---

function showAuthView() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1 class="auth-title">WordWise</h1>
          <p class="auth-subtitle">智能英语词汇提取工具</p>
        </div>
        <div id="auth-tabs" class="auth-tabs">
          <button class="tab-btn active" data-tab="login">登录</button>
          <button class="tab-btn" data-tab="register">注册</button>
        </div>
        <div id="auth-form-container"></div>
        <div id="auth-error" class="auth-error hidden"></div>
      </div>
    </div>
  `
  setupAuthTabs()
  showLoginForm()
}

function setupAuthTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      hideError()
      if (btn.dataset.tab === 'login') {
        showLoginForm()
      } else {
        showRegisterForm()
      }
    })
  })
}

function showLoginForm() {
  const container = document.getElementById('auth-form-container')
  container.innerHTML = `
    <form id="login-form" class="auth-form">
      <div class="form-group">
        <label for="login-email">邮箱</label>
        <input type="email" id="login-email" placeholder="请输入邮箱" required />
      </div>
      <div class="form-group">
        <label for="login-password">密码</label>
        <input type="password" id="login-password" placeholder="请输入密码" required />
      </div>
      <button type="submit" class="btn-primary">登录</button>
    </form>
  `
  document.getElementById('login-form').addEventListener('submit', handleLogin)
}

function showRegisterForm() {
  const container = document.getElementById('auth-form-container')
  container.innerHTML = `
    <form id="register-form" class="auth-form">
      <div class="form-group">
        <label for="reg-name">昵称</label>
        <input type="text" id="reg-name" placeholder="请输入昵称" required />
      </div>
      <div class="form-group">
        <label for="reg-email">邮箱</label>
        <input type="email" id="reg-email" placeholder="请输入邮箱" required />
      </div>
      <div class="form-group">
        <label for="reg-password">密码</label>
        <input type="password" id="reg-password" placeholder="请输入密码（至少6位）" required minlength="6" />
      </div>
      <button type="submit" class="btn-primary">注册</button>
    </form>
  `
  document.getElementById('register-form').addEventListener('submit', handleRegister)
}

function showVerifyForm(email) {
  const container = document.getElementById('auth-form-container')
  document.getElementById('auth-tabs').classList.add('hidden')
  container.innerHTML = `
    <div class="verify-info">
      <p>验证码已发送至 <strong>${email}</strong></p>
    </div>
    <form id="verify-form" class="auth-form">
      <div class="form-group">
        <label for="verify-code">验证码</label>
        <input type="text" id="verify-code" placeholder="请输入6位验证码" required maxlength="6" />
      </div>
      <button type="submit" class="btn-primary">验证</button>
    </form>
  `
  document.getElementById('verify-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const code = document.getElementById('verify-code').value.trim()
    try {
      setButtonLoading(e.target.querySelector('button'), true, '验证中...')
      await verifyEmail(email, code)
      currentUser = await getCurrentUser()
      showUploadView()
    } catch (err) {
      showError(err.message)
      setButtonLoading(e.target.querySelector('button'), false, '验证')
    }
  })
}

async function handleLogin(e) {
  e.preventDefault()
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const btn = e.target.querySelector('button')
  try {
    setButtonLoading(btn, true, '登录中...')
    await signIn(email, password)
    currentUser = await getCurrentUser()
    showUploadView()
  } catch (err) {
    showError(err.message)
    setButtonLoading(btn, false, '登录')
  }
}

async function handleRegister(e) {
  e.preventDefault()
  const name = document.getElementById('reg-name').value.trim()
  const email = document.getElementById('reg-email').value.trim()
  const password = document.getElementById('reg-password').value
  const btn = e.target.querySelector('button')
  try {
    setButtonLoading(btn, true, '注册中...')
    const data = await signUp(email, password, name)
    if (data?.requireEmailVerification) {
      showVerifyForm(email)
    } else if (data?.accessToken) {
      currentUser = await getCurrentUser()
      showUploadView()
    }
  } catch (err) {
    showError(err.message)
    setButtonLoading(btn, false, '注册')
  }
}

// --- Main Layout ---

let selectedFiles = []
let renderFileListFn = null
let processBtnRef = null
let activeTab = 'extract'
let jobPollTimer = null
let jobFilter = 'all'

function showMainView() {
  selectedFiles = []
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-container">
      <header class="app-header">
        <div class="header-left">
          <h1 class="app-title">WordWise</h1>
          <span class="header-divider"></span>
          <span class="header-desc">智能英语词汇提取</span>
        </div>
        <div class="header-right">
          <span class="user-email">${currentUser?.email || ''}</span>
          <button id="logout-btn" class="btn-text">退出</button>
        </div>
      </header>
      <nav class="app-nav">
        <button class="nav-tab active" data-tab="extract">提取</button>
        <button class="nav-tab" data-tab="dictionary">词典</button>
      </nav>
      <main class="app-main">
        <div id="tab-content"></div>
      </main>
    </div>
  `
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut()
    currentUser = null
    showAuthView()
  })
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      activeTab = tab.dataset.tab
      if (activeTab === 'extract') {
        showExtractTab()
      } else {
        showDictionaryTab()
      }
    })
  })
  showExtractTab()
}

// Keep old name for compatibility
function showUploadView() {
  showMainView()
}

// --- Extract Tab ---

function showExtractTab() {
  stopJobPolling()
  stopJobDetailPolling()
  activeJobDetailId = null
  const content = document.getElementById('tab-content')
  content.innerHTML = `
        <div class="upload-section">
          <div class="upload-area" id="upload-area">
            <div class="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p class="upload-text">拖拽 .docx 文件到此处，或点击选择文件</p>
            <p class="upload-hint">最多支持 50 个文件</p>
            <input type="file" id="file-input" multiple accept=".docx" class="hidden" />
          </div>
          <div id="file-list" class="file-list hidden"></div>
          <div class="action-bar">
            <button id="process-btn" class="btn-primary btn-large" disabled>开始提取</button>
          </div>
        </div>
        <div class="library-section">
          <button id="toggle-library-btn" class="btn-text">文件库</button>
          <div id="library-list" class="library-list hidden"></div>
        </div>
        <div id="progress-section" class="progress-section hidden">
          <div class="progress-bar-container">
            <div class="progress-bar" id="progress-bar"></div>
          </div>
          <p class="progress-text" id="progress-text">准备中...</p>
        </div>
        <div id="jobs-section"></div>
        <div id="results-section" class="results-section hidden"></div>
  `
  selectedFiles = []
  setupUploadHandlers()
  document.getElementById('toggle-library-btn').addEventListener('click', toggleLibrary)
  loadJobsList()
}

let libraryVisible = false

async function toggleLibrary() {
  const libraryList = document.getElementById('library-list')
  if (libraryVisible) {
    libraryList.classList.add('hidden')
    libraryVisible = false
    return
  }
  libraryVisible = true
  libraryList.classList.remove('hidden')
  await loadFileLibrary()
}

async function loadFileLibrary() {
  const libraryList = document.getElementById('library-list')
  libraryList.innerHTML = '<p class="loading-text">加载中...</p>'

  const files = await getProcessedFiles(currentUser?.id)

  if (files.length === 0) {
    libraryList.innerHTML = '<p class="empty-text">暂无已上传的文件</p>'
    return
  }

  // Check which library files are already in selectedFiles
  const selectedHashes = new Set(selectedFiles.map((f) => f.hash))

  libraryList.innerHTML = `
    <div class="library-items">
      ${files.map((f) => {
        const alreadySelected = selectedHashes.has(f.file_hash)
        return `
          <div class="library-item" data-id="${f.id}" data-hash="${escapeHtml(f.file_hash)}">
            <label class="library-check-label">
              <input type="checkbox" class="library-check" data-hash="${escapeHtml(f.file_hash)}" data-name="${escapeHtml(f.file_name)}" ${alreadySelected ? 'checked disabled' : ''} />
              <div class="library-item-info">
                <span class="library-file-name">${escapeHtml(f.file_name)}</span>
                <span class="library-date">${new Date(f.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
            </label>
            <button class="btn-delete-library" data-id="${f.id}" data-storage-key="${escapeHtml(f.storage_key || '')}">删除</button>
          </div>
        `
      }).join('')}
    </div>
    <div class="library-actions">
      <button id="add-library-files-btn" class="btn-secondary">添加选中文件到处理队列</button>
    </div>
  `

  // Add to queue button
  document.getElementById('add-library-files-btn').addEventListener('click', () => {
    const checked = document.querySelectorAll('.library-check:checked:not(:disabled)')
    const newItems = []
    checked.forEach((cb) => {
      const hash = cb.dataset.hash
      const fileName = cb.dataset.name
      if (!selectedFiles.some((f) => f.hash === hash)) {
        newItems.push({ file: null, hash, cached: true, fileName, fromLibrary: true })
      }
    })
    if (newItems.length > 0) {
      selectedFiles = [...selectedFiles, ...newItems]
      if (renderFileListFn) renderFileListFn()
      if (processBtnRef) processBtnRef.disabled = selectedFiles.length === 0
      loadFileLibrary() // refresh checkboxes
    }
  })

  // Delete handlers
  document.querySelectorAll('.btn-delete-library').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true
      btn.textContent = '删除中...'
      try {
        await deleteProcessedFile(currentUser?.id, btn.dataset.id, btn.dataset.storageKey || null)
        await loadFileLibrary()
      } catch {
        btn.disabled = false
        btn.textContent = '删除'
      }
    })
  })
}

function setupUploadHandlers() {
  const uploadArea = document.getElementById('upload-area')
  const fileInput = document.getElementById('file-input')
  const processBtn = document.getElementById('process-btn')
  processBtnRef = processBtn

  uploadArea.addEventListener('click', () => fileInput.click())
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over') })
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'))
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault()
    uploadArea.classList.remove('drag-over')
    addFiles(Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.docx')))
  })
  fileInput.addEventListener('change', () => { addFiles(Array.from(fileInput.files)); fileInput.value = '' })

  async function addFiles(files) {
    const toAdd = files.slice(0, 50 - selectedFiles.length)
    if (toAdd.length === 0) return

    const withHashes = await Promise.all(
      toAdd.map(async (file) => {
        const hash = await computeFileHash(file)
        return { file, hash, cached: false, fileName: file.name }
      })
    )

    const hashes = withHashes.map((f) => f.hash)
    const cachedSet = await checkFilesExistence(currentUser?.id, hashes)
    const items = withHashes.map((item) => ({
      ...item,
      cached: cachedSet.has(item.hash),
    }))

    selectedFiles = [...selectedFiles, ...items]
    renderFileList()
    processBtn.disabled = selectedFiles.length === 0
  }

  function removeFile(index) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index)
    renderFileList()
    processBtn.disabled = selectedFiles.length === 0
  }

  function renderFileList() {
    const fileList = document.getElementById('file-list')
    if (selectedFiles.length === 0) { fileList.classList.add('hidden'); return }
    fileList.classList.remove('hidden')
    fileList.innerHTML = `
      <div class="file-list-header">
        <span>已选择 ${selectedFiles.length} 个文件</span>
        <button class="btn-text btn-clear" id="clear-all-btn">清空</button>
      </div>
      <div class="file-items">
        ${selectedFiles.map((item, i) => `
          <div class="file-item">
            <span class="file-name" title="${item.fileName}">${item.fileName}</span>
            ${item.fromLibrary
              ? '<span class="file-badge file-badge-library">文件库</span>'
              : item.cached
                ? '<span class="file-badge file-badge-cached">已处理</span>'
                : '<span class="file-badge file-badge-new">新文件</span>'}
            <button class="btn-remove" data-index="${i}">&times;</button>
          </div>
        `).join('')}
      </div>
    `
    document.getElementById('clear-all-btn').addEventListener('click', () => { selectedFiles = []; renderFileList(); processBtn.disabled = true })
    document.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeFile(Number(btn.dataset.index)))
    })
  }

  renderFileListFn = renderFileList

  processBtn.addEventListener('click', () => processFiles(selectedFiles))
}

// --- Processing (Background Job) ---

async function processFiles(fileItems) {
  const progressBar = document.getElementById('progress-bar')
  const progressText = document.getElementById('progress-text')
  const processBtn = document.getElementById('process-btn')

  document.getElementById('progress-section').classList.remove('hidden')
  processBtn.disabled = true

  const allRankedWords = []
  const allSentences = []
  const userId = currentUser?.id

  try {
    // Step 1: Parse files client-side
    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i]
      const pct = ((i + 1) / fileItems.length) * 50
      progressBar.style.width = `${pct}%`
      progressText.textContent = `正在解析文件 (${i + 1}/${fileItems.length})：${item.fileName}`

      try {
        let words, sentences

        if (item.fromLibrary) {
          const record = await getCachedFileByHash(userId, item.hash)
          if (record) {
            words = record.raw_words
            sentences = record.sentences
          } else {
            continue
          }
        } else if (item.file) {
          const cacheResult = await getCachedFile(userId, item.file)
          if (cacheResult.cached) {
            words = cacheResult.record.raw_words
            sentences = cacheResult.record.sentences
          } else {
            const text = await parseDocxFile(item.file)
            sentences = extractSentences(text)
            words = extractEnglishWords(text)

            let storageKey = null
            try {
              storageKey = await uploadFileToStorage(userId, item.file, cacheResult.hash)
            } catch { /* storage upload optional */ }
            try {
              await saveProcessedFile(userId, item.file, cacheResult.hash, words, sentences, storageKey)
            } catch { /* ignore duplicate errors */ }
          }
        } else {
          continue
        }

        allSentences.push(...sentences)
        allRankedWords.push(...rankWords(words))
      } catch {
        progressText.textContent = `跳过文件（解析失败）：${item.fileName}`
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    if (allRankedWords.length === 0) {
      progressText.textContent = '未能从文件中提取到任何单词'
      processBtn.disabled = false
      return
    }

    // Step 2: Find uncached words
    progressBar.style.width = '60%'
    progressText.textContent = '正在统计词频...'

    const frequencyData = aggregateFrequencies(allRankedWords)
    const uniqueWords = frequencyData.map((f) => f.word)

    const cachedEntries = await getCachedWordEntries(userId, uniqueWords)
    const cachedWordSet = new Set(cachedEntries.map((e) => e.word))
    const uncachedWords = uniqueWords.filter((w) => !cachedWordSet.has(w))

    if (uncachedWords.length === 0) {
      progressBar.style.width = '100%'
      progressText.textContent = `所有 ${cachedEntries.length} 个词已缓存，无需生成`
      processBtn.disabled = false
      loadJobsList()
      return
    }

    // Step 3: Create background job for uncached words
    progressBar.style.width = '80%'
    progressText.textContent = `创建后台任务（${uncachedWords.length} 个新词需要生成）...`

    const wordEntriesForAI = uncachedWords.map((word) => ({
      word,
      sentence: findExampleSentence(word, allSentences),
    }))
    const fileNames = fileItems.map((f) => f.fileName)

    const job = await createExtractionJob(userId, fileNames, wordEntriesForAI)

    // Trigger first batch immediately
    triggerJobProcessing(job.id).catch(() => {})

    progressBar.style.width = '100%'
    progressText.textContent = `后台任务已创建！${uncachedWords.length} 个词正在生成中，可离开页面`

    processBtn.disabled = false
    loadJobsList()
  } catch (err) {
    progressText.textContent = `处理出错：${err.message}`
    progressBar.style.width = '0%'
    processBtn.disabled = false
  }
}

// --- Jobs List ---

async function loadJobsList() {
  const jobsSection = document.getElementById('jobs-section')
  if (!jobsSection) return

  const jobs = await getExtractionJobs(currentUser?.id)

  if (jobs.length === 0) {
    jobsSection.innerHTML = ''
    stopJobPolling()
    return
  }

  const hasActiveJobs = jobs.some((j) => j.status === 'pending' || j.status === 'processing')

  const filterCounts = {
    all: jobs.length,
    active: jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    cancelled: jobs.filter((j) => j.status === 'cancelled').length,
  }

  const filtered = jobFilter === 'all' ? jobs
    : jobFilter === 'active' ? jobs.filter((j) => j.status === 'pending' || j.status === 'processing')
    : jobs.filter((j) => j.status === jobFilter)

  jobsSection.innerHTML = `
    <div class="jobs-header">
      <h2>提取任务</h2>
    </div>
    <div class="job-filters">
      <button class="job-filter-btn ${jobFilter === 'all' ? 'active' : ''}" data-filter="all">全部 (${filterCounts.all})</button>
      <button class="job-filter-btn ${jobFilter === 'active' ? 'active' : ''}" data-filter="active">进行中 (${filterCounts.active})</button>
      <button class="job-filter-btn ${jobFilter === 'completed' ? 'active' : ''}" data-filter="completed">已完成 (${filterCounts.completed})</button>
      <button class="job-filter-btn ${jobFilter === 'cancelled' ? 'active' : ''}" data-filter="cancelled">已取消 (${filterCounts.cancelled})</button>
    </div>
    ${filtered.length === 0 ? '<p class="empty-text">没有匹配的任务</p>' : `
    <div class="jobs-list">
      ${filtered.map((job) => {
        const statusLabel = getJobStatusLabel(job.status)
        const pct = job.total_count > 0
          ? Math.round(((job.completed_count + job.failed_count) / job.total_count) * 100)
          : 0
        const date = new Date(job.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        const fileNames = (job.file_names || []).slice(0, 3).join(', ')
        const moreFiles = (job.file_names || []).length > 3 ? ` 等${job.file_names.length}个文件` : ''

        return `
          <div class="job-card ${job.status === 'completed' || job.status === 'cancelled' ? 'job-card-done' : ''}" data-job-id="${job.id}">
            <div class="job-card-top">
              <div class="job-info">
                <span class="job-files" title="${escapeHtml((job.file_names || []).join(', '))}">${escapeHtml(fileNames)}${moreFiles}</span>
                <span class="job-date">${date}</span>
              </div>
              <div class="job-card-actions">
                <span class="job-status job-status-${job.status}">${statusLabel}</span>
                ${job.status === 'pending' || job.status === 'processing' ? `<button class="btn-cancel-job" data-job-id="${job.id}">取消</button>` : ''}
              </div>
            </div>
            <div class="job-card-bottom">
              <div class="job-progress-bar"><div class="job-progress-fill" style="width: ${pct}%"></div></div>
              <span class="job-counts">${job.completed_count}/${job.total_count} 完成${job.failed_count > 0 ? `，${job.failed_count} 失败` : ''}</span>
            </div>
          </div>
        `
      }).join('')}
    </div>
    `}
  `

  // Filter button handlers
  document.querySelectorAll('.job-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      jobFilter = btn.dataset.filter
      loadJobsList()
    })
  })

  // Make entire job card clickable
  document.querySelectorAll('.job-card').forEach((card) => {
    card.style.cursor = 'pointer'
    card.addEventListener('click', () => {
      showJobDetail(card.dataset.jobId)
    })
  })

  // Cancel button handlers
  document.querySelectorAll('.btn-cancel-job').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      btn.disabled = true
      btn.textContent = '取消中...'
      try {
        await cancelExtractionJob(btn.dataset.jobId)
        await loadJobsList()
      } catch {
        btn.disabled = false
        btn.textContent = '取消'
      }
    })
  })

  // Start/stop polling based on active jobs
  if (hasActiveJobs) {
    startJobPolling()
  } else {
    stopJobPolling()
  }
}

function getJobStatusLabel(status) {
  const labels = { pending: '等待中', processing: '处理中', completed: '已完成', failed: '失败', cancelled: '已取消' }
  return labels[status] || status
}

function startJobPolling() {
  if (jobPollTimer) return
  jobPollTimer = setInterval(() => {
    if (activeTab === 'extract') {
      loadJobsList()
    } else {
      stopJobPolling()
    }
  }, 5000)
}

function stopJobPolling() {
  if (jobPollTimer) {
    clearInterval(jobPollTimer)
    jobPollTimer = null
  }
}

let jobDetailPollTimer = null
let activeJobDetailId = null

async function showJobDetail(jobId) {
  activeJobDetailId = jobId
  stopJobDetailPolling()

  const resultsSection = document.getElementById('results-section')
  resultsSection.classList.remove('hidden')
  resultsSection.innerHTML = '<p class="loading-text">加载任务详情...</p>'

  const job = await getExtractionJob(jobId)
  if (!job) {
    resultsSection.innerHTML = '<p class="empty-text">任务未找到</p>'
    return
  }

  renderJobDetail(job)

  if (job.status === 'pending' || job.status === 'processing') {
    startJobDetailPolling(jobId)
  }
}

function renderJobDetail(job) {
  const resultsSection = document.getElementById('results-section')
  const allWords = job.words || []
  const results = job.results || []
  const failedWords = job.failed_words || []
  const resultWordSet = new Set(results.map((r) => r.word))
  const failedWordSet = new Set(failedWords)

  const completedCount = results.length
  const failedCount = failedWords.length
  const pendingCount = allWords.length - completedCount - failedCount
  const pct = job.total_count > 0 ? Math.round(((completedCount + failedCount) / job.total_count) * 100) : 0

  const fileNames = (job.file_names || []).join(', ')
  const createdDate = new Date(job.created_at).toLocaleString('zh-CN')
  const statusLabel = getJobStatusLabel(job.status)
  const isActive = job.status === 'pending' || job.status === 'processing'

  resultsSection.innerHTML = `
    <div class="job-detail">
      <button class="btn-back" id="btn-back-jobs">← 返回任务列表</button>
      <div class="job-detail-header">
        <div>
          <h2 class="job-detail-title">${escapeHtml(fileNames)}</h2>
          <span class="job-detail-date">${createdDate}</span>
        </div>
        <div class="job-card-actions">
          <span class="job-status job-status-${job.status}">${statusLabel}</span>
          ${isActive ? `<button class="btn-cancel-job" id="btn-cancel-detail">取消任务</button>` : ''}
        </div>
      </div>

      <div class="job-viz">
        <div class="progress-ring-container" id="progress-ring">
          ${renderProgressRing(completedCount, failedCount, pendingCount, pct)}
        </div>
        <div class="stats-row" id="stats-row">
          <div class="stat-card">
            <span class="stat-value">${job.total_count}</span>
            <span class="stat-label">总词数</span>
          </div>
          <div class="stat-card stat-card-success">
            <span class="stat-value">${completedCount}</span>
            <span class="stat-label">已完成</span>
          </div>
          <div class="stat-card stat-card-failed">
            <span class="stat-value">${failedCount}</span>
            <span class="stat-label">失败</span>
          </div>
          <div class="stat-card stat-card-pending">
            <span class="stat-value">${pendingCount}</span>
            <span class="stat-label">等待中</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${job.batch_index || 0}</span>
            <span class="stat-label">批次</span>
          </div>
        </div>
      </div>

      <div class="word-grid-section">
        <h3 class="word-grid-title">词汇状态</h3>
        <div class="word-grid" id="word-grid">
          ${renderWordGrid(allWords, resultWordSet, failedWordSet, results)}
        </div>
      </div>

      ${completedCount > 0 ? `
        <div class="job-results-section">
          <h3 class="word-grid-title">已完成词条</h3>
          <div id="job-results-table"></div>
        </div>
      ` : ''}
    </div>
  `

  // Render results table if there are completed entries
  if (completedCount > 0) {
    renderResultsTable(results)
  }

  document.getElementById('btn-back-jobs').addEventListener('click', () => {
    stopJobDetailPolling()
    activeJobDetailId = null
    resultsSection.classList.add('hidden')
    resultsSection.innerHTML = ''
    loadJobsList()
  })

  const cancelDetailBtn = document.getElementById('btn-cancel-detail')
  if (cancelDetailBtn) {
    cancelDetailBtn.addEventListener('click', async () => {
      cancelDetailBtn.disabled = true
      cancelDetailBtn.textContent = '取消中...'
      try {
        await cancelExtractionJob(job.id)
        stopJobDetailPolling()
        showJobDetail(job.id) // re-render with cancelled state
      } catch {
        cancelDetailBtn.disabled = false
        cancelDetailBtn.textContent = '取消任务'
      }
    })
  }

  // Popover click handler for completed word pills
  setupWordPillPopovers(results)
}

function renderProgressRing(completed, failed, pending, pct) {
  const total = completed + failed + pending
  if (total === 0) return ''

  const radius = 52
  const circumference = 2 * Math.PI * radius
  const completedLen = (completed / total) * circumference
  const failedLen = (failed / total) * circumference
  const pendingLen = circumference - completedLen - failedLen

  const completedOffset = 0
  const failedOffset = completedLen
  const pendingOffset = completedLen + failedLen

  return `
    <svg class="progress-ring" width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r="${radius}" fill="none" stroke="#E8E2DA" stroke-width="10" />
      ${completedLen > 0 ? `<circle cx="65" cy="65" r="${radius}" fill="none" stroke="#27AE60" stroke-width="10"
        stroke-dasharray="${completedLen} ${circumference - completedLen}"
        stroke-dashoffset="${-completedOffset}"
        stroke-linecap="round" transform="rotate(-90 65 65)" />` : ''}
      ${failedLen > 0 ? `<circle cx="65" cy="65" r="${radius}" fill="none" stroke="#B91C1C" stroke-width="10"
        stroke-dasharray="${failedLen} ${circumference - failedLen}"
        stroke-dashoffset="${-failedOffset}"
        stroke-linecap="round" transform="rotate(-90 65 65)" />` : ''}
      <text x="65" y="60" text-anchor="middle" class="progress-pct">${pct}%</text>
      <text x="65" y="78" text-anchor="middle" class="progress-sub">完成</text>
    </svg>
  `
}

function renderWordGrid(allWords, resultWordSet, failedWordSet, results) {
  return allWords.map((w) => {
    const word = w.word
    let cls = 'word-pill word-pill-pending'
    let extra = ''
    if (resultWordSet.has(word)) {
      cls = 'word-pill word-pill-completed'
      extra = 'data-word="' + escapeHtml(word) + '"'
    } else if (failedWordSet.has(word)) {
      cls = 'word-pill word-pill-failed'
    }
    return `<span class="${cls}" ${extra}>${escapeHtml(word)}</span>`
  }).join('')
}

function setupWordPillPopovers(results) {
  const resultMap = new Map(results.map((r) => [r.word, r]))

  document.querySelectorAll('.word-pill-completed').forEach((pill) => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation()
      // Remove any existing popover
      document.querySelectorAll('.word-popover').forEach((p) => p.remove())

      const word = pill.dataset.word
      const entry = resultMap.get(word)
      if (!entry) return

      const popover = document.createElement('div')
      popover.className = 'word-popover'
      popover.innerHTML = `
        <div class="popover-word">${escapeHtml(entry.word)}</div>
        <div class="popover-phonetic">${escapeHtml(entry.phonetic)}</div>
        <div class="popover-pos">${escapeHtml(entry.pos)}</div>
        <div class="popover-meaning">${escapeHtml(entry.meaning)}</div>
        <div class="popover-example">${escapeHtml(entry.example)}</div>
        <div class="popover-example-cn">${escapeHtml(entry.exampleCn)}</div>
      `

      const rect = pill.getBoundingClientRect()
      popover.style.position = 'fixed'
      popover.style.left = `${rect.left}px`
      popover.style.top = `${rect.bottom + 6}px`
      document.body.appendChild(popover)

      // Ensure popover stays in viewport
      const popRect = popover.getBoundingClientRect()
      if (popRect.right > window.innerWidth - 8) {
        popover.style.left = `${window.innerWidth - popRect.width - 8}px`
      }
      if (popRect.bottom > window.innerHeight - 8) {
        popover.style.top = `${rect.top - popRect.height - 6}px`
      }

      const dismiss = () => {
        popover.remove()
        document.removeEventListener('click', dismiss)
      }
      setTimeout(() => document.addEventListener('click', dismiss), 0)
    })
  })
}

function updateJobDetail(job) {
  const allWords = job.words || []
  const results = job.results || []
  const failedWords = job.failed_words || []
  const resultWordSet = new Set(results.map((r) => r.word))
  const failedWordSet = new Set(failedWords)

  const completedCount = results.length
  const failedCount = failedWords.length
  const pendingCount = allWords.length - completedCount - failedCount
  const pct = job.total_count > 0 ? Math.round(((completedCount + failedCount) / job.total_count) * 100) : 0

  // Update progress ring
  const ringEl = document.getElementById('progress-ring')
  if (ringEl) ringEl.innerHTML = renderProgressRing(completedCount, failedCount, pendingCount, pct)

  // Update stats
  const statsEl = document.getElementById('stats-row')
  if (statsEl) {
    const values = statsEl.querySelectorAll('.stat-value')
    if (values.length >= 5) {
      values[0].textContent = job.total_count
      values[1].textContent = completedCount
      values[2].textContent = failedCount
      values[3].textContent = pendingCount
      values[4].textContent = job.batch_index || 0
    }
  }

  // Update word grid
  const gridEl = document.getElementById('word-grid')
  if (gridEl) {
    gridEl.innerHTML = renderWordGrid(allWords, resultWordSet, failedWordSet, results)
    setupWordPillPopovers(results)
  }

  // Update status badge
  const statusBadge = document.querySelector('.job-detail-header .job-status')
  if (statusBadge) {
    statusBadge.className = `job-status job-status-${job.status}`
    statusBadge.textContent = getJobStatusLabel(job.status)
  }

  // If job just completed, render the results table
  if ((job.status === 'completed' || completedCount > 0) && !document.getElementById('job-results-table')) {
    const detail = document.querySelector('.job-detail')
    if (detail) {
      const section = document.createElement('div')
      section.className = 'job-results-section'
      section.innerHTML = '<h3 class="word-grid-title">已完成词条</h3><div id="job-results-table"></div>'
      detail.appendChild(section)
    }
  }
  if (completedCount > 0) {
    renderResultsTable(results)
  }

  // Stop polling if job is done
  if (job.status === 'completed' || job.status === 'failed') {
    stopJobDetailPolling()
  }
}

function renderResultsTable(results) {
  const container = document.getElementById('job-results-table')
  if (!container) return

  const entries = results.map((e) => ({
    word: e.word,
    phonetic: e.phonetic,
    pos: e.pos,
    meaning: e.meaning,
    example: e.example,
    exampleAnnotated: e.exampleAnnotated || [],
    exampleCn: e.exampleCn,
  }))

  container.innerHTML = `
    <div class="results-actions" style="margin-bottom: 0.75rem">
      <span class="results-count">${entries.length} 个词条</span>
      <button id="job-download-csv-btn" class="btn-secondary">下载 CSV</button>
    </div>
    <div class="results-table-container">
      <table class="results-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-word">单词</th>
            <th class="col-phonetic">音标</th>
            <th class="col-pos">词性</th>
            <th class="col-meaning">中文意思</th>
            <th class="col-example">例句</th>
            <th class="col-example-cn">例句翻译</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry, i) => `
            <tr>
              <td class="col-num">${i + 1}</td>
              <td class="col-word"><strong>${escapeHtml(entry.word)}</strong></td>
              <td class="col-phonetic">${escapeHtml(entry.phonetic)}</td>
              <td class="col-pos">${escapeHtml(entry.pos)}</td>
              <td class="col-meaning">${escapeHtml(entry.meaning)}</td>
              <td class="col-example">${renderAnnotatedExample(entry)}</td>
              <td class="col-example-cn">${escapeHtml(entry.exampleCn)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  document.getElementById('job-download-csv-btn')?.addEventListener('click', () => downloadCSV(entries))
}

function startJobDetailPolling(jobId) {
  stopJobDetailPolling()
  jobDetailPollTimer = setInterval(async () => {
    if (activeJobDetailId !== jobId) {
      stopJobDetailPolling()
      return
    }
    const job = await getExtractionJob(jobId)
    if (job) updateJobDetail(job)
  }, 5000)
}

function stopJobDetailPolling() {
  if (jobDetailPollTimer) {
    clearInterval(jobDetailPollTimer)
    jobDetailPollTimer = null
  }
}


function renderAnnotatedExample(entry) {
  const annotated = entry.exampleAnnotated
  if (!Array.isArray(annotated) || annotated.length === 0) {
    return `<span class="example-plain">${escapeHtml(entry.example)}</span>`
  }

  return `<span class="example-annotated">${annotated.map((item) =>
    `<span class="word-unit"><span class="word-text">${escapeHtml(item.word)}</span><span class="word-phonetic">${escapeHtml(item.phonetic)}</span></span>`
  ).join('')}</span>`
}

function downloadCSV(entries) {
  const BOM = '\uFEFF'
  const header = '序号,频率,单词,音标,词性,中文意思,例句,例句翻译'
  const rows = entries.map((entry, i) =>
    [
      i + 1,
      entry.frequency,
      csvEscape(entry.word),
      csvEscape(entry.phonetic),
      csvEscape(entry.pos),
      csvEscape(entry.meaning),
      csvEscape(entry.example),
      csvEscape(entry.exampleCn),
    ].join(',')
  )
  const csv = BOM + header + '\n' + rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wordwise_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Dictionary Tab ---

async function showDictionaryTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = '<p class="loading-text">加载词典...</p>'

  const [rawEntries, freqMap] = await Promise.all([
    getAllWordEntries(currentUser?.id),
    getWordFrequencyMap(currentUser?.id),
  ])
  const allEntries = rawEntries.map((e) => ({
    word: e.word,
    phonetic: e.phonetic,
    pos: e.pos,
    meaning: e.meaning,
    example: e.example,
    exampleAnnotated: e.example_annotated || [],
    exampleCn: e.example_cn,
    freq: freqMap.get(e.word.toLowerCase()) || 0,
  }))

  content.innerHTML = `
    <div class="dict-header">
      <h2>词典</h2>
      <span class="dict-total" id="dict-total">共 ${allEntries.length} 个单词</span>
    </div>
    <div class="dict-controls">
      <input type="text" id="dict-search" class="dict-search" placeholder="搜索单词、释义或例句..." />
      <div class="dict-filters">
        <select id="dict-pos-filter" class="dict-select">
          <option value="">全部词性</option>
          <option value="n.">n. 名词</option>
          <option value="v.">v. 动词</option>
          <option value="adj.">adj. 形容词</option>
          <option value="adv.">adv. 副词</option>
          <option value="prep.">prep. 介词</option>
          <option value="conj.">conj. 连词</option>
          <option value="pron.">pron. 代词</option>
        </select>
        <select id="dict-sort" class="dict-select">
          <option value="freq-desc">出现频率 高→低</option>
          <option value="freq-asc">出现频率 低→高</option>
          <option value="alpha-asc">字母 A→Z</option>
          <option value="alpha-desc">字母 Z→A</option>
          <option value="newest">最新添加</option>
        </select>
        <button id="dict-download-btn" class="btn-secondary">下载 CSV</button>
      </div>
    </div>
    <div id="dict-table-container"></div>
  `

  let currentSearch = ''
  let currentPos = ''
  let currentSort = 'freq-desc'

  function getFiltered() {
    let filtered = allEntries

    if (currentSearch) {
      const q = currentSearch.toLowerCase()
      filtered = filtered.filter((e) =>
        e.word.toLowerCase().includes(q)
        || e.meaning.toLowerCase().includes(q)
        || e.example.toLowerCase().includes(q)
        || (e.exampleCn && e.exampleCn.includes(q))
      )
    }

    if (currentPos) {
      filtered = filtered.filter((e) => e.pos === currentPos)
    }

    if (currentSort === 'freq-desc') {
      filtered = [...filtered].sort((a, b) => b.freq - a.freq)
    } else if (currentSort === 'freq-asc') {
      filtered = [...filtered].sort((a, b) => a.freq - b.freq)
    } else if (currentSort === 'alpha-asc') {
      filtered = [...filtered].sort((a, b) => a.word.localeCompare(b.word))
    } else if (currentSort === 'alpha-desc') {
      filtered = [...filtered].sort((a, b) => b.word.localeCompare(a.word))
    }
    // 'newest' keeps original order (already sorted by created_at desc from DB)

    return filtered
  }

  function renderDictTable() {
    const filtered = getFiltered()
    document.getElementById('dict-total').textContent = `共 ${filtered.length} 个单词`
    const container = document.getElementById('dict-table-container')

    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-text">没有匹配的单词</p>'
      return
    }

    container.innerHTML = `
      <div class="results-table-container">
        <table class="results-table">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-freq">出现频率</th>
              <th class="col-word">单词</th>
              <th class="col-phonetic">音标</th>
              <th class="col-pos">词性</th>
              <th class="col-meaning">中文意思</th>
              <th class="col-example">例句</th>
              <th class="col-example-cn">例句翻译</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((entry, i) => `
              <tr>
                <td class="col-num">${i + 1}</td>
                <td class="col-freq"><span class="freq-badge">${entry.freq}</span></td>
                <td class="col-word"><strong>${escapeHtml(entry.word)}</strong></td>
                <td class="col-phonetic">${escapeHtml(entry.phonetic)}</td>
                <td class="col-pos">${escapeHtml(entry.pos)}</td>
                <td class="col-meaning">${escapeHtml(entry.meaning)}</td>
                <td class="col-example">${renderAnnotatedExample(entry)}</td>
                <td class="col-example-cn">${escapeHtml(entry.exampleCn)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  renderDictTable()

  let searchTimer = null
  document.getElementById('dict-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      currentSearch = e.target.value.trim()
      renderDictTable()
    }, 200)
  })

  document.getElementById('dict-pos-filter').addEventListener('change', (e) => {
    currentPos = e.target.value
    renderDictTable()
  })

  document.getElementById('dict-sort').addEventListener('change', (e) => {
    currentSort = e.target.value
    renderDictTable()
  })

  document.getElementById('dict-download-btn').addEventListener('click', () => {
    downloadDictCSV(getFiltered())
  })
}

function downloadDictCSV(entries) {
  const BOM = '\uFEFF'
  const header = '序号,出现频率,单词,音标,词性,中文意思,例句,例句翻译'
  const rows = entries.map((entry, i) =>
    [
      i + 1,
      entry.freq,
      csvEscape(entry.word),
      csvEscape(entry.phonetic),
      csvEscape(entry.pos),
      csvEscape(entry.meaning),
      csvEscape(entry.example),
      csvEscape(entry.exampleCn),
    ].join(',')
  )
  const csv = BOM + header + '\n' + rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wordwise_词典_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Helpers ---

function showError(message) {
  const el = document.getElementById('auth-error')
  if (el) { el.textContent = message; el.classList.remove('hidden') }
}

function hideError() {
  const el = document.getElementById('auth-error')
  if (el) el.classList.add('hidden')
}

function setButtonLoading(btn, loading, text) {
  btn.disabled = loading
  btn.textContent = text
}

function escapeHtml(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function csvEscape(str) {
  if (!str) return '""'
  return `"${str.replace(/"/g, '""')}"`
}
