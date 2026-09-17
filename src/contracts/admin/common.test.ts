import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  customBackendErrorSchema,
  laravelValidationErrorSchema,
  successEnvelopeSchema,
} from "@/contracts/admin/common";
import {
  customDomainValidationError,
  customForbiddenError,
  laravelCredentialValidationError,
} from "@/test/fixtures/admin-api";

const exampleEnvelopeSchema = successEnvelopeSchema(
  z.object({ value: z.string() }),
);

describe("successEnvelopeSchema", () => {
  const validEnvelope = {
    data: { value: "ok" },
    meta: { server_time: "2026-09-14T10:00:00+03:00" },
  };

  it("accepts a valid success envelope", () => {
    expect(exampleEnvelopeSchema.safeParse(validEnvelope).success).toBe(true);
  });

  it("rejects a missing data field", () => {
    expect(
      exampleEnvelopeSchema.safeParse({ meta: validEnvelope.meta }).success,
    ).toBe(false);
  });

  it("rejects a missing meta field", () => {
    expect(
      exampleEnvelopeSchema.safeParse({ data: validEnvelope.data }).success,
    ).toBe(false);
  });

  it("rejects an invalid server_time", () => {
    expect(
      exampleEnvelopeSchema.safeParse({
        ...validEnvelope,
        meta: { server_time: "not-a-date" },
      }).success,
    ).toBe(false);
  });

  it("accepts and strips additive unknown fields", () => {
    const result = exampleEnvelopeSchema.parse({
      ...validEnvelope,
      future_top_level: true,
      data: { ...validEnvelope.data, future_data_field: 42 },
    });

    expect(result).toEqual(validEnvelope);
  });
});

describe("laravelValidationErrorSchema", () => {
  it("parses the Laravel validation shape", () => {
    expect(
      laravelValidationErrorSchema.parse(laravelCredentialValidationError),
    ).toEqual(laravelCredentialValidationError);
  });

  it("supports dynamic validation field names", () => {
    const result = laravelValidationErrorSchema.parse({
      message: "Validation failed.",
      errors: { "items.0.title": ["Başlık zorunludur."] },
    });

    expect(result.errors["items.0.title"]).toEqual(["Başlık zorunludur."]);
  });

  it("rejects a non-array field error", () => {
    expect(
      laravelValidationErrorSchema.safeParse({
        message: "Validation failed.",
        errors: { email: "Geçersiz." },
      }).success,
    ).toBe(false);
  });
});

describe("customBackendErrorSchema", () => {
  it("parses code and message without details", () => {
    expect(customBackendErrorSchema.parse(customForbiddenError)).toEqual(
      customForbiddenError,
    );
  });

  it("preserves explicit details", () => {
    expect(
      customBackendErrorSchema.parse(customDomainValidationError).error.details,
    ).toEqual(customDomainValidationError.error.details);
  });
});
