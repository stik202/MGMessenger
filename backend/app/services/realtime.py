import json
from collections import defaultdict

from fastapi import WebSocket


class RealtimeHub:
    def __init__(self) -> None:
        self._event_connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._call_rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect_events(self, login: str, ws: WebSocket) -> None:
        await ws.accept()
        self._event_connections[login].add(ws)

    def disconnect_events(self, login: str, ws: WebSocket) -> None:
        self._event_connections[login].discard(ws)
        if not self._event_connections[login]:
            self._event_connections.pop(login, None)

    async def notify_users(self, logins: list[str], payload: dict) -> None:
        msg = json.dumps(payload)
        for login in logins:
            sockets = list(self._event_connections.get(login, set()))
            for ws in sockets:
                try:
                    await ws.send_text(msg)
                except Exception:
                    self.disconnect_events(login, ws)

    async def connect_call(self, room_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._call_rooms[room_id].add(ws)

    def disconnect_call(self, room_id: str, ws: WebSocket) -> None:
        self._call_rooms[room_id].discard(ws)
        if not self._call_rooms[room_id]:
            self._call_rooms.pop(room_id, None)

    async def broadcast_call(self, room_id: str, sender: WebSocket, message: str) -> None:
        sockets = list(self._call_rooms.get(room_id, set()))
        for ws in sockets:
            if ws is sender:
                continue
            try:
                await ws.send_text(message)
            except Exception:
                self.disconnect_call(room_id, ws)


realtime_hub = RealtimeHub()
