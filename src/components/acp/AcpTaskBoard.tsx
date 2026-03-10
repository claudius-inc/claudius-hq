"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AcpTaskColumn } from "./AcpTaskColumn";
import { AcpTaskDetailModal } from "./AcpTaskDetailModal";
import type { AcpTask } from "@/db/schema";

interface AcpTaskBoardProps {
  tasks: AcpTask[];
}

export function AcpTaskBoard({ tasks }: AcpTaskBoardProps) {
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<AcpTask | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const pending = tasks.filter((t) => (t.status ?? "pending") === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done").slice(0, 10);

  const handleTaskClick = (task: AcpTask) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  const handleStatusChange = async (taskId: number, status: string, result?: string) => {
    const body: Record<string, unknown> = { status };
    if (result !== undefined) {
      body.result = result;
    }

    const res = await fetch(`/api/acp/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update task");
    }

    // Refresh the page to get updated data
    router.refresh();
  };

  const handleDelete = async (taskId: number) => {
    const res = await fetch(`/api/acp/tasks/${taskId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete task");
    }

    // Refresh the page to get updated data
    router.refresh();
  };

  return (
    <>
      <div className="grid md:grid-cols-3 gap-4">
        <AcpTaskColumn
          title="Pending"
          status="pending"
          tasks={pending}
          count={pending.length}
          onTaskClick={handleTaskClick}
        />
        <AcpTaskColumn
          title="In Progress"
          status="in_progress"
          tasks={inProgress}
          count={inProgress.length}
          onTaskClick={handleTaskClick}
        />
        <AcpTaskColumn
          title="Done"
          status="done"
          tasks={done}
          count={done.length}
          onTaskClick={handleTaskClick}
        />
      </div>

      <AcpTaskDetailModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
      />
    </>
  );
}
