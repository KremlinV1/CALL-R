CREATE TYPE "public"."ivr_action_type" AS ENUM('play_message', 'transfer', 'voicemail', 'submenu', 'hangup', 'repeat', 'agent');--> statement-breakpoint
CREATE TABLE "ivr_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"call_id" uuid,
	"menu_id" uuid,
	"caller_number" varchar(20),
	"dtmf_inputs" jsonb DEFAULT '[]'::jsonb,
	"final_action" "ivr_action_type",
	"final_action_data" jsonb DEFAULT '{}'::jsonb,
	"duration_seconds" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_menu_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"dtmf_key" varchar(2) NOT NULL,
	"label" varchar(255) NOT NULL,
	"action_type" "ivr_action_type" NOT NULL,
	"action_data" jsonb DEFAULT '{}'::jsonb,
	"announcement_text" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"greeting_type" varchar(20) DEFAULT 'tts',
	"greeting_text" text,
	"greeting_audio_url" varchar(500),
	"voice_provider" varchar(50) DEFAULT 'cartesia',
	"voice_id" varchar(255),
	"input_timeout_seconds" integer DEFAULT 5,
	"max_retries" integer DEFAULT 3,
	"invalid_input_message" text DEFAULT 'Sorry, I didn''t understand that. Please try again.',
	"timeout_message" text DEFAULT 'I didn''t receive any input. Goodbye.',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ivr_call_logs" ADD CONSTRAINT "ivr_call_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_call_logs" ADD CONSTRAINT "ivr_call_logs_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_call_logs" ADD CONSTRAINT "ivr_call_logs_menu_id_ivr_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."ivr_menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_menu_options" ADD CONSTRAINT "ivr_menu_options_menu_id_ivr_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."ivr_menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_menus" ADD CONSTRAINT "ivr_menus_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;