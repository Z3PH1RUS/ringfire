#!/usr/bin/env python3
# RINGFIRE GALAXY — optional LAN fallback (host-authoritative HTTP)
# Default multiplayer is internet MQTT rooms on GitHub Pages (no python).
# Python 3 stdlib only. Inspired by 1973 PLATO Empire (Daleske et al.)
# Original names, map dressing, and code. No copied assets.
"""RINGFIRE GALAXY LAN host (optional).

Internet rooms: https://z3ph1rus.github.io/ringfire/  (CREATE ROOM / JOIN ROOM).
This process is only for same-Wi-Fi play without the public broker.
Share the printed URL after it binds. Two browser tabs on localhost = two players.
"""
from __future__ import annotations

import json
import math
import os
import random
import socket
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
TAU = math.pi * 2.0
TICK_HZ = 20.0
DT = 1.0 / TICK_HZ
MAX_PLAYERS = 12
MAX_TORP_INFLIGHT = 6
MAX_CHAT = 10
STALE_SEC = 12.0
HOST_STALE_SEC = 18.0

RACES = {
    "helios": {
        "name": "HELIOS", "color": "#e8d48a",
        "speed": 1.00, "hull": 100, "phaser": 1.00, "torp": 1.00,
        "fuel": 100, "turn": 1.00, "cx": 260, "cy": 260,
    },
    "veil": {
        "name": "VEIL", "color": "#3dcc5c",
        "speed": 0.80, "hull": 122, "phaser": 1.42, "torp": 1.38,
        "fuel": 112, "turn": 0.86, "cx": 260, "cy": 1340,
    },
    "spark": {
        "name": "SPARK", "color": "#3ad4d4",
        "speed": 1.34, "hull": 78, "phaser": 0.70, "torp": 0.74,
        "fuel": 88, "turn": 1.22, "cx": 1340, "cy": 260,
    },
    "mandate": {
        "name": "MANDATE", "color": "#e07038",
        "speed": 0.98, "hull": 106, "phaser": 1.14, "torp": 1.16,
        "fuel": 102, "turn": 0.96, "cx": 1340, "cy": 1340,
    },
}
RACE_ORDER = ("helios", "veil", "spark", "mandate")
N = "N"


def clamp(v, a, b):
    return a if v < a else b if v > b else v


def dist(ax, ay, bx, by):
    dx, dy = ax - bx, ay - by
    return math.sqrt(dx * dx + dy * dy)


def ang_norm(a):
    while a > math.pi:
        a -= TAU
    while a < -math.pi:
        a += TAU
    return a


def ang_to(ax, ay, bx, by):
    return math.atan2(by - ay, bx - ax)


def warp_speed(w, mul, fuel=100.0):
    if w <= 0:
        return (7.0 * mul) if fuel <= 0 else 0.0
    return (12.0 + w * w * 1.05) * mul


def turn_rate(w, mul):
    return (3.05 - w * 0.18) * mul


def fuel_burn(w, shields):
    b = 0.28 * w
    if w >= 7:
        b += (w - 6) * 0.40
    if shields:
        b += 0.85
    return b


def detect_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.4)
        s.connect(("1.1.1.1", 53))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                return ip
    except Exception:
        pass
    return "127.0.0.1"


def r1(v):
    return round(float(v), 1)


def r2(v):
    return round(float(v), 2)


# ---------- map: 5-spot die, 25 worlds, original names ----------
def _home_pts(cx, cy):
    return [
        (cx - 50, cy - 34),
        (cx + 52, cy - 24),
        (cx + 2, cy + 54),
    ]


def build_planet_defs():
    homes = [
        ("helios", "Crown", "Aurel", "Solis"),
        ("veil", "Groves", "Thorn", "Moss"),
        ("spark", "Volt", "Gleam", "Ion"),
        ("mandate", "Ember", "Cinder", "Forge"),
    ]
    out = []
    for race, a, b, c in homes:
        rc = RACES[race]
        pts = _home_pts(rc["cx"], rc["cy"])
        for i, name in enumerate((a, b, c)):
            out.append({
                "id": name.lower(),
                "name": name.upper(),
                "x": pts[i][0], "y": pts[i][1],
                "r": 12 if i == 0 else 10,
                "owner0": race,
                "armies0": 50,
                "def0": 7 if i == 0 else 5,
                "cap": 80,
                "minG": 8,
                "classM": True,
                "seat": i == 0,
                "home": race,
                "color": rc["color"],
            })
    # neighbor neutrals (2 per edge between neighboring homes)
    neutrals = [
        ("drift", "DRIFT", 620, 330, False),
        ("halo", "HALO", 980, 330, False),
        ("ridge", "RIDGE", 1270, 620, False),
        ("spire", "SPIRE", 1270, 980, False),
        ("dusk", "DUSK", 620, 1270, False),
        ("vale", "VALE", 980, 1270, False),
        ("quarry", "QUARRY", 330, 620, False),
        ("fen", "FEN", 330, 980, False),
        ("axis", "AXIS", 800, 800, True),
        ("hub", "HUB", 800, 698, False),
        ("nexus", "NEXUS", 902, 800, False),
        ("well", "WELL", 698, 800, False),
        ("core", "CORE", 800, 902, False),
    ]
    for pid, name, x, y, cm in neutrals:
        out.append({
            "id": pid,
            "name": name,
            "x": x, "y": y,
            "r": 13 if pid == "axis" else 9,
            "owner0": N,
            "armies0": 25,
            "def0": 4,
            "cap": 40,
            "minG": 4,
            "classM": cm,
            "seat": False,
            "home": None,
            "color": "#9aa8b0" if not cm else "#c8d4c0",
        })
    assert len(out) == 25, len(out)
    return out


