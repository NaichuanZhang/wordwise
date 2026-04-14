import { createClient } from 'npm:@insforge/sdk'
import { annotateExample } from './phonetic-annotator.ts'

const AI_MODEL = 'deepseek/deepseek-v3.2'
const FALLBACK_MODEL = 'openai/gpt-4o-mini'
const BATCH_SIZE = 10
const CONCURRENCY = 3
const RETRY_CONCURRENCY = 5

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

interface WordEntry {
  word: string
  sentence: string
}

interface DictEntry {
  word: string
  phonetic: string
  pos: string
  meaning: string
  example: string
  exampleAnnotated: { word: string; phonetic: string }[]
  exampleCn: string
}

function isFailed(entry: DictEntry): boolean {
  return !entry.word || !entry.phonetic || !entry.pos
    || !entry.meaning || entry.meaning === '(生成失败)'
    || !entry.example || !entry.exampleCn
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null

  // For cron invocations, use API key; for user invocations, use user token
  const apiKey = req.headers.get('X-API-Key')
  const client = apiKey
    ? createClient({
        baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
        apiKey,
      })
    : createClient({
        baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
        edgeFunctionToken: userToken,
      })

  const body = await req.json()
  const { job_id } = body

  if (!job_id) {
    return jsonResponse({ error: 'job_id required' }, 400)
  }

  // Load job
  const { data: jobs, error: jobErr } = await client.database
    .from('extraction_jobs')
    .select('*')
    .eq('id', job_id)
    .limit(1)

  if (jobErr || !jobs || jobs.length === 0) {
    return jsonResponse({ error: 'Job not found' }, 404)
  }

  const job = jobs[0]

  if (job.status === 'completed') {
    return jsonResponse({ status: 'completed', completed_count: job.completed_count })
  }

  // Calculate which words still need processing
  const allWords: WordEntry[] = job.words || []
  const existingResults: DictEntry[] = job.results || []
  const existingFailed: string[] = job.failed_words || []
  const processedWords = new Set([
    ...existingResults.map((r) => r.word),
    ...existingFailed,
  ])
  const remaining = allWords.filter((w) => !processedWords.has(w.word))

  if (remaining.length === 0) {
    await updateJob(client, job_id, {
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    return jsonResponse({ status: 'completed', completed_count: job.completed_count })
  }

  // Process next batch (~30 words per invocation)
  const batchWords = remaining.slice(0, BATCH_SIZE * CONCURRENCY)

  await updateJob(client, job_id, {
    status: 'processing',
    updated_at: new Date().toISOString(),
  })

  // Pass 1: Batch processing with primary model
  const pass1Results = await runBatches(client, batchWords, BATCH_SIZE, CONCURRENCY, AI_MODEL)

  const succeeded: DictEntry[] = []
  const failedForRetry: WordEntry[] = []

  for (const result of pass1Results) {
    if (isFailed(result)) {
      const original = batchWords.find((w) => w.word === result.word)
      if (original) failedForRetry.push(original)
    } else {
      succeeded.push(result)
    }
  }

  // Pass 2: Individual retry with primary model
  if (failedForRetry.length > 0) {
    const pass2Results = await runBatches(client, failedForRetry, 1, RETRY_CONCURRENCY, AI_MODEL)
    const stillFailed: WordEntry[] = []

    for (const result of pass2Results) {
      if (isFailed(result)) {
        const original = failedForRetry.find((w) => w.word === result.word)
        if (original) stillFailed.push(original)
      } else {
        succeeded.push(result)
      }
    }

    // Pass 3: Fallback model
    if (stillFailed.length > 0) {
      const pass3Results = await runBatches(client, stillFailed, 1, RETRY_CONCURRENCY, FALLBACK_MODEL)
      for (const result of pass3Results) {
        if (isFailed(result)) {
          existingFailed.push(result.word)
        } else {
          succeeded.push(result)
        }
      }
    }
  }

  // Save successful word entries to word_entries table
  if (succeeded.length > 0 && job.user_id) {
    const rows = succeeded.map((entry) => ({
      user_id: job.user_id,
      word: entry.word,
      phonetic: entry.phonetic,
      pos: entry.pos,
      meaning: entry.meaning,
      example: entry.example,
      example_annotated: entry.exampleAnnotated || [],
      example_cn: entry.exampleCn,
    }))

    await client.database
      .from('word_entries')
      .upsert(rows, { onConflict: 'user_id,word' })
  }

  // Update job with new results
  const allResults = [...existingResults, ...succeeded]
  const newRemaining = allWords.filter((w) =>
    !allResults.some((r) => r.word === w.word)
    && !existingFailed.includes(w.word)
  )

  const isComplete = newRemaining.length === 0
  await updateJob(client, job_id, {
    status: isComplete ? 'completed' : 'processing',
    results: allResults,
    failed_words: existingFailed,
    completed_count: allResults.length,
    failed_count: existingFailed.length,
    batch_index: job.batch_index + 1,
    updated_at: new Date().toISOString(),
  })

  return jsonResponse({
    status: isComplete ? 'completed' : 'processing',
    completed_count: allResults.length,
    failed_count: existingFailed.length,
    remaining: newRemaining.length,
  })
}

// --- AI Processing ---

async function runBatches(
  client: ReturnType<typeof createClient>,
  wordEntries: WordEntry[],
  batchSize: number,
  concurrency: number,
  model: string,
): Promise<DictEntry[]> {
  const batches: WordEntry[][] = []
  for (let i = 0; i < wordEntries.length; i += batchSize) {
    batches.push(wordEntries.slice(i, i + batchSize))
  }

  const results: DictEntry[] = []
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency)
    const waveResults = await Promise.all(
      wave.map((batch) => processBatchSafe(client, batch, model))
    )
    results.push(...waveResults.flat())
  }
  return results
}

