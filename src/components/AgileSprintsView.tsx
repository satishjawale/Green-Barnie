import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, Plus, Trash2 } from 'lucide-react';
import type {
  PriorityLevel,
  ProductStage,
  SprintStatus,
  SprintTask,
  Tenant,
  UserRole,
} from '../types/domain';
import { hasPermission } from '../utils/dmrv';

interface AgileSprintsViewProps {
  tenant: Tenant;
  tasks: SprintTask[];
  role: UserRole;
  onAddTask: (input: {
    sprintName: string;
    title: string;
    stage: ProductStage;
    ownerTeam: 'BFMA' | 'Arknex' | 'Joint';
    storyPoints: number;
    priority: PriorityLevel;
  }) => void;
  onMoveTask: (taskId: string, newStatus: SprintStatus) => void;
  onDeleteTask: (taskId: string) => void;
  onExportSprintCsv: () => void;
}

const COLUMNS: Array<{ key: SprintStatus; label: string }> = [
  { key: 'backlog', label: 'Sprint Backlog' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'audit_review', label: 'Arknex Audit Review' },
  { key: 'done', label: 'Done' },
];

const SPRINT_PRESETS = [
  'Sprint 1: Q4 2026 Pilot Prep & MoU',
  'Sprint 2: Q1 2027 Dubai Launch',
  'Sprint 3: Q2 2027 RAK Barjeel Launch',
  'Sprint 4: Q3 2027 Fujairah BMS Expansion',
];

