"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register, ApiError } from "@/lib/api";
import { LogoStacked } from "@/components/layout/Logo";

/** Deriva um slug válido (minúsculas, sem acento, hífen simples) a partir do nome. */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export default function RegisterPage() {
  const router = useRouter();
  const [barbershopName, setBarbershopName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Enquanto o usuário não editar o slug manualmente, ele acompanha o nome.
  function onNameChange(v: string) {
    setBarbershopName(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function onSlugChange(v: string) {
    setSlugEdited(true);
    // Sanitização leve durante a digitação (o backend valida o formato final).
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      await register({ barbershopName, slug, adminName, email, password });
      router.replace("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar a conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-2xl"
      >
        <div className="mb-6 flex flex-col items-center">
          <LogoStacked />
          <p className="mt-3 text-sm text-muted-foreground">Crie sua barbearia</p>
        </div>

        <Field label="Nome da barbearia" value={barbershopName} onChange={onNameChange} />
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-muted-foreground">
            Endereço de acesso (slug)
          </span>
          <input
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
            required
            minLength={3}
            maxLength={40}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Só letras minúsculas, números e hífen. Ex.: barbearia-do-ze
          </span>
        </label>
        <Field label="Seu nome (administrador)" value={adminName} onChange={setAdminName} />
        <Field label="E-mail" type="email" value={email} onChange={setEmail} />
        <Field
          label="Senha (mín. 8 caracteres)"
          type="password"
          value={password}
          onChange={setPassword}
        />
        <Field
          label="Confirme a senha"
          type="password"
          value={confirm}
          onChange={setConfirm}
        />

        {error && (
          <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-gold w-full rounded-lg py-2.5 font-semibold disabled:cursor-not-allowed"
        >
          {loading ? "Criando..." : "Criar barbearia"}
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
        required
        minLength={type === "password" ? 8 : undefined}
      />
    </label>
  );
}