async function processBatchSafe(
  client: ReturnType<typeof createClient>,
  batch: WordEntry[],
  model: string,
): Promise<DictEntry[]> {
  try {
    return await processBatch(client, batch, model)
  } catch {
    return batch.map((entry) => ({
      word: entry.word,
      phonetic: '',
      pos: '',
      meaning: '(生成失败)',
      example: entry.sentence || '',
      exampleAnnotated: [],
      exampleCn: '',
    }))
  }
}

async function processBatch(
  client: ReturnType<typeof createClient>,
  wordEntries: WordEntry[],
  model: string,
): Promise<DictEntry[]> {
  const wordList = wordEntries
    .map((entry) => {
      const sentenceInfo = entry.sentence ? `（原文例句：${entry.sentence}）` : ''
      return `${entry.word}${sentenceInfo}`
    })
    .join('\n')

  const prompt = `你是一个专业的英语词典编辑。请为以下每个英语单词提供：音标、词性、中文意思、例句、例句中文翻译。

要求：
1. 音标用国际音标，格式如 /ˈselɪbreɪt/
2. 每个单词只给出一个最常用的词性，用缩写：n. v. adj. adv. prep. conj. pron. 等
3. 中文意思简洁准确，只对应所给词性
4. 例句要求：
   - 如果提供了原文例句且不超过10个词，直接使用原文例句
   - 如果原文例句超过10个词，请根据该单词重新造一个简短（不超过10个词）、通顺的例句
   - 如果没有提供原文例句，请造一个简短的例句
5. 例句的中文翻译要自然流畅

请严格按照以下JSON数组格式输出，不要输出任何其他内容：
[
  {
    "word": "celebrate",
    "phonetic": "/ˈselɪbreɪt/",
    "pos": "v.",
    "meaning": "庆祝",
    "example": "We celebrate this festival in April.",
    "exampleCn": "我们在四月庆祝这个节日。"
  }
]

单词列表：
${wordList}`

  const completion = await client.ai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 2500,
  })

  const content = completion.choices[0].message.content
  return parseAIResponse(content, wordEntries)
}

function parseAIResponse(content: string, wordEntries: WordEntry[]): DictEntry[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    return fallbackEntries(wordEntries)
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return parsed.map((item: Record<string, unknown>) => ({
      word: (item.word as string) || '',
      phonetic: (item.phonetic as string) || '',
      pos: (item.pos as string) || '',
      meaning: (item.meaning as string) || '',
      example: (item.example as string) || '',
      exampleAnnotated: annotateExample((item.example as string) || ''),
      exampleCn: (item.exampleCn as string) || '',
    }))
  } catch {
    return fallbackEntries(wordEntries)
  }
}

function fallbackEntries(wordEntries: WordEntry[]): DictEntry[] {
  return wordEntries.map((entry) => ({
    word: entry.word,
    phonetic: '',
    pos: '',
    meaning: '',
    example: entry.sentence || '',
    exampleAnnotated: [],
    exampleCn: '',
  }))
}

async function updateJob(
  client: ReturnType<typeof createClient>,
  jobId: string,
  updates: Record<string, unknown>,
) {
  await client.database
    .from('extraction_jobs')
    .update(updates)
    .eq('id', jobId)
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
