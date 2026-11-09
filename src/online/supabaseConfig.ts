/**
 * 공개해도 되는 값만 있다(주소와 publishable key). 비밀 키(access token, service role)는 절대 여기 쓰지 않는다.
 * 표는 서버(Edge Function)만 읽고 쓰므로 이 키로는 로그인과 함수 호출, 랭킹 조회 함수 말고는 할 수 없다.
 */
export const SUPABASE_URL: string = 'https://izzahtchuofajalwxubi.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY: string = 'sb_publishable_WxtHrtLD4xgj9aMU0zOrzg_kkoaY5On';

export const SUPABASE_CONFIGURED = SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== '';
