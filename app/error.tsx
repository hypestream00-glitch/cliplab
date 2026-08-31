"use client";

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-medium">Algo deu errado</h1>
      <p className="mt-2 text-sm text-muted-foreground">Não foi possível concluir a operação. Tente de novo.</p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-muted-foreground">ID {error.digest}</p> : null}
    </div>
  );
}
