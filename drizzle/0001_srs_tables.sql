CREATE TABLE "card_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"tier_before" text NOT NULL,
	"tier_after" text NOT NULL,
	"undo_to" jsonb
);
--> statement-breakpoint
CREATE TABLE "card_state" (
	"user_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"fsrs_state" text DEFAULT 'new' NOT NULL,
	"tier" text DEFAULT 'rotation' NOT NULL,
	"banked_at" timestamp with time zone,
	"mastered_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"stability" double precision,
	"difficulty" double precision,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"learning_step" integer DEFAULT 0 NOT NULL,
	"last_review_at" timestamp with time zone,
	"is_leech" boolean DEFAULT false NOT NULL,
	"bank_correct_days" integer DEFAULT 0 NOT NULL,
	"bank_last_counted" date,
	"bank_prev_counted" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_state_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_type" text NOT NULL,
	"prompt_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"generation" integer,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_prompt_key_unique" UNIQUE("prompt_key")
);
--> statement-breakpoint
CREATE TABLE "daily_tier_snapshot" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"unseen" integer NOT NULL,
	"rotation" integer NOT NULL,
	"bank" integer NOT NULL,
	"mastered" integer NOT NULL,
	CONSTRAINT "daily_tier_snapshot_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"session_id" uuid,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rating" smallint NOT NULL,
	"mode" text NOT NULL,
	"fsrs_state_before" text NOT NULL,
	"stability_before" double precision,
	"stability_after" double precision,
	"difficulty_before" double precision,
	"difficulty_after" double precision,
	"retrievability_at_review" double precision,
	"due_before" timestamp with time zone,
	"due_after" timestamp with time zone,
	"tier_before" text NOT NULL,
	"tier_after" text NOT NULL,
	"bank_counter_after" integer,
	"is_wrapup" boolean DEFAULT false NOT NULL,
	"answer_ms" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"length_type" text NOT NULL,
	"length_value" integer,
	"ended_reason" text
);
--> statement-breakpoint
ALTER TABLE "card_events" ADD CONSTRAINT "card_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_events" ADD CONSTRAINT "card_events_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_state" ADD CONSTRAINT "card_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_state" ADD CONSTRAINT "card_state_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tier_snapshot" ADD CONSTRAINT "daily_tier_snapshot_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_events_user_card_idx" ON "card_events" USING btree ("user_id","card_id","at");--> statement-breakpoint
CREATE INDEX "card_state_user_tier_idx" ON "card_state" USING btree ("user_id","tier");--> statement-breakpoint
CREATE INDEX "card_state_user_due_idx" ON "card_state" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "cards_type_idx" ON "cards" USING btree ("card_type");--> statement-breakpoint
CREATE INDEX "review_log_user_time_idx" ON "review_log" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "review_log_user_card_idx" ON "review_log" USING btree ("user_id","card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "review_log_session_idx" ON "review_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_started_idx" ON "sessions" USING btree ("user_id","started_at");