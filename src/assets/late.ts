import enemyWorkerBeeModel from './models/enemy_worker_bee.glb?url'
import bossQueenBeeModel from './models/boss_queen_bee.glb?url'
import bossElderSpiderModel from './models/boss_elder_spider.glb?url'
import enemyWorkerBee from './sprites/enemy_worker_bee.webp'
import bossQueenBee from './sprites/boss_queen_bee.webp'
import bossElderSpider from './sprites/boss_elder_spider.webp'
import bossQueenBeeBgm from './audio/boss-queen-bee.mp3'
import bossElderSpiderBgm from './audio/boss-elder-spider.mp3'

export const LATE_ASSETS = {
  models: {
    enemy_worker_bee: enemyWorkerBeeModel,
    boss_queen_bee: bossQueenBeeModel,
    boss_elder_spider: bossElderSpiderModel,
  },
  sprites: {
    enemy_worker_bee: enemyWorkerBee,
    boss_queen_bee: bossQueenBee,
    boss_elder_spider: bossElderSpider,
  },
  audio: { bossQueenBeeBgm, bossElderSpiderBgm },
} as const
