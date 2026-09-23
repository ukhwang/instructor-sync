# 피칭 전 의존성 감사

점검일: 2026-09-22 / 대상: 현재 `package-lock.json`과 설치 트리

## 결과

`npm audit --json`과 `npm audit --omit=dev --json`을 각각 실행했다. 감사 명령은 취약점이 발견되어 비정상 종료했지만 JSON 결과는 정상 파싱됐다.

참고로 같은 배포의 Vercel `npm install` 로그는 19건(critical 1, high 10, moderate 5, low 3)으로 집계됐다. 로컬 npm 버전·설치 트리 집계와 차이가 있으므로 어느 쪽도 취약점 해소 근거로 사용하지 않고, critical/high가 남아 있다는 공통 사실만 출시 판단에 반영한다.

| 범위 | critical | high | moderate | low |
|---|---:|---:|---:|---:|
| 전체 설치 트리 | 1 | 18 | 30 | 9 |
| 운영 의존성(`--omit=dev`) | 1 | 18 | 13 | 9 |

직접 운영 의존성으로 확인된 주요 항목은 `next@16.2.2`(critical), `better-auth@1.7.4`(high)다. `next`는 루트에 고정되어 있고 `better-auth`가 같은 Next 버전을 peer로 참조한다. `@supabase/supabase-js@2.103.0`과 `@supabase/ssr@0.10.2`는 현재 감사에서 전이 `ws` 등으로 분류된다.

Next 감사 결과에는 Server Components DoS, App Router middleware 우회, Server Action SSRF/DoS, 이미지 최적화 관련 항목이 포함되어 있고 일부는 `16.2.11` 미만, critical 항목은 `16.3.3` 미만 범위다. 현재 `next.config.ts`에는 이미지 원격 설정이나 custom server 설정이 없지만, 이 사실만으로 advisory가 해소되었다고 판정하지 않았다.

## 처리 판정

- `npm audit fix --force`와 대규모 dependency 업데이트는 실행하지 않았다.
- 현재 감사 결과에서 `next`, `better-auth`, `shadcn`은 자동 수정 가능 버전이 제시되지 않았다.
- 따라서 이번 피칭 배포의 보안 상태는 **P1 검토 필요 / 완전한 Production READY 아님**으로 기록한다.
- 다음 조치는 Next와 `eslint-config-next`의 호환 patch 후보를 별도 브랜치에서 검토하고, 변경 후 전체 gate와 Production smoke를 다시 실행하는 것이다. 사용자 승인 없이 인증 구조나 의존성 대규모 교체를 하지 않는다.

근거 advisory는 npm audit가 출력한 GitHub Advisory URL을 사용한다. 예: [Next middleware bypass](https://github.com/advisories/GHSA-6gpp-xcg3-4w24), [Next unauthenticated RCE](https://github.com/advisories/GHSA-p293-qw3h-jr36).
