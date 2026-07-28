import { currentLocale, type LocaleCode } from './index'

type ForeignLocale = Exclude<LocaleCode, 'ko'>
type Row = readonly [ko: string, en: string, ja: string, ru: string, zhHans: string, zhHant: string]

const ROWS: Row[] = [
  ['전투 상태','Battle status','戦闘状態','Состояние боя','战斗状态','戰鬥狀態'],
  ['보상','Reward','報酬','Награда','奖励','獎勵'], ['주인공 상태','Hero status','主人公の状態','Состояние героя','主角状态','主角狀態'],
  ['이번 문장','This sentence','今回の文','Эта фраза','本句','本句'], ['행동 순서','Action order','行動順','Порядок действий','行动顺序','行動順序'],
  ['문장 행동','Sentence action','文の行動','Действие фразы','句子行动','句子行動'], ['선공','First strike','先攻','Первый ход','先攻','先攻'], ['후공','Second strike','後攻','Второй ход','后攻','後攻'], ['레일 대기','Waiting','待機中','Ожидание','等待中','等待中'],
  ['시스템 메뉴','System menu','システムメニュー','Системное меню','系统菜单','系統選單'], ['설정','Settings','設定','Настройки','设置','設定'], ['그림일기 도감','Picture-diary codex','絵日記図鑑','Альбом-дневник','图画日记图鉴','圖畫日記圖鑑'], ['홈으로','Home','ホームへ','Домой','返回主页','返回主頁'],
  ['문장 조립 단계','Sentence steps','文の組み立て','Этапы фразы','句子组装步骤','句子組裝步驟'], ['주어','Subject','主語','Подлежащее','主语','主語'], ['수식','Modifier','修飾','Модификатор','修饰','修飾'], ['동사','Verb','動詞','Глагол','动词','動詞'],
  ['단어 카드 선택 영역','Word card area','単語カード選択','Выбор карт слов','词语卡选择区','詞語卡選擇區'], ['현재 손패','Current hand','現在の手札','Текущая рука','当前手牌','目前手牌'], ['카드 뽑기','Draw card','カードを引く','Взять карту','抽卡','抽卡'], ['남은 카드 없음','No cards left','残りカードなし','Карт не осталось','没有剩余卡牌','沒有剩餘卡牌'],
  ['그림일기','Picture diary','絵日記','Дневник','图画日记','圖畫日記'], ['감정','Emotion','感情','Эмоция','情绪','情緒'],
  ['토큰이 알려 줄게!','Token will show you!','トークンが教えるよ！','Токен всё объяснит!','让托肯告诉你！','讓托肯告訴你！'], ['멋진 문장을 쓰는 법','How to write a great sentence','すてきな文の書き方','Как написать отличную фразу','写出精彩句子的方法','寫出精彩句子的方法'],
  ['맥락','Context','文脈','Контекст','语境','語境'], ['공명','Resonance','共鳴','Резонанс','共鸣','共鳴'], ['문맥에 맞는 멋진 단어를 만들면 보너스!','Match words to the context for a bonus!','文脈に合う言葉でボーナス！','Подбирайте слова по контексту и получайте бонус!','搭配符合语境的词语即可获得奖励！','搭配符合語境的詞語即可獲得獎勵！'], ['같은 감정을 모아 증폭시키면 보너스!','Gather matching emotions to amplify them!','同じ感情を集めて増幅！','Собирайте одинаковые эмоции для усиления!','聚集相同情绪即可增强！','聚集相同情緒即可增強！'], ['다양한 동사로 다채로운 동작을!','Use different verbs for different actions!','動詞を変えて多彩な行動！','Разные глаголы — разные действия!','用不同动词施展丰富行动！','用不同動詞施展豐富行動！'], ['초과 데미지는 짜릿한 오버킬을 선사!','Excess damage becomes a thrilling overkill!','余剰ダメージで爽快オーバーキル！','Лишний урон превращается в эффектный оверкилл!','溢出伤害会带来爽快的过量击杀！','溢出傷害會帶來爽快的過量擊殺！'], ['전투 도움말 열기','Open battle help','戦闘ヘルプを開く','Открыть справку боя','打开战斗帮助','開啟戰鬥說明'],
  ['오늘의 보상등급','Today’s reward grade','今日の報酬等級','Уровень награды','今日奖励等级','今日獎勵等級'], ['보상 받지 않기','Skip reward','報酬を受け取らない','Пропустить награду','跳过奖励','跳過獎勵'], ['자세히보기','Details','詳細','Подробнее','详情','詳情'], ['고르기 →','Choose →','選ぶ →','Выбрать →','选择 →','選擇 →'], ['새 단어','New word','新しい言葉','Новое слово','新词语','新詞語'], ['아이템','Item','アイテム','Предмет','道具','道具'],
  ['제련할 아이템','Item to forge','鍛えるアイテム','Предмет для ковки','待锻造道具','待鍛造道具'], ['제련 스탯','Forge stats','鍛錬能力','Параметры ковки','锻造属性','鍛造屬性'], ['제련 완료','Forge complete','鍛錬完了','Ковка завершена','锻造完成','鍛造完成'], ['세 마디의 힘이 아이템에 새겨졌다','The power of three words was forged into the item','三つの言葉の力が刻まれた','Сила трёх слов вплавлена в предмет','三句话的力量已刻入道具','三句話的力量已刻入道具'], ['제련 문장','Forge sentence','鍛錬の文','Фраза ковки','锻造句子','鍛造句子'], ['세 마디를 골라 아이템에 힘을 새긴다','Choose three words to forge power into the item','三つの言葉で力を刻む','Выберите три слова и вложите силу в предмет','选择三句话，将力量刻入道具','選擇三句話，將力量刻入道具'], ['등급 보너스 +1점','Rarity bonus +1','等級ボーナス +1','Бонус редкости +1','稀有度奖励 +1','稀有度獎勵 +1'],
  ['새 일기 시작','Start a new diary','新しい日記を始める','Начать новый дневник','开始新日记','開始新日記'], ['타이틀로','To title','タイトルへ','В главное меню','返回标题','返回標題'], ['계속 쓰기','Keep writing','書き続ける','Продолжить писать','继续书写','繼續書寫'],
  ['닫기','Close','閉じる','Закрыть','关闭','關閉'], ['강화하면','After upgrade','強化すると','После усиления','强化后','強化後'], ['전체','All','全体','Все','全部','全部'],
  ['전투 도움말 닫기','Close battle help','戦闘ヘルプを閉じる','Закрыть справку боя','关闭战斗帮助','關閉戰鬥說明'],
  ['보상등급 — 오래 끌면 내려가고, 한 턴에 쓸어담으면 오른다','Reward grade — falls in long battles and rises when you sweep a turn','報酬等級 — 長期戦で下がり、1ターンで一掃すると上がる','Уровень награды — падает в долгом бою и растёт за зачистку за ход','奖励等级——战斗拖久会下降，一回合清场则上升','獎勵等級——戰鬥拖久會下降，一回合清場則上升'],
  ['이번 문장 행동 순서','Action order for this sentence','今回の文の行動順','Порядок действий этой фразы','本句行动顺序','本句行動順序'],
  ['보유 아이템','Owned items','所持アイテム','Предметы','持有道具','持有道具'],
  ['끝나지 않은 이야기','The unfinished story','終わらない物語','Незаконченная история','未完的故事','未完的故事'],
  ['멋진 문장을 쓰는 법','How to write a great sentence','すてきな文の書き方','Как написать отличную фразу','写出精彩句子的方法','寫出精彩句子的方法'],
  ['문맥에 맞는 멋진 단어를 만들면','Match words to the context for a','文脈に合う言葉で','Подберите слова по контексту —','搭配符合语境的词语即可获得','搭配符合語境的詞語即可獲得'],
  ['같은 감정을 모아 증폭시키면','Gather matching emotions for a','同じ感情を集めて増幅すると','Соберите одинаковые эмоции —','聚集相同情绪并增强即可获得','聚集相同情緒並增強即可獲得'],
  ['다양한 동사로 다채로운 동작을!','Use different verbs for different actions!','動詞を変えて多彩な行動！','Разные глаголы — разные действия!','用不同动词施展丰富行动！','用不同動詞施展豐富行動！'],
  ['초과 데미지는 짜릿한 오버킬을 선사!','Excess damage becomes a thrilling overkill!','余剰ダメージで爽快オーバーキル！','Лишний урон превращается в эффектный оверкилл!','溢出伤害会带来爽快的过量击杀！','溢出傷害會帶來爽快的過量擊殺！'],
  ['보너스!','bonus!','ボーナス！','бонус!','奖励！','獎勵！'],
  ['고유 기본','Innate','固有','Базовый','固有','固有'],
  ['영향 스탯','Affected stats','影響ステータス','Зависит от','影响属性','影響屬性'],
  ['스탯은 오르지 않는다. 문장 규칙이 바뀐다.','No stats gained. Changes a sentence rule.','能力値は上がらず、文のルールが変わる。','Не повышает параметры, но меняет правило фразы.','不提升属性，而是改变句子规则。','不提升屬性，而是改變句子規則。'],
  ['제련 문장을 조립해 추가 스탯이 붙는다.','Build a forging sentence to add stats.','鍛錬の文を組み立てて能力値を追加する。','Составьте фразу ковки, чтобы добавить параметры.','组装锻造句子以获得额外属性。','組裝鍛造句子以獲得額外屬性。'],
  ['제련 문장으로 스탯을 더할 수 있다','Stats can be added with a forging sentence','鍛錬の文で能力値を追加できる','Параметры можно добавить фразой ковки','可通过锻造句子增加属性','可透過鍛造句子增加屬性'],
  ['주어와 수식어를 고르자','Choose a subject and modifier','主語と修飾語を選ぼう','Выберите подлежащее и модификатор','选择主语和修饰语','選擇主語和修飾語'],
  ['이야기의 소품을 고르자','Choose a prop for the story','物語の小道具を選ぼう','Выберите предмет для истории','选择故事中的道具','選擇故事中的道具'],
  ['마지막 동사를 고르자','Choose the final verb','最後の動詞を選ぼう','Выберите последний глагол','选择最后的动词','選擇最後的動詞'],
  ['이번 단계의 보상을 받지 않고 넘어갑니다','Skip this reward step','この段階の報酬を受け取らず進みます','Пропустить награду этого этапа','跳过本阶段的奖励','跳過本階段的獎勵'],
  ['문장부호','Punctuation','句読点','Знак препинания','标点','標點'], ['카드','Card','カード','Карта','卡牌','卡牌'], ['행동','Action','行動','Действие','行动','行動'], ['배율','Multiplier','倍率','Множитель','倍率','倍率'], ['개',' items','個',' шт.','个','個'], ['종',' types','種',' видов','种','種'],
  ['쓰러진 장로거미','Fallen Elder Spider','倒れた長老蜘蛛','Павший Старый паук','倒下的长老蜘蛛','倒下的長老蜘蛛'], ['고개를 떨군 토큰','Downcast Token','うなだれたトークン','Поникший Токен','垂头丧气的托肯','垂頭喪氣的托肯'], ['나팔을 부는 토큰','Trumpeting Token','ラッパを吹くトークン','Токен с трубой','吹响号角的托肯','吹響號角的托肯'],
  ['그래픽 품질','Graphics quality','グラフィック品質','Качество графики','画面质量','畫面品質'], ['해상도 배율','Resolution scale','解像度倍率','Масштаб разрешения','分辨率倍率','解析度倍率'], ['최대 FPS','Maximum FPS','最大FPS','Максимальный FPS','最大帧率','最大幀率'], ['이펙트 품질','Effects quality','エフェクト品質','Качество эффектов','特效质量','特效品質'], ['후처리 품질','Post-processing quality','ポストプロセス品質','Качество постобработки','后期处理质量','後製品質'], ['안티앨리어싱 품질','Anti-aliasing quality','アンチエイリアス品質','Качество сглаживания','抗锯齿质量','反鋸齒品質'], ['마스터 볼륨','Master volume','マスター音量','Общая громкость','主音量','主音量'],
  ['카드의','Select','カードの','Нажмите','点击卡牌的','點擊卡牌的'],
  ['를 누르면','to see','を押すと','на карточке, чтобы увидеть','即可查看','即可查看'],
  ['효과·확률·영향 스탯이 여기 표시된다.','effects, odds, and affected stats here.','効果・確率・影響する能力値をここに表示。','эффекты, шансы и связанные параметры.','效果、概率和影响属性。','效果、機率和影響屬性。'],
  ['쾅!','BAM!','ドン！','БАХ!','砰！','砰！'], ['등급','Rarity','等級','Редкость','稀有度','稀有度'],
  ['새 단어','New word','新しい言葉','Новое слово','新词语','新詞語'], ['단계','Level','段階','Уровень','等级','等級'],
  ['위력','Power','威力','Сила','威力','威力'], ['공격','Attack','攻撃','Атака','攻击','攻擊'], ['방어','Guard','防御','Защита','防御','防禦'], ['회복','Heal','回復','Лечение','恢复','恢復'], ['체력','HP','体力','Здоровье','生命','生命'], ['운','Luck','運','Удача','幸运','幸運'], ['계수','Scaling','係数','Коэффициент','系数','係數'], ['카운터','Counter','カウンター','Контратака','反击','反擊'],
  ['일기장이 너무 상했다…','The diary is too damaged…','日記が傷みすぎた…','Дневник слишком повреждён…','日记损坏得太严重了……','日記損壞得太嚴重了……'],
  ['이번 일기는 여기까지. 새 페이지에서 다시 이야기를 지켜 보자.','This diary ends here. Let’s protect the story again on a new page.','今回の日記はここまで。新しいページでもう一度物語を守ろう。','Эта запись окончена. Защитим историю снова на новой странице.','这本日记就写到这里。让我们在新的一页再次守护故事。','這本日記就寫到這裡。讓我們在新的一頁再次守護故事。'],
  ['이야기를 지켜 냈다!','The story is safe!','物語を守り抜いた！','История спасена!','守住故事了！','守住故事了！'],
  ['마지막 몸','Final condition','最後の状態','Итоговое состояние','最终状态','最終狀態'], ['갉아 낸 벌레','Bugs defeated','倒した虫','Побеждено жуков','消灭的虫子','消滅的蟲子'], ['주워 담은 것','Items collected','拾ったもの','Собрано предметов','拾取的物品','拾取的物品'],
  ['마지막 장','Final page','最後のページ','Последняя страница','最后一页','最後一頁'], ['고쳐 쓴 결말','A rewritten ending','書き直した結末','Переписанный финал','改写的结局','改寫的結局'],
  ['나를 갉아먹은 것','What consumed me','ぼくを蝕んだもの','Что меня погубило','吞噬我的东西','吞噬我的東西'], ['알 수 없는 무엇','Something unknown','正体不明の何か','Нечто неизвестное','未知之物','未知之物'], ['내가 쓴 문장','My own sentence','ぼくが書いた文','Моя фраза','我写下的句子','我寫下的句子'], ['사인','Cause','原因','Причина','原因','原因'],
  ['한 마리도 못 잡았다.','Not a single bug was defeated.','一匹も倒せなかった。','Не удалось победить ни одного жука.','一只虫子也没消灭。','一隻蟲子也沒消滅。'], ['아무것도 줍지 못했다.','Nothing was collected.','何も拾えなかった。','Ничего не собрано.','什么也没捡到。','什麼也沒撿到。'],
  ['넘긴 날','Days cleared','越えた日','Пройдено дней','完成天数','完成天數'], ['쓴 문장','Sentences written','書いた文','Написано фраз','写下的句子','寫下的句子'], ['최고 배율','Best multiplier','最高倍率','Лучший множитель','最高倍率','最高倍率'], ['최고 관통','Best pierce','最大貫通','Лучшее пробитие','最高贯通','最高貫通'], ['가장 센 한 방','Strongest hit','最大の一撃','Сильнейший удар','最强一击','最強一擊'],
  ['엔딩 진행','Ending progress','エンディング進行','Ход финала','结局进度','結局進度'], ['엔드리스 모드 시작','Start Endless mode','エンドレスモード開始','Начать бесконечный режим','开始无尽模式','開始無盡模式'], ['다음 장','Next page','次のページ','Следующая страница','下一页','下一頁'],
  ['여는 맥락','Combos opened','開く文脈','Доступные сочетания','可触发语境','可觸發語境'], ['짝이 될 카드가 아직 없다','No matching card yet','組み合わせるカードがまだない','Подходящей карты пока нет','还没有可搭配的卡牌','還沒有可搭配的卡牌'], ['이 카드만으로','This card alone','このカードだけで','Только этой картой','仅凭此卡','僅憑此卡'], ['지금 발동 중','Active now','発動中','Сейчас активно','正在触发','正在觸發'],
  ['문장에 넣기','Add to sentence','文に入れる','Добавить во фразу','加入句子','加入句子'], ['대사 단어 선택','Dialogue word choice','台詞の単語選択','Выбор слов реплики','选择台词词语','選擇台詞詞語'], ['선택','Select','選択','Выбрать','选择','選擇'],
  ['주인공 이름','Hero name','主人公の名前','Имя героя','主角姓名','主角姓名'], ['최대 HP','Max HP','最大HP','Макс. здоровье','最大生命','最大生命'], ['이 늘어난다',' increases','が上がる',' повышается','提升','提升'], ['문장의 피해가 커진다','sentence damage increases','文のダメージが上がる','увеличивает урон фразы','句子伤害提升','句子傷害提升'], ['임시 HP','temporary HP','一時HP','временное здоровье','临时生命','臨時生命'], ['수치가 커진다','value increases','の値が上がる','увеличивает значение','数值提升','數值提升'], ['량이 커진다',' amount increases','量が上がる',' усиливается','量提升','量提升'],
  ['보상등급의 시작·최저치를 올린다 · 도박 보정','raises the starting and minimum reward grade · improves gambles','報酬等級の開始値・最低値を上げる · ギャンブル補正','повышает начальный и минимальный уровень награды · усиливает азартные эффекты','提高奖励等级的初始值与最低值 · 强化赌博效果','提高獎勵等級的初始值與最低值 · 強化賭博效果'],
  ['과 도우미',' and helper ','と相棒',' и помощник ','与助手','與助手'], ['상세 보기',' details','の詳細',' — подробнее','详情','詳情'], ['불가','unavailable','不可','недоступно','不可用','不可用'], ['아끼면','save it for','温存すると','сохранить для','保留可获得','保留可獲得'],
  ['다양한','Use different','さまざまな','Разные','使用不同的','使用不同的'], ['로 다채로운 동작을!',' for different actions!','で多彩な行動！',' — разные действия!','施展丰富行动！','施展豐富行動！'], ['초과 데미지는','Excess damage becomes','余剰ダメージで','Лишний урон даёт','溢出伤害会带来','溢出傷害會帶來'], ['짜릿한 오버킬을 선사!','a thrilling overkill!','爽快オーバーキル！','эффектный оверкилл!','爽快的过量击杀！','爽快的過量擊殺！'], ['게임 버전','Game version','ゲームバージョン','Версия игры','游戏版本','遊戲版本'],
  ['다채로운 동작','different actions','多彩な行動','разные действия','丰富行动','豐富行動'], ['을!','!','！','!','！','！'], ['짜릿한','a thrilling','爽快な','эффектный','爽快的','爽快的'], ['오버킬','overkill','オーバーキル','оверкилл','过量击杀','過量擊殺'], ['을 선사!','!','！','!','！','！'],
  ['로',' for ','で',' — ','来','來'], ['RewardRarity','reward grade','報酬等級','уровень награды','奖励等级','獎勵等級'],
  ['지금 배율','Current multiplier','現在の倍率','Текущий множитель','当前倍率','目前倍率'], ['깡 점수','Base score','基礎点','Базовые очки','基础分','基礎分'], ['배율 누적','Multiplier stack','倍率の累積','Накопление множителя','倍率累积','倍率累積'], ['배율 풀','Multiplier pool','倍率プール','Пул множителя','倍率池','倍率池'], ['도박','Gamble','ギャンブル','Азарт','赌博','賭博'], ['이 단어 적용','This word','この単語','Это слово','本词语','本詞語'], ['문장 최종','Sentence total','文の最終値','Итог фразы','句子最终值','句子最終值'], ['피해','Damage','ダメージ','Урон','伤害','傷害'], ['실드','Shield','シールド','Щит','护盾','護盾'],
  ['그림일기 · 전투 설명서','Picture diary · Battle guide','絵日記 · 戦闘説明書','Дневник · Руководство по бою','图画日记 · 战斗指南','圖畫日記 · 戰鬥指南'], ['오늘의 전투는 이렇게 쓴다','How to write today’s battle','今日の戦いはこう書く','Как записать сегодняшний бой','今天的战斗这样书写','今天的戰鬥這樣書寫'], ['단어 카드를 이어 문장 하나를 완성하면, 그 문장이 그대로 이번 턴의 행동이 된다.','Connect word cards into a sentence; that sentence becomes this turn’s action.','単語カードで文を完成させると、その文が今回の行動になる。','Соедините карты слов во фразу — она станет действием этого хода.','连接词语卡组成句子，该句子就是本回合行动。','連接詞語卡組成句子，該句子就是本回合行動。'], ['여기 적힌 수치는 모두 지금 돌아가는 전투 규칙에서 그대로 읽어 온 값이다.','Every value shown here comes directly from the current battle rules.','ここに示す数値は現在の戦闘ルールから直接読み取っている。','Все значения здесь берутся прямо из действующих правил боя.','这里的所有数值均直接读取当前战斗规则。','這裡的所有數值均直接讀取目前戰鬥規則。'], ['로비로 돌아가기','Back to lobby','ロビーへ戻る','Вернуться в меню','返回大厅','返回大廳'], ['설명서 차례','Guide contents','説明書の目次','Содержание руководства','指南目录','指南目錄'],
  ['토큰','Token','トークン','Токен','托肯','托肯'], ['프롬','From','フロム','Фром','弗洛姆','弗洛姆'],
  ['어서 일어나!','Wake up!','早く起きて！','Просыпайся!','快醒醒！','快醒醒！'], ['. . . 여긴 어디야?','. . . Where am I?','. . . ここはどこ？','. . . Где я?','. . . 这里是哪里？','. . . 這裡是哪裡？'],
  ['이런... 설마 또 기억을 잃은 거야?','Oh no... Did you lose your memory again?','まさか…また記憶をなくしたの？','О нет... Ты снова потерял память?','不会吧……你又失忆了吗？','不會吧……你又失憶了嗎？'],
  ['기억을 잃다니 무슨 소리야.','What do you mean, lost my memory?','記憶をなくしたって、どういうこと？','Что значит — потерял память?','失忆是什么意思？','失憶是什麼意思？'],
  ['젠장... 또 이야기를 빼앗겼다니!','Darn... They stole the story again!','くそっ…また物語を奪われた！','Вот же... Историю снова украли!','可恶……故事又被抢走了！','可惡……故事又被搶走了！'], ['괜찮아...','It’s okay...','大丈夫…','Всё хорошо...','没关系……','沒關係……'],
  ['다시 되찾을 수 있으니까. 매번 그래왔잖아 그치?','We can take it back. We always do, right?','また取り戻せるよ。いつもそうしてきたでしょ？','Мы вернём её. У нас всегда получалось, правда?','我们还能夺回来。每次都做到了，对吧？','我們還能奪回來。每次都做到了，對吧？'],
  ['아무것도 기억이 안 나.','I don’t remember anything.','何も思い出せない。','Я ничего не помню.','我什么都不记得。','我什麼都不記得。'], ['내가 다시 차근차근 알려줄게.','I’ll teach you again, one step at a time.','ぼくがまた一つずつ教えるよ。','Я снова всё объясню, шаг за шагом.','我会再一步步教你。','我會再一步步教你。'], ['우린 최고의 파트너니까!','Because we’re the best partners!','ぼくらは最高の相棒だから！','Ведь мы лучшие напарники!','因为我们是最棒的搭档！','因為我們是最棒的搭檔！'],
  ['같은 색 감정을 모으면 강력한 힘이 나가!','Gather emotions of the same color to unleash great power!','同じ色の感情を集めると強い力が出るよ！','Собирай эмоции одного цвета — и высвободишь огромную силу!','聚集同色的情绪，就能释放强大的力量！','聚集同色的情緒，就能釋放強大的力量！'], ['우선 눈 앞에 이야기를 좀먹는 녀석들을 처리해야해!','First, deal with those bugs eating the story!','まずは目の前で物語を蝕むやつらを片づけよう！','Сначала разберёмся с теми, кто пожирает историю!','先解决眼前这些啃食故事的家伙！','先解決眼前這些啃食故事的傢伙！'], ['그게 누군데?','Who are they?','それって誰？','Кто это?','那是谁？','那是誰？'],
  ['거미줄이 끊어졌다.','The web snapped.','蜘蛛の糸が切れた。','Паутина порвалась.','蛛网断裂了。','蛛網斷裂了。'], ['이야기는 지켜 냈어.','The story is safe.','物語は守った。','История спасена.','故事守住了。','故事守住了。'], ['하지만 이야기는 계속된다.','But the story continues.','けれど物語は続く。','Но история продолжается.','但故事仍将继续。','但故事仍將繼續。'],
  ['마지막 장 · 고쳐 쓴 결말','Final page · A rewritten ending','最後のページ · 書き直した結末','Последняя страница · Переписанный финал','最后一页 · 改写的结局','最後一頁 · 改寫的結局'], ['그리고, 맑아진 여백','And then, the cleared margin','そして、晴れた余白','И вот — чистые поля','然后，重归清澈的留白','然後，重歸清澈的留白'], ['ENDLESS · 새로운 한 권','ENDLESS · A new volume','ENDLESS · 新しい一冊','ENDLESS · Новый том','ENDLESS · 新的一卷','ENDLESS · 新的一卷'],
  ['장로거미가 고쳐 쓰던 문장은 멈췄다. 프롬은 찢어진 페이지를 한 장씩 펴서, 자신의 글씨로 결말을 다시 잇는다.','The Elder Spider’s rewriting stopped. From smooths each torn page and reconnects the ending in his own hand.','長老グモが書き換えていた文は止まった。フロムは破れたページを一枚ずつ広げ、自分の字で結末をつなぎ直す。','Старый паук больше не переписывает фразы. Фром разглаживает порванные страницы и собственноручно восстанавливает финал.','长老蜘蛛篡改的句子停了下来。弗洛姆逐页铺平破损的纸张，用自己的笔迹重新续写结局。','長老蜘蛛篡改的句子停了下來。弗洛姆逐頁鋪平破損的紙張，用自己的筆跡重新續寫結局。'],
  ['토큰이 되찾은 문장 위를 환하게 맴돈다. 끝이라고 적은 자리 너머에도, 아직 쓰지 않은 페이지가 바람에 팔랑인다.','Token circles brightly above the recovered sentence. Beyond the word “End,” unwritten pages flutter in the wind.','トークンは取り戻した文の上を明るく舞う。「終わり」と書いた先でも、まだ白いページが風に揺れている。','Токен сияет над возвращённой фразой. За словом «Конец» на ветру шелестят ещё не написанные страницы.','托肯在夺回的句子上方明亮地盘旋。即使越过写着“完”的地方，尚未落笔的书页仍在风中翻飞。','托肯在奪回的句子上方明亮地盤旋。即使越過寫著「完」的地方，尚未落筆的書頁仍在風中翻飛。'],
  ['15층의 이야기를 마쳤습니다. 이제 같은 여정을 더 강해진 벌레들과 반복하며, 매 15층마다 한층 높아진 난이도에 도전합니다.','You completed the story’s 15 floors. Repeat the journey against stronger bugs, with the challenge rising every 15 floors.','15階の物語を終えました。さらに強くなった虫たちと旅を繰り返し、15階ごとに上がる難易度へ挑みます。','Вы завершили 15 этажей истории. Повторяйте путь с более сильными жуками — сложность растёт каждые 15 этажей.','你已完成故事的15层。接下来将与更强的虫子重复旅程，每15层迎接更高难度。','你已完成故事的15層。接下來將與更強的蟲子重複旅程，每15層迎接更高難度。'],
  ['상대 행동','Enemy action','敵の行動','Действие врага','敌方行动','敵方行動'], ['본인 캐릭터','Your character','自分のキャラクター','Ваш персонаж','己方角色','己方角色'], ['선수','Preemptive','先手','Опережение','抢先','搶先'], ['선공 빼앗김','Initiative stolen','先攻を奪われた','Инициатива перехвачена','先攻被夺','先攻被奪'], ['추가 대기','More waiting','さらに待機','Ещё в ожидании','更多等待','更多等待'],
  ['방어 필수','Guard required','防御必須','Нужна Защита','需要防御','需要防禦'], ['보스 체력','Boss HP','ボス体力','Здоровье босса','Boss生命','Boss生命'], ['전투 정보','Battle info','戦闘情報','Информация о бое','战斗信息','戰鬥資訊'], ['선공 — 내 문장 직후, 나보다 먼저 때린다','First strike — attacks before my sentence resolves','先攻 — こちらの文より先に攻撃する','Первый ход — атакует до выполнения моей фразы','先攻——在我的句子结算前攻击','先攻——在我的句子結算前攻擊'], ['불안해하며 프롬을 응원하는 토큰','Token anxiously cheering for From','不安そうにフロムを応援するトークン','Токен тревожно болеет за Фрома','焦急为弗洛姆加油的托肯','焦急為弗洛姆加油的托肯'],
  ['방어막 한도: 최대 체력과 같음','Guard limit: equal to Max HP','防御上限：最大体力と同じ','Предел Защиты равен макс. здоровью','防御上限：等同最大生命','防禦上限：等同最大生命'], ['호위','Escort','護衛','Охрана','护卫','護衛'], ['적','Enemy','敵','Враг','敌','敵'], ['약점','Weakness','弱点','Слабость','弱点','弱點'], ['다음 행동','Next action','次の行動','Следующее действие','下一行动','下一行動'], ['공격 단계','Attack stage','攻撃段階','Стадия атаки','攻击阶段','攻擊階段'], ['마법실드','Magic Shield','マジックシールド','Магический щит','魔法盾','魔法盾'], ['매직실드','Magic Shield','マジックシールド','Магический щит','魔法盾','魔法盾'], ['관통','Pierce','貫通','Пробитие','贯通','貫通'], ['거미줄','Web','蜘蛛の糸','Паутина','蛛网','蛛網'], ['그로기','Exposed','グロッキー','Уязвимость','破绽','破綻'], ['막','bar','本','полоса','条','條'], ['태그','tag','タグ','тег','标签','標籤'], ['필요 방어','Required Guard','必要防御','Нужная Защита','所需防御','所需防禦'], ['받는 피해','Damage taken','受けるダメージ','Получаемый урон','受到伤害','受到傷害'], ['약점 없음','No weakness','弱点なし','Нет слабости','无弱点','無弱點'],
  ['준비 효과','Preparation effect','準備効果','Эффект подготовки','准备效果','準備效果'], ['준비','Prepare','準備','Подготовка','准备','準備'], ['선수 · 먼저 움직였다','Preemptive · moved first','先手 · 先に動いた','Опережение · ход первым','抢先 · 优先行动','搶先 · 優先行動'], ['선공 상대 행동','First-strike enemy action','先攻の敵の行動','Действие врага первого хода','先攻敌方行动','先攻敵方行動'], ['적 선공','Enemy first','敵の先攻','Враг ходит первым','敌方先攻','敵方先攻'], ['본인 캐릭터 행동','Your character action','自分の行動','Действие персонажа','己方角色行动','己方角色行動'], ['본행동','Main action','本行動','Основное действие','主要行动','主要行動'], ['후공 상대 행동','Second-strike enemy action','後攻の敵の行動','Действие врага второго хода','后攻敌方行动','後攻敵方行動'], ['적 후공','Enemy second','敵の後攻','Враг ходит вторым','敌方后攻','敵方後攻'], ['단어 완성','Sentence complete','文の完成','Фраза готова','句子完成','句子完成'], ['완성','Complete','完成','Готово','完成','完成'], ['전투 승리','Battle victory','戦闘勝利','Победа','战斗胜利','戰鬥勝利'], ['승리','Victory','勝利','Победа','胜利','勝利'],
  ['다음 기술','Next skill','次の技','Следующий приём','下一技能','下一技能'], ['현재 부위','Current part','現在の部位','Текущая часть','当前部位','目前部位'], ['현재 약점','Current weakness','現在の弱点','Текущая слабость','当前弱点','目前弱點'], ['행동 주기','Action interval','行動周期','Интервал действий','行动周期','行動週期'], ['다음 순서','Next turn order','次の順番','Следующий порядок','下一顺序','下一順序'], ['상세 정보','Details','詳細情報','Подробности','详细信息','詳細資訊'], ['2D 스프라이트','2D sprite','2Dスプライト','2D-спрайт','2D精灵','2D精靈'], ['문장을 조립해 이야기를 올바른 방향으로 이끈다.','Build sentences to guide the story in the right direction.','文を組み立てて物語を正しい方向へ導く。','Составляет фразы и направляет историю по верному пути.','组装句子，引导故事走向正确方向。','組裝句子，引導故事走向正確方向。'],
  ['완벽한 맥락','Perfect context','完璧な文脈','Идеальный контекст','完美语境','完美語境'], ['어긋남','Mismatch','不一致','Несоответствие','不匹配','不匹配'], ['감정 공명','Emotion resonance','感情共鳴','Резонанс эмоций','情绪共鸣','情緒共鳴'], ['같은 감정','Matching emotions','同じ感情','Одинаковые эмоции','相同情绪','相同情緒'], ['거미줄 봉인','Web-sealed','蜘蛛の糸で封印','Запечатано паутиной','蛛网封印','蛛網封印'], ['사용 불가','Unavailable','使用不可','Недоступно','不可使用','不可使用'], ['자해','Self-damage','自傷','Самоурон','自伤','自傷'], ['보유','Owned','所持','В наличии','持有','持有'],
  ['이번 런에서 모은 단어다. 단어를 고르면 옆에 카드 상세가 펼쳐진다.','Words collected this run. Select one to open its card details.','今回のランで集めた言葉。選ぶとカード詳細が開く。','Слова, собранные за этот забег. Выберите слово, чтобы открыть карту.','本次游玩收集的词语。选择词语即可查看卡牌详情。','本次遊玩收集的詞語。選擇詞語即可查看卡牌詳情。'], ['미발견 카드','Undiscovered card','未発見カード','Неизвестная карта','未发现卡牌','未發現卡牌'], ['보상에서 만나면 기록된다.','Recorded after it appears in rewards.','報酬で出会うと記録される。','Записывается после появления в награде.','在奖励中遇到后记录。','在獎勵中遇到後記錄。'], ['이번 런에서 직접 마주친 벌레만 그림일기에 기록됩니다.','Only bugs encountered in this run are recorded.','今回のランで出会った虫だけ記録される。','Записываются только встреченные в этом забеге жуки.','只记录本次游玩中遇到的虫子。','只記錄本次遊玩中遇到的蟲子。'], ['미발견 벌레','Undiscovered bug','未発見の虫','Неизвестный жук','未发现虫子','未發現蟲子'], ['전장에서 만나면 기록된다.','Recorded after an encounter.','戦場で出会うと記録される。','Записывается после встречи в бою.','在战场遇到后记录。','在戰場遇到後記錄。'], ['획득해 감탄 문장을 붙인 소품만 온전한 모습으로 남습니다.','Only acquired items completed with a forging sentence are fully recorded.','入手して鍛錬文を付けた小道具だけ完全に記録される。','Полностью записываются только полученные предметы с фразой ковки.','只有获得并附上锻造句子的道具会完整记录。','只有獲得並附上鍛造句子的道具會完整記錄。'], ['미발견 아이템','Undiscovered item','未発見アイテム','Неизвестный предмет','未发现道具','未發現道具'], ['기록 없음','No record','記録なし','Нет записи','无记录','無紀錄'], ['도감','Codex','図鑑','Альбом','图鉴','圖鑑'], ['도감 분류','Codex categories','図鑑分類','Разделы альбома','图鉴分类','圖鑑分類'], ['현재 내 단어','My current words','現在の言葉','Мои слова','当前词语','目前詞語'], ['카드 도감','Card codex','カード図鑑','Альбом карт','卡牌图鉴','卡牌圖鑑'], ['적 도감','Enemy codex','敵図鑑','Альбом врагов','敌人图鉴','敵人圖鑑'], ['아이템 도감','Item codex','アイテム図鑑','Альбом предметов','道具图鉴','道具圖鑑'], ['내 단어','My words','自分の言葉','Мои слова','我的词语','我的詞語'], ['상세 닫기','Close details','詳細を閉じる','Закрыть подробности','关闭详情','關閉詳情'],
  ['실드 효과','Shield effect','シールド効果','Эффект щита','护盾效果','護盾效果'], ['회복 효과','Healing effect','回復効果','Эффект лечения','恢复效果','恢復效果'], ['맥락 발동','Context activated','文脈発動','Контекст активирован','语境触发','語境觸發'], ['실드 한도','Guard limit','防御上限','Предел Защиты','防御上限','防禦上限'], ['마지막 벌레가 책장 밖으로 떨어졌다.','The last bug fell out of the book.','最後の虫が本の外へ落ちた。','Последний жук выпал из книги.','最后一只虫子掉出了书页。','最後一隻蟲子掉出了書頁。'], ['일벌 호위 · 본체 무적','Worker escort · body invulnerable','働き蜂の護衛 · 本体無敵','Охрана рабочих · тело неуязвимо','工蜂护卫 · 本体无敌','工蜂護衛 · 本體無敵'], ['패배','Defeat','敗北','Поражение','失败','失敗'], ['무럭','Grow','成長','Рост','成长','成長'], ['누댕의 메아리','Patchwork Echo','つぎはぎのこだま','Лоскутное эхо','补丁的回声','補丁的回聲'], ['한 번 더','Once more','もう一度','Ещё раз','再来一次','再來一次'],
  ['한 번에 돌파','Break through at once','一気に突破','Пробитие насквозь','一次突破','一次突破'], ['경계 파괴','Boundary broken','境界破壊','Граница разрушена','边界破坏','邊界破壞'], ['체력 막 파괴!','HP bar broken!','体力ゲージ破壊！','Полоса здоровья разбита!','生命条破坏！','生命條破壞！'], ['약점 파훼!','Weakness solved!','弱点攻略！','Слабость раскрыта!','弱点破解！','弱點破解！'], ['다리 절단! 거미줄 전부 해제!','Leg severed! All webs removed!','脚を切断！蜘蛛の糸を全解除！','Нога отсечена! Вся паутина снята!','腿部斩断！全部蛛网解除！','腿部斬斷！全部蛛網解除！'], ['매직실드 파괴!','Magic Shield broken!','マジックシールド破壊！','Магический щит разбит!','魔法盾破坏！','魔法盾破壞！'], ['카드 뽑기','Card draw','カードドロー','Добор карты','抽卡','抽卡'], ['CLEAR! 보상','CLEAR! Reward','CLEAR! 報酬','ПОБЕДА! Награда','通关！奖励','通關！獎勵'], ['연쇄 관통 → 본체!','Chain pierce → body!','連鎖貫通 → 本体！','Цепное пробитие → тело!','连锁贯通 → 本体！','連鎖貫通 → 本體！'], ['분노 집중!','Focused Anger!','怒り集中！','Фокус Гнева!','愤怒集中！','憤怒集中！'], ['일벌 전멸! 다음 턴 행동 불가!','All workers defeated! Next action skipped!','働き蜂全滅！次の行動不可！','Все рабочие побеждены! Следующее действие пропущено!','工蜂全灭！下一回合无法行动！','工蜂全滅！下一回合無法行動！'], ['지금이 빈틈이에요!!','Now is your chance!!','今がチャンスだよ！！','Сейчас наш шанс!!','现在就是破绽！！','現在就是破綻！！'], ['벌떼 돌격!','Swarm charge!','蜂群突撃！','Атака роя!','蜂群突击！','蜂群突擊！'], ['강공격 준비!','Heavy attack ready!','強攻撃準備！','Подготовка мощной атаки!','强攻准备！','強攻準備！'], ['실드 파괴 · 강공격 취소!','Shield broken · heavy attack canceled!','シールド破壊 · 強攻撃中止！','Щит разбит · мощная атака отменена!','护盾破坏 · 强攻取消！','護盾破壞 · 強攻取消！'], ['그로기!','Exposed!','グロッキー！','Уязвимость!','露出破绽！','露出破綻！'], ['큰낫이 빛난다','The great scythe gleams','大鎌が光る','Большая коса сияет','巨镰闪光','巨鐮閃光'], ['방어 관통','Pierces Guard','防御貫通','Пробивает Защиту','贯通防御','貫通防禦'],
  ['건너뛰기','Skip','スキップ','Пропустить','跳过','跳過'], ['보유 카드','Owned card','所持カード','Карта в колоде','持有卡牌','持有卡牌'], ['이 카드를 버리기','Discard this card','このカードを捨てる','Сбросить эту карту','舍弃此卡','捨棄此卡'], ['새로 들어올 카드','Incoming card','新しく入るカード','Новая карта','即将加入的卡牌','即將加入的卡牌'], ['새 카드','New card','新しいカード','Новая карта','新卡牌','新卡牌'], ['이 카드가 들어옵니다','This card will be added','このカードが入る','Эта карта будет добавлена','将加入此卡','將加入此卡'], ['문법','Grammar','文法','Грамматика','语法','語法'], ['단어장이 가득 찼다','dictionary is full','の辞書がいっぱい','словарь заполнен','词典已满','詞典已滿'], ['한 장을 지우고 새 문장을 쓰자','Erase one card and write a new sentence','一枚消して新しい文を書こう','Уберите одну карту и напишите новую фразу','移除一张卡牌，写下新句子','移除一張卡牌，寫下新句子'], ['오른쪽의 새 카드','The new card on the right','右の新しいカード','Новая карта справа','右侧的新卡牌','右側的新卡牌'], ['를 넣기 위해 현재 보유 카드 중 한 장을 골라 버린다.','requires discarding one currently owned card.','を入れるため、所持カードを一枚選んで捨てる。','требует сбросить одну из текущих карт.','需要舍弃一张当前持有的卡牌。','需要捨棄一張目前持有的卡牌。'], ['버릴 보유 카드 목록','Owned cards to discard','捨てる所持カード一覧','Карты для сброса','可舍弃的持有卡牌','可捨棄的持有卡牌'],
  ['룰렛(맥락 스탯+운)','Roulette (context stat + Luck)','ルーレット（文脈能力値＋運）','Рулетка (параметр контекста + Удача)','轮盘（语境属性＋幸运）','輪盤（語境屬性＋幸運）'], ['고유 기본 스탯','Innate base stats','固有基本能力','Врождённые параметры','固有基础属性','固有基礎屬性'], ['문장','Sentence','文','Фраза','句子','句子'], ['룰렛','Roulette','ルーレット','Рулетка','轮盘','輪盤'],
  ['고개를 떨군 토큰','Downcast Token','うなだれるトークン','Поникший Токен','垂头丧气的托肯','垂頭喪氣的托肯'], ['나팔을 부는 토큰','Trumpeting Token','ラッパを吹くトークン','Токен с трубой','吹号角的托肯','吹號角的托肯'], ['낙서에 먹히던 문장을 끝까지 제 글씨로 되찾았다.','Recovered the devoured sentence to the very end in my own handwriting.','落書きに食われた文を最後まで自分の字で取り戻した。','До конца вернул поглощённую фразу собственным почерком.','用自己的笔迹完整夺回了被涂鸦吞噬的句子。','用自己的筆跡完整奪回了被塗鴉吞噬的句子。'], ['일기장이 스스로 닳아 버렸다.','The diary wore itself away.','日記がひとりでにすり減った。','Дневник истёрся сам собой.','日记自行磨损殆尽。','日記自行磨損殆盡。'], ['제 손으로 쓴 문장이 제 일기장을 깎았다.','My own sentence damaged my diary.','自分で書いた文が自分の日記を削った。','Моя собственная фраза повредила мой дневник.','亲手写下的句子损伤了自己的日记。','親手寫下的句子損傷了自己的日記。'],
  ['거미줄 봉인 · 이번 문장에는 선택할 수 없다','Web-sealed · cannot be chosen for this sentence','蜘蛛の糸で封印 · 今回の文では選べない','Запечатано паутиной · нельзя выбрать для этой фразы','蛛网封印 · 本句无法选择','蛛網封印 · 本句無法選擇'], ['선택 불가','Unavailable','選択不可','Недоступно','无法选择','無法選擇'], ['맥락 충돌','Context conflict','文脈の矛盾','Конфликт контекста','语境冲突','語境衝突'], ['이번 전투 소진','Spent this battle','この戦闘では使用済み','Исчерпано в этом бою','本场战斗已耗尽','本場戰鬥已耗盡'], ['손패 가득','Hand full','手札がいっぱい','Рука заполнена','手牌已满','手牌已滿'], ['남은 카드 없음','No cards left','残りカードなし','Карт не осталось','无剩余卡牌','無剩餘卡牌'], ['남은 뽑기','Draws left','残りドロー','Осталось доборов','剩余抽卡','剩餘抽卡'], ['회 남음',' left','回残り',' осталось','次','次'], ['회남음',' left','回残り',' осталось','次','次'], ['등과',' and others','などと',' и другими','等','等'], ['함께','together','一緒に','вместе','一起','一起'],
]

