/**
 * 아이템 특성 — 일반·희귀 아이템에 상점 진열마다 무작위로 하나 붙는 작은 규칙.
 *
 * 영웅·전설 아이템의 고유 특성(passives.ts)이 문장 구조를 바꾼다면, 이 특성은
 * "어떤 덱으로 갈지"를 슬쩍 밀어 주는 방향 표지다. 같은 감정 카드를 모으거나,
 * 공격·방어·회복 중 하나에 집중하거나, 관용구를 노리는 덱이 각자 보상을 받는다.
 * 값은 등급으로만 정해지므로 저장에는 특성 id만 남긴다.
 */

import type { CompileMods, Emotion, Rarity } from './types'
import { currentLocale, type LocaleCode } from '@/localization'

export type ItemTraitId =
  | 'inkMax' // 매 문장 잉크 최대치 +
  | 'extraDraw' // 전투마다 카드 뽑기 +
  | 'angerScore' // 분노 카드 1장마다 문장 수치 +
  | 'joyScore'
  | 'sorrowScore'
  | 'pleasureScore'
  | 'poolBonus' // 배율 풀 +
  | 'attackFlat' // 공격 문장 수치 +
  | 'guardFlat' // 방어 문장 수치 +
  | 'healFlat' // 회복 문장 수치 +
  | 'resonanceBoost' // 감정 공명이 일어나면 공명 배율 +
  | 'comboBoost' // 관용구가 발동하면 배율 ×

export const ITEM_TRAIT_IDS: readonly ItemTraitId[] = [
  'inkMax', 'extraDraw', 'angerScore', 'joyScore', 'sorrowScore', 'pleasureScore',
  'poolBonus', 'attackFlat', 'guardFlat', 'healFlat', 'resonanceBoost', 'comboBoost',
]

/** 특성이 붙는 등급. 영웅·전설은 고유 특성(passive)을 쓴다. */
export function rarityHasRandomTrait(rarity: Rarity | undefined): boolean {
  return rarity === 'common' || rarity === 'rare'
}

/** 일반 / 희귀 값. 희귀는 같은 특성이 조금 더 세다. */
const TRAIT_VALUE: Record<ItemTraitId, [number, number]> = {
  inkMax: [1, 1],
  extraDraw: [1, 2],
  angerScore: [1, 2],
  joyScore: [1, 2],
  sorrowScore: [1, 2],
  pleasureScore: [1, 2],
  poolBonus: [0.1, 0.15],
  attackFlat: [1, 2],
  guardFlat: [1, 2],
  healFlat: [1, 2],
  resonanceBoost: [0.1, 0.15],
  comboBoost: [0.1, 0.15],
}

export function itemTraitValue(id: ItemTraitId, rarity: Rarity | undefined): number {
  return TRAIT_VALUE[id][rarity === 'rare' ? 1 : 0]
}

export function isItemTraitId(value: unknown): value is ItemTraitId {
  return typeof value === 'string' && (ITEM_TRAIT_IDS as readonly string[]).includes(value)
}

/**
 * 진열 씨앗과 아이템 id로 특성을 고른다. 같은 상점을 새로고침(페이지)해도 같은 특성이
 * 보이고, 상점을 새로 펼치거나 다음 클리어가 되면 다시 굴린다.
 */
export function rollItemTrait(itemId: string, rarity: Rarity | undefined, seed: number): ItemTraitId | undefined {
  if (!rarityHasRandomTrait(rarity)) return undefined
  let h = (Math.floor(seed) ^ 0x7f4a7c15) >>> 0
  for (const ch of itemId) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  return ITEM_TRAIT_IDS[h % ITEM_TRAIT_IDS.length]
}

interface TraitOwner { rarity?: Rarity; trait?: ItemTraitId }

function sumTrait(items: readonly TraitOwner[] | undefined, id: ItemTraitId): number {
  return (items ?? []).reduce((sum, item) => sum + (item.trait === id ? itemTraitValue(id, item.rarity) : 0), 0)
}

export function traitInkBonus(items: readonly TraitOwner[] | undefined): number {
  return sumTrait(items, 'inkMax')
}

export function traitExtraDraws(items: readonly TraitOwner[] | undefined): number {
  return sumTrait(items, 'extraDraw')
}

