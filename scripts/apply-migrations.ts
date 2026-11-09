/**
 * supabase/migrations/*.sql을 Management API로 적용한다 (Docker, DB 비밀번호 필요 없음).
 * 실행: npm run db:migrate   (프로젝트 루트의 .env.local에서 SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF를 읽는다)
 * 비밀값은 출력하지 않는다. SQL은 여러 번 실행해도 안전하게 쓰여 있다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { loadEnvLocal } from './env.ts';

const env = loadEnvLocal();
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) throw new Error('.env.local에 SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF가 필요함');

const files = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
for (const file of files) {
  const query = readFileSync(`supabase/migrations/${file}`, 'utf8');
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`${file}: 실패 ${response.status} ${text.slice(0, 500)}`);
    process.exitCode = 1;
    break;
  }
  console.log(`${file}: 적용됨`);
}
