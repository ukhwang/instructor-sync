CREATE SCHEMA "authn";
--> statement-breakpoint
CREATE SCHEMA "app";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "authn", "app" FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE "authn"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_key" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "authn"."signup_allowlist" (
	"email_hash" "bytea" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowlist_hash_size" CHECK (octet_length("authn"."signup_allowlist"."email_hash")=32)
);
--> statement-breakpoint
CREATE TABLE "authn"."rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" double precision NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "app"."exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cue" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_name" CHECK (length(btrim("app"."exercises"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "app"."feedback" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"homework_id" uuid NOT NULL,
	"has_pain" boolean NOT NULL,
	"note" text,
	"pain_area" text,
	CONSTRAINT "feedback_lengths" CHECK (length("app"."feedback"."note")<=1000 and length("app"."feedback"."pain_area")<=100),
	CONSTRAINT "feedback_pain" CHECK ("app"."feedback"."has_pain" or "app"."feedback"."pain_area" is null)
);
--> statement-breakpoint
CREATE TABLE "app"."homework_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL,
	"exercise_id" uuid,
	"order_index" integer NOT NULL,
	"name" text NOT NULL,
	"cue" text DEFAULT '' NOT NULL,
	"sets" integer NOT NULL,
	"target_reps" text NOT NULL,
	"effort_kind" text NOT NULL,
	"reps" integer,
	"hold_seconds" integer,
	"seconds_per_rep" double precision DEFAULT 3 NOT NULL,
	"rest_seconds" integer DEFAULT 30 NOT NULL,
	"per_side" boolean DEFAULT false NOT NULL,
	CONSTRAINT "homework_order_key" UNIQUE("homework_id","order_index"),
	CONSTRAINT "assigned_name" CHECK (length(btrim("app"."homework_exercises"."name")) between 1 and 100),
	CONSTRAINT "assigned_order" CHECK ("app"."homework_exercises"."order_index" between 1 and 3),
	CONSTRAINT "assigned_sets" CHECK ("app"."homework_exercises"."sets" between 1 and 20),
	CONSTRAINT "assigned_cadence" CHECK ("app"."homework_exercises"."seconds_per_rep" between 0.5 and 10 and "app"."homework_exercises"."rest_seconds" between 0 and 180),
	CONSTRAINT "assigned_effort" CHECK (("app"."homework_exercises"."effort_kind"='reps' and "app"."homework_exercises"."reps" is not null and "app"."homework_exercises"."reps" between 1 and 50 and "app"."homework_exercises"."hold_seconds" is null) or ("app"."homework_exercises"."effort_kind"='hold' and "app"."homework_exercises"."hold_seconds" is not null and "app"."homework_exercises"."hold_seconds" between 1 and 300 and "app"."homework_exercises"."reps" is null))
);
--> statement-breakpoint
CREATE TABLE "app"."homeworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"why" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"first_opened_at" timestamp with time zone,
	"latest_submission_id" uuid,
	"opening_line" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_owner_key" UNIQUE("id","trainer_id"),
	CONSTRAINT "homework_status" CHECK ("app"."homeworks"."status" in ('ready','opened','logged')),
	CONSTRAINT "homework_version" CHECK ("app"."homeworks"."version">0)
);
--> statement-breakpoint
CREATE TABLE "app"."members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"package_total" integer NOT NULL,
	"remaining" integer NOT NULL,
	"expires_on" date,
	"end_state" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_owner_key" UNIQUE("id","trainer_id"),
	CONSTRAINT "member_name" CHECK (length(btrim("app"."members"."name")) between 1 and 100),
	CONSTRAINT "member_package" CHECK ("app"."members"."package_total">0 and "app"."members"."remaining" between 0 and "app"."members"."package_total"),
	CONSTRAINT "member_version" CHECK ("app"."members"."version">0)
);
--> statement-breakpoint
CREATE TABLE "app"."session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"note" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_length" CHECK (length("app"."session_notes"."note") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "app"."rate_limit_buckets" (
	"key" "bytea" PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_count" CHECK ("app"."rate_limit_buckets"."count">=0)
);
--> statement-breakpoint
CREATE TABLE "app"."write_requests" (
	"actor_scope" text NOT NULL,
	"operation" text NOT NULL,
	"aggregate_key" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" "bytea" NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_idempotency_key" UNIQUE("actor_scope","operation","aggregate_key","request_id"),
	CONSTRAINT "request_hash_size" CHECK (octet_length("app"."write_requests"."payload_hash")=32)
);
--> statement-breakpoint
CREATE TABLE "authn"."session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "app"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"observation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_supersedes_id_unique" UNIQUE("supersedes_id"),
	CONSTRAINT "submission_homework_key" UNIQUE("id","homework_id"),
	CONSTRAINT "observation_version_key" UNIQUE("observation_id","version"),
	CONSTRAINT "submission_observation_key" UNIQUE("id","homework_id","observation_id"),
	CONSTRAINT "submission_kind" CHECK ("app"."submissions"."kind" in ('complete','cant')),
	CONSTRAINT "submission_initial" CHECK (("app"."submissions"."version"=1 and "app"."submissions"."supersedes_id" is null and "app"."submissions"."observation_id"="app"."submissions"."id") or ("app"."submissions"."version">1 and "app"."submissions"."supersedes_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."member_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaces_token_id" uuid,
	CONSTRAINT "member_access_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "token_homework_key" UNIQUE("id","homework_id"),
	CONSTRAINT "token_hash_length" CHECK (octet_length("app"."member_access_tokens"."token_hash")=32),
	CONSTRAINT "token_dates" CHECK ("app"."member_access_tokens"."expires_at">"app"."member_access_tokens"."issued_at" and ("app"."member_access_tokens"."revoked_at" is null or "app"."member_access_tokens"."revoked_at">="app"."member_access_tokens"."issued_at"))
);
--> statement-breakpoint
CREATE TABLE "app"."trainers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"is_pro" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_name" CHECK (length(btrim("app"."trainers"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "authn"."user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "authn"."verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authn"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "authn"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback" ADD CONSTRAINT "feedback_submission_id_homework_id_submissions_id_homework_id_fk" FOREIGN KEY ("submission_id","homework_id") REFERENCES "app"."submissions"("id","homework_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."homework_exercises" ADD CONSTRAINT "homework_exercises_homework_id_homeworks_id_fk" FOREIGN KEY ("homework_id") REFERENCES "app"."homeworks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."homework_exercises" ADD CONSTRAINT "homework_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."homeworks" ADD CONSTRAINT "homeworks_member_id_trainer_id_members_id_trainer_id_fk" FOREIGN KEY ("member_id","trainer_id") REFERENCES "app"."members"("id","trainer_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."members" ADD CONSTRAINT "members_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "app"."trainers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."session_notes" ADD CONSTRAINT "session_notes_member_id_trainer_id_members_id_trainer_id_fk" FOREIGN KEY ("member_id","trainer_id") REFERENCES "app"."members"("id","trainer_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authn"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "authn"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."submissions" ADD CONSTRAINT "submissions_homework_id_homeworks_id_fk" FOREIGN KEY ("homework_id") REFERENCES "app"."homeworks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."submissions" ADD CONSTRAINT "submissions_token_id_homework_id_member_access_tokens_id_homework_id_fk" FOREIGN KEY ("token_id","homework_id") REFERENCES "app"."member_access_tokens"("id","homework_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."member_access_tokens" ADD CONSTRAINT "member_access_tokens_homework_id_homeworks_id_fk" FOREIGN KEY ("homework_id") REFERENCES "app"."homeworks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trainers" ADD CONSTRAINT "trainers_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "authn"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "authn"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_homework_idx" ON "app"."feedback" USING btree ("homework_id");--> statement-breakpoint
CREATE INDEX "assigned_exercise_idx" ON "app"."homework_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "homework_member_idx" ON "app"."homeworks" USING btree ("member_id","trainer_id");--> statement-breakpoint
CREATE INDEX "homework_trainer_idx" ON "app"."homeworks" USING btree ("trainer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "members_trainer_idx" ON "app"."members" USING btree ("trainer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notes_member_idx" ON "app"."session_notes" USING btree ("member_id","trainer_id");--> statement-breakpoint
CREATE INDEX "rate_expiry_idx" ON "app"."rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "authn"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expiry_idx" ON "authn"."session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "submission_token_idx" ON "app"."submissions" USING btree ("token_id","homework_id");--> statement-breakpoint
CREATE INDEX "submission_homework_idx" ON "app"."submissions" USING btree ("homework_id","performed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_token" ON "app"."member_access_tokens" USING btree ("homework_id") WHERE "app"."member_access_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "token_expiry_idx" ON "app"."member_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "authn"."verification" USING btree ("identifier");
