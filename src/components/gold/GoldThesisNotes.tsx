import { marked } from "marked";

interface GoldThesisNotesProps {
  thesisNotes: string;
  editMode: boolean;
  onChange: (value: string) => void;
}

export function GoldThesisNotes({
  thesisNotes,
  editMode,
  onChange,
}: GoldThesisNotesProps) {
  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Thesis Notes</h2>
      {editMode ? (
        <textarea
          value={thesisNotes}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 border rounded-lg font-mono text-sm"
          rows={10}
          placeholder="Your gold thesis in markdown..."
        />
      ) : thesisNotes ? (
        <div 
          className="prose prose-sm max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: marked(thesisNotes) as string }}
        />
      ) : (
        <p className="text-gray-400 text-sm">No thesis notes. Click Edit to add.</p>
      )}
    </div>
  );
}
