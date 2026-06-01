import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, Wand2, FileDown, Printer, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import { shiftsApi } from '../../api/shifts';
import { sitesApi } from '../../api/sites';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import { toneForShift } from '../../utils/shiftColors';
import {
  startOfWeek, weekDays, dateKey, indexAssignments, shiftRangeDays, exportCsv,
} from './schedulerHelpers';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ShiftSchedulerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSupervisor = user?.role === 'supervisor';

  const [siteId, setSiteId] = useState(
    isSupervisor ? user?.site_id?._id || user?.site_id || '' : ''
  );
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState('week'); // 'week' | 'month'
  const [selected, setSelected] = useState(new Set());
  const [activeDrag, setActiveDrag] = useState(null);
  const [autoPreview, setAutoPreview] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const days = useMemo(
    () => weekDays(weekStart, shiftRangeDays(weekStart, view)),
    [weekStart, view]
  );
  const periodFrom = days[0];
  const periodTo = days[days.length - 1];

  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
    enabled: !isSupervisor,
  });

  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'templates'],
    queryFn: () => shiftsApi.list(),
  });

  const calendarQuery = useQuery({
    queryKey: ['shifts', 'site-calendar', siteId, dateKey(periodFrom), dateKey(periodTo)],
    queryFn: () =>
      shiftsApi.siteCalendar({
        siteId: siteId || undefined,
        from: periodFrom.toISOString(),
        to: periodTo.toISOString(),
      }),
    enabled: Boolean(siteId) || isSupervisor,
    keepPreviousData: true,
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, user_id, date }) => shiftsApi.moveAssignment(id, { user_id, date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts', 'site-calendar'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Move failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => shiftsApi.deleteAssignment(id),
    onSuccess: () => {
      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['shifts', 'site-calendar'] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const assignmentMap = useMemo(
    () => indexAssignments(calendarQuery.data?.assignments || []),
    [calendarQuery.data]
  );

  // Build a map from assignment id → conflict types for quick lookup in cells.
  const conflictByAssignmentId = useMemo(() => {
    const map = new Map();
    for (const c of calendarQuery.data?.conflicts || []) {
      for (const id of c.assignmentIds || []) {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(c);
      }
    }
    return map;
  }, [calendarQuery.data]);

  function toggleSelected(workerId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  }

  function onDragStart(evt) {
    setActiveDrag(evt.active.data.current);
  }

  function onDragEnd(evt) {
    setActiveDrag(null);
    const overData = evt.over?.data.current;
    const activeData = evt.active?.data.current;
    if (!overData || !activeData) return;
    if (overData.userId === activeData.assignment.user_id && overData.dateKey === dateKey(new Date(activeData.assignment.date))) {
      return;
    }
    if (assignmentMap.has(`${overData.userId}:${overData.dateKey}`)) {
      toast.error('Target cell already has an assignment');
      return;
    }
    moveMutation.mutate({
      id: activeData.assignment._id,
      user_id: overData.userId,
      date: overData.dateKey,
    });
  }

  return (
    <div className="p-6">
      <SchedulerToolbar
        user={user}
        siteId={siteId}
        setSiteId={setSiteId}
        sites={sitesQuery.data?.items || []}
        weekStart={weekStart}
        setWeekStart={setWeekStart}
        view={view}
        setView={setView}
        selectedCount={selected.size}
        onBulk={() => setBulkOpen(true)}
        onAutoAssign={async (dryRun) => {
          if (!siteId) return toast.error('Pick a site first');
          try {
            const res = await shiftsApi.autoAssign({
              siteId,
              from: periodFrom.toISOString(),
              to: periodTo.toISOString(),
              dryRun,
            });
            if (dryRun) {
              setAutoPreview(res);
            } else {
              toast.success(`Auto-assigned ${res.created + res.updated} entries`);
              queryClient.invalidateQueries({ queryKey: ['shifts', 'site-calendar'] });
            }
          } catch (err) {
            toast.error(err?.response?.data?.error || 'Auto-assign failed');
          }
        }}
        onExport={() => {
          const rows = [];
          for (const w of calendarQuery.data?.workers || []) {
            const row = [w.name, w.employeeId || ''];
            for (const d of days) {
              const a = assignmentMap.get(`${w._id}:${dateKey(d)}`);
              row.push(a ? (a.isWeeklyOff ? 'WEEKLY OFF' : a.shift_id?.name || '') : '');
            }
            rows.push(row);
          }
          const headers = ['Worker', 'Employee ID', ...days.map((d) => format(d, 'EEE dd MMM'))];
          exportCsv(rows, headers, `schedule-${dateKey(periodFrom)}.csv`);
        }}
      />

      {calendarQuery.isError && (
        <ErrorBox error={calendarQuery.error} onRetry={() => calendarQuery.refetch()} />
      )}

      {(calendarQuery.data?.conflicts || []).length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">{calendarQuery.data.conflicts.length} conflict(s) detected</div>
            <ul className="mt-1 text-xs space-y-0.5">
              {calendarQuery.data.conflicts.slice(0, 5).map((c, i) => (
                <li key={i}>
                  {c.type.replace(/_/g, ' ')}
                  {c.gapHours != null ? ` — ${c.gapHours}h gap` : ''}
                </li>
              ))}
              {calendarQuery.data.conflicts.length > 5 && (
                <li>+{calendarQuery.data.conflicts.length - 5} more…</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left w-56">Worker</th>
                {days.map((d) => (
                  <th key={dateKey(d)} className="px-2 py-2 text-left whitespace-nowrap">
                    <div>{format(d, 'EEE')}</div>
                    <div className="text-[10px] text-slate-400">{format(d, 'dd MMM')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {calendarQuery.isLoading &&
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={days.length + 1} />)}

              {!calendarQuery.isLoading && (calendarQuery.data?.workers || []).length === 0 && (
                <tr>
                  <td colSpan={days.length + 1} className="px-4 py-10 text-center text-slate-400">
                    No workers at this site.
                  </td>
                </tr>
              )}

              {(calendarQuery.data?.workers || []).map((worker) => (
                <tr key={worker._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 sticky left-0 bg-white border-r">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(worker._id)}
                        onChange={() => toggleSelected(worker._id)}
                      />
                      <div>
                        <div className="font-medium text-slate-800 text-sm">{worker.name}</div>
                        <div className="text-xs text-slate-400">
                          {worker.employeeId || worker.category}
                        </div>
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const key = `${worker._id}:${dateKey(d)}`;
                    const assignment = assignmentMap.get(key);
                    return (
                      <Cell
                        key={key}
                        worker={worker}
                        date={d}
                        assignment={assignment}
                        shifts={shiftsQuery.data?.items || []}
                        conflicts={assignment ? conflictByAssignmentId.get(String(assignment._id)) : null}
                        onAssign={async (shiftId) => {
                          try {
                            await shiftsApi.assign({
                              shiftId,
                              workerIds: [worker._id],
                              from: d.toISOString(),
                              to: d.toISOString(),
                              siteId: siteId || worker.site_id || null,
                            });
                            toast.success('Assigned');
                            queryClient.invalidateQueries({ queryKey: ['shifts', 'site-calendar'] });
                          } catch (err) {
                            toast.error(err?.response?.data?.error || 'Assign failed');
                          }
                        }}
                        onDelete={(id) => deleteMutation.mutate(id)}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DragOverlay>
          {activeDrag ? (
            <ShiftPill assignment={activeDrag.assignment} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {bulkOpen && (
        <BulkAssignModal
          workerIds={Array.from(selected)}
          shifts={shiftsQuery.data?.items || []}
          siteId={siteId}
          initialFrom={periodFrom}
          initialTo={periodTo}
          onClose={() => setBulkOpen(false)}
          onAssigned={() => {
            toast.success('Bulk assignment complete');
            setSelected(new Set());
            queryClient.invalidateQueries({ queryKey: ['shifts', 'site-calendar'] });
            setBulkOpen(false);
          }}
        />
      )}

      {autoPreview && (
        <AutoAssignPreviewModal
          preview={autoPreview}
          siteId={siteId}
          periodFrom={periodFrom}
          periodTo={periodTo}
          onClose={() => setAutoPreview(null)}
          onConfirm={async () => {
            try {
              const res = await shiftsApi.autoAssign({
                siteId,
                from: periodFrom.toISOString(),
                to: periodTo.toISOString(),
                dryRun: false,
              });
              toast.success(`Saved ${res.created + res.updated} entries`);
              queryClient.invalidateQueries({ queryKey: ['shifts', 'site-calendar'] });
              setAutoPreview(null);
            } catch (err) {
              toast.error(err?.response?.data?.error || 'Save failed');
            }
          }}
        />
      )}
    </div>
  );
}

function SchedulerToolbar({
  user, siteId, setSiteId, sites, weekStart, setWeekStart, view, setView,
  selectedCount, onBulk, onAutoAssign, onExport,
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Scheduler</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Assign shifts to workers. Drag pills to move, click empty cells to assign.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {user?.role !== 'supervisor' && (
          <Field label="Site">
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className={`${inputCls} bg-white`}
            >
              <option value="">Pick a site…</option>
              {sites.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Period">
          <div className="flex items-center gap-1 mt-1">
            <button onClick={() => setWeekStart(subDays(weekStart, view === 'month' ? 28 : 7))}
              className="px-2 py-1.5 rounded border border-slate-300">
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-sm text-slate-700">
              {format(weekStart, 'dd MMM yyyy')}
            </span>
            <button onClick={() => setWeekStart(addDays(weekStart, view === 'month' ? 28 : 7))}
              className="px-2 py-1.5 rounded border border-slate-300">
              <ChevronRight size={14} />
            </button>
          </div>
        </Field>
        <Field label="View">
          <select
            value={view}
            onChange={(e) => setView(e.target.value)}
            className={`${inputCls} bg-white`}
          >
            <option value="week">Week</option>
            <option value="month">4 Weeks</option>
          </select>
        </Field>

        <button
          disabled={selectedCount === 0}
          onClick={onBulk}
          className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100 disabled:opacity-50"
        >
          Bulk Assign {selectedCount > 0 && `(${selectedCount})`}
        </button>
        <button
          onClick={() => onAutoAssign(true)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm bg-violet-600 text-white hover:bg-violet-700"
        >
          <Wand2 size={14} /> Auto Assign
        </button>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100"
        >
          <FileDown size={14} /> CSV
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100"
        >
          <Printer size={14} /> Print/PDF
        </button>
      </div>
    </div>
  );
}

function Cell({ worker, date, assignment, shifts, conflicts, onAssign, onDelete }) {
  const droppableId = `cell:${worker._id}:${dateKey(date)}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    disabled: Boolean(assignment),
    data: { userId: worker._id, dateKey: dateKey(date) },
  });

  if (assignment) {
    return (
      <td className={`px-1.5 py-1 align-top ${conflicts ? 'bg-rose-50' : ''}`}>
        <div title={conflicts ? conflicts.map((c) => c.type).join(', ') : ''}
             className={conflicts ? 'ring-2 ring-rose-400 rounded' : ''}>
          <ShiftPill
            assignment={assignment}
            onDelete={() => onDelete(assignment._id)}
          />
        </div>
      </td>
    );
  }

  return (
    <td
      ref={setNodeRef}
      className={`px-1.5 py-1 align-top transition ${isOver ? 'bg-emerald-50' : ''}`}
    >
      <AssignDropdown shifts={shifts} onSelect={onAssign} />
    </td>
  );
}

function ShiftPill({ assignment, dragging, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pill:${assignment._id}`,
    data: { assignment },
  });
  const tone = toneForShift(assignment.shift_id?.type);
  const label = assignment.isWeeklyOff
    ? 'OFF'
    : assignment.shift_id?.name || 'Shift';
  const sub = assignment.isWeeklyOff
    ? ''
    : assignment.shift_id
      ? `${assignment.shift_id.startTime}–${assignment.shift_id.endTime}`
      : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={`group relative px-2 py-1.5 rounded border text-xs cursor-grab ${
        assignment.isWeeklyOff
          ? 'bg-slate-100 text-slate-600 border-slate-200'
          : tone.pill
      } ${dragging ? 'shadow-lg cursor-grabbing' : ''}`}
    >
      <div className="font-medium">{label}</div>
      {sub && <div className="text-[10px] opacity-70">{sub}</div>}
      {!dragging && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-white border border-slate-300 text-rose-500 items-center justify-center"
          title="Remove"
        >
          <Trash2 size={9} />
        </button>
      )}
    </div>
  );
}

function AssignDropdown({ shifts, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left text-[11px] text-slate-400 border border-dashed border-slate-200 rounded px-2 py-2 hover:border-slate-400 hover:text-slate-600"
      >
        +
      </button>
      {open && (
        <div className="absolute z-10 mt-1 left-0 bg-white rounded-md shadow-lg border border-slate-200 w-44 max-h-56 overflow-y-auto">
          {shifts.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No templates</div>
          )}
          {shifts.map((s) => (
            <button
              key={s._id}
              onClick={() => {
                onSelect(s._id);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
            >
              <div className="font-medium text-slate-800">{s.name}</div>
              <div className="text-[10px] text-slate-500">{s.startTime}–{s.endTime}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkAssignModal({ workerIds, shifts, siteId, initialFrom, initialTo, onClose, onAssigned }) {
  const [shiftId, setShiftId] = useState('');
  const [from, setFrom] = useState(dateKey(initialFrom));
  const [to, setTo] = useState(dateKey(initialTo));
  const mutation = useMutation({
    mutationFn: () =>
      shiftsApi.assign({
        shiftId,
        workerIds,
        from,
        to,
        siteId: siteId || undefined,
      }),
    onSuccess: onAssigned,
    onError: (err) => toast.error(err?.response?.data?.error || 'Assign failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Bulk Assign</h2>
        <p className="text-sm text-slate-500 mt-1">{workerIds.length} worker(s) selected</p>

        <Field label="Shift">
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={`${inputCls} bg-white`}>
            <option value="">Choose a shift…</option>
            {shifts.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!shiftId || mutation.isPending}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutoAssignPreviewModal({ preview, periodFrom, periodTo, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">Auto-assign Preview</h2>
          <p className="text-xs text-slate-500">
            {format(periodFrom, 'dd MMM')} – {format(periodTo, 'dd MMM')} · {preview.generated} entries
          </p>
        </div>
        <div className="p-5 overflow-y-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 text-left">Worker</th>
                <th className="px-2 py-1.5 text-left">Date</th>
                <th className="px-2 py-1.5 text-left">Shift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.preview.slice(0, 200).map((p, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">{p.user_name}</td>
                  <td className="px-2 py-1">{p.date}</td>
                  <td className="px-2 py-1">
                    {p.isWeeklyOff ? (
                      <span className="text-slate-500">Weekly Off</span>
                    ) : (
                      p.shift_name
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.preview.length > 200 && (
            <div className="text-xs text-slate-400 mt-2">Showing 200 of {preview.preview.length} rows…</div>
          )}
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className="px-3 py-2 rounded-md bg-violet-600 text-white text-sm"
          >
            Save Preview
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
