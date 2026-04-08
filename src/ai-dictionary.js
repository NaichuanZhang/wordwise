import { insforge } from './insforge-client.js'

const AI_MODEL = 'deepseek/deepseek-v3.2'
const BATCH_SIZE = 10
const CONCURRENCY = 3

export async function generateDictionaryEntries(wordEntries, onProgress) {
  const batches = []
  for (let i = 0; i < wordEntries.length; i += BATCH_SIZE) {
    batches.push(wordEntries.slice(i, i + BATCH_SIZE))
  }

  const results = []
  let completed = 0

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const wave = batches.slice(i, i + CONCURRENCY)
    const waveResults = await Promise.all(wave.map(processBatchSafe))
    results.push(...waveResults.flat())
    completed += wave.length
    if (onProgress) {
      onProgress(completed, batches.length, results.length, wordEntries.length)
    }
  }

  return results
}

async function processBatchSafe(batch) {
  try {
    return await processBatch(batch)
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

async function processBatch(wordEntries) {
  const wordList = wordEntries
    .map((entry) => {
      const sentenceInfo = entry.sentence
        ? `（原文例句：${entry.sentence}）`
        : ''
      return `${entry.word}${sentenceInfo}`
    })
    .join('\n')

  const prompt = `你是一个专业的英语词典编辑。请为以下每个英语单词提供：音标、词性、中文意思、例句、例句中每个词的音标、例句中文翻译。

要求：
1. 音标用国际音标，格式如 /ˈselɪbreɪt/
2. 每个单词只给出一个最常用的词性，用缩写：n. v. adj. adv. prep. conj. pron. 等
3. 中文意思简洁准确，只对应所给词性
4. 例句要求：
   - 如果提供了原文例句且不超过10个词，直接使用原文例句
   - 如果原文例句超过10个词，请根据该单词重新造一个简短（不超过10个词）、通顺的例句
   - 如果没有提供原文例句，请造一个简短的例句
5. exampleAnnotated：将例句中的每个英文单词标注音标，格式为对象数组，每个对象包含 word 和 phonetic
6. 例句的中文翻译要自然流畅

请严格按照以下JSON数组格式输出，不要输出任何其他内容：
[
  {
    "word": "celebrate",
    "phonetic": "/ˈselɪbreɪt/",
    "pos": "v.",
    "meaning": "庆祝",
    "example": "We celebrate this festival in April.",
    "exampleAnnotated": [
      {"word": "We", "phonetic": "/wiː/"},
      {"word": "celebrate", "phonetic": "/ˈselɪbreɪt/"},
      {"word": "this", "phonetic": "/ðɪs/"},
      {"word": "festival", "phonetic": "/ˈfestɪvl/"},
      {"word": "in", "phonetic": "/ɪn/"},
      {"word": "April.", "phonetic": "/ˈeɪprəl/"}
    ],
    "exampleCn": "我们在四月庆祝这个节日。"
  }
]

单词列表：
${wordList}`

  const completion = await insforge.ai.chat.completions.create({
    model: AI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 4000,
  })

  const content = completion.choices[0].message.content
  return parseAIResponse(content, wordEntries)
}

function parseAIResponse(content, wordEntries) {
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    return fallbackEntries(wordEntries)
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return parsed.map((item) => ({
      word: item.word || '',
      phonetic: item.phonetic || '',
      pos: item.pos || '',
      meaning: item.meaning || '',
      example: item.example || '',
      exampleAnnotated: Array.isArray(item.exampleAnnotated) ? item.exampleAnnotated : [],
      exampleCn: item.exampleCn || '',
    }))
  } catch {
    return fallbackEntries(wordEntries)
  }
}

function fallbackEntries(wordEntries) {
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
