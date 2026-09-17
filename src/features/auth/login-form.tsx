"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  loginFormSchema,
  type LoginFormValues,
} from "@/features/auth/login-schema";
import { loginSession } from "@/features/auth/session-client";

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    resetField,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleValidSubmit = async (values: LoginFormValues) => {
    setFormError(null);

    const result = await loginSession(values);

    if (result.ok) {
      router.replace("/");
      router.refresh();
      return;
    }

    const emailError = result.error.fields?.email?.[0];
    const passwordError = result.error.fields?.password?.[0];

    if (emailError) {
      setError("email", { type: "server", message: emailError });
    }

    if (passwordError) {
      setError("password", { type: "server", message: passwordError });
    }

    if (result.error.kind === "rate_limit") {
      const retryMessage =
        result.error.retryAfterSeconds === undefined
          ? result.error.message
          : `${result.error.message} ${result.error.retryAfterSeconds} saniye sonra tekrar deneyin.`;
      setFormError(retryMessage);
      return;
    }

    if (result.error.kind !== "validation" || !emailError) {
      setFormError(result.error.message);
    }

    if (
      result.error.kind === "network" ||
      result.error.kind === "server" ||
      result.error.kind === "protocol" ||
      result.error.kind === "contract"
    ) {
      resetField("password");
    }
  };

  const onSubmit = handleSubmit(handleValidSubmit);

  return (
    <form className="w-full max-w-sm space-y-5" noValidate onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          E-posta
        </label>
        <input
          {...register("email")}
          aria-describedby={errors.email ? "email-error" : undefined}
          aria-invalid={errors.email ? "true" : "false"}
          autoComplete="username"
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          id="email"
          type="email"
        />
        {errors.email ? (
          <p className="mt-1 text-sm text-red-700" id="email-error">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Şifre
        </label>
        <input
          {...register("password")}
          aria-describedby={errors.password ? "password-error" : undefined}
          aria-invalid={errors.password ? "true" : "false"}
          autoComplete="current-password"
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          id="password"
          type="password"
        />
        {errors.password ? (
          <p className="mt-1 text-sm text-red-700" id="password-error">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p className="text-sm text-red-700" role="alert">
          {formError}
        </p>
      ) : null}

      <button
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
