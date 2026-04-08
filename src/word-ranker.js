const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must', 'can', 'could', 'need', 'dare', 'ought', 'used',
  'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose',
  'where', 'when', 'why', 'how',
  'and', 'but', 'or', 'nor', 'not', 'no', 'so', 'if', 'then', 'than',
  'too', 'very', 'just', 'also', 'only', 'even', 'still', 'already',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'out', 'off', 'over', 'under', 'again', 'further',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'any', 'many', 'much', 'own', 'same',
  'here', 'there', 'now', 'then', 'once', 'always', 'never',
  'yes', 'no', 'ok', 'well',
  'get', 'got', 'go', 'went', 'gone', 'come', 'came',
  'say', 'said', 'tell', 'told', 'ask', 'asked',
  'make', 'made', 'take', 'took', 'taken', 'give', 'gave', 'given',
  'see', 'saw', 'seen', 'know', 'knew', 'known', 'think', 'thought',
  'look', 'like', 'want', 'let', 'put',
  'don', 'doesn', 'didn', 'won', 'wouldn', 'shouldn', 'couldn', 'isn', 'aren',
  'wasn', 'weren', 'hasn', 'haven', 'hadn',
])

// Common basic words that most learners already know — excluded from difficulty ranking
const BASIC_WORDS = new Set([
  'hello', 'hi', 'bye', 'please', 'thank', 'thanks', 'sorry',
  'big', 'small', 'good', 'bad', 'new', 'old', 'long', 'short',
  'man', 'woman', 'boy', 'girl', 'child', 'people', 'friend',
  'day', 'night', 'time', 'year', 'week', 'month',
  'house', 'home', 'room', 'door', 'window',
  'water', 'food', 'eat', 'drink', 'sleep',
  'red', 'blue', 'green', 'white', 'black',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'first', 'second', 'third', 'last', 'next',
  'hand', 'head', 'eye', 'face', 'body',
  'name', 'work', 'school', 'book', 'read', 'write',
  'play', 'run', 'walk', 'sit', 'stand', 'open', 'close',
  'love', 'help', 'try', 'use', 'find', 'found',
  'call', 'keep', 'begin', 'show', 'hear', 'turn', 'start', 'move',
  'live', 'feel', 'set', 'end', 'world', 'life',
  'back', 'way', 'part', 'place', 'right', 'left',
  'city', 'country', 'thing', 'lot',
])

