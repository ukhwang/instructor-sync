-- Supabase 기본 역할·권한을 로컬 PostgreSQL 16 에 재현한다 (supabase/postgres 초기 스키마 기준).
CREATE DATABASE postgres_e2e;
\c postgres_e2e

CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'authenticator';
GRANT anon, authenticated, service_role TO authenticator;
CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD 'auth_admin';

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
ALTER ROLE supabase_auth_admin SET search_path = 'auth';

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
-- Supabase 클라우드 기본값: public 의 새 객체는 Data API 역할에 자동 노출된다 (RLS 가 유일한 방어선).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

ALTER DATABASE postgres_e2e SET search_path = "$user", public, extensions;
ALTER ROLE authenticator SET statement_timeout = '8s';

-- Supabase 클라우드와 같이 UTC (timezone('utc', now()) 기본값이 9시간 밀리지 않도록)
ALTER DATABASE postgres_e2e SET timezone = 'UTC';
