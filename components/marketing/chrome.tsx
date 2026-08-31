import Link from "next/link";
import { brand } from "@/lib/config/brand";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/#produto", label: "Produto" },
  { href: "/#recursos", label: "Recursos" },
  { href: "/pricing", label: "Preços" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="text-[14px] font-semibold tracking-tight">
          {brand.name}
        </Link>
        <nav className="hidden items-center gap-5 text-[13px] text-muted-foreground md:flex" aria-label="Principal">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Começar grátis</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[14px] font-semibold">{brand.name}</p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{brand.tagline}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-[13px] sm:grid-cols-3">
          <div className="space-y-2">
            <p className="font-medium text-foreground">Produto</p>
            <Link href="/#como-funciona" className="block text-muted-foreground hover:text-foreground">
              Como funciona
            </Link>
            <Link href="/pricing" className="block text-muted-foreground hover:text-foreground">
              Preços
            </Link>
            <Link href="/register" className="block text-muted-foreground hover:text-foreground">
              Começar
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Conta</p>
            <Link href="/login" className="block text-muted-foreground hover:text-foreground">
              Entrar
            </Link>
            <Link href="/forgot-password" className="block text-muted-foreground hover:text-foreground">
              Recuperar senha
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Legal</p>
            <Link href="/terms" className="block text-muted-foreground hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacy" className="block text-muted-foreground hover:text-foreground">
              Privacidade
            </Link>
          </div>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-[12px] text-muted-foreground">
        © {new Date().getFullYear()} {brand.name}. Todos os direitos reservados.
      </p>
    </footer>
  );
}
