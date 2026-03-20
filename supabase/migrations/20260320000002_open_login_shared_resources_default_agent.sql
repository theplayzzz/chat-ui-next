-- ============================================================
-- Migration: Open login, shared resources, auto-onboard, default agent
-- ============================================================

-- 1. AUTO-ONBOARD: Update trigger to set has_onboarded = TRUE and generate display_name from email
CREATE OR REPLACE FUNCTION create_profile_and_workspace()
RETURNS TRIGGER
security definer set search_path = public
AS $$
DECLARE
    random_username TEXT;
    user_email TEXT;
    user_display_name TEXT;
BEGIN
    -- Generate a random username
    random_username := 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

    -- Extract display name from email (part before @)
    user_email := NEW.email;
    user_display_name := split_part(user_email, '@', 1);

    -- Create a profile for the new user (auto-onboarded)
    INSERT INTO public.profiles(user_id, anthropic_api_key, azure_openai_35_turbo_id, azure_openai_45_turbo_id, azure_openai_45_vision_id, azure_openai_api_key, azure_openai_endpoint, google_gemini_api_key, has_onboarded, image_url, image_path, mistral_api_key, display_name, bio, openai_api_key, openai_organization_id, perplexity_api_key, profile_context, use_azure_openai, username)
    VALUES(
        NEW.id,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        TRUE,  -- Auto-onboarded
        '',
        '',
        '',
        user_display_name,  -- Display name from email
        '',
        '',
        '',
        '',
        '',
        FALSE,
        random_username
    );

    -- Create the home workspace for the new user
    INSERT INTO public.workspaces(user_id, is_home, name, default_context_length, default_model, default_prompt, default_temperature, description, embeddings_provider, include_profile_context, include_workspace_instructions, instructions)
    VALUES(
        NEW.id,
        TRUE,
        'Home',
        4096,
        'gpt-4-1106-preview',
        'You are a friendly, helpful AI assistant.',
        0.5,
        'My home workspace.',
        'openai',
        TRUE,
        TRUE,
        ''
    );

    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Auto-onboard existing users that haven't onboarded yet
UPDATE profiles SET has_onboarded = TRUE WHERE has_onboarded = FALSE;

-- ============================================================
-- 3. SHARED RESOURCES: Update RLS policies
-- Files, collections, assistants, tools, and all their associations
-- are shared across ALL authenticated users.
-- Only chats and messages remain per-user.
-- ============================================================

-- ---------- FILES ----------
DROP POLICY IF EXISTS "Allow full access to own files" ON files;
DROP POLICY IF EXISTS "Allow view access to non-private files" ON files;

CREATE POLICY "Allow full access to own files"
    ON files
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on files"
    ON files FOR SELECT TO authenticated
    USING (true);

-- ---------- FILE_ITEMS ----------
DROP POLICY IF EXISTS "Allow full access to own file items" ON file_items;
DROP POLICY IF EXISTS "Allow view access to non-private file items" ON file_items;

CREATE POLICY "Allow full access to own file items"
    ON file_items
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on file_items"
    ON file_items FOR SELECT TO authenticated
    USING (true);

-- ---------- FILE_WORKSPACES ----------
DROP POLICY IF EXISTS "Allow full access to own file_workspaces" ON file_workspaces;

CREATE POLICY "Allow full access to own file_workspaces"
    ON file_workspaces
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on file_workspaces"
    ON file_workspaces FOR SELECT TO authenticated
    USING (true);

-- ---------- COLLECTIONS ----------
DROP POLICY IF EXISTS "Allow full access to own collections" ON collections;
DROP POLICY IF EXISTS "Allow view access to non-private collections" ON collections;

CREATE POLICY "Allow full access to own collections"
    ON collections
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on collections"
    ON collections FOR SELECT TO authenticated
    USING (true);

-- ---------- COLLECTION_WORKSPACES ----------
DROP POLICY IF EXISTS "Allow full access to own collection_workspaces" ON collection_workspaces;

CREATE POLICY "Allow full access to own collection_workspaces"
    ON collection_workspaces
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on collection_workspaces"
    ON collection_workspaces FOR SELECT TO authenticated
    USING (true);

-- ---------- COLLECTION_FILES ----------
DROP POLICY IF EXISTS "Allow full access to own collection files" ON collection_files;
DROP POLICY IF EXISTS "Allow view access to non-private collection files" ON collection_files;

CREATE POLICY "Allow full access to own collection_files"
    ON collection_files
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on collection_files"
    ON collection_files FOR SELECT TO authenticated
    USING (true);

-- ---------- ASSISTANTS ----------
DROP POLICY IF EXISTS "Allow full access to own assistants" ON assistants;
DROP POLICY IF EXISTS "Allow view access to non-private assistants" ON assistants;

CREATE POLICY "Allow full access to own assistants"
    ON assistants
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on assistants"
    ON assistants FOR SELECT TO authenticated
    USING (true);

-- ---------- ASSISTANT_WORKSPACES ----------
DROP POLICY IF EXISTS "Allow full access to own assistant_workspaces" ON assistant_workspaces;

CREATE POLICY "Allow full access to own assistant_workspaces"
    ON assistant_workspaces
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on assistant_workspaces"
    ON assistant_workspaces FOR SELECT TO authenticated
    USING (true);

-- ---------- ASSISTANT_COLLECTIONS ----------
DROP POLICY IF EXISTS "Allow full access to own assistant_collections" ON assistant_collections;

CREATE POLICY "Allow full access to own assistant_collections"
    ON assistant_collections
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on assistant_collections"
    ON assistant_collections FOR SELECT TO authenticated
    USING (true);

-- ---------- ASSISTANT_FILES ----------
DROP POLICY IF EXISTS "Allow full access to own assistant_files" ON assistant_files;

CREATE POLICY "Allow full access to own assistant_files"
    ON assistant_files
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on assistant_files"
    ON assistant_files FOR SELECT TO authenticated
    USING (true);

-- ---------- TOOLS ----------
DROP POLICY IF EXISTS "Allow full access to own tools" ON tools;
DROP POLICY IF EXISTS "Allow view access to non-private tools" ON tools;

CREATE POLICY "Allow full access to own tools"
    ON tools
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on tools"
    ON tools FOR SELECT TO authenticated
    USING (true);

-- ---------- TOOL_WORKSPACES ----------
DROP POLICY IF EXISTS "Allow full access to own tool_workspaces" ON tool_workspaces;

CREATE POLICY "Allow full access to own tool_workspaces"
    ON tool_workspaces
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on tool_workspaces"
    ON tool_workspaces FOR SELECT TO authenticated
    USING (true);

-- ---------- ASSISTANT_TOOLS ----------
-- Check if table has RLS policies
DROP POLICY IF EXISTS "Allow full access to own assistant_tools" ON assistant_tools;

CREATE POLICY "Allow full access to own assistant_tools"
    ON assistant_tools
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow read access to all authenticated users on assistant_tools"
    ON assistant_tools FOR SELECT TO authenticated
    USING (true);

-- ---------- STORAGE: file_items bucket ----------
-- Allow all authenticated users to read files from storage
DROP POLICY IF EXISTS "Allow authenticated read access to files" ON storage.objects;
CREATE POLICY "Allow authenticated read access to all files"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'files');
