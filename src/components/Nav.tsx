import Link from "next/link";
import db from "@/lib/db";

async function getUnreadCount(): Promise<number> {
  try {
    const result = await db.execute("SELECT COUNT(*) as count FROM comments WHERE is_read = 0");
    return Number((result.rows[0] as unknown as { count: number }).count);
  } catch {
    return 0;
  }
}

export async function Nav() {
  const unreadCount = await getUnreadCount();

  return (
    <nav className="border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-emerald-600 text-lg">⚡</span>
            <span className="font-bold text-gray-900">Claudius HQ</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Projects
            </Link>
            <Link href="/ideas" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Ideas
            </Link>
            <Link href="/tasks" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Tasks
            </Link>
            <Link href="/activity" className="relative text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Activity
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-3.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-blue-500 rounded-full">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
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
