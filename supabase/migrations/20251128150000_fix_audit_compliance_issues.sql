-- Migration: fix_audit_compliance_issues
-- Data: 2025-11-28
-- Task: 13 - Correcoes de compliance LGPD
-- PRD Reference: RF-012 (Sistema de auditoria e compliance)
--
-- Correcoes:
-- 1. Fix IMMUTABLE -> STABLE nas funcoes de anonimizacao (NOW() nao e deterministica)
-- 2. Fix retention default de 1 para 2 anos (conforme PRD RF-012)
-- 3. Update registros existentes para 2 anos de retencao

-- ============================================================================
-- FIX 1: CORRIGIR VOLATILIDADE DAS FUNCOES (IMMUTABLE -> STABLE)
-- ============================================================================
-- Funcoes que usam NOW() devem ser STABLE, nao IMMUTABLE.
-- IMMUTABLE significa que dado os mesmos inputs, sempre retorna o mesmo output.
-- NOW() muda a cada chamada, entao isso viola a semantica de IMMUTABLE.
-- O planner do PostgreSQL pode cachear resultados de funcoes IMMUTABLE incorretamente.

CREATE OR REPLACE FUNCTION anonymize_client_info(
  client_info JSONB,
  level TEXT DEFAULT 'partial'
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  age_value INTEGER;
  age_range TEXT;
  first_name TEXT;
  cpf_hash TEXT;
  dependents_array JSONB;
  dep JSONB;
  new_dep JSONB;
  i INTEGER;
BEGIN
  -- Validar nivel
  IF level NOT IN ('full', 'partial', 'none') THEN
    RAISE EXCEPTION 'Invalid anonymization level: %. Must be full, partial, or none.', level;
  END IF;

  -- Se none, retornar dados originais com metadata
  IF level = 'none' THEN
    RETURN client_info || jsonb_build_object(
      '_anonymization', jsonb_build_object(
        'level', 'none',
        'appliedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'fieldsRemoved', '[]'::jsonb,
        'fieldsHashed', '[]'::jsonb
      )
    );
  END IF;

  -- Iniciar resultado vazio
  result := '{}'::jsonb;

  -- === CAMPOS SEMPRE PRESERVADOS ===
  IF client_info ? 'state' THEN
    result := result || jsonb_build_object('state', client_info->>'state');
  END IF;

  IF client_info ? 'budget' THEN
    result := result || jsonb_build_object('budget', (client_info->>'budget')::numeric);
  END IF;

  IF client_info ? 'preExistingConditions' THEN
    result := result || jsonb_build_object('preExistingConditions', client_info->'preExistingConditions');
  END IF;

  IF client_info ? 'medications' THEN
    result := result || jsonb_build_object('medications', client_info->'medications');
  END IF;

  IF client_info ? 'preferences' THEN
    result := result || jsonb_build_object('preferences', client_info->'preferences');
  END IF;

  -- === CAMPOS COM TRATAMENTO POR NIVEL ===

  -- Idade
  IF client_info ? 'age' THEN
    age_value := (client_info->>'age')::integer;

    IF level = 'full' THEN
      -- Converter para faixa etaria
      age_range := CASE
        WHEN age_value BETWEEN 0 AND 17 THEN '0-17'
        WHEN age_value BETWEEN 18 AND 29 THEN '18-29'
        WHEN age_value BETWEEN 30 AND 39 THEN '30-39'
        WHEN age_value BETWEEN 40 AND 49 THEN '40-49'
        WHEN age_value BETWEEN 50 AND 59 THEN '50-59'
        WHEN age_value BETWEEN 60 AND 69 THEN '60-69'
        WHEN age_value BETWEEN 70 AND 79 THEN '70-79'
        ELSE '80+'
      END;
      result := result || jsonb_build_object('ageRange', age_range);
    ELSE
      -- Partial: manter idade exata
      result := result || jsonb_build_object('age', age_value);
    END IF;
  END IF;

  -- Cidade
  IF client_info ? 'city' AND level = 'partial' THEN
    result := result || jsonb_build_object('city', client_info->>'city');
  END IF;

  -- Dependentes
  IF client_info ? 'dependents' AND jsonb_array_length(client_info->'dependents') > 0 THEN
    dependents_array := '[]'::jsonb;

    FOR i IN 0..jsonb_array_length(client_info->'dependents') - 1 LOOP
      dep := client_info->'dependents'->i;

      IF level = 'full' THEN
        -- Converter idade para faixa
        IF dep ? 'age' THEN
          age_value := (dep->>'age')::integer;
          age_range := CASE
            WHEN age_value BETWEEN 0 AND 17 THEN '0-17'
            WHEN age_value BETWEEN 18 AND 29 THEN '18-29'
            WHEN age_value BETWEEN 30 AND 39 THEN '30-39'
            WHEN age_value BETWEEN 40 AND 49 THEN '40-49'
            WHEN age_value BETWEEN 50 AND 59 THEN '50-59'
            WHEN age_value BETWEEN 60 AND 69 THEN '60-69'
            WHEN age_value BETWEEN 70 AND 79 THEN '70-79'
            ELSE '80+'
          END;
          new_dep := jsonb_build_object('relationship', dep->>'relationship', 'ageRange', age_range);
        ELSE
          new_dep := jsonb_build_object('relationship', dep->>'relationship');
        END IF;
      ELSE
        -- Partial: manter idade exata
        new_dep := jsonb_build_object('relationship', dep->>'relationship');
        IF dep ? 'age' THEN
          new_dep := new_dep || jsonb_build_object('age', (dep->>'age')::integer);
        END IF;
      END IF;

      dependents_array := dependents_array || new_dep;
    END LOOP;

    result := result || jsonb_build_object('dependents', dependents_array);
  END IF;

  -- CPF (apenas em partial: gerar hash)
  IF client_info ? 'cpf' AND level = 'partial' THEN
    cpf_hash := encode(sha256(convert_to(client_info->>'cpf' || 'lgpd-compliance-salt', 'UTF8')), 'hex');
    result := result || jsonb_build_object('cpfHash', cpf_hash);
  END IF;

  -- Nome (apenas em partial: primeiro nome)
  IF (client_info ? 'name' OR client_info ? 'nome') AND level = 'partial' THEN
    first_name := COALESCE(client_info->>'name', client_info->>'nome');
    first_name := split_part(trim(first_name), ' ', 1);
    result := result || jsonb_build_object('name', first_name);
  ELSIF (client_info ? 'fullName' OR client_info ? 'nomeCompleto') AND level = 'partial' THEN
    first_name := COALESCE(client_info->>'fullName', client_info->>'nomeCompleto');
    first_name := split_part(trim(first_name), ' ', 1);
    result := result || jsonb_build_object('name', first_name);
  END IF;

  -- Adicionar metadata de anonimizacao
  result := result || jsonb_build_object(
    '_anonymization', jsonb_build_object(
      'level', level,
      'appliedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'fieldsRemoved', CASE level
        WHEN 'full' THEN '["cpf", "name", "fullName", "email", "phone", "address", "city", "age"]'::jsonb
        WHEN 'partial' THEN '["fullName", "email", "phone", "address"]'::jsonb
        ELSE '[]'::jsonb
      END,
      'fieldsHashed', CASE
        WHEN level = 'partial' AND client_info ? 'cpf' THEN '["cpf"]'::jsonb
        ELSE '[]'::jsonb
      END
    )
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;  -- CORRIGIDO: era IMMUTABLE, agora STABLE

-- Funcao de upgrade de anonimizacao
CREATE OR REPLACE FUNCTION upgrade_anonymization(
  client_info JSONB
)
RETURNS JSONB AS $$
DECLARE
  current_level TEXT;
BEGIN
  -- Verificar nivel atual
  current_level := client_info->'_anonymization'->>'level';

  -- Se ja esta em full ou none, retorna como esta
  IF current_level = 'full' OR current_level = 'none' THEN
    RETURN client_info;
  END IF;

  -- Aplicar anonimizacao full
  RETURN anonymize_client_info(client_info, 'full');
END;
$$ LANGUAGE plpgsql STABLE;  -- CORRIGIDO: era IMMUTABLE, agora STABLE

-- ============================================================================
-- FIX 2: CORRIGIR RETENTION DEFAULT DE 1 PARA 2 ANOS
-- ============================================================================
-- PRD RF-012 especifica: "Retencao configuravel (default: 2 anos)"

-- Alterar default em client_recommendations
ALTER TABLE client_recommendations
  ALTER COLUMN retention_until SET DEFAULT (NOW() + INTERVAL '2 years');

-- Alterar default em workspace_audit_config
ALTER TABLE workspace_audit_config
  ALTER COLUMN retention_years SET DEFAULT 2;

-- ============================================================================
-- FIX 3: UPDATE REGISTROS EXISTENTES PARA 2 ANOS
-- ============================================================================
-- Adicionar 1 ano extra aos registros que tinham o default de 1 ano

UPDATE client_recommendations
SET retention_until = retention_until + INTERVAL '1 year'
WHERE retention_until IS NOT NULL
  AND created_at IS NOT NULL
  AND retention_until <= created_at + INTERVAL '1 year' + INTERVAL '1 day';
  -- Margem de 1 dia para cobrir diferenca de timestamp

-- Update workspace_audit_config existentes que tinham default de 1 ano
UPDATE workspace_audit_config
SET retention_years = 2
WHERE retention_years = 1;

-- ============================================================================
-- COMENTARIOS ATUALIZADOS
-- ============================================================================

COMMENT ON FUNCTION anonymize_client_info(JSONB, TEXT) IS
  'Anonimiza dados de cliente conforme LGPD. Niveis: full (remove PII), partial (hash CPF, primeiro nome), none (preserva tudo). STABLE porque usa NOW().';

COMMENT ON FUNCTION upgrade_anonymization(JSONB) IS
  'Faz upgrade de anonimizacao de partial para full. Usado pelo job de cleanup apos 90 dias. STABLE porque chama anonymize_client_info.';
