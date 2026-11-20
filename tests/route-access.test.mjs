import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { isPublicPath, isAppPath, hasSupabaseAuthCookie, normalizePath } = loadModule('lib/route-access.ts');

test('공개 경로는 로그인 상태를 보지 않는다', () => {
  for (const path of [
    '/',
    '/demo',
    '/demo/members',
    '/h/demo-token',
    '/h/1f0a-uuid-token?name=지욱',
    '/report/sample-report-token',
    '/auth/callback',
  ]) {
    assert.equal(isPublicPath(path), true, `${path} 는 공개 경로여야 한다`);
  }
});

test('앱·로그인 경로는 공개로 판정하지 않는다', () => {
  for (const path of ['/app', '/app/', '/app/schedules', '/app/members/mem-1', '/login']) {
    assert.equal(isPublicPath(path), false, `${path} 는 인증 확인 대상이어야 한다`);
  }
});

test('/app 가드 대상 판정은 /application 같은 접두사에 걸리지 않는다', () => {
  assert.equal(isAppPath('/app'), true);
  assert.equal(isAppPath('/app/'), true);
  assert.equal(isAppPath('/app/members/1'), true);
  assert.equal(isAppPath('/application'), false);
  assert.equal(isAppPath('/demo/app'), false);
  assert.equal(isAppPath('/login'), false);
});

test('공개 경로와 앱 경로는 겹치지 않는다', () => {
  for (const path of ['/', '/demo', '/h/x', '/report/x', '/auth/cb', '/app', '/app/x']) {
    assert.equal(isPublicPath(path) && isAppPath(path), false, `${path} 가 양쪽으로 판정됐다`);
  }
});

test('Supabase 세션 쿠키가 없으면 Auth 호출을 생략하고, 있으면 검증 경로로 간다', () => {
  assert.equal(hasSupabaseAuthCookie([]), false);
  assert.equal(hasSupabaseAuthCookie(['theme', 'NEXT_LOCALE']), false);
  assert.equal(hasSupabaseAuthCookie(['sb-ilcbzjtptmdqqydnzksr-auth-token']), true);
  assert.equal(hasSupabaseAuthCookie(['sb-x-auth-token.0', 'sb-x-auth-token.1']), true);
});

test('trailing slash는 루트만 남기고 정리한다', () => {
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath('/app/'), '/app');
  assert.equal(normalizePath('/app//'), '/app');
});
