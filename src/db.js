import { insforge } from './insforge-client.js'

const STORAGE_BUCKET = 'docx-uploads'

export async function computeFileHash(file) {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// --- Storage ---

export async function uploadFileToStorage(userId, file, hash) {
  const key = `${userId}/${hash}.docx`
  const { data, error } = await insforge.storage
    .from(STORAGE_BUCKET)
    .upload(key, file)

  if (error) throw new Error(error.message)
  return data.key
}

export async function deleteFileFromStorage(storageKey) {
  if (!storageKey) return
  await insforge.storage
    .from(STORAGE_BUCKET)
    .remove(storageKey)
}

// --- Processed Files ---

export async function getCachedFile(userId, file) {
  const hash = await computeFileHash(file)

  const { data, error } = await insforge.database
    .from('processed_files')
    .select('*')
    .eq('user_id', userId)
    .eq('file_hash', hash)
    .limit(1)

  if (error || !data || data.length === 0) {
    return { cached: false, hash }
  }

  return { cached: true, hash, record: data[0] }
}

export async function getCachedFileByHash(userId, hash) {
  const { data, error } = await insforge.database
    .from('processed_files')
    .select('*')
    .eq('user_id', userId)
    .eq('file_hash', hash)
    .limit(1)

  if (error || !data || data.length === 0) {
    return null
  }

  return data[0]
}

export async function checkFilesExistence(userId, fileHashes) {
  if (fileHashes.length === 0) return new Set()

  const { data, error } = await insforge.database
    .from('processed_files')
    .select('file_hash')
    .eq('user_id', userId)
    .in('file_hash', fileHashes)

  if (error) return new Set()
  return new Set((data || []).map((r) => r.file_hash))
}

function buildWordFreqMap(words) {
  const freq = {}
  for (const w of words) {
    if (w.length < 3) continue
    const lower = w.toLowerCase()
    freq[lower] = (freq[lower] || 0) + 1
  }
  return freq
}

export async function saveProcessedFile(userId, file, hash, rawWords, sentences, storageKey) {
  const { data, error } = await insforge.database
    .from('processed_files')
    .insert([{
      user_id: userId,
      file_hash: hash,
      file_name: file.name,
      raw_words: rawWords,
      sentences: sentences,
      storage_key: storageKey || null,
      word_freq: buildWordFreqMap(rawWords),
    }])
    .select()

  if (error) throw new Error(error.message)
  return data[0]
}

export async function getProcessedFiles(userId) {
  const { data, error } = await insforge.database
    .from('processed_files')
    .select('id, file_name, file_hash, storage_key, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return []
  return data || []
}

export async function deleteProcessedFile(userId, fileId, storageKey) {
  await deleteFileFromStorage(storageKey)

  const { error } = await insforge.database
    .from('processed_files')
    .delete()
    .eq('user_id', userId)
    .eq('id', fileId)

  if (error) throw new Error(error.message)
}

// --- Word Entries ---

export async function getAllWordEntries(userId) {
  const { data, error } = await insforge.database
    .from('word_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return []
  return data || []
}

export async function getWordFrequencyMap(userId) {
  const { data, error } = await insforge.database
    .from('processed_files')
    .select('word_freq')
    .eq('user_id', userId)

  if (error || !data) return new Map()

  const freqMap = new Map()
  for (const file of data) {
    const freq = file.word_freq || {}
    for (const [word, count] of Object.entries(freq)) {
      freqMap.set(word, (freqMap.get(word) || 0) + count)
    }
  }
  return freqMap
}

export async function getCachedWordEntries(userId, words) {
  if (words.length === 0) return []

  const { data, error } = await insforge.database
    .from('word_entries')
    .select('*')
    .eq('user_id', userId)
    .in('word', words)

  if (error) return []
  return data || []
}

// --- Extraction Jobs ---

export async function createExtractionJob(userId, fileNames, words) {
  const { data, error } = await insforge.database
    .from('extraction_jobs')
    .insert([{
      user_id: userId,
      file_names: fileNames,
      words,
      total_count: words.length,
      status: 'pending',
    }])
    .select()

  if (error) throw new Error(error.message)
  return data[0]
}

export async function getExtractionJobs(userId) {
  const { data, error } = await insforge.database
    .from('extraction_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return []
  return data || []
}

export async function getExtractionJob(jobId) {
  const { data, error } = await insforge.database
    .from('extraction_jobs')
    .select('*')
    .eq('id', jobId)
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

export async function triggerJobProcessing(jobId) {
  return insforge.functions.invoke('process-words', {
    body: { job_id: jobId },
  })
}

// --- Word Entries ---

export async function saveWordEntries(userId, entries) {
  if (entries.length === 0) return

  const rows = entries.map((entry) => ({
    user_id: userId,
    word: entry.word,
    phonetic: entry.phonetic,
    pos: entry.pos,
    meaning: entry.meaning,
    example: entry.example,
    example_annotated: entry.exampleAnnotated || [],
    example_cn: entry.exampleCn,
  }))

  const { error } = await insforge.database
    .from('word_entries')
    .upsert(rows, { onConflict: 'user_id,word' })

  if (error) {
    throw new Error(error.message)
  }
}
