import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Camera, CameraInput } from '../types';
import { api } from '../api';

interface Props {
  onChanged: () => void;
  onReorder?: (cameras: Camera[]) => void;
}

const empty: CameraInput = { name: '', location: '', ip: '', username: 'admin', password: '', has_ptz: true, enabled: true };

function SortableRow({
  camera,
  onEdit,
  onRemove,
}: {
  camera: Camera;
  onEdit: (c: Camera) => void;
  onRemove: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: camera.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between rounded-lg bg-panel px-3 py-2 ${isDragging ? 'inv-row-dragging' : 'inv-row'}`}
    >
      <div className="flex items-center min-w-0">
        <div className="inv-drag-handle" {...attributes} {...listeners} title="Arrastrar para reordenar">
          ⠿
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-fg">{camera.name}</span>
            <span className={`h-2 w-2 rounded-full ${camera.enabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          </div>
          <div className="truncate text-xs text-muted">{camera.ip} · {camera.main_stream || 'sin stream'} · {camera.model}</div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button onClick={() => onEdit(camera)} className="rounded bg-muted/10 px-2 py-1 text-xs hover:bg-muted/20">Editar</button>
        <button onClick={() => onRemove(camera.id)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/30">Borrar</button>
      </div>
    </div>
  );
}

export default function InventoryPanel({ onChanged, onReorder }: Props) {
  const [list, setList] = useState<Camera[]>([]);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [form, setForm] = useState<CameraInput>(empty);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const load = () => api.listCameras().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing(null); setForm(empty); };
  const startEdit = (c: Camera) => { setEditing(c); setForm({ ...c }); };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await api.updateCamera(editing.id, form);
      else await api.createCamera(form);
      setEditing(null);
      onChanged();
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('¿Eliminar esta cámara del inventario?')) return;
    await api.deleteCamera(id);
    onChanged();
    load();
  };

  const set = (k: keyof CameraInput, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = list.findIndex((c) => c.id === active.id);
    const newIndex = list.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(list, oldIndex, newIndex);

    setList(reordered);
    api.reorderCameras(reordered.map((c) => c.id)).catch(console.error);
    onReorder?.(reordered);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-fg">Inventario</h2>
        <button onClick={startNew} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90">
          + Añadir cámara
        </button>
      </div>

      {(editing || form.name || form.ip) && (
        <div className="grid gap-2 rounded-xl bg-panel p-3 sm:grid-cols-2">
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="Nombre (CAM-01)" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="IP (192.168.1.x)" value={form.ip} onChange={(e) => set('ip', e.target.value)} />
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="Ubicación" value={form.location} onChange={(e) => set('location', e.target.value)} />
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="Modelo" value={form.model} onChange={(e) => set('model', e.target.value)} />
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="Stream main (cam01)" value={form.main_stream} onChange={(e) => set('main_stream', e.target.value)} />
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="Stream sub (cam01sd)" value={form.sub_stream} onChange={(e) => set('sub_stream', e.target.value)} />
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="Usuario (admin)" value={form.username} onChange={(e) => set('username', e.target.value)} />
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" type="password" placeholder="Password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={!!form.has_ptz} onChange={(e) => set('has_ptz', e.target.checked)} /> PTZ
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={!!form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Habilitada
          </label>
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90">
              {editing ? 'Guardar cambios' : 'Crear'}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-lg bg-muted/10 px-4 py-1.5 text-sm hover:bg-muted/20">Cancelar</button>
          </div>
        </div>
      )}

      <div className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={list.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {list.map((c) => (
              <SortableRow
                key={c.id}
                camera={c}
                onEdit={startEdit}
                onRemove={remove}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
