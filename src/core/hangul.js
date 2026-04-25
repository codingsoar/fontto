/**
 * hangul.js — 한글 유니코드 분해/조합 유틸리티
 *
 * 한글 음절 범위: U+AC00 (가) ~ U+D7A3 (힣)
 * 음절 = (초성 × 21 + 중성) × 28 + 종성 + 0xAC00
 */

// ── 초성 (19개) ──
export const CHO = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'
];

// ── 중성 (21개) ──
export const JUNG = [
  'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ',
  'ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'
];

// ── 종성 (28개, 0='없음') ──
export const JONG = [
  '','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ',
  'ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'
];

// ── 기본 14자음 (사용자가 실제 그리는 자음) ──
export const BASIC_CONSONANTS = [
  'ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'
];

// ── 기본 10모음 (사용자가 실제 그리는 모음) ──
export const BASIC_VOWELS = [
  'ㅏ','ㅑ','ㅓ','ㅕ','ㅗ','ㅛ','ㅜ','ㅠ','ㅡ','ㅣ'
];

// ── 모음 분류 ──
export const VERTICAL_VOWELS   = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅣ'];
export const HORIZONTAL_VOWELS = ['ㅗ','ㅛ','ㅜ','ㅠ','ㅡ'];
export const COMPLEX_VOWELS    = ['ㅘ','ㅙ','ㅚ','ㅝ','ㅞ','ㅟ','ㅢ'];

// ── 쌍자음 매핑 (기본자음 → 쌍자음) ──
export const DOUBLE_CONSONANT_MAP = {
  'ㄱ': 'ㄲ', 'ㄷ': 'ㄸ', 'ㅂ': 'ㅃ', 'ㅅ': 'ㅆ', 'ㅈ': 'ㅉ'
};

// ── 복합모음 파생 매핑 (기본모음 조합 → 복합모음) ──
export const COMPOUND_VOWEL_MAP = {
  'ㅐ': ['ㅏ','ㅣ'],
  'ㅒ': ['ㅑ','ㅣ'],
  'ㅔ': ['ㅓ','ㅣ'],
  'ㅖ': ['ㅕ','ㅣ'],
  'ㅘ': ['ㅗ','ㅏ'],
  'ㅙ': ['ㅗ','ㅏ','ㅣ'],
  'ㅚ': ['ㅗ','ㅣ'],
  'ㅝ': ['ㅜ','ㅓ'],
  'ㅞ': ['ㅜ','ㅓ','ㅣ'],
  'ㅟ': ['ㅜ','ㅣ'],
  'ㅢ': ['ㅡ','ㅣ']
};

// ── 겹받침 파생 매핑 ──
export const COMPOUND_JONG_MAP = {
  'ㄲ': ['ㄱ','ㄱ'],
  'ㄳ': ['ㄱ','ㅅ'],
  'ㄵ': ['ㄴ','ㅈ'],
  'ㄶ': ['ㄴ','ㅎ'],
  'ㄺ': ['ㄹ','ㄱ'],
  'ㄻ': ['ㄹ','ㅁ'],
  'ㄼ': ['ㄹ','ㅂ'],
  'ㄽ': ['ㄹ','ㅅ'],
  'ㄾ': ['ㄹ','ㅌ'],
  'ㄿ': ['ㄹ','ㅍ'],
  'ㅀ': ['ㄹ','ㅎ'],
  'ㅄ': ['ㅂ','ㅅ'],
  'ㅆ': ['ㅅ','ㅅ'],
};

export const COMPOUND_JONG_CLUSTERS = ['ㄳ', 'ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ'];

const SYLLABLE_START = 0xAC00;
const SYLLABLE_END   = 0xD7A3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

/**
 * 한글 음절을 초성/중성/종성 인덱스로 분해
 * @param {string} char — 한글 1글자
 * @returns {{cho:number, jung:number, jong:number}|null}
 */
