"""오디 165종 3D 모델을 NVIDIA TRELLIS(글→3D)로 만든다. 이미 만든 파일은 건너뛴다.

usage: python nv_batch.py [OD-001 OD-042 ...]   (id를 주면 그것만, 없으면 우선순위 순서로 전부)

- 프롬프트: 로블록스 쪽 oddie_prompts.py의 영어 설명 + 같은 화풍 문구(oddie_pipeline.style_for)
- 키: 유튜브/secrets.json의 NVIDIA_KEYS_GOOD, NVIDIA_KEYS를 돌려 쓴다. 키 값은 출력하지 않는다.
- 결과: art/raw/OD-xxx.glb, 기록: art/log.txt
"""
import base64, io, json, os, runpy, sys, time, urllib.error, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ODDIE_TOOLS = r'C:\Users\준우\OneDrive\Desktop\cluade\로블록스 스튜디오\tools\oddie_assets'
SECRETS = r'C:\Users\준우\OneDrive\Desktop\cluade\유튜브\secrets.json'
OUT = os.path.join(ROOT, 'art', 'raw')
LOG = os.path.join(ROOT, 'art', 'log.txt')
URL = 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis'

sys.path.insert(0, ODDIE_TOOLS)
import oddie_pipeline as pipeline  # noqa: E402  (style_for만 쓴다)
from oddie_prompts import SPECIES  # noqa: E402

PROMPT_OVERRIDES = {
    'OD-001': 'A round bouncy green blob creature, soft smooth dome shape with a tiny sprout on top of its head, '
              'two big glossy black eyes and a small happy smile, short stubby feet, bright green and pale yellow colors.',
}
FIRST = ['OD-001', 'OD-042', 'OD-107']  # 스타터
REGION_ORDER = ['Meadow', 'Desert', 'Frozen', 'Volcano', 'Mushroom', 'Candy', 'Glitch', 'Abyss', 'Celestial', 'Special']


def load_keys():
    data = json.load(open(SECRETS, encoding='utf-8'))
    keys = []
    for name in ('NVIDIA_KEYS_GOOD', 'NVIDIA_KEYS'):
        for key in data.get(name, []):
            if key not in keys:
                keys.append(key)
    return keys


def log(text):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    line = time.strftime('%H:%M:%S ') + text
    print(line)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def order(specs):
    def rank(spec):
        if spec['id'] in FIRST:
            return (-1, FIRST.index(spec['id']))
        return (REGION_ORDER.index(spec['region']) if spec['region'] in REGION_ORDER else 99, spec['id'])
    return sorted(specs, key=rank)


def prompt_for(spec):
    base = PROMPT_OVERRIDES.get(spec['id'], spec['prompt'])
    text = (pipeline.style_for({**spec, 'prompt': base}) + base).replace('plain solid dark teal background, ', '')
    return text.replace('three-quarter front view, ', '')[:1000]


def call(key, prompt, seed):
    body = {'prompt': prompt, 'seed': seed, 'ss_sampling_steps': 25, 'slat_sampling_steps': 25}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method='POST', headers={
        'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json'})
    data = json.loads(urllib.request.urlopen(req, timeout=300).read())
    art = data['artifacts'][0] if 'artifacts' in data else data
    return base64.b64decode(art.get('base64') or art.get('b64_json'))


def main():
    wanted = {a for a in sys.argv[1:] if a.startswith('OD-')}
    shard = next((a for a in sys.argv[1:] if a.startswith('--shard=')), None)
    keys = load_keys()
    dead = set()
    os.makedirs(OUT, exist_ok=True)
    specs = order([s for s in SPECIES.values() if not wanted or s['id'] in wanted])
    cursor = 0
    if shard:  # --shard=K/N: 우선순위 순서에서 K번째부터 N개 간격으로 맡는다. 키도 어긋나게 시작한다
        k, n = (int(x) for x in shard.split('=')[1].split('/'))
        specs = specs[k::n]
        cursor = k
    log(f'시작: 오디 {len(specs)}종, 키 {len(keys)}개 {shard or ""}')
    made = failed = 0
    for spec in specs:
        target = os.path.join(OUT, spec['id'] + '.glb')
        if os.path.exists(target):
            continue
        started = time.time()
        done = False
        for attempt in range(1, 7):
            live = [k for k in keys if k not in dead]
            if not live:
                log('사용할 수 있는 키가 없어 중단')
                return
            key = live[cursor % len(live)]
            cursor += 1
            try:
                blob = call(key, prompt_for(spec), seed=attempt)
                open(target, 'wb').write(blob)
                log(f"{spec['id']} {spec['name']} 성공 {time.time() - started:.0f}초 {len(blob) // 1024}KB")
                made += 1
                done = True
                break
            except urllib.error.HTTPError as e:
                detail = e.read()[:120]
                if e.code == 429:
                    log(f"{spec['id']} 요청이 너무 많아 20초 쉼")
                    time.sleep(20)
                elif e.code in (401, 402, 403):
                    dead.add(key)
                    log(f'키 한도나 권한 문제로 제외({e.code}), 남은 키 {len([k for k in keys if k not in dead])}개')
                else:
                    log(f"{spec['id']} 시도 {attempt} 오류 {e.code} {detail}")
                    time.sleep(3)
            except Exception as e:  # 네트워크 끊김 등은 다음 키로
                log(f"{spec['id']} 시도 {attempt} 예외 {type(e).__name__} {str(e)[:100]}")
                time.sleep(3)
        if not done:
            failed += 1
            log(f"{spec['id']} {spec['name']} 실패(6번 모두)")
    log(f'끝: 성공 {made}, 실패 {failed}')


main()
