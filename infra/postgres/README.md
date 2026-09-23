# 합성 로컬 PostgreSQL runbook

Ubuntu WSL에서만 실행한다. 대상은 `homework-stage4-{dev,test,restore}` 프로젝트와 각 전용 volume뿐이며, 기존 DB·앱 환경변수·Supabase에는 사용하지 않는다. 포트는 `127.0.0.1` 전용이다.

## 최초 준비와 dev clean apply

```sh
cd /mnt/c/Users/tmd31/instructor-sync/infra/postgres
node prepare.mjs
HW_PG_DATABASE=homework_dev HW_PG_PORT=55432 docker compose -p homework-stage4-dev up -d --wait
HW_PG_DATABASE=homework_dev HW_PG_PORT=55432 npm run migrate
HW_PG_DATABASE=homework_dev HW_PG_PORT=55432 npm run seed
HW_PG_DATABASE=homework_dev HW_PG_PORT=55432 npm run check:schema
```

`prepare.mjs`는 Git에서 제외된 `.local/pg-password.txt`만 최초 생성하며 기존 파일을 덮어쓰지 않는다. seed는 합성 고정 데이터만 넣고 재실행 중복을 거절한다. migrations는 `0000_fine_taskmaster`, `0001_integrity-contracts`다.

## 시작·중지·검사

```sh
docker start homework-stage4-dev-db-1
docker stop homework-stage4-dev-db-1
HW_PG_DATABASE=homework_dev HW_PG_PORT=55432 npm run check:ownership
HW_PG_DATABASE=homework_dev HW_PG_PORT=55432 npm run check:schema
HW_PG_DATABASE=homework_dev HW_PG_PORT=55432 npm run fingerprint
```

WSL 호출이 끝나면 컨테이너가 멈출 수 있다. 다음 검사 전에 `docker start`로 해당 프로젝트 컨테이너만 시작한다.

## 백업·별도 복원

```sh
docker exec homework-stage4-dev-db-1 pg_dump --format=custom --no-owner --file=/tmp/stage4-homework-dev.dump --username=homework_owner --dbname=homework_dev
docker cp homework-stage4-dev-db-1:/tmp/stage4-homework-dev.dump .local/stage4-homework-dev.dump
docker exec homework-stage4-dev-db-1 pg_restore --list /tmp/stage4-homework-dev.dump

HW_PG_DATABASE=homework_restore HW_PG_PORT=55434 docker compose -p homework-stage4-restore up -d --wait
docker exec homework-stage4-restore-db-1 psql --username=homework_owner --dbname=homework_restore --set=ON_ERROR_STOP=1 --command="CREATE ROLE homework_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; CREATE ROLE homework_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;"
docker cp .local/stage4-homework-dev.dump homework-stage4-restore-db-1:/tmp/stage4-homework-dev.dump
docker exec homework-stage4-restore-db-1 pg_restore --exit-on-error --no-owner --username=homework_owner --dbname=homework_restore /tmp/stage4-homework-dev.dump
HW_PG_DATABASE=homework_restore HW_PG_PORT=55434 node fingerprint.mjs compare
HW_PG_DATABASE=homework_restore HW_PG_PORT=55434 npm run check:schema
```

복원 대상은 반드시 새 빈 `homework-stage4-restore` volume이어야 한다. 기존 volume 초기화·삭제 명령은 이 runbook에 포함하지 않는다. 새 clean apply가 필요하면 새 프로젝트 이름·새 포트를 정하고 `database.mjs` allowlist를 검토한 뒤 별도 작업으로 수행한다.
