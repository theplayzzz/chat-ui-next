-- Tabela de emails aprovados para acesso à aplicação.
-- Gerenciada diretamente no banco por admins (Supabase Studio ou SQL).
-- Exemplo: INSERT INTO approved_emails (email, approved) VALUES ('user@empresa.com', true);

CREATE TABLE IF NOT EXISTS approved_emails (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT        NOT NULL UNIQUE,
  approved    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ
);

ALTER TABLE approved_emails ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER: permite verificação de aprovação sem expor a tabela
CREATE OR REPLACE FUNCTION check_email_approved(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT approved FROM approved_emails WHERE LOWER(email) = LOWER(check_email) LIMIT 1),
    FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_email_approved(TEXT) TO anon, authenticated;
