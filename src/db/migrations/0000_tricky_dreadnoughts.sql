CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'waiting_music', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."share_visibility" AS ENUM('unlisted', 'public');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('upload', 'paste');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('stored', 'extracted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('ingest', 'extract', 'knowledge_map', 'song_plan', 'lyric_draft', 'critique', 'rewrite', 'fact_check', 'style_params', 'music', 'post_process', 'finalize');--> statement-breakpoint
CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "generation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"current_stage" "stage",
	"stage_states" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"knowledge_map_id" text,
	"inngest_run_id" text,
	"music_job_id" text,
	"music_provider_id" text,
	"song_id" text,
	"error" text,
	"cost_estimate_usd" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_map" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"facts" jsonb NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb,
	"focus_applied" text,
	"model_meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"focus_prompt_default" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share" (
	"id" text PRIMARY KEY NOT NULL,
	"song_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"visibility" "share_visibility" DEFAULT 'unlisted' NOT NULL,
	"allow_download" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text,
	"title" text NOT NULL,
	"description" text,
	"lyrics" text NOT NULL,
	"line_fact_map" jsonb DEFAULT '[]'::jsonb,
	"knowledge_map_id" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_id" text,
	"audio_r2_key" text,
	"audio_duration_sec" real,
	"cover_r2_key" text,
	"lyrics_timing_r2_key" text,
	"parent_song_id" text,
	"root_song_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_document" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"filename" text NOT NULL,
	"mime" text,
	"r2_key" text,
	"bytes" integer,
	"status" "source_status" DEFAULT 'stored' NOT NULL,
	"normalized_text" text,
	"token_estimate" integer,
	"warnings" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counter" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"window_date" text NOT NULL,
	"gemini_requests" integer DEFAULT 0 NOT NULL,
	"gemini_tokens" integer DEFAULT 0 NOT NULL,
	"songs_generated" integer DEFAULT 0 NOT NULL,
	"music_spend_usd" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_map" ADD CONSTRAINT "knowledge_map_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document" ADD CONSTRAINT "source_document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_user_idx" ON "generation_job" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "generation_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "km_project_hash_idx" ON "knowledge_map" USING btree ("project_id","source_hash");--> statement-breakpoint
CREATE INDEX "project_user_idx" ON "project" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "share_slug_idx" ON "share" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "song_user_idx" ON "song" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "song_project_idx" ON "song" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "source_project_idx" ON "source_document" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_user_window_idx" ON "usage_counter" USING btree ("user_id","window_date");