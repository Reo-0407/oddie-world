/**
 * Edge Function이 쓰는 서버 로직(src/engine, src/data, src/game/factory.ts, src/online 일부)을
 * supabase/functions/_shared/src/ 로 복사한다. Supabase 배포는 함수 폴더 밖의 상대 경로를 번들하지 못하기 때문이다.
 * 복사본은 생성물이라 git에 넣지 않는다(.gitignore). 원본은 항상 src/ 이다.
 * 실행: npm run functions:sync   (배포 스크립트가 알아서 먼저 부른다)
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'supabase/functions/_shared/src';
const HEADER = '// 생성물: scripts/sync-functions.ts가 src/에서 복사했다. 여기를 고치지 말고 src/의 원본을 고칠 것.\n';

const ONLINE_FILES = ['protocol', 'validate', 'room', 'server', 'elo', 'ranking', 'rateLimit', 'edgeHandler'];

rmSync('supabase/functions/_shared', { recursive: true, force: true });

function copyTs(from: string, to: string) {
  mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true });
  writeFileSync(to, HEADER + readFileSync(from, 'utf8'));
}

for (const name of readdirSync('src/engine')) {
  // 테스트와 테스트용 도구는 필요 없다
  if (name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testkit.ts') copyTs(`src/engine/${name}`, `${OUT}/engine/${name}`);
}
for (const name of ['index.ts', 'types.ts']) copyTs(`src/data/${name}`, `${OUT}/data/${name}`);
for (const name of ['moves.json', 'species.json']) {
  mkdirSync(`${OUT}/data`, { recursive: true });
  cpSync(`src/data/${name}`, `${OUT}/data/${name}`);
}
copyTs('src/game/factory.ts', `${OUT}/game/factory.ts`);
for (const name of ONLINE_FILES) copyTs(`src/online/${name}.ts`, `${OUT}/online/${name}.ts`);

console.log(`서버 로직을 ${OUT}/ 로 복사함`);
