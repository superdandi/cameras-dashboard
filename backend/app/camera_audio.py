"""Camera audio streaming — eseecloud demux + MP3 encoding for browser playback.

Per-camera pipeline: eseecloud_audio.py → ffmpeg (AAC→MP3).
Serves MP3 frames via HTTP streaming for <audio> elements in the frontend.
"""
from __future__ import annotations

import collections
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

log = logging.getLogger("camera_audio")

SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"
ESEELOUD_AUDIO_SCRIPT = SCRIPTS_DIR / "eseecloud_audio.py"
PYTHON = sys.executable

IDLE_TIMEOUT = 60  # seconds without clients before stopping pipeline
BUF_SIZE = 64 * 1024  # ring buffer size per camera (bytes)


class _CameraAudio:
    """Per-camera audio pipeline + ring buffer."""

    def __init__(self, cam_id: int, ip: str) -> None:
        self.cam_id = cam_id
        self.ip = ip
        self.buffer: collections.deque[bytes] = collections.deque(maxlen=256)
        self._buf_bytes = 0
        self._lock = threading.Lock()
        self._cond = threading.Condition(self._lock)
        self._proc: subprocess.Popen | None = None
        self._reader: threading.Thread | None = None
        self._refcount = 0
        self._running = False
        self._last_client = 0.0

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._reader = threading.Thread(
            target=self._pipeline, daemon=True, name=f"cam-audio-{self.cam_id}"
        )
        self._reader.start()
        log.info("Audio pipeline started for cam %d (%s)", self.cam_id, self.ip)

    def stop(self) -> None:
        self._running = False
        if self._proc:
            try:
                self._proc.kill()
            except OSError:
                pass
            self._proc = None
        log.info("Audio pipeline stopped for cam %d", self.cam_id)

    def _pipeline(self) -> None:
        while self._running:
            try:
                cmd_demux = [PYTHON, str(ESEELOUD_AUDIO_SCRIPT), self.ip, "11"]
                cmd_ffmpeg = [
                    "ffmpeg", "-hide_banner", "-loglevel", "error",
                    "-f", "aac", "-i", "pipe:0",
                    "-ac", "1", "-ar", "22050",
                    "-c:a", "libmp3lame", "-b:a", "96k",
                    "-f", "mp3", "pipe:1",
                ]
                p_demux = subprocess.Popen(
                    cmd_demux,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                )
                p_ffmpeg = subprocess.Popen(
                    cmd_ffmpeg,
                    stdin=p_demux.stdout,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                )
                # Allow p_demux.stdout to be garbage collected
                if p_demux.stdout:
                    p_demux.stdout.close()
                self._proc = p_ffmpeg

                chunk_size = 4096
                while self._running:
                    data = p_ffmpeg.stdout.read(chunk_size)
                    if not data:
                        break
                    with self._lock:
                        self.buffer.append(data)
                        self._buf_bytes += len(data)
                        # Trim old data
                        while self._buf_bytes > BUF_SIZE:
                            old = self.buffer.popleft()
                            self._buf_bytes -= len(old)
                        self._cond.notify_all()

                # Wait for child processes
                p_ffmpeg.wait(timeout=5)
                p_demux.wait(timeout=5)
            except Exception as e:
                if self._running:
                    log.error("Pipeline error cam %d: %s, restarting...", self.cam_id, e)
                    time.sleep(2)
            finally:
                self._proc = None

    def ref(self) -> None:
        with self._lock:
            self._refcount += 1
            self._last_client = time.monotonic()
            if not self._running:
                self.start()

    def unref(self) -> None:
        with self._lock:
            self._refcount = max(0, self._refcount - 1)
            self._last_client = time.monotonic()

    @property
    def refcount(self) -> int:
        return self._refcount

    def iter_mp3(self, timeout: float = IDLE_TIMEOUT):
        """Yield MP3 chunks. Blocks until data available. Yields until timeout with no data."""
        empty_count = 0
        while True:
            data = b""
            with self._lock:
                if self.buffer:
                    data = b"".join(self.buffer)
                    self.buffer.clear()
                    self._buf_bytes = 0
                    empty_count = 0
                else:
                    if not self._cond.wait(timeout=1.0):
                        empty_count += 1
                        if empty_count >= timeout:
                            return
            if data:
                yield data


class CameraAudioManager:
    """Singleton managing audio pipelines for all cameras."""

    def __init__(self) -> None:
        self._cameras: dict[int, _CameraAudio] = {}
        self._lock = threading.Lock()

    def _ensure(self, cam_id: int, ip: str) -> _CameraAudio:
        with self._lock:
            if cam_id not in self._cameras:
                self._cameras[cam_id] = _CameraAudio(cam_id, ip)
            return self._cameras[cam_id]

    def start(self, cam_id: int, ip: str) -> _CameraAudio:
        ca = self._ensure(cam_id, ip)
        ca.ref()
        return ca

    def stop(self, cam_id: int) -> None:
        with self._lock:
            ca = self._cameras.get(cam_id)
            if ca:
                ca.unref()

    def shutdown_all(self) -> None:
        with self._lock:
            for ca in self._cameras.values():
                ca.stop()
            self._cameras.clear()

    def get_audio_iter(self, cam_id: int, ip: str):
        ca = self.start(cam_id, ip)
        try:
            yield from ca.iter_mp3(timeout=IDLE_TIMEOUT)
        finally:
            self.stop(cam_id)


manager = CameraAudioManager()