// Higher difficulty words — common in exams but challenging for learners
const DIFFICULTY_BOOST = new Set([
  'achieve', 'achievement', 'admire', 'advantage', 'advertisement',
  'ancient', 'announce', 'anxiety', 'appreciate', 'approach',
  'atmosphere', 'attempt', 'authority', 'available',
  'behavior', 'benefit', 'burden',
  'campaign', 'challenge', 'characteristic', 'circumstance', 'civilization',
  'commercial', 'communicate', 'community', 'competition', 'concern',
  'conclusion', 'confidence', 'conflict', 'consequence', 'conservation',
  'considerable', 'contribute', 'convenient', 'convince', 'cooperation',
  'correspond', 'criticism', 'curiosity', 'custom',
  'decade', 'decision', 'declaration', 'demonstrate', 'depression',
  'determine', 'development', 'disappoint', 'discipline', 'discovery',
  'distinguish', 'donate', 'drought',
  'economy', 'effective', 'embarrass', 'emergency', 'emotion',
  'emphasis', 'employ', 'encourage', 'environment', 'establish',
  'evaluate', 'evidence', 'evolution', 'examination', 'excellence',
  'exchange', 'exhibit', 'existence', 'expectation', 'experience',
  'experiment', 'explanation', 'exploration', 'expression', 'extraordinary',
  'fascinate', 'flexible', 'fortunate', 'fundamental',
  'generation', 'generous', 'government', 'guarantee', 'guidance',
  'harmony', 'hesitate', 'highlight',
  'identify', 'ignorance', 'illustrate', 'imagination', 'immediate',
  'impression', 'independence', 'indicate', 'individual', 'influence',
  'innocent', 'innovation', 'inspiration', 'intelligence', 'interpret',
  'investigate', 'involve',
  'journalist', 'judgment',
  'kindergarten', 'knowledge',
  'landscape', 'literature',
  'magnificent', 'manufacture', 'meanwhile', 'measure', 'minority',
  'motivation', 'mysterious',
  'negotiate', 'nevertheless', 'numerous',
  'objective', 'observation', 'occupation', 'opponent', 'opportunity',
  'ordinary', 'organization', 'overcome',
  'participate', 'particular', 'patience', 'percentage', 'permanent',
  'permission', 'personality', 'perspective', 'phenomenon', 'philosophy',
  'physical', 'pollution', 'population', 'possession', 'potential',
  'poverty', 'precious', 'prediction', 'preference', 'prejudice',
  'preparation', 'preservation', 'previous', 'principle', 'privilege',
  'procedure', 'profession', 'profit', 'progress', 'prohibit',
  'promote', 'proportion', 'protection', 'psychology', 'punishment',
  'qualify', 'quantity',
  'recognize', 'recommend', 'recovery', 'reduce', 'reference',
  'reflection', 'regulation', 'relationship', 'relevant', 'religion',
  'remarkable', 'reputation', 'requirement', 'research', 'resident',
  'resource', 'responsibility', 'revolution', 'sacrifice',
  'satisfaction', 'scholarship', 'significance', 'situation', 'solution',
  'sophisticated', 'specific', 'stimulate', 'strategy', 'strengthen',
  'structure', 'substitute', 'sufficient', 'suggestion', 'summarize',
  'supplement', 'surrounding', 'survive', 'sympathy', 'systematic',
  'technique', 'technology', 'temporary', 'territory', 'tradition',
  'transform', 'transportation', 'tremendous',
  'ultimately', 'unconscious', 'unemployment', 'unfortunately', 'universe',
  'valuable', 'variety', 'vehicle', 'veteran', 'violence', 'virtual',
  'volunteer', 'vulnerable',
  'widespread', 'wilderness',
])

export function rankWords(words) {
  const wordCounts = new Map()
  for (const word of words) {
    if (word.length < 3) continue
    if (STOP_WORDS.has(word)) continue
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
  }

  const scored = []
  for (const [word, count] of wordCounts) {
    let score = 0

    // Longer words tend to be harder
    score += Math.min(word.length * 2, 20)

    // Words with common difficult suffixes
    if (/tion$|sion$|ment$|ness$|ence$|ance$|ible$|able$|ious$|eous$|ful$|less$|ity$|ive$|ous$/.test(word)) {
      score += 10
    }

    // Words with common difficult prefixes
    if (/^un|^dis|^mis|^over|^under|^re|^pre|^inter|^trans/.test(word)) {
      score += 5
    }

    // Known difficult words get a boost
    if (DIFFICULTY_BOOST.has(word)) {
      score += 25
    }

    // Very basic words get penalized
    if (BASIC_WORDS.has(word)) {
      score -= 30
    }

    // Less frequent in the document = likely harder
    if (count === 1) {
      score += 5
    }

    scored.push({ word, score, count })
  }

  return scored.sort((a, b) => b.score - a.score)
}

export function getTopWords(rankedWords, limit = 100) {
  return rankedWords.slice(0, limit).map((item) => item.word)
}

export function aggregateFrequencies(allRankedWords) {
  const freqMap = new Map()
  for (const item of allRankedWords) {
    freqMap.set(item.word, (freqMap.get(item.word) || 0) + item.count)
  }

  return [...freqMap.entries()]
    .map(([word, totalFrequency]) => ({ word, totalFrequency }))
    .sort((a, b) => b.totalFrequency - a.totalFrequency)
}

export function findExampleSentence(word, sentences) {
  const regex = new RegExp(`\\b${word}\\b`, 'i')
  for (const sentence of sentences) {
    if (regex.test(sentence)) {
      return sentence
    }
  }
  return ''
}