export function AgileSprintsView({
  tenant,
  tasks,
  role,
  onAddTask,
  onMoveTask,
  onDeleteTask,
  onExportSprintCsv,
}: AgileSprintsViewProps) {
  const canWrite = hasPermission(role, 'sprint:write');
  const [teamFilter, setTeamFilter] = useState<'All' | 'BFMA' | 'Arknex' | 'Joint'>('All');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [title, setTitle] = useState('');
  const [sprintName, setSprintName] = useState(SPRINT_PRESETS[1]);
  const [stage, setStage] = useState<ProductStage>('P4');
  const [ownerTeam, setOwnerTeam] = useState<'BFMA' | 'Arknex' | 'Joint'>('Joint');
  const [storyPoints, setStoryPoints] = useState('5');
  const [priority, setPriority] = useState<PriorityLevel>('high');

  const filteredTasks = useMemo(() => {
    if (teamFilter === 'All') return tasks;
    return tasks.filter((t) => t.ownerTeam === teamFilter);
  }, [tasks, teamFilter]);

  const metrics = useMemo(() => {
    const totalPoints = filteredTasks.reduce((s, t) => s + t.storyPoints, 0);
    const donePoints = filteredTasks
      .filter((t) => t.status === 'done')
      .reduce((s, t) => s + t.storyPoints, 0);
    const pct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;
    return { totalPoints, donePoints, pct };
  }, [filteredTasks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 3) return;
    onAddTask({
      sprintName,
      title: trimmed,
      stage,
      ownerTeam,
      storyPoints: Math.min(21, Math.max(1, Number(storyPoints) || 3)),
      priority,
    });
    setTitle('');
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Agile Feature &amp; Compliance Delivery · {tenant.name}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Agile Sprint Board &amp; Feature Backlog
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage 2-week cross-functional sprints across BFMA field engineers and Arknex carbon auditors mapped to P1–P5 stages.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportSprintCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Sprint CSV
          </button>
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            {showCreateForm ? 'Close Task Form' : 'New Sprint Task'}
          </button>
        </div>
      </div>

      {/* Velocity & Filter Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex-1 max-w-md">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-slate-700">Sprint Story Point Velocity</span>
            <span className="font-mono tabular-nums font-bold text-[#114B33]">
              {metrics.donePoints} / {metrics.totalPoints} pts ({metrics.pct}%)
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#114B33] transition-all duration-200"
              style={{ width: `${metrics.pct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
          {(['All', 'BFMA', 'Arknex', 'Joint'] as const).map((team) => (
            <button
              key={team}
              type="button"
              onClick={() => setTeamFilter(team)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                teamFilter === team
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {team === 'All' ? 'All Teams' : team}
            </button>
          ))}
        </div>
      </section>

      {/* Add Sprint Task Form */}
      {showCreateForm && canWrite && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900">Create Sprint Backlog Item</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="sprint-task-title" className="block text-xs font-medium text-slate-700 mb-1">
                Task / User Story Title
              </label>
              <input
                id="sprint-task-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Deploy automated DEWA invoice parser for P3 MRV reporting"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114B33]/30"
              />
            </div>

            <div>
              <label htmlFor="sprint-name-select" className="block text-xs font-medium text-slate-700 mb-1">
                Sprint Iteration
              </label>
              <select
                id="sprint-name-select"
                value={sprintName}
                onChange={(e) => setSprintName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {SPRINT_PRESETS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sprint-stage-select" className="block text-xs font-medium text-slate-700 mb-1">
                GTM Stage
              </label>
              <select
                id="sprint-stage-select"
                value={stage}
                onChange={(e) => setStage(e.target.value as ProductStage)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="P1">P1 — Green Compliance Check</option>
                <option value="P2">P2 — Green Certification</option>
                <option value="P3">P3 — Annual MRV Reporting</option>
                <option value="P4">P4 — Physical Optimization</option>
                <option value="P5">P5 — Sustained FM Program</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="sprint-team-select" className="block text-xs font-medium text-slate-700 mb-1">
                Owner Team
              </label>
              <select
                id="sprint-team-select"
                value={ownerTeam}
                onChange={(e) => setOwnerTeam(e.target.value as 'BFMA' | 'Arknex' | 'Joint')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="BFMA">BFMA (Front End / FM)</option>
                <option value="Arknex">Arknex (Back End / dMRV)</option>
                <option value="Joint">Joint Delivery</option>
              </select>
            </div>

            <div>
              <label htmlFor="sprint-points-select" className="block text-xs font-medium text-slate-700 mb-1">
                Story Points (Fibonacci)
              </label>
              <select
                id="sprint-points-select"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white"
              >
                {[1, 2, 3, 5, 8, 13, 21].map((pt) => (
                  <option key={pt} value={pt}>
                    {pt} pts
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sprint-priority-select" className="block text-xs font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                id="sprint-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28]"
            >
              Add to Backlog
            </button>
          </div>
        </form>
      )}

      {/* 4-Column Agile Kanban Board */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {COLUMNS.map((col, colIndex) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.key);
          const colPoints = colTasks.reduce((s, t) => s + t.storyPoints, 0);
          return (
            <div
              key={col.key}
              data-testid={`sprint-col-${col.key}`}
              className="bg-slate-100/70 border border-slate-200 rounded-xl p-4 flex flex-col min-h-[340px]"
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/80">
                <h2 className="text-sm font-semibold text-slate-900">{col.label}</h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {colTasks.length} · {colPoints} pts
                </span>
              </div>

              <div className="space-y-3 flex-1">
                {colTasks.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No items in column</p>
                ) : (
                  colTasks.map((task) => {
                    const prevCol = colIndex > 0 ? COLUMNS[colIndex - 1].key : null;
                    const nextCol = colIndex < COLUMNS.length - 1 ? COLUMNS[colIndex + 1].key : null;
                    return (
                      <article
                        key={task.taskId}
                        className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-mono font-semibold text-[#114B33]">
                            {task.stage} · {task.ownerTeam}
                          </span>
                          <span className="font-mono tabular-nums">
                            {task.storyPoints} pts
                          </span>
                        </div>

                        <h3 className="text-sm font-medium text-slate-900 leading-snug">
                          {task.title}
                        </h3>

                        <div className="text-[11px] text-slate-500">
                          {task.sprintName} · Priority:{' '}
                          <span
                            className={
                              task.priority === 'high'
                                ? 'text-red-700 font-medium'
                                : task.priority === 'medium'
                                ? 'text-amber-700 font-medium'
                                : 'text-slate-600'
                            }
                          >
                            {task.priority}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-1">
                            {prevCol && (
                              <button
                                type="button"
                                disabled={!canWrite}
                                onClick={() => onMoveTask(task.taskId, prevCol)}
                                aria-label={`Move '${task.title}' back to ${prevCol}`}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md disabled:opacity-30"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {nextCol && (
                              <button
                                type="button"
                                disabled={!canWrite}
                                onClick={() => onMoveTask(task.taskId, nextCol)}
                                aria-label={`Advance '${task.title}' to ${nextCol}`}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#114B33] hover:bg-emerald-50 rounded-md disabled:opacity-30"
                              >
                                Advance
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => onDeleteTask(task.taskId)}
                              aria-label={`Delete task '${task.title}'`}
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