const INDEX: Record<ForeignLocale, number> = { en: 1, ja: 2, ru: 3, 'zh-Hans': 4, 'zh-Hant': 5 }
const dictionaries = Object.fromEntries(Object.keys(INDEX).map((locale) => [locale, new Map(ROWS.map((row) => [row[0], row[INDEX[locale as ForeignLocale]]]))])) as Record<ForeignLocale, Map<string, string>>
export const missingLocalizationTexts = new Set<string>()

export function translateText(value: string, locale: ForeignLocale): string {
  const dict = dictionaries[locale]
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  const core = value.trim()
  if (core === '한국어') return value
  const direct = dict.get(core)
  if (direct) return `${leading}${direct}${trailing}`

  const codexCount = core.match(/^(카드|적|아이템|내 단어)\s+(\d+)\s*\/\s*(\d+)$/)
  if (codexCount) {
    const label = dict.get(codexCount[1]) ?? codexCount[1]
    return `${leading}${label} ${codexCount[2]} / ${codexCount[3]}${trailing}`
  }

  const emotion = core.match(/^감정:\s*(.+)$/)
  if (emotion) return `${leading}${dict.get('감정')}: ${emotion[1]}${trailing}`
  const day = core.match(/^(\d+)일째$/)
  if (day) return `${leading}${locale === 'ja' ? `${day[1]}日目` : locale === 'ru' ? `День ${day[1]}` : locale.startsWith('zh') ? `第${day[1]}天` : `Day ${day[1]}`}${trailing}`
  const stage = core.match(/^(\d+)스테이지 클리어$/)
  if (stage) return `${leading}${locale === 'ja' ? `ステージ${stage[1]}クリア` : locale === 'ru' ? `Этап ${stage[1]} пройден` : locale.startsWith('zh') ? `第${stage[1]}关完成` : `Stage ${stage[1]} clear`}${trailing}`
  const rewardStep = core.match(/^보상 (\d+)단계 \/ 3단계$/)
  if (rewardStep) return `${leading}${locale === 'ja' ? `報酬 ${rewardStep[1]} / 3段階` : locale === 'ru' ? `Награда: этап ${rewardStep[1]} из 3` : locale.startsWith('zh') ? `奖励第${rewardStep[1]}/3阶段` : `Reward step ${rewardStep[1]} / 3`}${trailing}`
  const numbered = core.match(/^(\d+)번 (.+)$/)
  if (numbered) {
    const label = dict.get(numbered[2]) ?? numbered[2]
    return `${leading}${locale === 'ja' ? `${numbered[1]}番 ${label}` : locale === 'ru' ? `${numbered[1]}. ${label}` : locale.startsWith('zh') ? `第${numbered[1]} ${label}` : `${numbered[1]} ${label}`}${trailing}`
  }
  const level = core.match(/^강화 Lv\.(\d+)$/)
  if (level) return `${leading}${locale === 'ja' ? `強化 Lv.${level[1]}` : locale === 'ru' ? `Усиление Lv.${level[1]}` : locale.startsWith('zh') ? `强化 Lv.${level[1]}` : `Upgrade Lv.${level[1]}`}${trailing}`
  const countMore = core.match(/^\+(\d+)종 더$/)
  if (countMore) return `${leading}${locale === 'ja' ? `ほか${countMore[1]}種` : locale === 'ru' ? `ещё ${countMore[1]}` : locale.startsWith('zh') ? `另有${countMore[1]}种` : `+${countMore[1]} more`}${trailing}`
  const nthWord = core.match(/^(\d+)번째 단어$/)
  if (nthWord) return `${leading}${locale === 'ja' ? `${nthWord[1]}番目の単語` : locale === 'ru' ? `Слово ${nthWord[1]}` : locale.startsWith('zh') ? `第${nthWord[1]}个词` : `Word ${nthWord[1]}`}${trailing}`
  const defeatDay = core.match(/^(\d+)일째, (.+) 무리가 이야기를 갉아먹었다\.$/)
  if (defeatDay) return `${leading}${locale === 'ja' ? `${defeatDay[1]}日目、${defeatDay[2]}の群れに物語を蝕まれた。` : locale === 'ru' ? `День ${defeatDay[1]}: стая «${defeatDay[2]}» изгрызла историю.` : locale.startsWith('zh') ? `第${defeatDay[1]}天，${defeatDay[2]}群啃噬了故事。` : `Day ${defeatDay[1]}: a swarm of ${defeatDay[2]} consumed the story.`}${trailing}`
  const runDay = core.match(/^(ENDLESS · )?(\d+)일째(에서 멈췄다|까지 써 냈다)$/)
  if (runDay) {
    const prefix = runDay[1] ?? ''
    const won = runDay[3] === '까지 써 냈다'
    const message = locale === 'ja' ? `${runDay[2]}日目${won ? 'まで書き上げた' : 'で止まった'}` : locale === 'ru' ? `${won ? 'Записано до дня' : 'Остановлено на дне'} ${runDay[2]}` : locale.startsWith('zh') ? `${won ? '写到了第' : '止步于第'}${runDay[2]}天` : `${won ? 'Written through day' : 'Stopped on day'} ${runDay[2]}`
    return `${leading}${prefix}${message}${trailing}`
  }
  const statPrefix = core.match(/^(체력|공격|방어|회복|운)(?=\s+\d)/)?.[1]
  if (statPrefix) return `${leading}${core.replace(statPrefix, dict.get(statPrefix) ?? statPrefix)}${trailing}`

  // Markup can split one sentence into several text nodes. Replace known phrases
  // inside a node as a fallback, longest first so specific messages win.
  let translated = core
  const safeSingleCharacterFragments = new Set(['운', '적', '막', '개', '종'])
  const replacements = [...dict.entries()]
    .filter(([ko]) => (ko.length >= 2 || safeSingleCharacterFragments.has(ko)) && translated.includes(ko))
    .sort((a, b) => b[0].length - a[0].length)
  for (const [ko, foreign] of replacements) translated = translated.split(ko).join(foreign)
  if (translated.includes('로')) translated = translated.split('로').join(dict.get('로') ?? '')
  translated = translateUnits(translated, locale)
  // Never leak source-language text in a foreign locale. Missing phrases stay
  // observable to the audit while the player receives a localized diagnostic.
  if (/[가-힣]/.test(translated)) {
    missingLocalizationTexts.add(core)
    const fallback = locale === 'ja' ? '翻訳未登録' : locale === 'ru' ? 'Перевод не добавлен' : locale === 'zh-Hans' ? '翻译尚未添加' : locale === 'zh-Hant' ? '翻譯尚未加入' : 'Translation missing'
    translated = translated.replace(/[가-힣]+(?:\s+[가-힣]+)*/g, fallback)
  }
  return translated === core ? value : `${leading}${translated}${trailing}`
}

