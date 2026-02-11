-- Add contact_list_id column to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS contact_list_id UUID REFERENCES contact_lists(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_campaigns_contact_list_id ON campaigns(contact_list_id);
