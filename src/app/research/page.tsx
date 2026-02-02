import db, { ensureDB } from "@/lib/db";
import { ResearchNote, Project } from "@/lib/types";
import { Nav } from "@/components/Nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

const noteTypeColors: Record<string, string> = {
  general: "bg-gray-100 text-gray-700",
  competitor: "bg-red-100 text-red-700",
  market: "bg-blue-100 text-blue-700",
  tech: "bg-purple-100 text-purple-700",
  user_feedback: "bg-amber-100 text-amber-700",
};

const noteTypeEmojis: Record<string, string> = {
  general: "📝",
  competitor: "🏁",
  market: "📊",
  tech: "⚙️",
  user_feedback: "💬",
};

async function getData(noteType?: string, projectId?: string) {
  await ensureDB();

  let sql = `SELECT rn.*, i.title as idea_title, p.name as project_name
             FROM research_notes rn
             LEFT JOIN ideas i ON rn.idea_id = i.id
             LEFT JOIN projects p ON rn.project_id = p.id`;
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (noteType) {
    conditions.push("rn.note_type = ?");
    args.push(noteType);
  }
  if (projectId) {
    conditions.push("rn.project_id = ?");
    args.push(Number(projectId));
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY rn.created_at DESC";

  const [notesRes, projectsRes] = await Promise.all([
    db.execute({ sql, args }),
    db.execute("SELECT id, name FROM projects ORDER BY name"),
  ]);

  return {
    notes: notesRes.rows as unknown as ResearchNote[],
    projects: projectsRes.rows as unknown as Pick<Project, "id" | "name">[],
  };
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ note_type?: string; project_id?: string }>;
}) {
  const params = await searchParams;
  const { notes, projects } = await getData(params.note_type, params.project_id);
  const noteTypes = ["general", "competitor", "market", "tech", "user_feedback"];

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">🔬 Research Notes</h1>
          <span className="text-sm text-gray-400">{notes.length} notes</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/research"
              className={`status-badge ${!params.note_type ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition-colors`}
            >
              All Types
            </Link>
            {noteTypes.map((type) => (
              <Link
                key={type}
                href={`/research?note_type=${type}${params.project_id ? `&project_id=${params.project_id}` : ""}`}
                className={`status-badge ${params.note_type === type ? noteTypeColors[type] : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition-colors`}
              >
                {noteTypeEmojis[type]} {type.replace("_", " ")}
              </Link>
            ))}
          </div>

          {projects.length > 0 && (
            <div className="flex flex-wrap gap-2 border-l border-gray-200 pl-3">
              <Link
                href={`/research${params.note_type ? `?note_type=${params.note_type}` : ""}`}
                className={`status-badge ${!params.project_id ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition-colors`}
              >
                All Projects
              </Link>
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/research?project_id=${p.id}${params.note_type ? `&note_type=${params.note_type}` : ""}`}
                  className={`status-badge ${params.project_id === String(p.id) ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition-colors`}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Notes List */}
        {notes.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-gray-400">No research notes found</div>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="card-hover">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`status-badge ${noteTypeColors[note.note_type]}`}>
                        {noteTypeEmojis[note.note_type]} {note.note_type.replace("_", " ")}
                      </span>
                      {note.project_name && (
                        <Link
                          href={`/projects/${note.project_id}`}
                          className="status-badge bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          {note.project_name}
                        </Link>
                      )}
                      {note.idea_title && (
                        <span className="status-badge bg-purple-50 text-purple-600">
                          💡 {note.idea_title}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900">{note.title}</h3>
                    {note.content && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {note.content}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {note.source_url && (
                        <a
                          href={note.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:text-emerald-700 truncate max-w-[200px]"
                        >
                          🔗 {new URL(note.source_url).hostname}
                        </a>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(note.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
