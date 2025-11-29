import { supabase } from "@/lib/supabase/browser-client"
import { TablesInsert, TablesUpdate } from "@/supabase/types"
import {
  ERPConfigInsert,
  ERPConfigUpdate,
  WorkspaceERPConfig
} from "@/lib/tools/health-plan/types"

/**
 * Get ERP configuration by workspace ID
 * @param workspaceId - The workspace ID
 * @returns The ERP configuration or null if not found
 */
export const getERPConfigByWorkspaceId = async (
  workspaceId: string
): Promise<WorkspaceERPConfig | null> => {
  const { data: config, error } = await supabase
    .from("workspace_erp_config")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single()

  if (error) {
    // Return null if not found (not an error condition)
    if (error.code === "PGRST116") {
      return null
    }
    throw new Error(`Error fetching ERP config: ${error.message}`)
  }

  return config as WorkspaceERPConfig
}

/**
 * Create ERP configuration for a workspace
 * @param config - The ERP configuration to create
 * @returns The created configuration
 */
export const createERPConfig = async (
  config: ERPConfigInsert
): Promise<WorkspaceERPConfig> => {
  // First, encrypt the API key
  // Note: encrypt_api_key function may need to be created in the database
  const { data: encryptedKey, error: encryptError } = await supabase.rpc(
    "encrypt_api_key" as any,
    { api_key: config.api_key }
  )

  if (encryptError) {
    throw new Error(`Error encrypting API key: ${encryptError.message}`)
  }

  // Prepare the insert data
  const insertData: TablesInsert<"workspace_erp_config"> = {
    workspace_id: config.workspace_id,
    api_url: config.api_url,
    api_key_encrypted: encryptedKey,
    custom_headers: config.custom_headers || {},
    timeout_ms: config.timeout_ms || 10000,
    retry_attempts: config.retry_attempts || 2,
    cache_ttl_minutes: config.cache_ttl_minutes || 15
  }

  const { data: createdConfig, error } = await supabase
    .from("workspace_erp_config")
    .insert([insertData])
    .select("*")
    .single()

  if (error) {
    throw new Error(`Error creating ERP config: ${error.message}`)
  }

  return createdConfig as WorkspaceERPConfig
}

/**
 * Update ERP configuration for a workspace
 * @param workspaceId - The workspace ID
 * @param updates - The updates to apply
 * @returns The updated configuration
 */
export const updateERPConfig = async (
  workspaceId: string,
  updates: ERPConfigUpdate
): Promise<WorkspaceERPConfig> => {
  // Prepare update data
  const updateData: Partial<TablesUpdate<"workspace_erp_config">> = {}

  if (updates.api_url !== undefined) {
    updateData.api_url = updates.api_url
  }

  if (updates.api_key !== undefined) {
    // Encrypt the new API key
    // Note: encrypt_api_key function may need to be created in the database
    const { data: encryptedKey, error: encryptError } = await supabase.rpc(
      "encrypt_api_key" as any,
      { api_key: updates.api_key }
    )

    if (encryptError) {
      throw new Error(`Error encrypting API key: ${encryptError.message}`)
    }

    updateData.api_key_encrypted = encryptedKey
  }

  if (updates.custom_headers !== undefined) {
    updateData.custom_headers = updates.custom_headers
  }

  if (updates.timeout_ms !== undefined) {
    updateData.timeout_ms = updates.timeout_ms
  }

  if (updates.retry_attempts !== undefined) {
    updateData.retry_attempts = updates.retry_attempts
  }

  if (updates.cache_ttl_minutes !== undefined) {
    updateData.cache_ttl_minutes = updates.cache_ttl_minutes
  }

  const { data: updatedConfig, error } = await supabase
    .from("workspace_erp_config")
    .update(updateData)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Error updating ERP config: ${error.message}`)
  }

  return updatedConfig as WorkspaceERPConfig
}

/**
 * Delete ERP configuration for a workspace
 * @param workspaceId - The workspace ID
 * @returns True if deleted successfully
 */
export const deleteERPConfig = async (
  workspaceId: string
): Promise<boolean> => {
  const { error } = await supabase
    .from("workspace_erp_config")
    .delete()
    .eq("workspace_id", workspaceId)

  if (error) {
    throw new Error(`Error deleting ERP config: ${error.message}`)
  }

  return true
}

/**
 * Get decrypted API key for a workspace
 * Note: This should only be used server-side
 * @param workspaceId - The workspace ID
 * @returns The decrypted API key or null if not found
 */
export const getDecryptedAPIKey = async (
  workspaceId: string
): Promise<string | null> => {
  const config = await getERPConfigByWorkspaceId(workspaceId)

  if (!config) {
    return null
  }

  const { data: decryptedKey, error } = await supabase.rpc("decrypt_api_key", {
    encrypted_key: config.api_key_encrypted
  })

  if (error) {
    throw new Error(`Error decrypting API key: ${error.message}`)
  }

  return decryptedKey
}
