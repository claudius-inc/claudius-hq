import Link from "next/link";
import db from "@/lib/db";
import { MobileMenu } from "./MobileMenu";
import { GlobalSearch } from "./GlobalSearch";
import { MoreDropdown } from "./MoreDropdown";

async function getUnreadCount(): Promise<number> {
  try {
    const result = await db.execute("SELECT COUNT(*) as count FROM comments WHERE is_read = 0");
    return Number((result.rows[0] as unknown as { count: number }).count);
  } catch {
    return 0;
  }
}

async function getUnreadEmailCount(): Promise<number> {
  try {
    const result = await db.execute("SELECT COUNT(*) as count FROM emails WHERE is_read = 0");
    return Number((result.rows[0] as unknown as { count: number }).count);
  } catch {
    return 0;
  }
}

const primaryLinks = [
  { href: "/projects", label: "Projects" },
  { href: "/stocks", label: "Stocks" },
  { href: "/emails", label: "Emails" },
];

const moreLinks = [
  { href: "/ideas", label: "Ideas" },
  { href: "/tasks", label: "Tasks" },
  { href: "/activity", label: "Activity" },
  { href: "/research", label: "Research" },
  { href: "/crons", label: "Crons" },
  { href: "/integrations", label: "Integrations" },
];

export async function Nav() {
  const [unreadCount, unreadEmails] = await Promise.all([
    getUnreadCount(),
    getUnreadEmailCount(),
  ]);

  // All links for mobile menu
  const allLinks = [...primaryLinks, ...moreLinks].map((link) => {
    if (link.href === "/activity") return { ...link, badge: unreadCount };
    if (link.href === "/emails") return { ...link, badge: unreadEmails };
    return link;
  });

  // More links with badges
  const moreLinksWithBadge = moreLinks.map((link) => {
    if (link.href === "/activity") return { ...link, badge: unreadCount };
    return link;
  });

  return (
    <nav className="border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-emerald-600 text-lg">⚡</span>
            <span className="font-bold text-gray-900">Claudius HQ</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                {link.label === "Emails" && unreadEmails > 0 ? (
                  <span className="relative">
                    {link.label}
                    <span className="absolute -top-1.5 -right-3.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-blue-500 rounded-full">
                      {unreadEmails > 9 ? "9+" : unreadEmails}
                    </span>
                  </span>
                ) : (
                  link.label
                )}
              </Link>
            ))}
            <MoreDropdown links={moreLinksWithBadge} />
            <GlobalSearch />
          </div>

          {/* Mobile hamburger */}
          <MobileMenu links={allLinks} />
        </div>
      </div>
    </nav>
  );
}
