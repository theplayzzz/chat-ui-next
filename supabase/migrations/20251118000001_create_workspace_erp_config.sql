-- Enable pg_crypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create workspace_erp_config table
CREATE TABLE IF NOT EXISTS workspace_erp_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  api_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  custom_headers JSONB DEFAULT '{}'::JSONB,
  timeout_ms INTEGER DEFAULT 10000 CHECK (timeout_ms > 0 AND timeout_ms <= 60000),
  retry_attempts INTEGER DEFAULT 2 CHECK (retry_attempts >= 0 AND retry_attempts <= 5),
  cache_ttl_minutes INTEGER DEFAULT 15 CHECK (cache_ttl_minutes >= 1 AND cache_ttl_minutes <= 1440),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE(workspace_id)
);

-- Create index on workspace_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_workspace_erp_config_workspace_id
  ON workspace_erp_config(workspace_id);

-- Enable RLS
ALTER TABLE workspace_erp_config ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy: Users can only view ERP config for their own workspace
CREATE POLICY "Users can view their workspace ERP config"
  ON workspace_erp_config
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert ERP config for their own workspace
CREATE POLICY "Users can insert ERP config for their workspace"
  ON workspace_erp_config
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update ERP config for their own workspace
CREATE POLICY "Users can update their workspace ERP config"
  ON workspace_erp_config
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete ERP config for their own workspace
CREATE POLICY "Users can delete their workspace ERP config"
  ON workspace_erp_config
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE user_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_erp_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::TEXT, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_workspace_erp_config_updated_at_trigger
  BEFORE UPDATE ON workspace_erp_config
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_erp_config_updated_at();

-- Helper function to encrypt API keys
CREATE OR REPLACE FUNCTION encrypt_api_key(api_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(pgp_sym_encrypt(api_key, current_setting('app.settings.encryption_key', true)), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to decrypt API keys
CREATE OR REPLACE FUNCTION decrypt_api_key(encrypted_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(decode(encrypted_key, 'base64'), current_setting('app.settings.encryption_key', true));
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on encryption functions
GRANT EXECUTE ON FUNCTION encrypt_api_key(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_api_key(TEXT) TO authenticated;

-- Add comment to table
COMMENT ON TABLE workspace_erp_config IS 'Stores ERP API configuration per workspace for health plan price fetching';
