import Link from "next/link";
import Image from "next/image";
import { NavSectionSwitcher } from "./NavSectionSwitcher";

const sections = [
  { href: "/projects", label: "Projects" },
  { href: "/markets", label: "Markets" },
  { href: "/acp/showcase", label: "ACP" },
];

export async function Nav() {
  return (
    <nav className="border-b border-gray-200 bg-white/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-2">
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
            <span className="text-gray-300">/</span>
            <NavSectionSwitcher sections={sections} />
          </div>
        </div>
      </div>
    </nav>
  );
}
