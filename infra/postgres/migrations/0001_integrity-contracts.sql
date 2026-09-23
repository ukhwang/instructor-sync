-- Integrity constraints not expressible in the Drizzle schema DSL.
-- This migration is forward-only and is applied by the explicit migration command.

ALTER TABLE app.member_access_tokens
  ADD CONSTRAINT token_replacement_same_homework
  FOREIGN KEY (replaces_token_id, homework_id)
  REFERENCES app.member_access_tokens (id, homework_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT token_not_self_replacement
  CHECK (replaces_token_id IS NULL OR replaces_token_id <> id);

ALTER TABLE app.submissions
  ADD CONSTRAINT submission_supersedes_same_observation
  FOREIGN KEY (supersedes_id, homework_id, observation_id)
  REFERENCES app.submissions (id, homework_id, observation_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE app.homeworks
  ADD CONSTRAINT homework_latest_submission_same_homework
  FOREIGN KEY (latest_submission_id, id)
  REFERENCES app.submissions (id, homework_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX token_homework_idx ON app.member_access_tokens (homework_id);
CREATE INDEX token_replacement_idx ON app.member_access_tokens (replaces_token_id, homework_id);
CREATE INDEX submission_supersedes_idx ON app.submissions (supersedes_id, homework_id, observation_id);

CREATE FUNCTION app.validate_homework_exercises(target_homework uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item_count integer; first_order integer; last_order integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.homeworks WHERE id = target_homework) THEN RETURN; END IF;
  SELECT count(*)::integer, min(order_index), max(order_index)
    INTO item_count, first_order, last_order
    FROM app.homework_exercises WHERE homework_id = target_homework;
  IF item_count NOT BETWEEN 1 AND 3 OR first_order <> 1 OR last_order <> item_count THEN
    RAISE EXCEPTION 'homework exercises must have contiguous order 1..3'
      USING ERRCODE = '23514', CONSTRAINT = 'homework_exercise_count_and_order';
  END IF;
END $$;

DO $$
DECLARE invalid_homework uuid;
BEGIN
  SELECT h.id INTO invalid_homework
  FROM app.homeworks h LEFT JOIN app.homework_exercises i ON i.homework_id = h.id
  GROUP BY h.id HAVING count(i.id) NOT BETWEEN 1 AND 3 OR min(i.order_index) <> 1 OR max(i.order_index) <> count(i.id)
  LIMIT 1;
  IF invalid_homework IS NOT NULL THEN
    RAISE EXCEPTION 'existing homework violates item count/order contract: %', invalid_homework USING ERRCODE = '23514';
  END IF;
END $$;

CREATE FUNCTION app.check_homework_exercises_from_homework()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN PERFORM app.validate_homework_exercises(NEW.id); RETURN NULL; END $$;

CREATE FUNCTION app.check_homework_exercises_from_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM app.validate_homework_exercises(OLD.homework_id); END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.homework_id IS DISTINCT FROM OLD.homework_id) THEN
    PERFORM app.validate_homework_exercises(NEW.homework_id);
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER homework_requires_exercises
AFTER INSERT OR UPDATE OF id ON app.homeworks DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.check_homework_exercises_from_homework();

CREATE CONSTRAINT TRIGGER homework_exercise_set_is_valid
AFTER INSERT OR UPDATE OR DELETE ON app.homework_exercises DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.check_homework_exercises_from_item();

CREATE FUNCTION app.check_submission_lineage()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE previous app.submissions%ROWTYPE;
BEGIN
  IF NEW.version = 1 THEN RETURN NEW; END IF;
  SELECT * INTO previous FROM app.submissions WHERE id = NEW.supersedes_id FOR KEY SHARE;
  IF NOT FOUND OR previous.homework_id <> NEW.homework_id OR previous.observation_id <> NEW.observation_id
     OR previous.version <> NEW.version - 1 OR previous.performed_at <> NEW.performed_at THEN
    RAISE EXCEPTION 'invalid submission correction lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'submission_correction_lineage';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER submission_lineage_before_insert
BEFORE INSERT ON app.submissions FOR EACH ROW EXECUTE FUNCTION app.check_submission_lineage();

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'homework_app') THEN CREATE ROLE homework_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'homework_auth') THEN CREATE ROLE homework_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA app, authn FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO homework_app;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO homework_app;
GRANT INSERT (id, name, created_at) ON app.trainers TO homework_app;
GRANT UPDATE (name, updated_at) ON app.trainers TO homework_app;
GRANT INSERT (id, trainer_id, name, phone, package_total, remaining, expires_on, end_state, version, created_at, updated_at) ON app.members TO homework_app;
GRANT UPDATE (name, phone, package_total, remaining, expires_on, end_state, version, updated_at) ON app.members TO homework_app;
GRANT INSERT (id, trainer_id, member_id, why, status, version, first_opened_at, latest_submission_id, opening_line, created_at, updated_at) ON app.homeworks TO homework_app;
GRANT UPDATE (why, status, version, first_opened_at, latest_submission_id, opening_line, updated_at) ON app.homeworks TO homework_app;
GRANT INSERT (id, homework_id, exercise_id, order_index, name, cue, sets, target_reps, effort_kind, reps, hold_seconds, seconds_per_rep, rest_seconds, per_side) ON app.homework_exercises TO homework_app;
GRANT UPDATE (exercise_id, order_index, name, cue, sets, target_reps, effort_kind, reps, hold_seconds, seconds_per_rep, rest_seconds, per_side) ON app.homework_exercises TO homework_app;
GRANT INSERT (id, homework_id, token_hash, issued_at, expires_at, revoked_at, replaces_token_id) ON app.member_access_tokens TO homework_app;
GRANT UPDATE (revoked_at) ON app.member_access_tokens TO homework_app;
GRANT INSERT (id, trainer_id, member_id, note, version, created_at, updated_at) ON app.session_notes TO homework_app;
GRANT UPDATE (note, version, updated_at) ON app.session_notes TO homework_app;
GRANT SELECT, INSERT, UPDATE ON app.rate_limit_buckets TO homework_app;
GRANT INSERT (id, homework_id, token_id, kind, performed_at, observation_id, version, supersedes_id, created_at) ON app.submissions TO homework_app;
GRANT INSERT (submission_id, homework_id, has_pain, note, pain_area) ON app.feedback TO homework_app;
GRANT INSERT (actor_scope, operation, aggregate_key, request_id, payload_hash, result, created_at) ON app.write_requests TO homework_app;
GRANT USAGE ON SCHEMA authn TO homework_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA authn TO homework_auth;
GRANT EXECUTE ON FUNCTION app.validate_homework_exercises(uuid) TO homework_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA authn REVOKE ALL ON TABLES FROM PUBLIC;
