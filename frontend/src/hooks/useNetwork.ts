import { useEffect, useState } from 'react';
import { api, type NetworkInfo } from '../api';

export function useNetwork() {
  const [net, setNet] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      api.network().then((data) => {
        if (active) setNet(data);
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => { active = false; clearInterval(t); };
  }, []);

  return net;
}
