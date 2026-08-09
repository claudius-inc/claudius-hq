import { PageHero } from "@/components/PageHero";
import { SpotlightSettings } from "./_components/SpotlightSettings";

export const metadata = { title: "Daily note — spotlight" };

export default function NoteSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 pb-16">
      <PageHero
        title="Daily note settings"
        subtitle="Choose which sectors get an expanded block in the daily note"
      />

      <p className="text-sm text-gray-500 mb-6">
        The standard sector tape (top two up, bottom two down) always renders. A spotlighted sector
        additionally gets a one-line callout in the Telegram push and a deep-dive block on the web
        note. Changes apply to the next note.
      </p>

      <SpotlightSettings />
    </div>
  );
}
