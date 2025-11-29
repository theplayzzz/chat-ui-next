/**
 * Tests for anonymization functions
 * Task 13.2 - Sistema de Auditoria e Compliance LGPD
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  anonymizeClientInfo,
  anonymizeWithResult,
  hashSensitiveField,
  isPersonalData,
  ageToRange,
  extractFirstName,
  maskCPF,
  upgradeAnonymization,
  isProperlyAnonymized,
  findSensitiveFields
} from "../anonymization"
import type { AnonymizedClientInfo } from "../schemas/anonymization-schemas"

// =============================================================================
// TEST DATA
// =============================================================================

const mockClientInfoFull = {
  age: 35,
  city: "São Paulo",
  state: "SP",
  budget: 500,
  cpf: "123.456.789-00",
  name: "João da Silva Santos",
  fullName: "João da Silva Santos",
  email: "joao@email.com",
  phone: "(11) 99999-9999",
  address: "Rua das Flores, 123",
  dependents: [
    { relationship: "spouse", age: 32 },
    { relationship: "child", age: 8 },
    { relationship: "child", age: 5 }
  ],
  preExistingConditions: ["hipertensão", "diabetes"],
  medications: ["losartana", "metformina"],
  preferences: {
    networkType: "broad",
    coParticipation: false,
    specificHospitals: ["Hospital Albert Einstein"]
  }
}

const mockClientInfoMinimal = {
  age: 45,
  city: "Rio de Janeiro",
  state: "RJ",
  budget: 800
}

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe("Helper Functions", () => {
  describe("hashSensitiveField", () => {
    it("should generate consistent SHA256 hash", () => {
      const hash1 = hashSensitiveField("123.456.789-00")
      const hash2 = hashSensitiveField("123.456.789-00")

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA256 hex length
    })

    it("should generate different hashes for different values", () => {
      const hash1 = hashSensitiveField("123.456.789-00")
      const hash2 = hashSensitiveField("987.654.321-00")

      expect(hash1).not.toBe(hash2)
    })

    it("should handle empty string", () => {
      const hash = hashSensitiveField("")
      expect(hash).toBe("")
    })

    it("should handle null/undefined", () => {
      expect(hashSensitiveField(null as any)).toBe("")
      expect(hashSensitiveField(undefined as any)).toBe("")
    })
  })

  describe("isPersonalData", () => {
    it("should identify CPF as personal data", () => {
      expect(isPersonalData("cpf")).toBe(true)
      expect(isPersonalData("CPF")).toBe(true)
      expect(isPersonalData("cpfCliente")).toBe(true)
    })

    it("should identify name fields as personal data", () => {
      expect(isPersonalData("name")).toBe(true)
      expect(isPersonalData("fullName")).toBe(true)
      expect(isPersonalData("nome")).toBe(true)
      expect(isPersonalData("nomeCompleto")).toBe(true)
    })

    it("should identify contact info as personal data", () => {
      expect(isPersonalData("email")).toBe(true)
      expect(isPersonalData("phone")).toBe(true)
      expect(isPersonalData("telefone")).toBe(true)
      expect(isPersonalData("celular")).toBe(true)
    })

    it("should identify address fields as personal data", () => {
      expect(isPersonalData("address")).toBe(true)
      expect(isPersonalData("endereco")).toBe(true)
      expect(isPersonalData("cep")).toBe(true)
      expect(isPersonalData("logradouro")).toBe(true)
    })

    it("should NOT identify non-personal fields", () => {
      expect(isPersonalData("age")).toBe(false)
      expect(isPersonalData("city")).toBe(false)
      expect(isPersonalData("state")).toBe(false)
      expect(isPersonalData("budget")).toBe(false)
      expect(isPersonalData("preExistingConditions")).toBe(false)
    })
  })

  describe("ageToRange", () => {
    it("should convert ages to correct ranges", () => {
      expect(ageToRange(5)).toBe("0-17")
      expect(ageToRange(17)).toBe("0-17")
      expect(ageToRange(18)).toBe("18-29")
      expect(ageToRange(25)).toBe("18-29")
      expect(ageToRange(35)).toBe("30-39")
      expect(ageToRange(45)).toBe("40-49")
      expect(ageToRange(55)).toBe("50-59")
      expect(ageToRange(65)).toBe("60-69")
      expect(ageToRange(75)).toBe("70-79")
      expect(ageToRange(85)).toBe("80+")
      expect(ageToRange(100)).toBe("80+")
    })
  })

  describe("extractFirstName", () => {
    it("should extract first name from full name", () => {
      expect(extractFirstName("João da Silva Santos")).toBe("João")
      expect(extractFirstName("Maria")).toBe("Maria")
      expect(extractFirstName("  José  Carlos  ")).toBe("José")
    })

    it("should handle empty/null values", () => {
      expect(extractFirstName("")).toBe("")
      expect(extractFirstName(null as any)).toBe("")
      expect(extractFirstName(undefined as any)).toBe("")
    })
  })

  describe("maskCPF", () => {
    it("should mask CPF preserving last 2 digits", () => {
      expect(maskCPF("123.456.789-00")).toBe("***.***.***-00")
      expect(maskCPF("12345678900")).toBe("***.***.***-00")
    })

    it("should handle invalid CPF", () => {
      expect(maskCPF("123")).toBe("***.***.***-**")
      expect(maskCPF("")).toBe("")
    })
  })
})

// =============================================================================
// ANONYMIZATION TESTS - LEVEL: NONE
// =============================================================================

describe("anonymizeClientInfo - level: none", () => {
  it("should preserve all original data", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "none")

    expect(result.age).toBe(35)
    expect(result.city).toBe("São Paulo")
    expect(result.state).toBe("SP")
    expect(result.budget).toBe(500)
    expect((result as any).cpf).toBe("123.456.789-00")
    expect((result as any).name).toBe("João da Silva Santos")
    expect((result as any).email).toBe("joao@email.com")
  })

  it("should add anonymization metadata", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "none")

    expect(result._anonymization).toBeDefined()
    expect(result._anonymization?.level).toBe("none")
    expect(result._anonymization?.fieldsRemoved).toHaveLength(0)
    expect(result._anonymization?.fieldsHashed).toHaveLength(0)
  })
})

// =============================================================================
// ANONYMIZATION TESTS - LEVEL: PARTIAL
// =============================================================================

describe("anonymizeClientInfo - level: partial", () => {
  it("should preserve age and city", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "partial")

    expect(result.age).toBe(35)
    expect(result.city).toBe("São Paulo")
    expect(result.state).toBe("SP")
    expect(result.budget).toBe(500)
  })

  it("should hash CPF instead of removing", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "partial")

    expect((result as any).cpf).toBeUndefined()
    expect(result.cpfHash).toBeDefined()
    expect(result.cpfHash).toHaveLength(64) // SHA256
    expect(result._anonymization?.fieldsHashed).toContain("cpf")
  })

  it("should extract first name only", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "partial")

    expect(result.name).toBe("João")
    expect((result as any).fullName).toBeUndefined()
  })

  it("should remove email, phone, address", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "partial")

    expect((result as any).email).toBeUndefined()
    expect((result as any).phone).toBeUndefined()
    expect((result as any).address).toBeUndefined()
    expect(result._anonymization?.fieldsRemoved).toContain("email")
    expect(result._anonymization?.fieldsRemoved).toContain("phone")
    expect(result._anonymization?.fieldsRemoved).toContain("address")
  })

  it("should preserve dependents with exact ages", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "partial")

    expect(result.dependents).toHaveLength(3)
    expect(result.dependents?.[0].age).toBe(32)
    expect(result.dependents?.[0].relationship).toBe("spouse")
    expect(result.dependents?.[1].age).toBe(8)
    expect(result.dependents?.[2].age).toBe(5)
  })

  it("should preserve non-personal fields", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "partial")

    expect(result.preExistingConditions).toEqual(["hipertensão", "diabetes"])
    expect(result.medications).toEqual(["losartana", "metformina"])
    expect(result.preferences?.networkType).toBe("broad")
  })
})

// =============================================================================
// ANONYMIZATION TESTS - LEVEL: FULL
// =============================================================================

describe("anonymizeClientInfo - level: full", () => {
  it("should convert age to range", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "full")

    expect(result.age).toBeUndefined()
    expect(result.ageRange).toBe("30-39")
  })

  it("should remove city", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "full")

    expect(result.city).toBeUndefined()
    expect(result._anonymization?.fieldsRemoved).toContain("city")
  })

  it("should preserve state", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "full")

    expect(result.state).toBe("SP")
  })

  it("should remove all PII fields", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "full")

    expect((result as any).cpf).toBeUndefined()
    expect(result.cpfHash).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect((result as any).fullName).toBeUndefined()
    expect((result as any).email).toBeUndefined()
    expect((result as any).phone).toBeUndefined()
    expect((result as any).address).toBeUndefined()
  })

  it("should convert dependent ages to ranges", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "full")

    expect(result.dependents).toHaveLength(3)
    expect(result.dependents?.[0].age).toBeUndefined()
    expect(result.dependents?.[0].ageRange).toBe("30-39")
    expect(result.dependents?.[1].ageRange).toBe("0-17")
    expect(result.dependents?.[2].ageRange).toBe("0-17")
  })

  it("should preserve medical information", () => {
    const result = anonymizeClientInfo(mockClientInfoFull, "full")

    expect(result.preExistingConditions).toEqual(["hipertensão", "diabetes"])
    expect(result.medications).toEqual(["losartana", "metformina"])
  })
})

// =============================================================================
// ANONYMIZATION WITH RESULT TESTS
// =============================================================================

describe("anonymizeWithResult", () => {
  it("should return detailed statistics", () => {
    const result = anonymizeWithResult(mockClientInfoFull, "partial")

    expect(result.success).toBe(true)
    expect(result.originalFieldsCount).toBeGreaterThan(0)
    expect(result.removedFieldsCount).toBeGreaterThan(0)
    expect(result.hashedFieldsCount).toBe(1) // CPF
    expect(result.data).toBeDefined()
  })

  it("should handle errors gracefully", () => {
    const result = anonymizeWithResult(mockClientInfoFull, "invalid" as any)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

// =============================================================================
// UPGRADE ANONYMIZATION TESTS
// =============================================================================

describe("upgradeAnonymization", () => {
  it("should upgrade partial to full", () => {
    const partial = anonymizeClientInfo(mockClientInfoFull, "partial")
    const upgraded = upgradeAnonymization(partial)

    expect(upgraded._anonymization?.level).toBe("full")
    expect(upgraded.age).toBeUndefined()
    expect(upgraded.ageRange).toBeDefined()
    expect(upgraded.city).toBeUndefined()
  })

  it("should not change already full", () => {
    const full = anonymizeClientInfo(mockClientInfoFull, "full")
    const upgraded = upgradeAnonymization(full)

    expect(upgraded._anonymization?.level).toBe("full")
  })

  it("should not change none level", () => {
    const none = anonymizeClientInfo(mockClientInfoFull, "none")
    const upgraded = upgradeAnonymization(none)

    expect(upgraded._anonymization?.level).toBe("none")
  })
})

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe("isProperlyAnonymized", () => {
  it("should validate full anonymization", () => {
    const full = anonymizeClientInfo(mockClientInfoFull, "full")
    expect(isProperlyAnonymized(full, "full")).toBe(true)
  })

  it("should validate partial anonymization", () => {
    const partial = anonymizeClientInfo(mockClientInfoFull, "partial")
    expect(isProperlyAnonymized(partial, "partial")).toBe(true)
  })

  it("should reject partial when full is expected", () => {
    const partial = anonymizeClientInfo(mockClientInfoFull, "partial")
    expect(isProperlyAnonymized(partial, "full")).toBe(false)
  })

  it("should accept any data for none level", () => {
    expect(isProperlyAnonymized(mockClientInfoFull as any, "none")).toBe(true)
  })
})

describe("findSensitiveFields", () => {
  it("should find all sensitive fields", () => {
    const sensitive = findSensitiveFields(mockClientInfoFull)

    expect(sensitive).toContain("cpf")
    expect(sensitive).toContain("name")
    expect(sensitive).toContain("fullName")
    expect(sensitive).toContain("email")
    expect(sensitive).toContain("phone")
    expect(sensitive).toContain("address")
  })

  it("should return empty for anonymized data", () => {
    const full = anonymizeClientInfo(mockClientInfoFull, "full")
    const sensitive = findSensitiveFields(full)

    // Should not find PII fields
    expect(sensitive).not.toContain("cpf")
    expect(sensitive).not.toContain("email")
    expect(sensitive).not.toContain("phone")
  })
})

// =============================================================================
// EDGE CASES
// =============================================================================

describe("Edge Cases", () => {
  it("should handle minimal client info", () => {
    const result = anonymizeClientInfo(mockClientInfoMinimal, "partial")

    expect(result.age).toBe(45)
    expect(result.city).toBe("Rio de Janeiro")
    expect(result.state).toBe("RJ")
    expect(result.budget).toBe(800)
  })

  it("should handle empty dependents array", () => {
    const data = { ...mockClientInfoMinimal, dependents: [] }
    const result = anonymizeClientInfo(data, "partial")

    // Empty arrays are preserved (not converted to undefined)
    expect(result.dependents).toEqual([])
  })

  it("should handle null values in object", () => {
    const data = {
      ...mockClientInfoMinimal,
      cpf: null,
      name: null
    }
    const result = anonymizeClientInfo(data, "partial")

    expect(result.cpfHash).toBeUndefined()
    expect(result.name).toBeUndefined()
  })

  it("should handle nested structures", () => {
    const data = {
      ...mockClientInfoMinimal,
      preferences: {
        networkType: "broad",
        coParticipation: true,
        specificHospitals: ["Hospital A", "Hospital B"]
      }
    }
    const result = anonymizeClientInfo(data, "full")

    expect(result.preferences?.networkType).toBe("broad")
    expect(result.preferences?.specificHospitals).toHaveLength(2)
  })

  it("should throw on invalid anonymization level", () => {
    expect(() => {
      anonymizeClientInfo(mockClientInfoMinimal, "invalid" as any)
    }).toThrow("Invalid anonymization level")
  })
})
