export interface Camera {
  id: number;
  name: string;
  location: string;
  ip: string;
  mac: string;
  model: string;
  sn: string;
  main_stream: string;
  sub_stream: string;
  snapshot: string;
  has_ptz: boolean;
  enabled: boolean;
  notes: string;
  display_order?: number;
  created_at?: string;
}

export interface CameraInput {
  name: string;
  location?: string;
  ip: string;
  mac?: string;
  model?: string;
  sn?: string;
  username?: string;
  password?: string;
  main_stream?: string;
  sub_stream?: string;
  snapshot?: string;
  has_ptz?: boolean;
  enabled?: boolean;
  notes?: string;
}

export interface CamStatus {
  id: number;
  name: string;
  ip: string;
  enabled: boolean;
  stream: string;
  ok: boolean;
  status: number;
  bytes: number;
  live_since: number;
  last_cut_at: number;
}

export interface Health {
  status: string;
  go2rtc: { ok: boolean; streams: string[] };
}

export interface Skin {
  id: string;
  label: string;
  vars: Record<string, string>;
}
