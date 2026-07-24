# 문장 데이터 CSV

문장 전투 데이터의 원본이다. TypeScript 파일을 직접 편집하지 않고 아래 CSV를 수정한다.

- `words.csv`: 일반 런, 보상, 확장용 단어
- `combos.csv`: 관용구와 필요 태그 멀티셋
- `conflicts.csv`: 함께 사용할 수 없는 태그 쌍
- `dissonances.csv`: 허용하지만 성능이 감소하는 태그 쌍

`pool`은 `early`(3슬롯 일반 런), `reward`(획득 단어), `expansion`(확장 및 전수 검사) 중 하나다.
한 셀에 여러 태그를 넣을 때는 `|`로 구분하고, 쉼표가 들어간 텍스트는 큰따옴표로 감싼다.

CSV를 수정한 뒤 다음 명령으로 타입이 있는 런타임 데이터를 다시 만든다.

```bash
npm run data:generate
```

`dev`, `type-check`, `sweep`, `build`도 실행 전에 이 변환을 자동 수행한다. 생성된
`src/data/generated/sentenceData.ts`는 직접 편집하지 않는다.