function translateUnits(value: string, locale: ForeignLocale): string {
  return value
    .replace(/(\d+)턴 뒤/g, (_, n) => locale === 'ja' ? `${n}ターン後` : locale === 'ru' ? `через ${n} ход.` : locale.startsWith('zh') ? `${n}回合后` : `in ${n} turns`)
    .replace(/(\d+)턴/g, (_, n) => locale === 'ja' ? `${n}ターン` : locale === 'ru' ? `${n} ход.` : locale.startsWith('zh') ? `${n}回合` : `${n} turns`)
    .replace(/(\d+)장/g, (_, n) => locale === 'ja' ? `${n}枚` : locale === 'ru' ? `${n} карт.` : locale.startsWith('zh') ? `${n}张` : `${n} cards`)
    .replace(/(\d+)마리/g, (_, n) => locale === 'ja' ? `${n}匹` : locale === 'ru' ? `${n}` : locale.startsWith('zh') ? `${n}只` : `${n}`)
    .replace(/(\d+)막/g, (_, n) => locale === 'ja' ? `${n}本` : locale === 'ru' ? `${n} полос.` : locale.startsWith('zh') ? `${n}条` : `${n} bars`)
    .replace(/(\d+)개/g, (_, n) => locale === 'ja' ? `${n}個` : locale === 'ru' ? `${n}` : locale.startsWith('zh') ? `${n}个` : `${n}`)
    .replace(/(\d+)층/g, (_, n) => locale === 'ja' ? `${n}階` : locale === 'ru' ? `${n} этаж` : locale.startsWith('zh') ? `${n}层` : `Floor ${n}`)
    .replace(/(\d+)일/g, (_, n) => locale === 'ja' ? `${n}日` : locale === 'ru' ? `${n} дн.` : locale.startsWith('zh') ? `${n}天` : `${n} days`)
}

