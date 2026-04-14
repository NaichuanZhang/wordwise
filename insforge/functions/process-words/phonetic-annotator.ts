// Phonetic dictionary for annotating example sentences in the edge function.
// Uses CMU Pronouncing Dictionary (ARPABET) converted to IPA.

import cmuModule from 'npm:cmu-pronouncing-dictionary'
import { toIPA } from 'npm:arpabet-and-ipa-convertor-ts'

interface AnnotatedWord {
  word: string
  phonetic: string
}

let ipaDict: Map<string, string> | null = null

function getIpaDict(): Map<string, string> {
  if (ipaDict) return ipaDict

  const cmuDict: Record<string, string> = cmuModule.dictionary ?? cmuModule
  ipaDict = new Map()

  for (const [word, arpabet] of Object.entries(cmuDict)) {
    try {
      const rawIpa = toIPA(arpabet)
      const ipa = fixSchwa(arpabet, rawIpa)
      ipaDict.set(word, `/${ipa}/`)
    } catch {
      // Skip entries that fail conversion
    }
  }

  return ipaDict
}

// The converter maps all AH → ʌ, but unstressed AH (AH0) should be ə (schwa).
function fixSchwa(arpabet: string, ipa: string): string {
  const phones = arpabet.split(' ')
  let result = ipa
  let searchFrom = 0

  for (const phone of phones) {
    if (phone === 'AH0') {
      const idx = result.indexOf('ʌ', searchFrom)
      if (idx !== -1) {
        result = result.slice(0, idx) + 'ə' + result.slice(idx + 1)
        searchFrom = idx + 1
      }
    } else if (phone.startsWith('AH')) {
      const idx = result.indexOf('ʌ', searchFrom)
      if (idx !== -1) {
        searchFrom = idx + 1
      }
    }
  }

  return result
}

const PUNCTUATION_RE = /^[^a-zA-Z]+|[^a-zA-Z]+$/g

function stripPunctuation(word: string): string {
  return word.replace(PUNCTUATION_RE, '')
}

export function annotateExample(sentence: string): AnnotatedWord[] {
  if (!sentence) return []

  const dict = getIpaDict()
  const words = sentence.split(/\s+/).filter((w) => w.length > 0)

  return words.map((originalWord) => {
    const cleaned = stripPunctuation(originalWord).toLowerCase()
    const phonetic = dict.get(cleaned) || ''
    return { word: originalWord, phonetic }
  })
}
