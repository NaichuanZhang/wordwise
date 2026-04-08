import { getCurrentUser, signIn, signUp, signOut, verifyEmail } from './auth.js'
import { parseDocxFile, extractSentences, extractEnglishWords } from './docx-parser.js'
import { rankWords, findExampleSentence, aggregateFrequencies } from './word-ranker.js'
import { generateDictionaryEntries } from './ai-dictionary.js'
import {
  getCachedFile, saveProcessedFile, getCachedWordEntries, saveWordEntries,
  getProcessedFiles, deleteProcessedFile, checkFilesExistence, computeFileHash,
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

// --- Upload View ---

function showUploadView() {
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
      <main class="app-main">
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
        <div class="history-section">
          <button id="toggle-history-btn" class="btn-text">已处理的文件</button>
          <div id="history-list" class="history-list hidden"></div>
        </div>
        <div id="progress-section" class="progress-section hidden">
          <div class="progress-bar-container">
            <div class="progress-bar" id="progress-bar"></div>
          </div>
          <p class="progress-text" id="progress-text">准备中...</p>
        </div>
        <div id="results-section" class="results-section hidden"></div>
      </main>
    </div>
  `
  setupUploadHandlers()
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut()
    currentUser = null
    showAuthView()
  })
  document.getElementById('toggle-history-btn').addEventListener('click', toggleHistory)
}

let historyVisible = false

async function toggleHistory() {
  const historyList = document.getElementById('history-list')
  if (historyVisible) {
    historyList.classList.add('hidden')
    historyVisible = false
    return
  }
  historyVisible = true
  historyList.classList.remove('hidden')
  await loadProcessedFilesHistory()
}

async function loadProcessedFilesHistory() {
  const historyList = document.getElementById('history-list')
  historyList.innerHTML = '<p class="loading-text">加载中...</p>'

  const files = await getProcessedFiles(currentUser?.id)

  if (files.length === 0) {
    historyList.innerHTML = '<p class="empty-text">暂无已处理的文件</p>'
    return
  }

  historyList.innerHTML = `
    <div class="history-items">
      ${files.map((f) => `
        <div class="history-item" data-id="${f.id}">
          <div class="history-item-info">
            <span class="history-file-name">${escapeHtml(f.file_name)}</span>
            <span class="history-date">${new Date(f.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
          <button class="btn-delete-history" data-id="${f.id}">删除</button>
        </div>
      `).join('')}
    </div>
  `

  document.querySelectorAll('.btn-delete-history').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true
      btn.textContent = '删除中...'
      try {
        await deleteProcessedFile(currentUser?.id, btn.dataset.id)
        await loadProcessedFilesHistory()
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
  let selectedFiles = [] // { file, hash, cached }[]

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

    // Hash files in parallel
    const withHashes = await Promise.all(
      toAdd.map(async (file) => {
        const hash = await computeFileHash(file)
        return { file, hash, cached: false }
      })
    )

    // Batch-check which files are already processed
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
            <span class="file-name" title="${item.file.name}">${item.file.name}</span>
            ${item.cached
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

  processBtn.addEventListener('click', () => processFiles(selectedFiles))
}

// --- Processing ---

async function processFiles(fileItems) {
  const progressBar = document.getElementById('progress-bar')
  const progressText = document.getElementById('progress-text')
  const processBtn = document.getElementById('process-btn')
  const resultsSection = document.getElementById('results-section')

  document.getElementById('progress-section').classList.remove('hidden')
  resultsSection.classList.add('hidden')
  processBtn.disabled = true

  const allRankedWords = []
  const allSentences = []
  const totalSteps = fileItems.length + 3
  const userId = currentUser?.id

  try {
    // Step 1: Parse files (with DB caching, per-file error handling)
    for (let i = 0; i < fileItems.length; i++) {
      const { file } = fileItems[i]
      const pct = ((i + 1) / totalSteps) * 100
      progressBar.style.width = `${pct}%`
      progressText.textContent = `正在解析文件 (${i + 1}/${fileItems.length})：${file.name}`

      try {
        let words, sentences

        // Check cache first
        const cacheResult = await getCachedFile(userId, file)
        if (cacheResult.cached) {
          progressText.textContent = `文件已缓存，跳过解析：${file.name}`
          words = cacheResult.record.raw_words
          sentences = cacheResult.record.sentences
        } else {
          const text = await parseDocxFile(file)
          sentences = extractSentences(text)
          words = extractEnglishWords(text)
          try {
            await saveProcessedFile(userId, file, cacheResult.hash, words, sentences)
          } catch { /* ignore duplicate errors */ }
        }

        allSentences.push(...sentences)
        const ranked = rankWords(words)
        allRankedWords.push(...ranked)
      } catch {
        progressText.textContent = `跳过文件（解析失败）：${file.name}`
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    if (allRankedWords.length === 0) {
      progressText.textContent = '未能从文件中提取到任何单词'
      processBtn.disabled = false
      return
    }

    // Step 2: Aggregate frequencies across all files
    progressBar.style.width = `${((fileItems.length + 1) / totalSteps) * 100}%`
    progressText.textContent = '正在统计词频...'

    const frequencyData = aggregateFrequencies(allRankedWords)
    const frequencyMap = new Map(frequencyData.map((f) => [f.word, f.totalFrequency]))
    const uniqueWords = frequencyData.map((f) => f.word)

    // Step 3: Check DB for existing word entries
    progressBar.style.width = `${((fileItems.length + 1.5) / totalSteps) * 100}%`
    progressText.textContent = '检查已有词条...'

    const cachedEntries = await getCachedWordEntries(userId, uniqueWords)
    const cachedWordSet = new Set(cachedEntries.map((e) => e.word))
    const uncachedWords = uniqueWords.filter((w) => !cachedWordSet.has(w))

    let newEntries = []
    if (uncachedWords.length > 0) {
      // Build word entries with example sentences for uncached words
      const wordEntriesForAI = uncachedWords.map((word) => ({
        word,
        sentence: findExampleSentence(word, allSentences),
      }))

      // Step 4: Generate via AI
      const onProgress = (batchNum, totalBatches, done, total) => {
        const aiPct = done / total
        const overallPct = ((fileItems.length + 2 + aiPct) / totalSteps) * 100
        progressBar.style.width = `${overallPct}%`
        progressText.textContent = `正在生成词典条目 (第 ${batchNum}/${totalBatches} 批，已完成 ${done}/${total} 个词)...`
      }

      newEntries = await generateDictionaryEntries(wordEntriesForAI, onProgress)

      // Only save entries where all fields are populated
      const successfulEntries = newEntries
        .filter((e) => e.word && e.phonetic && e.pos && e.meaning && e.meaning !== '(生成失败)' && e.example && e.exampleCn)
        .map((e) => ({
          ...e,
          frequency: frequencyMap.get(e.word) || 0,
        }))
      if (successfulEntries.length > 0) {
        try {
          await saveWordEntries(userId, successfulEntries)
        } catch { /* ignore save errors */ }
      }
    }

    progressBar.style.width = '100%'
    progressText.textContent = `完成！（${cachedEntries.length} 个词从缓存加载，${newEntries.length} 个词新生成）`

    // Merge cached + new, assign frequencies, sort by frequency desc
    const allEntries = [
      ...cachedEntries.map((e) => ({
        word: e.word,
        phonetic: e.phonetic,
        pos: e.pos,
        meaning: e.meaning,
        example: e.example,
        exampleAnnotated: e.example_annotated || [],
        exampleCn: e.example_cn,
        frequency: frequencyMap.get(e.word) || e.frequency || 0,
      })),
      ...newEntries.map((e) => ({
        ...e,
        frequency: frequencyMap.get(e.word) || 0,
      })),
    ].sort((a, b) => b.frequency - a.frequency)

    showResults(allEntries)
  } catch (err) {
    progressText.textContent = `处理出错：${err.message}`
    progressBar.style.width = '0%'
  } finally {
    processBtn.disabled = false
  }
}

// --- Results ---

function showResults(entries) {
  const resultsSection = document.getElementById('results-section')
  resultsSection.classList.remove('hidden')

  resultsSection.innerHTML = `
    <div class="results-header">
      <h2>提取结果</h2>
      <div class="results-actions">
        <span class="results-count">共 ${entries.length} 个单词</span>
        <button id="download-csv-btn" class="btn-secondary">下载 CSV</button>
      </div>
    </div>
    <div id="table-container"></div>
  `

  const container = document.getElementById('table-container')
  container.innerHTML = `
    <div class="results-table-container">
      <table class="results-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-freq">频率</th>
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
              <td class="col-freq"><span class="freq-badge">${entry.frequency}</span></td>
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

  document.getElementById('download-csv-btn').addEventListener('click', () => downloadCSV(entries))
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
