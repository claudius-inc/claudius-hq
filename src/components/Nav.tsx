import Link from "next/link";
import Image from "next/image";
import { MobileMenu } from "./MobileMenu";

const links = [
  { href: "/projects", label: "Projects" },
  { href: "/ideas", label: "Ideas" },
  { href: "/stocks", label: "Stocks" },
];

export async function Nav() {
  return (
    <nav className="border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <Link href="/" className="flex items-center gap-2">
            <Image 
              src="/logo.png" 
              alt="Claudius HQ" 
              width={24} 
              height={24}
              className="w-6 h-6 rounded-lg"
            />
            <span className="font-bold text-gray-900">Claudius HQ</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Mobile hamburger */}
          <MobileMenu links={links} />
        </div>
      </div>
    </nav>
  );
}
