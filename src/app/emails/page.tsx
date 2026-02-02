import { Nav } from "@/components/Nav";
import { EmailInbox } from "@/components/EmailInbox";

export const dynamic = "force-dynamic";

export default function EmailsPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">📧 Emails</h1>
        <EmailInbox />
      </main>
    </div>
  );
}
