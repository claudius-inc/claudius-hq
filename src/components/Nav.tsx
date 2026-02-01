import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-emerald-400 text-lg">⚡</span>
            <span className="font-bold text-zinc-100">Claudius HQ</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/projects" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Projects
            </Link>
            <Link href="/tasks" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Tasks
            </Link>
            <Link href="/activity" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Activity
            </Link>
            <Link href="/crons" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Crons
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
