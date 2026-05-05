import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Terminal, ShieldAlert, Library, Sparkles, PackageSearch, Wrench, Package } from "lucide-react";

const NAV_LINKS: Array<{ href: string; label: string; icon?: typeof ShieldAlert }> = [
  { href: "/", label: "Dashboard" },
  { href: "/builder", label: "Builder" },
  { href: "/library", label: "Library", icon: Library },
  { href: "/pitfalls", label: "Pitfalls", icon: ShieldAlert },
  { href: "/best-practices", label: "Best Practices", icon: Sparkles },
  { href: "/toolbox", label: "Toolbox", icon: Wrench },
  { href: "/modules", label: "Modules", icon: Package },
  { href: "/reference", label: "Reference", icon: PackageSearch },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <div className="mr-4 flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <Terminal className="h-6 w-6 text-primary" />
              <span className="hidden font-bold sm:inline-block">
                Intune PowerShell Script Builder
              </span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              {NAV_LINKS.map((link) => {
                const Icon = link.icon;
                const active =
                  link.href === "/"
                    ? location === "/"
                    : location === link.href || location.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`transition-colors hover:text-foreground/80 inline-flex items-center gap-1.5 ${
                      active ? "text-foreground" : "text-foreground/60"
                    }`}
                    data-testid={`nav-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
