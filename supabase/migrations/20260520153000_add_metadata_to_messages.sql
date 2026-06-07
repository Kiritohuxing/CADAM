ALTER TABLE "public"."messages" ADD COLUMN IF NOT EXISTS "model" "text";
ALTER TABLE "public"."messages" ADD COLUMN IF NOT EXISTS "metadata" "jsonb";