PLANET_DEFS = build_planet_defs()


class Game:
    def __init__(self):
        self.lock = threading.Lock()
        self.reset_lobby()

    def reset_lobby(self, keep_humans=False):
        humans = []
        if keep_humans:
            humans = [p for p in self.players.values() if not p.get("ai")]
        self.phase = "lobby"  # lobby | play | over
        self.time = 0.0
        self.winner = None
        self.fill_ai = False
        self.host_id = None
        self.players = {}
        self.planets = []
        self.torps = []
        self.events = []
        self.chat = []
        self.seq_ev = 0
        self.torp_seq = 0
        self.elim = set()
        self.over_reason = ""
        self.tick_n = 0
        if humans:
            for p in humans:
                p["ready"] = False
                p["alive"] = False
                p["inp"] = {}
                p["seq"] = 0
                self.players[p["id"]] = p
                if self.host_id is None:
                    self.host_id = p["id"]
                p["host"] = p["id"] == self.host_id

    def make_planets(self):
        self.planets = []
        for d in PLANET_DEFS:
            self.planets.append({
                "id": d["id"], "name": d["name"],
                "x": d["x"], "y": d["y"], "r": d["r"],
                "owner": d["owner0"], "armies": d["armies0"],
                "def": float(d["def0"]), "cap": d["cap"], "minG": d["minG"],
                "classM": d["classM"], "seat": d["seat"], "home": d["home"],
                "color": d["color"],
                "gunCd": 0.4 + random.random() * 0.6,
                "recruit": random.random() * 6,
                "battle": None,
            })

    def planet(self, pid):
        for p in self.planets:
            if p["id"] == pid:
                return p
        return None

    def race_planets(self, race):
        return [p for p in self.planets if p["owner"] == race]

    def counts(self):
        sc = {r: 0 for r in RACE_ORDER}
        sc[N] = 0
        for p in self.planets:
            sc[p["owner"]] = sc.get(p["owner"], 0) + 1
        return sc

    def emit(self, kind, **kw):
        self.seq_ev += 1
        ev = {"i": self.seq_ev, "k": kind, "t": r1(self.time)}
        ev.update(kw)
        self.events.append(ev)
        if len(self.events) > 24:
            self.events = self.events[-24:]

    def add_chat(self, name, race, text):
        text = (text or "").strip()[:72]
        if not text:
            return
        self.chat.append({
            "t": r1(self.time), "n": name[:16], "r": race, "m": text,
        })
        if len(self.chat) > MAX_CHAT:
            self.chat = self.chat[-MAX_CHAT:]

    # ----- lobby -----
    def join(self, name, race, old_id=None):
        name = (name or "ANON").strip().upper()[:16]
        name = "".join(c for c in name if c.isalnum() or c in " -_") or "ANON"
        if race not in RACES:
            return {"err": "pick a race"}
        if self.phase != "lobby":
            # reconnect
            if old_id and old_id in self.players:
                p = self.players[old_id]
                p["last"] = time.time()
                return {"id": p["id"], "host": p["id"] == self.host_id, "ok": 1}
            return {"err": "match already running"}
        humans = [p for p in self.players.values() if not p.get("ai")]
        if old_id and old_id in self.players:
            p = self.players[old_id]
            p["name"] = name
            p["race"] = race
            p["last"] = time.time()
            return {"id": p["id"], "host": p["id"] == self.host_id, "ok": 1}
        if len(humans) >= MAX_PLAYERS:
            return {"err": "server full (12)"}
        pid = uuid.uuid4().hex[:10]
        rec = {
            "id": pid, "name": name, "race": race, "ready": False,
            "ai": False, "host": False, "alive": False,
            "inp": {}, "seq": 0, "last": time.time(),
            "chat_t": 0.0,
            "did_x": False, "did_h": False, "did_s": False, "did_m": False,
        }
        if self.host_id is None:
            self.host_id = pid
        rec["host"] = pid == self.host_id
        self.players[pid] = rec
        return {"id": pid, "host": rec["host"], "ok": 1}

    def set_ready(self, pid, ready):
        p = self.players.get(pid)
        if not p or p.get("ai") or self.phase != "lobby":
            return {"err": "no"}
        if not p.get("race"):
            return {"err": "pick a race"}
        p["ready"] = bool(ready)
        p["last"] = time.time()
        return {"ok": 1}

    def host_cmd(self, pid, op, fill_ai=None):
        p = self.players.get(pid)
        if not p or p["id"] != self.host_id:
            return {"err": "host only"}
        if op == "fill":
            self.fill_ai = bool(fill_ai)
            return {"ok": 1, "fillAI": self.fill_ai}
        if op == "start":
            if fill_ai is not None:
                self.fill_ai = bool(fill_ai)
            return self.start_match()
        if op == "reset":
            self.reset_lobby(keep_humans=True)
            return {"ok": 1}
        if op == "quit":
            self.phase = "over"
            self.winner = None
            self.over_reason = "HOST QUIT"
            return {"ok": 1}
        return {"err": "unknown"}

    def start_match(self):
        humans = [p for p in self.players.values() if not p.get("ai")]
        ready = [p for p in humans if p.get("ready") and p.get("race") in RACES]
        if not ready:
            # allow host to start if they at least picked a race
            ready = [p for p in humans if p.get("race") in RACES]
        if not ready:
            return {"err": "need a race and a player"}
        # drop un-raced
        drop = [i for i, p in self.players.items() if not p.get("ai") and p.get("race") not in RACES]
        for i in drop:
            self.players.pop(i, None)
        self.make_planets()
        self.torps = []
        self.events = []
        self.elim = set()
        self.winner = None
        self.over_reason = ""
        self.time = 0.0
        self.tick_n = 0
        # AI for empty races
        present = set(p["race"] for p in self.players.values() if p.get("race") in RACES and not p.get("ai"))
        if self.fill_ai:
            for r in RACE_ORDER:
                if r not in present:
                    self.spawn_ai(r)
        for p in list(self.players.values()):
            if p.get("race") in RACES:
                self.spawn_ship(p, first=True)
        self.phase = "play"
        self.emit("start")
        self.add_chat("RINGFIRE", "helios", "MATCH LIVE — TAKE ALL 25")
        return {"ok": 1}

    def spawn_ai(self, race):
        pid = "ai-" + race[:3] + "-" + uuid.uuid4().hex[:4]
        rec = {
            "id": pid, "name": RACES[race]["name"] + "-AI", "race": race,
            "ready": True, "ai": True, "host": False, "alive": False,
            "inp": {}, "seq": 0, "last": time.time(),
            "state": "patrol", "hunt_t": 0.0, "tgt": None,
            "did_x": False, "did_h": False, "did_s": False,
        }
        self.players[pid] = rec
        return rec

    def spawn_point(self, race):
        owned = self.race_planets(race)
        if not owned:
            return None
        # prefer original home worlds still owned
        homes = [p for p in owned if p.get("home") == race]
        if homes:
            owned = homes
        else:
            # conquered home systems (planets that were someone's home)
            conquered = [p for p in owned if p.get("home") and p.get("home") != race]
            if conquered:
                owned = conquered
        b = random.choice(owned)
        a = random.random() * TAU
        return b, b["x"] + math.cos(a) * (b["r"] + 28), b["y"] + math.sin(a) * (b["r"] + 28), a + math.pi * 0.5

    def spawn_ship(self, p, first=False):
        sp = self.spawn_point(p["race"])
        if not sp:
            p["alive"] = False
            p["elim"] = True
            return False
        b, x, y, ang = sp
        rs = RACES[p["race"]]
        p.update({
            "x": x, "y": y, "ang": ang, "warp": 0,
            "hull": float(rs["hull"]), "maxHull": float(rs["hull"]),
            "fuel": float(rs["fuel"]), "maxFuel": float(rs["fuel"]),
            "armies": 0, "maxArmies": 16,
            "shieldsOn": False, "shields": 70, "maxShields": 70,
            "alive": True, "spawnT": 0.0, "flash": 0.0, "invuln": 1.8 if not first else 2.2,
            "torpCd": 0.0, "phaserCd": 0.0, "beamCd": 0.0, "hyperCd": 0.0,
            "hyperI": 0.0, "repairing": False,
            "lostArmies": 0,
        })
        return True

    # ----- sim helpers -----
    def in_orbit(self, x, y, b):
        return dist(x, y, b["x"], b["y"]) < b["r"] + 38

    def orbiting(self, ship):
        best, sc = None, 1e9
        for b in self.planets:
            if not self.in_orbit(ship["x"], ship["y"], b):
                continue
            d = dist(ship["x"], ship["y"], b["x"], b["y"])
            if d < sc:
                sc, best = d, b
        return best

    def allied(self, a, b):
        if not a or not b:
            return False
        ra = a if isinstance(a, str) else a.get("race")
        rb = b if isinstance(b, str) else b.get("race")
        return ra and rb and ra == rb

    def count_inflight(self, pid):
        n = 0
        for t in self.torps:
            if t["oid"] == pid:
                n += 1
        return n

    def fire_torp(self, ship):
        if ship["torpCd"] > 0 or not ship["alive"]:
            return
        if ship["fuel"] < 2.5:
            return
        if self.count_inflight(ship["id"]) >= MAX_TORP_INFLIGHT:
            return
        rs = RACES[ship["race"]]
        ang = ship["ang"]
        spd = 390.0
        self.torp_seq += 1
        self.torps.append({
            "id": self.torp_seq,
            "oid": ship["id"],
            "race": ship["race"],
            "x": ship["x"] + math.cos(ang) * 14,
            "y": ship["y"] + math.sin(ang) * 14,
            "vx": math.cos(ang) * spd,
            "vy": math.sin(ang) * spd,
            "life": 1.85,
            "dmg": 18.0 * rs["torp"],
            "r": 2.6,
        })
        ship["torpCd"] = 0.38
        ship["fuel"] = max(0.0, ship["fuel"] - 2.4)
        self.emit("torp", sid=ship["id"])
        dock = self.orbiting(ship)
        if dock and dock["owner"] != ship["race"]:
            self.bombard(dock, 18.0 * rs["torp"])

    def fire_phaser(self, ship):
        if ship["phaserCd"] > 0 or not ship["alive"]:
            return
        if ship["fuel"] < 6:
            return
        rs = RACES[ship["race"]]
        reach = 195.0
        half = 0.46
        ship["phaserCd"] = 0.44
        ship["fuel"] = max(0.0, ship["fuel"] - 7.0)
        self.emit("ph", sid=ship["id"], ang=r2(ship["ang"]), x=r1(ship["x"]), y=r1(ship["y"]))
        for o in self.players.values():
            if o is ship or not o.get("alive"):
                continue
            if o["race"] == ship["race"]:
                continue
            d = dist(ship["x"], ship["y"], o["x"], o["y"])
            if d > reach or d < 4:
                continue
            want = ang_to(ship["x"], ship["y"], o["x"], o["y"])
            if abs(ang_norm(want - ship["ang"])) > half:
                continue
            fall = 1.0 - 0.55 * (d / reach)
            dmg = 17.0 * rs["phaser"] * fall
            self.hit_ship(o, dmg)

    def hyper(self, ship):
        if not ship["alive"] or ship["hyperCd"] > 0:
            return
        if ship["fuel"] < 18:
            return
        rs = RACES[ship["race"]]
        hop = 118.0 + 40.0 * rs["speed"]
        ship["x"] += math.cos(ship["ang"]) * hop
        ship["y"] += math.sin(ship["ang"]) * hop
        ship["fuel"] = max(0.0, ship["fuel"] - 20.0)
        ship["hyperCd"] = 1.12
        ship["hyperI"] = 0.32
        ship["invuln"] = max(ship.get("invuln", 0), 0.32)
        self.emit("hop", sid=ship["id"], x=r1(ship["x"]), y=r1(ship["y"]))

    def detonate(self, ship):
        mine = [t for t in self.torps if t["oid"] == ship["id"]]
        if not mine:
            return
        rs = RACES[ship["race"]]
        keep = []
        boom = set()
        for t in self.torps:
            if t["oid"] == ship["id"]:
                boom.add(id(t))
                self.aoe(t["x"], t["y"], 56.0, 20.0 * rs["torp"], ship["race"], ship["id"])
                self.emit("boom", x=r1(t["x"]), y=r1(t["y"]))
            else:
                keep.append(t)
        self.torps = keep

    def aoe(self, x, y, radius, dmg, race, oid):
        for o in self.players.values():
            if not o.get("alive"):
                continue
            if o["id"] == oid:
                continue
            if o["race"] == race:
                continue
            d = dist(x, y, o["x"], o["y"])
            if d < radius + 10:
                fall = 1.0 - 0.4 * (d / (radius + 10))
                self.hit_ship(o, dmg * fall)
        for b in self.planets:
            if b["owner"] == race:
                continue
            d = dist(x, y, b["x"], b["y"])
            if d < radius + b["r"]:
                self.bombard(b, dmg * 0.85)

    def bombard(self, b, dmg):
        if b["def"] > 0:
            b["def"] = max(0.0, b["def"] - (0.65 + dmg * 0.035))
        elif b["armies"] > 0:
            lost = 2 if b["armies"] >= 3 else 1
            if dmg > 24:
                lost += 1
            b["armies"] = max(0, b["armies"] - lost)

    def hit_ship(self, ship, dmg):
        if ship.get("invuln", 0) > 0 or ship.get("hyperI", 0) > 0:
            return
        if ship.get("shieldsOn") and ship.get("shields", 0) > 0:
            soak = min(ship["shields"], dmg * 0.82)
            ship["shields"] -= soak
            dmg -= soak
            ship["flash"] = 0.12
        if dmg > 0:
            ship["hull"] -= dmg
            ship["flash"] = 0.18
        if ship["hull"] <= 0 and ship.get("alive"):
            self.kill_ship(ship)

    def kill_ship(self, ship):
        lost = int(ship.get("armies") or 0)
        ship["armies"] = 0
        ship["alive"] = False
        ship["hull"] = 0
        ship["spawnT"] = 2.3
        ship["lostArmies"] = lost
        self.emit("die", sid=ship["id"], n=lost, x=r1(ship.get("x", 0)), y=r1(ship.get("y", 0)))
        # strip this ship's torps
        self.torps = [t for t in self.torps if t["oid"] != ship["id"]]

    def try_beam(self, ship):
        if ship.get("beamCd", 0) > 0 or not ship["alive"]:
            return
        b = self.orbiting(ship)
        if not b:
            return
        if b["owner"] == ship["race"]:
            can = max(0, b["armies"] - b["minG"])
            if can <= 0 or ship["armies"] >= ship["maxArmies"]:
                return
            n = min(4, can, ship["maxArmies"] - ship["armies"])
            b["armies"] -= n
            ship["armies"] += n
            ship["beamCd"] = 0.28
            self.emit("up", sid=ship["id"], n=n, pid=b["id"])
        else:
            if ship["armies"] <= 0:
                return
            n = min(4, ship["armies"])
            ship["armies"] -= n
            self.start_battle(b, ship["race"], n)
            ship["beamCd"] = 0.28
            self.emit("dn", sid=ship["id"], n=n, pid=b["id"])

    def start_battle(self, b, side, n):
        if n <= 0:
            return
        if b["armies"] <= 0 and not b["battle"]:
            b["owner"] = side
            b["armies"] = n
            b["def"] = 2.5
            self.emit("cap", pid=b["id"], r=side)
            self.add_chat("RINGFIRE", side, b["name"] + " TAKEN BY " + RACES[side]["name"])
            return
        if not b["battle"]:
            b["battle"] = {"side": side, "atk": n, "t": 0.0}
        elif b["battle"]["side"] == side:
            b["battle"]["atk"] += n
        else:
            clash = min(b["battle"]["atk"], n)
            b["battle"]["atk"] -= clash
            n -= clash
            if b["battle"]["atk"] <= 0:
                b["battle"] = {"side": side, "atk": n, "t": 0.0} if n > 0 else None

    def tick_battle(self, b, dt):
        if not b["battle"]:
            return
        b["battle"]["t"] += dt
        if b["battle"]["t"] < 0.45:
            return
        b["battle"]["t"] = 0.0
        atk = b["battle"]["atk"]
        def_n = b["armies"]
        def_p = def_n + b["def"] * 0.55
        atk_loss = max(1, int(round(def_p * 0.16)))
        def_loss = max(1, int(round(atk * 0.2)))
        b["battle"]["atk"] = max(0, atk - atk_loss)
        b["armies"] = max(0, def_n - def_loss)
        if b["armies"] <= 0 and b["battle"]["atk"] > 0:
            pass  # fall through to capture
        elif b["battle"]["atk"] <= 0:
            if b["armies"] <= 0:
                b["armies"] = 1
            b["battle"] = None
            return
        if b["armies"] <= 0:
            winner = b["battle"]["side"]
            leftover = max(1, b["battle"]["atk"])
            b["owner"] = winner
            b["armies"] = leftover
            b["def"] = 3.0
            b["battle"] = None
            self.emit("cap", pid=b["id"], r=winner)
            self.add_chat("RINGFIRE", winner, b["name"] + " TAKEN BY " + RACES[winner]["name"])

    def apply_input(self, pid, body):
        p = self.players.get(pid)
        if not p or p.get("ai"):
            return {"err": "no"}
        p["last"] = time.time()
        seq = int(body.get("seq") or 0)
        if seq < p.get("seq", 0) - 20:
            pass
        p["seq"] = seq
        keys = body.get("keys") or body.get("k") or {}
        p["inp"] = {
            "l": bool(keys.get("l") or keys.get("left")),
            "r": bool(keys.get("r") or keys.get("right")),
            "sp": bool(keys.get("sp") or keys.get("space")),
            "f": bool(keys.get("f") or keys.get("c")),
            "x": bool(keys.get("x") or keys.get("g") or body.get("detonate")),
            "h": bool(keys.get("h") or body.get("hyper")),
            "b": bool(keys.get("b") or body.get("beam")),
            "s": bool(keys.get("s")),
            "u": bool(keys.get("u")),
            "rp": bool(keys.get("rp") or keys.get("r")),
            "w": keys.get("w"),
        }
        if "w" in keys and keys["w"] is not None:
            try:
                p["inp"]["w"] = int(keys["w"])
            except Exception:
                p["inp"]["w"] = None
        msg = body.get("chat") or body.get("msg")
        if msg and self.phase == "play":
            if self.time - p.get("chat_t", 0) >= 0.6:
                p["chat_t"] = self.time
                self.add_chat(p["name"], p["race"], str(msg))
        return {"ok": 1}

    def steer(self, e, tx, ty, dt, want_warp):
        rs = RACES[e["race"]]
        want = ang_to(e["x"], e["y"], tx, ty)
        diff = ang_norm(want - e["ang"])
        tr = turn_rate(e.get("warp", 4), rs["turn"])
        step = tr * dt
        if diff > step:
            e["ang"] += step
        elif diff < -step:
            e["ang"] -= step
        else:
            e["ang"] = want
        d = dist(e["x"], e["y"], tx, ty)
        if d < 70:
            e["warp"] = min(want_warp, 3)
        elif d < 180:
            e["warp"] = min(want_warp, 5)
        else:
            e["warp"] = want_warp

    def weakest_target(self, race):
        best, score = None, 1e9
        for b in self.planets:
            if b["owner"] == race:
                continue
            s = b["armies"] * 1.3 + b["def"] * 2
            if b["owner"] == N:
                s -= 6
            if s < score:
                score, best = s, b
        return best

    def strongest_depot(self, race):
        best, score = None, -1
        for b in self.planets:
            if b["owner"] != race:
                continue
            if b["armies"] <= b["minG"] + 1:
                continue
            s = b["armies"] - b["minG"]
            if s > score:
                score, best = s, b
        return best

    def nearest_enemy_ship(self, e, lim=340):
        best, bd = None, lim
        for o in self.players.values():
            if o is e or not o.get("alive") or o["race"] == e["race"]:
                continue
            d = dist(e["x"], e["y"], o["x"], o["y"])
            if d < bd:
                bd, best = d, o
        return best

    def update_ai(self, e, dt):
        if not e.get("alive"):
            return
        prey = self.nearest_enemy_ship(e)
        if prey:
            e["hunt_t"] = 2.2
        if e.get("hunt_t", 0) > 0:
            e["hunt_t"] -= dt
        if prey and e.get("hunt_t", 0) > 0:
            lead = warp_speed(prey.get("warp", 3), RACES[prey["race"]]["speed"], prey.get("fuel", 50)) * 0.22
            self.steer(e, prey["x"] + math.cos(prey["ang"]) * lead,
                       prey["y"] + math.sin(prey["ang"]) * lead, dt, 6)
            d = dist(e["x"], e["y"], prey["x"], prey["y"])
            diff = abs(ang_norm(ang_to(e["x"], e["y"], prey["x"], prey["y"]) - e["ang"]))
            if d < 190 and diff < 0.5:
                self.fire_phaser(e)
            if d < 260 and diff < 0.28:
                self.fire_torp(e)
            if d < 90 and e.get("hull", 1) < e.get("maxHull", 100) * 0.4:
                self.hyper(e)
            return
        if e.get("armies", 0) <= 1:
            depot = self.strongest_depot(e["race"])
            if depot:
                self.steer(e, depot["x"], depot["y"], dt, 7)
                if self.in_orbit(e["x"], e["y"], depot):
                    e["warp"] = 1
                    e["inp"] = {"b": True}
                    self.try_beam(e)
                return
        tgt = self.weakest_target(e["race"])
        if not tgt:
            return
        self.steer(e, tgt["x"], tgt["y"], dt, 7)
        if self.in_orbit(e["x"], e["y"], tgt):
            e["warp"] = 1
            if tgt["owner"] != e["race"]:
                if tgt["armies"] > 6 or tgt["def"] > 1:
                    # bomb
                    self.fire_torp(e)
                    if random.random() < 0.08:
                        self.detonate(e)
                elif e.get("armies", 0) > 1:
                    self.try_beam(e)
                else:
                    self.fire_torp(e)

    def update_ship(self, p, dt):
        if not p.get("alive"):
            if p.get("spawnT", 0) > 0:
                p["spawnT"] -= dt
                if p["spawnT"] <= 0:
                    if not self.race_planets(p["race"]):
                        self.elim.add(p["race"])
                        p["elim"] = True
                    else:
                        self.spawn_ship(p)
            return
        rs = RACES[p["race"]]
        inp = p.get("inp") or {}
        p["invuln"] = max(0.0, p.get("invuln", 0) - dt)
        p["hyperI"] = max(0.0, p.get("hyperI", 0) - dt)
        p["flash"] = max(0.0, p.get("flash", 0) - dt)
        p["torpCd"] = max(0.0, p.get("torpCd", 0) - dt)
        p["phaserCd"] = max(0.0, p.get("phaserCd", 0) - dt)
        p["beamCd"] = max(0.0, p.get("beamCd", 0) - dt)
        p["hyperCd"] = max(0.0, p.get("hyperCd", 0) - dt)

        if inp.get("l"):
            p["ang"] -= turn_rate(p.get("warp", 0), rs["turn"]) * dt
        if inp.get("r"):
            p["ang"] += turn_rate(p.get("warp", 0), rs["turn"]) * dt
        w = inp.get("w")
        if w is not None and p["fuel"] > 0:
            p["warp"] = clamp(int(w), 0, 9)
        if p["fuel"] <= 0:
            p["fuel"] = 0
            p["warp"] = 0
            p["shieldsOn"] = False

        sp = warp_speed(p.get("warp", 0), rs["speed"], p.get("fuel", 0))
        p["x"] += math.cos(p["ang"]) * sp * dt
        p["y"] += math.sin(p["ang"]) * sp * dt
        # soft world bounds
        p["x"] = clamp(p["x"], -80, 1680)
        p["y"] = clamp(p["y"], -80, 1680)

        burn = fuel_burn(p.get("warp", 0), p.get("shieldsOn"))
        p["fuel"] -= burn * dt

        dock = self.orbiting(p)
        if dock and dock["owner"] == p["race"]:
            rate = 22.0 if dock["classM"] else 5.5
            p["fuel"] = min(p["maxFuel"], p["fuel"] + rate * dt)
            if inp.get("rp") and p["hull"] < p["maxHull"]:
                p["hull"] = min(p["maxHull"], p["hull"] + 11 * dt)
                p["fuel"] = max(0.0, p["fuel"] - 1.5 * dt)
            if inp.get("u"):
                p["fuel"] = min(p["maxFuel"], p["fuel"] + 10 * dt)
        else:
            p["fuel"] = min(p["maxFuel"], p["fuel"] + 0.42 * dt)

        if p["fuel"] < 0:
            p["fuel"] = 0
        if p.get("shieldsOn"):
            p["shields"] = min(p["maxShields"], p["shields"] + 7 * dt)

        if inp.get("sp"):
            self.fire_torp(p)
        if inp.get("f"):
            self.fire_phaser(p)
        if inp.get("x"):
            if not p.get("did_x"):
                self.detonate(p)
            p["did_x"] = True
        else:
            p["did_x"] = False
        if inp.get("h"):
            if not p.get("did_h"):
                self.hyper(p)
            p["did_h"] = True
        else:
            p["did_h"] = False
        if inp.get("s"):
            if not p.get("did_s"):
                p["shieldsOn"] = not p.get("shieldsOn")
                if p["fuel"] <= 0:
                    p["shieldsOn"] = False
            p["did_s"] = True
        else:
            p["did_s"] = False
        if inp.get("b"):
            self.try_beam(p)

    def update_torps(self, dt):
        live = []
        for t in self.torps:
            t["x"] += t["vx"] * dt
            t["y"] += t["vy"] * dt
            t["life"] -= dt
            hit = False
            for o in self.players.values():
                if not o.get("alive") or o["id"] == t["oid"] or o["race"] == t["race"]:
                    continue
                if dist(t["x"], t["y"], o["x"], o["y"]) < 11 + t["r"]:
                    self.hit_ship(o, t["dmg"])
                    self.emit("boom", x=r1(t["x"]), y=r1(t["y"]))
                    hit = True
                    break
            if not hit and not str(t.get("oid","")).startswith("gun-"):
                for b in self.planets:
                    if b["owner"] == t["race"]:
                        continue
                    if dist(t["x"], t["y"], b["x"], b["y"]) < b["r"] + 3:
                        self.bombard(b, t["dmg"])
                        self.emit("boom", x=r1(t["x"]), y=r1(t["y"]))
                        hit = True
                        break
            if not hit and t["life"] > 0:
                live.append(t)
        self.torps = live

    def update_planets(self, dt):
        for b in self.planets:
            if b["owner"] != N and b["armies"] < b["cap"] and not b["battle"]:
                b["recruit"] += dt
                rate = 12.0 if b.get("home") else 16.0
                if b["recruit"] >= rate:
                    b["recruit"] = 0
                    b["armies"] += 1
            elif b["owner"] == N and b["armies"] < b["cap"] and not b["battle"]:
                b["recruit"] += dt
                if b["recruit"] >= 90.0:
                    b["recruit"] = 0
                    b["armies"] += 1
            if b["battle"]:
                self.tick_battle(b, dt)
            if b["def"] > 0:
                b["gunCd"] -= dt
                interval = 1.25 * (10 / (b["def"] + 4))
                if b["gunCd"] <= 0:
                    b["gunCd"] = interval
                    for o in self.players.values():
                        if not o.get("alive"):
                            continue
                        if o["race"] == b["owner"]:
                            continue
                        if self.in_orbit(o["x"], o["y"], b):
                            a = ang_to(b["x"], b["y"], o["x"], o["y"])
                            spd = 220
                            self.torp_seq += 1
                            # gun bolt as short-lived torp not owned by a race ship
                            self.torps.append({
                                "id": self.torp_seq, "oid": "gun-" + b["id"],
                                "race": b["owner"] if b["owner"] != N else "gun",
                                "x": b["x"] + math.cos(a) * (b["r"] + 4),
                                "y": b["y"] + math.sin(a) * (b["r"] + 4),
                                "vx": math.cos(a) * spd, "vy": math.sin(a) * spd,
                                "life": 0.85, "dmg": 5.5 + b["def"] * 0.8, "r": 2.0,
                            })
                            break

    def check_outcome(self):
        sc = self.counts()
        for r in RACE_ORDER:
            n = sc.get(r, 0)
            if n <= 0:
                self.elim.add(r)
            elif r in self.elim and n > 0:
                self.elim.discard(r)
        for r in RACE_ORDER:
            if sc.get(r, 0) >= 25:
                self.phase = "over"
                self.winner = r
                self.over_reason = RACES[r]["name"] + " HOLDS THE GALAXY"
                self.add_chat("RINGFIRE", r, self.over_reason)
                return

    def sweep_stale(self):
        now = time.time()
        if self.phase == "lobby":
            dead = []
            for pid, p in self.players.items():
                if p.get("ai"):
                    continue
                if now - p.get("last", now) > STALE_SEC:
                    dead.append(pid)
            for pid in dead:
                was_host = pid == self.host_id
                self.players.pop(pid, None)
                if was_host:
                    humans = [q for q in self.players.values() if not q.get("ai")]
                    self.host_id = humans[0]["id"] if humans else None
                    for q in self.players.values():
                        q["host"] = q["id"] == self.host_id
        elif self.phase == "play":
            host = self.players.get(self.host_id)
            if host and not host.get("ai") and now - host.get("last", now) > HOST_STALE_SEC:
                self.phase = "over"
                self.winner = None
                self.over_reason = "HOST LEFT"
                self.add_chat("RINGFIRE", "helios", "HOST LEFT — MATCH ENDS")

    def tick(self):
        if self.phase != "play":
            self.sweep_stale()
            return
        dt = DT
        self.time += dt
        self.tick_n += 1
        for p in list(self.players.values()):
            if p.get("ai"):
                if p.get("alive"):
                    p["inp"] = {}
                    self.update_ai(p, dt)
            self.update_ship(p, dt)
        self.update_torps(dt)
        self.update_planets(dt)
        if self.tick_n % 8 == 0:
            self.check_outcome()
        self.sweep_stale()

    def lobby_json(self):
        pl = []
        for p in self.players.values():
            if p.get("ai") and self.phase == "lobby":
                continue
            pl.append({
                "id": p["id"], "name": p["name"], "race": p.get("race"),
                "ready": bool(p.get("ready")), "host": p["id"] == self.host_id,
                "ai": bool(p.get("ai")),
            })
        return {
            "phase": self.phase,
            "players": pl,
            "fillAI": self.fill_ai,
            "max": MAX_PLAYERS,
            "hostId": self.host_id,
            "winner": self.winner,
            "reason": self.over_reason,
        }

    def state_json(self, pid=None):
        if self.phase == "lobby":
            return self.lobby_json()
        ships = []
        for p in self.players.values():
            if not p.get("race"):
                continue
            ships.append({
                "id": p["id"], "n": p["name"], "r": p["race"],
                "x": r1(p.get("x", 0)), "y": r1(p.get("y", 0)),
                "a": r2(p.get("ang", 0)), "w": int(p.get("warp", 0) or 0),
                "h": r1(p.get("hull", 0)), "H": int(p.get("maxHull", 100)),
                "f": r1(p.get("fuel", 0)), "F": int(p.get("maxFuel", 100)),
                "m": int(p.get("armies", 0)), "M": int(p.get("maxArmies", 16)),
                "s": 1 if p.get("shieldsOn") else 0,
                "S": r1(p.get("shields", 0)),
                "v": 1 if p.get("alive") else 0,
                "i": 1 if p.get("invuln", 0) > 0 or p.get("hyperI", 0) > 0 else 0,
                "z": r1(p.get("flash", 0)),
                "ai": 1 if p.get("ai") else 0,
                "el": 1 if p.get("race") in self.elim else 0,
            })
        planets = []
        for b in self.planets:
            rec = {
                "id": b["id"], "n": b["name"], "x": int(b["x"]), "y": int(b["y"]),
                "R": b["r"], "o": b["owner"], "m": int(b["armies"]),
                "d": r1(b["def"]), "c": 1 if b["classM"] else 0,
                "k": 1 if b["seat"] else 0, "col": b["color"],
            }
            if b["battle"]:
                rec["b"] = {"s": b["battle"]["side"], "a": int(b["battle"]["atk"])}
            planets.append(rec)
        torps = [{
            "x": r1(t["x"]), "y": r1(t["y"]),
            "r": t["race"][:1], "o": t["oid"],
        } for t in self.torps]
        sc = self.counts()
        you = None
        if pid and pid in self.players:
            you = pid
        return {
            "p": "P" if self.phase == "play" else ("O" if self.phase == "over" else "L"),
            "t": r1(self.time),
            "w": self.winner,
            "why": self.over_reason,
            "you": you,
            "sh": ships,
            "pl": planets,
            "tr": torps,
            "ch": self.chat[-8:],
            "sc": {r: sc.get(r, 0) for r in RACE_ORDER},
            "n": sc.get(N, 0),
            "ev": self.events[-10:],
            "fillAI": self.fill_ai,
            "elim": list(self.elim),
            "host": self.host_id,
        }