/** 보유 아이템 특성 → 컴파일러 수정자 일부. */
export function traitMods(items: readonly TraitOwner[] | undefined): Pick<CompileMods, 'traitEmotionFlat' | 'traitPool' | 'traitKindFlat' | 'traitResonance' | 'traitCombo'> {
  const emotionFlat: Partial<Record<Emotion, number>> = {}
  for (const [id, emotion] of [['angerScore', 'anger'], ['joyScore', 'joy'], ['sorrowScore', 'sorrow'], ['pleasureScore', 'pleasure']] as const) {
    const value = sumTrait(items, id)
    if (value) emotionFlat[emotion] = value
  }
  return {
    traitEmotionFlat: emotionFlat,
    traitPool: sumTrait(items, 'poolBonus'),
    traitKindFlat: { damage: sumTrait(items, 'attackFlat'), guard: sumTrait(items, 'guardFlat'), heal: sumTrait(items, 'healFlat') },
    traitResonance: sumTrait(items, 'resonanceBoost'),
    traitCombo: sumTrait(items, 'comboBoost'),
  }
}

type TraitText = Record<ItemTraitId, [name: string, desc: string]>

const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, ''))

/** {v}는 등급 값으로 바뀐다. 이름은 한 단어 태그처럼 짧게 유지한다. */
const TRAIT_TEXT: Record<LocaleCode, TraitText> = {
  ko: {
    inkMax: ['넉넉한 잉크', '매 문장 잉크 최대치 +{v}'],
    extraDraw: ['한 장 더', '전투마다 카드 뽑기 +{v}회'],
    angerScore: ['분노 집필', '분노 카드마다 점수 +{v}'],
    joyScore: ['기쁨 집필', '기쁨 카드마다 점수 +{v}'],
    sorrowScore: ['슬픔 집필', '슬픔 카드마다 점수 +{v}'],
    pleasureScore: ['즐거움 집필', '즐거움 카드마다 점수 +{v}'],
    poolBonus: ['배율', '모든 문장 배율 풀 +{v}'],
    attackFlat: ['공격 집필', '공격 문장 점수 +{v}'],
    guardFlat: ['방어 집필', '방어 문장 점수 +{v}'],
    healFlat: ['회복 집필', '회복 문장 점수 +{v}'],
    resonanceBoost: ['공명', '감정 공명이 일어나면 공명 배율 +{v}'],
    comboBoost: ['관용구', '관용구가 발동하면 배율 ×{m}'],
  },
  en: {
    inkMax: ['Spare Ink', 'Max Ink +{v} for every sentence'],
    extraDraw: ['One More', 'Card draws +{v} each battle'],
    angerScore: ['Anger Focus', '+{v} sentence score per Anger card'],
    joyScore: ['Joy Focus', '+{v} sentence score per Joy card'],
    sorrowScore: ['Sorrow Focus', '+{v} sentence score per Sorrow card'],
    pleasureScore: ['Pleasure Focus', '+{v} sentence score per Pleasure card'],
    poolBonus: ['Multiplier', 'Multiplier pool +{v} for every sentence'],
    attackFlat: ['Attack Focus', 'Attack sentence score +{v}'],
    guardFlat: ['Guard Focus', 'Guard sentence score +{v}'],
    healFlat: ['Heal Focus', 'Heal sentence score +{v}'],
    resonanceBoost: ['Resonance', 'Emotion resonance multiplier +{v}'],
    comboBoost: ['Idiom', 'Multiplier ×{m} when an idiom triggers'],
  },
  ja: {
    inkMax: ['たっぷりインク', '文ごとの最大インク+{v}'],
    extraDraw: ['もう一枚', '戦闘ごとのドロー+{v}回'],
    angerScore: ['怒りの筆', '怒りカード1枚ごとに文の数値+{v}'],
    joyScore: ['喜びの筆', '喜びカード1枚ごとに文の数値+{v}'],
    sorrowScore: ['悲しみの筆', '悲しみカード1枚ごとに文の数値+{v}'],
    pleasureScore: ['楽しさの筆', '楽しさカード1枚ごとに文の数値+{v}'],
    poolBonus: ['倍率', 'すべての文の倍率プール+{v}'],
    attackFlat: ['攻撃の筆', '攻撃の文の数値+{v}'],
    guardFlat: ['防御の筆', '防御の文の数値+{v}'],
    healFlat: ['回復の筆', '回復の文の数値+{v}'],
    resonanceBoost: ['共鳴', '感情共鳴の倍率+{v}'],
    comboBoost: ['慣用句', '慣用句が発動すると倍率×{m}'],
  },
  ru: {
    inkMax: ['Запас чернил', 'Максимум чернил каждой фразы +{v}'],
    extraDraw: ['Ещё одна', 'Добор карт +{v} в каждом бою'],
    angerScore: ['Перо гнева', '+{v} к фразе за каждую карту Гнева'],
    joyScore: ['Перо радости', '+{v} к фразе за каждую карту Радости'],
    sorrowScore: ['Перо печали', '+{v} к фразе за каждую карту Печали'],
    pleasureScore: ['Перо веселья', '+{v} к фразе за каждую карту Веселья'],
    poolBonus: ['Множитель', 'Пул множителя каждой фразы +{v}'],
    attackFlat: ['Атака', 'Фразы атаки +{v}'],
    guardFlat: ['Защита', 'Фразы защиты +{v}'],
    healFlat: ['Лечение', 'Фразы лечения +{v}'],
    resonanceBoost: ['Резонанс', 'Множитель резонанса эмоций +{v}'],
    comboBoost: ['Идиома', 'Множитель ×{m}, когда срабатывает идиома'],
  },
  'zh-Hans': {
    inkMax: ['充足墨水', '每句最大墨水+{v}'],
    extraDraw: ['再来一张', '每场战斗抽牌+{v}次'],
    angerScore: ['愤怒之笔', '每张愤怒卡使句子数值+{v}'],
    joyScore: ['喜悦之笔', '每张喜悦卡使句子数值+{v}'],
    sorrowScore: ['悲伤之笔', '每张悲伤卡使句子数值+{v}'],
    pleasureScore: ['快乐之笔', '每张快乐卡使句子数值+{v}'],
    poolBonus: ['倍率', '所有句子倍率池+{v}'],
    attackFlat: ['攻击之笔', '攻击句子数值+{v}'],
    guardFlat: ['防御之笔', '防御句子数值+{v}'],
    healFlat: ['回复之笔', '回复句子数值+{v}'],
    resonanceBoost: ['共鸣', '情绪共鸣倍率+{v}'],
    comboBoost: ['惯用语', '惯用语发动时倍率×{m}'],
  },
  'zh-Hant': {
    inkMax: ['充足墨水', '每句最大墨水+{v}'],
    extraDraw: ['再來一張', '每場戰鬥抽牌+{v}次'],
    angerScore: ['憤怒之筆', '每張憤怒卡使句子數值+{v}'],
    joyScore: ['喜悅之筆', '每張喜悅卡使句子數值+{v}'],
    sorrowScore: ['悲傷之筆', '每張悲傷卡使句子數值+{v}'],
    pleasureScore: ['快樂之筆', '每張快樂卡使句子數值+{v}'],
    poolBonus: ['倍率', '所有句子倍率池+{v}'],
    attackFlat: ['攻擊之筆', '攻擊句子數值+{v}'],
    guardFlat: ['防禦之筆', '防禦句子數值+{v}'],
    healFlat: ['回復之筆', '回復句子數值+{v}'],
    resonanceBoost: ['共鳴', '情緒共鳴倍率+{v}'],
    comboBoost: ['慣用語', '慣用語發動時倍率×{m}'],
  },
}

export function itemTraitText(id: ItemTraitId, rarity: Rarity | undefined, locale: LocaleCode = currentLocale): { name: string; desc: string } {
  const [name, desc] = (TRAIT_TEXT[locale] ?? TRAIT_TEXT.en)[id]
  const value = itemTraitValue(id, rarity)
  return { name, desc: desc.replace('{v}', fmt(value)).replace('{m}', fmt(1 + value)) }
}

/** 특성 라벨(모든 언어 공통 UI 문구). */
export const TRAIT_LABEL: Record<LocaleCode, string> = {
  ko: '특성', en: 'Trait', ja: '特性', ru: 'Черта', 'zh-Hans': '特性', 'zh-Hant': '特性',
}
