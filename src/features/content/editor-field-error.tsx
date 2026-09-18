"use client";

/** Single error presentation shared by the common fields and every type. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message === undefined ? null : (
    <p className="mt-1.5 text-xs text-red-700" id={id}>
      {message}
    </p>
  );
}
