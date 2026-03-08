import Link from "next/link";

export function ConditionalLink({ href, children, ...props }: { href?: string; children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void }) {
  if (href) return <Link href={href} {...props}>{children}</Link>;
  return <div {...props}>{children}</div>;
}
