/** 서버 로직을 복사(sync)한 뒤 Edge Function을 배포한다. Docker 없이 --use-api로 올린다. 토큰은 .env.local에서만 읽는다 */
import { spawnSync } from 'node:child_process';
import { loadEnvLocal } from './env.ts';

const env = loadEnvLocal();
if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_PROJECT_REF) throw new Error('.env.local에 SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF가 필요함');

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npx', ['tsx', 'scripts/sync-functions.ts']);
run('npx', ['supabase', 'functions', 'deploy', 'online', '--project-ref', env.SUPABASE_PROJECT_REF, '--use-api', '--no-verify-jwt', '--yes']);
