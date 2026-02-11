-- Add contact_lists table
CREATE TABLE IF NOT EXISTS contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3b82f6',
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Add listId column to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES contact_lists(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contact_lists_org ON contact_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_list_id ON contacts(list_id);
