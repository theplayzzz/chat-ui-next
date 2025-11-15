import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

/**
 * API endpoint para reprocessar arquivos de uma collection com novos parâmetros de chunking
 * POST /api/retrieval/reprocess
 *
 * Body:
 * {
 *   collection_id: string
 * }
 *
 * Fluxo:
 * 1. Valida que o usuário possui acesso à collection
 * 2. Busca todos os arquivos da collection
 * 3. Deleta os file_items existentes
 * 4. Retorna IDs dos arquivos que precisam ser reprocessados
 *
 * O frontend deve então chamar /api/retrieval/process para cada arquivo
 */
export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()
    const { collection_id } = await req.json()

    if (!collection_id) {
      return new NextResponse("collection_id is required", { status: 400 })
    }

    // Verificar se o usuário possui acesso à collection
    const { data: collection, error: collectionError } = await supabaseAdmin
      .from("collections")
      .select("*")
      .eq("id", collection_id)
      .eq("user_id", profile.user_id)
      .single()

    if (collectionError || !collection) {
      return new NextResponse("Collection not found or unauthorized", {
        status: 404
      })
    }

    // Buscar todos os arquivos da collection
    const { data: collectionFiles, error: filesError } = await supabaseAdmin
      .from("collection_files")
      .select("file_id")
      .eq("collection_id", collection_id)

    if (filesError) {
      throw new Error(`Failed to get collection files: ${filesError.message}`)
    }

    if (!collectionFiles || collectionFiles.length === 0) {
      return NextResponse.json({
        message: "No files to reprocess",
        file_ids: []
      })
    }

    const fileIds = collectionFiles.map(cf => cf.file_id)

    // Deletar todos os file_items existentes desses arquivos
    const { error: deleteError } = await supabaseAdmin
      .from("file_items")
      .delete()
      .in("file_id", fileIds)

    if (deleteError) {
      throw new Error(`Failed to delete file items: ${deleteError.message}`)
    }

    // Resetar tokens dos arquivos
    const { error: updateError } = await supabaseAdmin
      .from("files")
      .update({ tokens: 0 })
      .in("id", fileIds)

    if (updateError) {
      throw new Error(`Failed to reset file tokens: ${updateError.message}`)
    }

    return NextResponse.json({
      message: `Successfully prepared ${fileIds.length} files for reprocessing`,
      file_ids: fileIds,
      collection_config: {
        chunk_size: collection.chunk_size,
        chunk_overlap: collection.chunk_overlap,
        collection_type: collection.collection_type
      }
    })
  } catch (error: any) {
    console.error("Error in reprocess endpoint:", error)
    const errorMessage = error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
