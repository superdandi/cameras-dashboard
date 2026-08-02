import socket, sys
ip = sys.argv[1]
def scan(ports):
    openp = []
    for p in ports:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.25)
        try:
            if s.connect_ex((ip, p)) == 0: openp.append(p)
        except OSError: pass
        s.close()
    return openp
ranges = [list(range(1,1024))[::3], list(range(1024,10000))[::7], list(range(10000,65536))[::19]]
import concurrent.futures as cf
allports = sorted(set(ranges[0]) | set(ranges[1]) | set(ranges[2]))
print(f"Escaneando {len(allports)} puertos (muestreo) en {ip}...", flush=True)
with cf.ThreadPoolExecutor(max_workers=96) as ex:
    res = ex.map(scan, [allports[i:i+8] for i in range(0, len(allports), 8)])
openp = sorted(set([p for chunk in res for p in chunk]))
print("PUERTOS ABIERTOS:", openp)
