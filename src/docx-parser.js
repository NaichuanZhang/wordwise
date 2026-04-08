import mammoth from 'mammoth'

export async function parseDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

export function extractSentences(text) {
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const sentencePattern = /[A-Z][^.!?]*[.!?]/g
  const matches = cleaned.match(sentencePattern) || []

  return matches
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4)
}

export function extractEnglishWords(text) {
  const wordPattern = /\b[a-zA-Z]{2,}\b/g
  const matches = text.match(wordPattern) || []
  return matches.map((w) => w.toLowerCase())
}
