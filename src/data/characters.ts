import { SPRITES } from '@/assets'

export interface CharacterVisualDef {
  id: 'player' | 'moth' | 'roach'
  name: string
  model3d: string | null
  portrait2d: string
  title: string
  description: string
}

// 전장의 3D 모델과 상세 화면의 2D 스프라이트를 한 곳에서 1:1로 연결한다.
// 모델 에셋이 준비되기 전에는 model3d를 null로 두고 portrait2d를 전장에도 쓴다.
export const CHARACTER_VISUALS: Record<CharacterVisualDef['id'], CharacterVisualDef> = {
  player: {
    id: 'player',
    name: '우비 아이',
    model3d: null,
    portrait2d: SPRITES.player_001,
    title: '이야기를 지키는 소년',
    description: '비에 젖은 일기장을 품고, 올바른 문장으로 이야기를 지켜낸다.',
  },
  moth: {
    id: 'moth',
    name: '좀나방',
    model3d: null,
    portrait2d: SPRITES.enemy_moth,
    title: '책장을 갉는 날개',
    description: '가벼운 날갯짓으로 문장의 가장자리부터 빠르게 먹어 치운다.',
  },
  roach: {
    id: 'roach',
    name: '바퀴벌레',
    model3d: null,
    portrait2d: SPRITES.enemy_roach,
    title: '문장 사이의 단단한 얼룩',
    description: '두꺼운 껍질로 버티며 일기장 깊숙한 곳까지 파고든다.',
  },
}
