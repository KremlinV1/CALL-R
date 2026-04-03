-- Migration: Add organization_id to escrow_claims and change amount columns to bigint
-- Run this in Supabase SQL Editor

-- 1. Add organization_id column to escrow_claims
ALTER TABLE escrow_claims 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- 2. Change escrow_amount_cents from integer to bigint (supports amounts over $21.4 million)
ALTER TABLE escrow_claims 
ALTER COLUMN escrow_amount_cents TYPE BIGINT;

-- 3. Change payment_fee_cents from integer to bigint
ALTER TABLE escrow_claims 
ALTER COLUMN payment_fee_cents TYPE BIGINT;

-- 4. Create index on organization_id for faster queries
CREATE INDEX IF NOT EXISTS idx_escrow_claims_organization_id 
ON escrow_claims(organization_id);

-- 5. (Optional) Update existing claims to link to a default organization
-- Replace 'YOUR_ORGANIZATION_ID' with the actual organization UUID you want to assign existing claims to
-- UPDATE escrow_claims SET organization_id = 'YOUR_ORGANIZATION_ID' WHERE organization_id IS NULL;