function translateElement(root: Node, locale: ForeignLocale): void {
  const nodes: Node[] = []
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root)
  const parent = root instanceof Element || root instanceof Document || root instanceof DocumentFragment ? root : null
  if (root instanceof Element) root.childNodes.forEach((node) => { if (node.nodeType === Node.TEXT_NODE) nodes.push(node) })
  parent?.querySelectorAll('*').forEach((element) => element.childNodes.forEach((node) => { if (node.nodeType === Node.TEXT_NODE) nodes.push(node) }))
  for (const node of nodes) if (node.nodeValue) {
    const translated = translateText(node.nodeValue, locale)
    if (translated !== node.nodeValue) node.nodeValue = translated
  }
  if (root instanceof Element) translateAttributes(root, locale)
  parent?.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder],[alt]').forEach((element) => translateAttributes(element, locale))
}

function translateAttributes(element: Element, locale: ForeignLocale): void {
  for (const attribute of ['aria-label','title','placeholder','alt']) {
    const value = element.getAttribute(attribute)
    if (value) {
      const translated = translateText(value, locale)
      if (translated !== value) element.setAttribute(attribute, translated)
    }
  }
}

export function installDomLocalization(): void {
  if (currentLocale === 'ko' || typeof document === 'undefined') return
  const locale = currentLocale as ForeignLocale
  translateElement(document.body, locale)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData' && record.target.nodeValue) {
        const translated = translateText(record.target.nodeValue, locale)
        if (translated !== record.target.nodeValue) record.target.nodeValue = translated
      }
      if (record.type === 'attributes' && record.target instanceof Element) translateAttributes(record.target, locale)
      record.addedNodes.forEach((node) => translateElement(node, locale))
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'title', 'placeholder', 'alt'],
  })
}
