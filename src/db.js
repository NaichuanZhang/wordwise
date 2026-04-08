import { insforge } from './insforge-client.js'

export async function computeFileHash(file) {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

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

export async function saveProcessedFile(userId, file, hash, rawWords, sentences) {
  const { data, error } = await insforge.database
    .from('processed_files')
    .insert([{
      user_id: userId,
      file_hash: hash,
      file_name: file.name,
      raw_words: rawWords,
      sentences: sentences,
    }])
    .select()

  if (error) throw new Error(error.message)
  return data[0]
}

export async function getProcessedFiles(userId) {
  const { data, error } = await insforge.database
    .from('processed_files')
    .select('id, file_name, file_hash, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return []
  return data || []
}

export async function deleteProcessedFile(userId, fileId) {
  const { error } = await insforge.database
    .from('processed_files')
    .delete()
    .eq('user_id', userId)
    .eq('id', fileId)

  if (error) throw new Error(error.message)
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
    frequency: entry.frequency || 0,
  }))

  const { error } = await insforge.database
    .from('word_entries')
    .upsert(rows, { onConflict: 'user_id,word' })

  if (error) {
    throw new Error(error.message)
  }
}
