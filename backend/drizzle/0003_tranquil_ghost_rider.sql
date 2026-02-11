ALTER TYPE "public"."ai_provider" ADD VALUE 'groq';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'google';--> statement-breakpoint
ALTER TYPE "public"."telephony_provider" ADD VALUE 'signalwire' BEFORE 'livekit_sip';--> statement-breakpoint
CREATE TABLE "contact_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#3b82f6',
	"contact_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "external_id" varchar(255);--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "call_provider" varchar(50) DEFAULT 'livekit';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "contact_list_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "list_id" uuid;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "signalwire_space_url" varchar(255);--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_contact_list_id_contact_lists_id_fk" FOREIGN KEY ("contact_list_id") REFERENCES "public"."contact_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;