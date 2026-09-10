import { useEffect, useState } from 'react';
import type { Camera, CameraInput } from '../types';
import { api } from '../api';

export function useInventory() {
  const [list, setList] = useState<Camera[]>([]);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [form, setForm] = useState<CameraInput>({
    name: '', location: '', ip: '', username: 'admin', password: '',
    has_ptz: true, enabled: true,
  });
  const [saving, setSaving] = useState(false);

  const load = () => api.listCameras().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing(null); setForm({
    name: '', location: '', ip: '', username: 'admin', password: '',
    has_ptz: true, enabled: true,
  }); };
  const startEdit = (c: Camera) => { setEditing(c); setForm({ ...c }); };

  const save = async (onChanged?: () => void) => {
    setSaving(true);
    try {
      if (editing) await api.updateCamera(editing.id, form);
      else await api.createCamera(form);
      setEditing(null);
      onChanged?.();
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number, onChanged?: () => void) => {
    if (!confirm('¿Eliminar esta cámara del inventario?')) return;
    await api.deleteCamera(id);
    onChanged?.();
    load();
  };

  const set = (k: keyof CameraInput, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return { list, editing, form, saving, startNew, startEdit, save, remove, set };
}
