import { useEffect, useState } from 'react';
import type { Camera, CameraInput } from '../types';
import { api } from '../api';

interface Props {
  onChanged: () => void;
}

const empty: CameraInput = { name: '', location: '', ip: '', username: 'admin', password: '', has_ptz: true, enabled: true };

export default function InventoryPanel({ onChanged }: Props) {
  const [list, setList] = useState<Camera[]>([]);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [form, setForm] = useState<CameraInput>(empty);
  const [saving, setSaving] = useState(false);

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
          <input className="rounded bg-muted/10 px-2 py-1.5 text-sm" placeholder="IP (192.168.x.x)" value={form.ip} onChange={(e) => set('ip', e.target.value)} />
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
        {list.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg bg-panel px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg">{c.name}</span>
                <span className={`h-2 w-2 rounded-full ${c.enabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              </div>
              <div className="truncate text-xs text-muted">{c.ip} · {c.main_stream || 'sin stream'} · {c.model}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => startEdit(c)} className="rounded bg-muted/10 px-2 py-1 text-xs hover:bg-muted/20">Editar</button>
              <button onClick={() => remove(c.id)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/30">Borrar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
