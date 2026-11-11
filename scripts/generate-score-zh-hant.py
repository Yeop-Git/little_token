"""점수 재기획 번체 중국어 생성기.
src/score/i18n/zhHans.ts(간체, 손으로 쓴 원본)를 OpenCC(s2twp)로 변환해 zhHant.ts를 만든다.
준비: pip install opencc-python-reimplemented   실행: npm run score:zh-hant
"""
from pathlib import Path
from opencc import OpenCC

root = Path(__file__).resolve().parent.parent / 'src' / 'score' / 'i18n'
src = (root / 'zhHans.ts').read_text(encoding='utf-8')
out = OpenCC('s2twp').convert(src)
out = out.replace('export const ZH_HANS', 'export const ZH_HANT')
head, body = out.split('\n', 1)
lines = body.split('\n')
lines = [l for l in lines if not l.startswith('/** ')]
banner = '// 자동 생성 파일 — 직접 수정하지 않는다. 원본: zhHans.ts, 생성: npm run score:zh-hant\n'
(root / 'zhHant.ts').write_text(banner + head + '\n' + '\n'.join(lines), encoding='utf-8')
print('zhHant.ts 생성')
