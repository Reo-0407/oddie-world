import { existsSync, readFileSync } from 'node:fs';

/** 프로젝트 루트의 .env.local(KEY=VALUE 줄)을 읽는다. 값은 절대 출력하지 않는다. 이미 있는 환경변수가 우선 */
export function loadEnvLocal(path = '.env.local'): Record<string, string> {
  const values: Record<string, string> = {};
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !line.trim().startsWith('#')) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  for (const key of Object.keys(values)) if (process.env[key]) values[key] = process.env[key] as string;
  return values;
}