export function decompose(char) {
  const code = char.charCodeAt(0);
  if (code < SYLLABLE_START || code > SYLLABLE_END) return null;

  const offset = code - SYLLABLE_START;
  const cho  = Math.floor(offset / (JUNG_COUNT * JONG_COUNT));
  const jung = Math.floor((offset % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT);
  const jong = offset % JONG_COUNT;

  return { cho, jung, jong };
}

/**
 * 초성/중성/종성 인덱스로 한글 음절 조합
 * @param {number} cho  — 초성 인덱스 (0~18)
 * @param {number} jung — 중성 인덱스 (0~20)
 * @param {number} jong — 종성 인덱스 (0~27, 0=없음)
 * @returns {string} 한글 1글자
 */
export function compose(cho, jung, jong = 0) {
  const code = SYLLABLE_START + (cho * JUNG_COUNT + jung) * JONG_COUNT + jong;
  return String.fromCharCode(code);
}

/**
 * 모음 방향 분류
 * @param {number} jungIdx — 중성 인덱스
 * @returns {'vertical'|'horizontal'|'complex'}
 */
export function getVowelCategory(jungIdx) {
  const vowel = JUNG[jungIdx];
  if (VERTICAL_VOWELS.includes(vowel))   return 'vertical';
  if (HORIZONTAL_VOWELS.includes(vowel)) return 'horizontal';
  return 'complex';
}

/**
 * 음절 블록 레이아웃 타입 결정 (1~8)
 * @param {number} jungIdx — 중성 인덱스
 * @param {number} jongIdx — 종성 인덱스 (0=없음)
 * @returns {number} 1~8
 */
export function getBlockType(jungIdx, jongIdx) {
  const cat = getVowelCategory(jungIdx);
  const hasBatchim = jongIdx > 0;

  if (cat === 'vertical'   && !hasBatchim) return 1;
  if (cat === 'vertical'   &&  hasBatchim) return 2;
  if (cat === 'horizontal' && !hasBatchim) return 3;
  if (cat === 'horizontal' &&  hasBatchim) return 4;
  if (cat === 'complex'    && !hasBatchim) return 5;
  if (cat === 'complex'    &&  hasBatchim) return 6;
  return 1; // fallback
}

/**
 * 초성 인덱스에서 기본 14자음 중 어떤 것인지, 또는 쌍자음인지 판별
 * @param {number} choIdx
 * @returns {{base:string, isDouble:boolean}}
 */
export function getChoInfo(choIdx) {
  const ch = CHO[choIdx];
  // 쌍자음 역매핑
  for (const [base, double] of Object.entries(DOUBLE_CONSONANT_MAP)) {
    if (double === ch) return { base, isDouble: true };
  }
  return { base: ch, isDouble: false };
}

/**
 * 중성 인덱스에서 기본 10모음인지, 복합모음인지 판별
 * @param {number} jungIdx
 * @returns {{base:string, isCompound:boolean, components:string[]|null}}
 */
export function getJungInfo(jungIdx) {
  const v = JUNG[jungIdx];
  if (BASIC_VOWELS.includes(v)) return { base: v, isCompound: false, components: null };
  const comps = COMPOUND_VOWEL_MAP[v];
  return { base: v, isCompound: true, components: comps || null };
}

/**
 * 종성 인덱스에서 기본 14자음인지, 겹받침인지 판별
 * @param {number} jongIdx
 * @returns {{base:string, isCompound:boolean, components:string[]|null}|null}
 */
export function getJongInfo(jongIdx) {
  if (jongIdx === 0) return null; // 종성 없음
  const ch = JONG[jongIdx];
  const comps = COMPOUND_JONG_MAP[ch];
  if (comps) return { base: ch, isCompound: true, components: comps };
  return { base: ch, isCompound: false, components: null };
}

/**
 * 초성의 맥락 키 결정 (jamoLibrary에서 조회할 키)
 * @param {number} choIdx
 * @param {number} jungIdx
 * @returns {string} 예: 'cho_v_ㄱ' (세로모음용), 'cho_h_ㄱ' (가로모음용)
 */
export function getChoKey(choIdx, jungIdx) {
  const cat = getVowelCategory(jungIdx);
  const info = getChoInfo(choIdx);
  const suffix = (cat === 'vertical') ? 'v' : 'h';
  return `cho_${suffix}_${info.base}`;
}

/**
 * 중성의 맥락 키 결정
 * @param {number} jungIdx
 * @param {number} jongIdx
 * @returns {string} 예: 'jung_nb_ㅏ' (받침없음), 'jung_wb_ㅏ' (받침있음)
 */
export function getJungKey(jungIdx, jongIdx) {
  const v = JUNG[jungIdx];
  const hasBatchim = jongIdx > 0;
  const suffix = hasBatchim ? 'wb' : 'nb';
  // 복합모음의 경우 기본 모음들의 키를 사용
  if (BASIC_VOWELS.includes(v)) {
    return `jung_${suffix}_${v}`;
  }
  return `jung_${suffix}_${v}`; // 복합모음도 같은 패턴
}

/**
 * 종성의 맥락 키 결정
 * @param {number} jongIdx
 * @returns {string|null} 예: 'jong_ㄱ'
 */
export function getJongKey(jongIdx) {
  if (jongIdx === 0) return null;
  const ch = JONG[jongIdx];
  return `jong_${ch}`;
}

// 전체 음절 수
export const TOTAL_SYLLABLES = 11172;
