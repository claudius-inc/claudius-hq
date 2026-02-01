import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-emerald-400 text-lg">⚡</span>
            <span className="font-bold text-gray-900">Claudius HQ</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Projects
            </Link>
            <Link href="/tasks" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Tasks
            </Link>
            <Link href="/activity" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Activity
            </Link>
            <Link href="/crons" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Crons
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