GAME = Game()
LAN_IP = "127.0.0.1"
PORT = 7474
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
}


def json_bytes(obj, code=200):
    data = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    return code, "application/json; charset=utf-8", data


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[http] " + (fmt % args) + "\n")

    def _cors(self, extra=None):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        if extra:
            for k, v in extra:
                self.send_header(k, v)

    def _send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 8000:
            return None
        raw = self.rfile.read(n) if n else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return None

    def do_GET(self):
        u = urlparse(self.path)
        path = u.path
        q = {}
        if u.query:
            for part in u.query.split("&"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    q[k] = v
        if path in ("/api/info", "/api/info/"):
            code, ct, body = json_bytes({
                "game": "ringfire",
                "mode": "galaxy",
                "lan": "http://%s:%d" % (LAN_IP, PORT),
                "local": "http://127.0.0.1:%d" % PORT,
                "port": PORT,
                "max": MAX_PLAYERS,
            })
            self._send(code, ct, body)
            return
        if path in ("/api/lobby", "/api/lobby/"):
            with GAME.lock:
                obj = GAME.lobby_json()
            obj["lan"] = "http://%s:%d" % (LAN_IP, PORT)
            self._send(*json_bytes(obj))
            return
        if path in ("/api/state", "/api/state/"):
            pid = q.get("id")
            with GAME.lock:
                if pid and pid in GAME.players:
                    GAME.players[pid]["last"] = time.time()
                obj = GAME.state_json(pid)
            self._send(*json_bytes(obj))
            return
        self._static(path)

    def _static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        rel = path.lstrip("/")
        if ".." in rel or rel.startswith("/"):
            self._send(403, "text/plain", b"no")
            return
        fp = os.path.normpath(os.path.join(ROOT, rel))
        if not fp.startswith(ROOT) or not os.path.isfile(fp):
            self._send(404, "text/plain; charset=utf-8", b"not found")
            return
        ext = os.path.splitext(fp)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        with open(fp, "rb") as f:
            data = f.read()
        self._send(200, ctype, data)

    def do_POST(self):
        u = urlparse(self.path)
        path = u.path.rstrip("/")
        body = self._read_json()
        if body is None:
            self._send(*json_bytes({"err": "bad json"}, 400))
            return
        with GAME.lock:
            if path == "/api/join":
                obj = GAME.join(body.get("name"), body.get("race"), body.get("id"))
            elif path == "/api/ready":
                obj = GAME.set_ready(body.get("id"), body.get("ready", True))
            elif path == "/api/input":
                obj = GAME.apply_input(body.get("id"), body)
            elif path == "/api/host":
                obj = GAME.host_cmd(body.get("id"), body.get("op") or body.get("action") or "start",
                                    body.get("fillAI") if "fillAI" in body else body.get("fill_ai"))
            elif path == "/api/leave":
                pid = body.get("id")
                if pid and pid in GAME.players and not GAME.players[pid].get("ai"):
                    was_host = pid == GAME.host_id
                    GAME.players.pop(pid, None)
                    if was_host and GAME.phase == "play":
                        GAME.phase = "over"
                        GAME.over_reason = "HOST LEFT"
                    elif was_host:
                        humans = [q for q in GAME.players.values() if not q.get("ai")]
                        GAME.host_id = humans[0]["id"] if humans else None
                obj = {"ok": 1}
            else:
                obj = {"err": "no route"}
        code = 400 if obj.get("err") else 200
        self._send(*json_bytes(obj, code))


def loop():
    acc = 0.0
    last = time.time()
    while True:
        now = time.time()
        acc += now - last
        last = now
        n = 0
        while acc >= DT and n < 4:
            with GAME.lock:
                GAME.tick()
            acc -= DT
            n += 1
        if acc > 0.5:
            acc = 0.0
        time.sleep(0.004)


def bind():
    global PORT
    err = None
    for port in range(7474, 7494):
        try:
            httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
            httpd.daemon_threads = True
            PORT = port
            return httpd
        except OSError as e:
            err = e
            continue
    raise SystemExit("could not bind 7474–7493: %s" % err)


def main():
    global LAN_IP, PORT
    LAN_IP = detect_lan_ip()
    httpd = bind()
    threading.Thread(target=loop, daemon=True).start()
    print("", flush=True)
    print("RINGFIRE GALAXY", flush=True)
    print("Share this on your Wi-Fi: http://%s:%d" % (LAN_IP, PORT), flush=True)
    print("Local test:              http://127.0.0.1:%d" % PORT, flush=True)
    print("Two browser tabs = two players.  Ctrl+C to stop.", flush=True)
    print("")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
