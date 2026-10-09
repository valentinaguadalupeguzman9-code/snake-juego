"use strict";

/* ============================================================
 * SNAKE.IO — Zonas, poderes y evolución
 * ------------------------------------------------------------
 * Estructura del archivo:
 *   1. Utilidades matemáticas
 *   2. Configuración (zonas, ítems, poderes, skins, misiones)
 *   3. Almacenamiento persistente (localStorage)
 *   4. Sprites de brillo
 *   5. Clase Snake  → jugador, enemigos y la Serpiente Gigante
 *   6. Clase Game   → mundo, zonas, ítems, poderes, eventos, IA
 *   7. Clase Input  → ratón, teclado y joystick táctil
 *   8. Interfaz     → menú, tienda, misiones, game over, victoria
 *   9. Arranque
 * ============================================================ */

/* ============================================================
 * 1. UTILIDADES MATEMÁTICAS
 * ============================================================ */

const TAU = Math.PI * 2;

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const lerp = (a, b, t) => a + (b - a) * t;
const distSq = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

function normalizeAngle(angle) {
  angle = angle % TAU;
  if (angle > Math.PI) angle -= TAU;
  if (angle < -Math.PI) angle += TAU;
  return angle;
}

function rotateToward(current, target, maxDelta) {
  const diff = normalizeAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(diff) * maxDelta);
}

function hexToRgba(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/* ============================================================
 * 2. CONFIGURACIÓN
 * ============================================================ */

const CONFIG = {
  world: 3600,          // tamaño total del mapa
  grid: 3,              // el mapa se divide en 3x3 zonas
  segmentSpacing: 5,    // distancia entre nodos del cuerpo

  baseSegments: 30,
  baseSpeed: 165,
  speedGain: 0.3,
  maxSpeed: 240,
  baseTurn: 3.7,
  turnLoss: 0.004,
  minTurn: 2.4,

  aiTarget: 8,          // enemigos simultáneos
  aiRespawnDelay: 2.5,
  aiPoints: [8, 170],

  spawn: { comida: 340, moneda: 80, diamante: 12, estrella: 7, caja: 6 },
  orbsPerElement: 4,    // orbes de evolución por elemento en el mapa
  evolveNeeded: 5,      // orbes necesarios para evolucionar

  fireAura: 115,        // radio del aura de fuego
  iceAura: 270,         // radio de ralentizado del hielo
  passiveMagnet: 190,   // imán pasivo de la evolución cristal
  activeMagnet: 300,    // imán del poder
  meteorRadius: 115,
  meteorDelay: 1.7,

  bossDelay: 90,        // segundos antes de poder aparecer el jefe
  bossPoints: 950,

  aiRampTime: 75,       // cada cuántos segundos sube la dificultad
  aiMax: 14,            // enemigos simultáneos máximo
  aiSpeedRamp: 0.012,   // bonus de velocidad por segundo de partida

  respawnShield: 3,     // segundos de protección al reaparecer

  portalPairs: 3,       // pares de portales en el mapa
  portalRadius: 52,
  portalCooldown: 2.5,

  obstacleCount: 8,     // obstáculos móviles
  obstacleSpeed: 62,
  obstacleRadius: 34,

  itemTtl: 14,          // vida de los objetos temporales

  eventMin: 24,
  eventMax: 38,
  zoneChangeMin: 28,
  zoneChangeMax: 46,

  shrinkInset: 420,     // cuánto se achica el mapa por evento
  maxInset: 560,

  victoryBonus: 250,
  rankRows: 10,
  saveKey: "snakeio_zen",
};

/** Las 5 regiones del mapa y su propiedad especial. */
const ZONES = {
  bosque:  { name: "Bosque",  fill: "#0b2418", tint: "#4ade80", shape: "leaf",
             effect: "Comida x2" },
  volcan:  { name: "Volcán",  fill: "#2a1108", tint: "#fb923c", shape: "ember",
             effect: "Más velocidad" },
  hielo:   { name: "Hielo",   fill: "#0a2130", tint: "#7dd3fc", shape: "snow",
             effect: "Deslizar" },
  desierto:{ name: "Desierto",fill: "#2b2009", tint: "#fbbf24", shape: "dune",
             effect: "Imán natural" },
  espacio: { name: "Espacio", fill: "#140a2e", tint: "#a78bfa", shape: "star",
             effect: "Sin gravedad" },
};
const ZONE_KEYS = Object.keys(ZONES);

/** Elementos de evolución y la zona donde aparecen sus orbes. */
const ELEMENTS = {
  fuego:     { name: "Fuego",     zone: "volcan",   color: "#fb923c" },
  hielo:     { name: "Hielo",     zone: "hielo",    color: "#7dd3fc" },
  cristal:   { name: "Cristal",   zone: "espacio",  color: "#a78bfa" },
  electrico: { name: "Eléctrico", zone: "desierto", color: "#facc15" },
};
const ELEMENT_KEYS = Object.keys(ELEMENTS);

/** Ítems coleccionables. */
const ITEMS = {
  comida:   { color: "#4ade80", r: 5,   points: 1,  coins: 0,  grow: 1 },
  moneda:   { color: "#fbbf24", r: 6.5, points: 2,  coins: 1,  grow: 0 },
  diamante: { color: "#22d3ee", r: 8,   points: 15, coins: 10, grow: 3 },
  estrella: { color: "#f472b6", r: 8,   points: 10, coins: 0,  grow: 2, power: true },
  caja:     { color: "#a78bfa", r: 9,   points: 5,  coins: 0,  grow: 1, box: true },
  corazon:  { color: "#fb7185", r: 8.5, points: 8,  coins: 0,  grow: 2, heart: true, temp: true },
  pocion:   { color: "#c084fc", r: 8.5, points: 4,  coins: 0,  grow: 1, potion: true, temp: true },
  llave:    { color: "#facc15", r: 7.5, points: 4,  coins: 3,  grow: 0, key: true, temp: true },
  orbe:     { color: "#ffffff", r: 7,   points: 3,  coins: 0,  grow: 1 },
};

/** Poderes temporales: duración + recarga (segundos) y precio. */
const POWERS = {
  velocidad:      { name: "Velocidad",      short: "Vel",  duration: 6,  cooldown: 12, price: 60,  color: "#facc15" },
  iman:           { name: "Imán",           short: "Imán", duration: 8,  cooldown: 14, price: 70,  color: "#22d3ee" },
  escudo:         { name: "Escudo",         short: "Esc",  duration: 5,  cooldown: 15, price: 90,  color: "#4ade80" },
  congelar:       { name: "Congelar",       short: "Gel",  duration: 4,  cooldown: 20, price: 110, color: "#7dd3fc" },
  teletransporte: { name: "Teletransporte", short: "TP",   duration: 0,  cooldown: 18, price: 80,  color: "#a78bfa" },
  fantasma:       { name: "Fantasma",       short: "Fan",  duration: 7,  cooldown: 22, price: 100, color: "#94a3b8" },
};
const POWER_IDS = Object.keys(POWERS);

/** Ojos y patrones libres para personalizar la serpiente. */
const EYES = [
  { id: "normal",  name: "Normal" },
  { id: "agudo",   name: "Focado" },
  { id: "enojado", name: "Enojado" },
  { id: "tranquilo", name: "Tranquilo" },
  { id: "robot",   name: "Robot" },
];

const PATTERNS = [
  { id: "liso",    name: "Liso" },
  { id: "rayas",   name: "Rayas" },
  { id: "puntos",  name: "Puntos" },
  { id: "anillos", name: "Anillos" },
];

/** Skins comprables con monedas. */
const SKINS = [
  { id: "neon",     name: "Neón",     price: 0,   color: "#22d3ee", mode: "solid" },
  { id: "verde",    name: "Verde",    price: 0,   color: "#4ade80", mode: "solid" },
  { id: "rosa",     name: "Rosa",     price: 150, color: "#f472b6", mode: "solid" },
  { id: "magma",    name: "Magma",    price: 350, color: "#fb923c", mode: "fire" },
  { id: "escarcha", name: "Escarcha", price: 350, color: "#7dd3fc", mode: "ice" },
  { id: "dorado",   name: "Dorado",   price: 450, color: "#fbbf24", mode: "gold" },
  { id: "arcoiris", name: "Arcoíris", price: 650, color: "#a78bfa", mode: "rainbow" },
  { id: "galaxia",  name: "Galaxia",  price: 800, color: "#818cf8", mode: "galaxy" },
];

/** Misiones con recompensa en monedas. */
const MISSIONS = [
  { id: "food",  name: "Comé 100 comidas",       target: 100, reward: 120, stat: "foods" },
  { id: "coins", name: "Recolectá 200 monedas",  target: 200, reward: 200, stat: "coins" },
  { id: "time",  name: "Sobreviví 120 segundos", target: 120, reward: 180, stat: "bestTime" },
  { id: "kills", name: "Derrotá 10 serpientes",  target: 10,  reward: 260, stat: "kills" },
  { id: "boss",  name: "Derrotá a la Gigante",   target: 1,   reward: 500, stat: "bosses" },
  { id: "evo",   name: "Evolucioná 5 veces",     target: 5,   reward: 300, stat: "evos" },
];

/** Desafíos diarios: se renuevan cada día (se agrupan 3 por fecha). */
const DAILY_POOL = [
  { id: "d_food",  name: "Comé 40 comidas",        target: 40,  reward: 90,  stat: "foods" },
  { id: "d_coins", name: "Recolectá 25 monedas",   target: 25,  reward: 80,  stat: "coins" },
  { id: "d_kills", name: "Eliminá 3 serpientes",   target: 3,   reward: 140, stat: "kills" },
  { id: "d_time",  name: "Sobreviví 60 segundos",  target: 60,  reward: 110, stat: "time" },
  { id: "d_boss",  name: "Derrotá al jefe",        target: 1,   reward: 220, stat: "bosses" },
  { id: "d_evo",   name: "Evolucioná 1 vez",       target: 1,   reward: 120, stat: "evos" },
  { id: "d_keys",  name: "Conseguí 3 llaves",      target: 3,   reward: 100, stat: "keys" },
];

/** Medallas: se desbloquean solas y dan monedas al reclamarlas. */
const ACHIEVEMENTS = [
  { id: "first",  name: "Primeras comidas", desc: "Comé 10 comidas",        target: 10,  stat: "foods",    reward: 50 },
  { id: "hungry", name: "Devorador",        desc: "Comé 250 comidas",       target: 250, stat: "foods",    reward: 180 },
  { id: "hunter", name: "Cazadora",         desc: "Eliminá 10 serpientes",  target: 10,  stat: "kills",    reward: 200 },
  { id: "tank",   name: "Superviviente",    desc: "Sobreviví 120 segundos", target: 120, stat: "bestTime", reward: 150 },
  { id: "rich",   name: "Fortuna",          desc: "Sumá 500 monedas",       target: 500, stat: "coins",    reward: 220 },
  { id: "slayer", name: "Caza gigantes",    desc: "Derrotá al jefe",        target: 1,   stat: "bosses",   reward: 400 },
  { id: "mutant", name: "Mutación",         desc: "Evolucioná 5 veces",     target: 5,   stat: "evos",     reward: 250 },
  { id: "ace",    name: "As del ranking",   desc: "Alcanzá 800 puntos",     target: 800, stat: "best",     reward: 300 },
];

/** Nombres disponibles para la IA. */
const CONFIG_NAMES = [
  "Nyx", "Kairo", "Luna", "Bolt", "Pixel", "Rex", "Mochi", "Nova",
  "Cosmo", "Tito", "Vera", "Onix", "Kiwi", "Zara", "Draco", "Momo",
  "Eco", "Lito", "Fenix", "Uva",
];

/* ============================================================
 * 3. ALMACENAMIENTO PERSISTENTE
 * ============================================================ */

function defaultSave() {
  return {
    wallet: 0,
    best: 0,
    name: "",
    skins: ["neon", "verde"],
    equipped: "neon",
    appearance: { skin: "neon", eyes: "normal", pattern: "liso", color: "" },
    settings: { names: true, minimap: true, particles: true, shake: true, trails: true },
    powers: { velocidad: 1, iman: 1, escudo: 1, congelar: 1, teletransporte: 1, fantasma: 1 },
    stats: { foods: 0, coins: 0, bestTime: 0, kills: 0, bosses: 0, evos: 0, best: 0, keys: 0 },
    claimed: {},
    medals: {},
    daily: null,
  };
}

function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return {
      ...base,
      ...data,
      appearance: { ...base.appearance, ...(data.appearance || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
      powers: { ...base.powers, ...(data.powers || {}) },
      stats: { ...base.stats, ...(data.stats || {}) },
      claimed: { ...base.claimed, ...(data.claimed || {}) },
      medals: { ...base.medals, ...(data.medals || {}) },
      daily: data.daily || null,
      skins: Array.isArray(data.skins) && data.skins.length ? data.skins : base.skins,
    };
  } catch (error) {
    return base;
  }
}

const SAVE = loadSave();

function persist() {
  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(SAVE));
  } catch (error) {
    // localStorage puede no estar disponible (modo privado)
  }
}

/** Texto breve del motivo de muerte (se muestra en el killfeed). */
function causeLabel(cause) {
  const type = cause && cause.type;
  if (type === "pared") return "chocó con la pared";
  if (type === "roca") return "chocó con una roca";
  if (type === "meteorito") return "le cayó un meteorito";
  if (type === "erupcion") return "quedó en la erupción";
  if (type === "fuego") return "entró en el aura de fuego";
  if (type === "snake") return "chocó con otra serpiente";
  return "quedó fuera";
}

/* ---------------- Desafíos diarios y medallas ---------------- */

/** Fecha local en formato AAAA-MM-DD. */
function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Garantiza que SAVE.daily corresponda al día de hoy (3 desafíos). */
function ensureDaily() {
  const key = todayKey();
  if (SAVE.daily && SAVE.daily.date === key) return SAVE.daily;

  const pool = [...DAILY_POOL];
  const ids = [];
  while (ids.length < 3 && pool.length) {
    const i = randInt(0, pool.length - 1);
    ids.push(pool[i].id);
    pool.splice(i, 1);
  }
  SAVE.daily = { date: key, ids, progress: {}, claimed: {} };
  persist();
  return SAVE.daily;
}

/** Avanza el progreso de los desafíos diarios que miden `stat`. */
function bumpDaily(stat, amount) {
  if (!amount) return;
  const daily = ensureDaily();
  for (const id of daily.ids) {
    const def = DAILY_POOL.find((d) => d.id === id);
    if (!def || def.stat !== stat) continue;
    daily.progress[id] = (daily.progress[id] || 0) + amount;
  }
}

/** Desbloquea las medallas cuyo objetivo ya se cumplió. */
function checkMedals() {
  for (const m of ACHIEVEMENTS) {
    if (SAVE.medals[m.id]) continue;
    const value = SAVE.stats[m.stat] || 0;
    if (value >= m.target) {
      SAVE.medals[m.id] = true;
      if (typeof UI !== "undefined" && UI.toast) {
        UI.toast(`Medalla: ${m.name}`, "#fbbf24");
      }
    }
  }
}

/* ============================================================
 * 4. SPRITES DE BRILLO
 * ============================================================ */

const glowCache = new Map();

function glowSprite(color) {
  let cached = glowCache.get(color);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");

  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, hexToRgba(color, 0.95));
  grad.addColorStop(0.3, hexToRgba(color, 0.45));
  grad.addColorStop(1, hexToRgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  glowCache.set(color, canvas);
  return canvas;
}

/** Color por tramos según el patrón de la skin. */
function bodyColor(mode, index, base) {
  switch (mode) {
    case "rainbow": return `hsl(${(index * 14) % 360} 90% 62%)`;
    case "fire":    return index % 2 ? "#f97316" : "#fde047";
    case "ice":     return index % 2 ? base : "#e0f2fe";
    case "gold":    return index % 2 ? "#fbbf24" : "#fde68a";
    case "galaxy":  return index % 3 ? base : "#c4b5fd";
    default:        return base;
  }
}

/* ============================================================
 * 5. CLASE SNAKE
 * ============================================================ */

class Snake {
  constructor({ x, y, name, color, mode = "solid", isPlayer = false, isBoss = false, points = 0, eyes = "normal", pattern = "liso" }) {
    this.name = name;
    this.color = color;
    this.mode = mode;            // patrón de dibujo (skin)
    this.eyes = eyes;            // tipo de ojos
    this.pattern = pattern;      // patrón del cuerpo
    this.isPlayer = isPlayer;
    this.isBoss = isBoss;
    this.points = points;
    this.size = CONFIG.baseSegments + points;
    this.alive = true;

    this.angle = rand(-Math.PI, Math.PI);
    this.targetAngle = this.angle;

    // Camino del cuerpo: el índice 0 es SIEMPRE la cabeza viva
    this.path = [];
    const back = this.angle + Math.PI;
    for (let i = 0; i < this.size; i++) {
      this.path.push({
        x: x + Math.cos(back) * i * CONFIG.segmentSpacing,
        y: y + Math.sin(back) * i * CONFIG.segmentSpacing,
      });
    }

    this.segments = this.computeSegments();
    this.eatFlash = 0;

    // Estado de batalla
    this.frozen = 0;             // segundos congelada
    this.invuln = 0;             // protección tras reaparecer
    this.speedMult = 1;          // multiplicador impuesto por Game
    this.speedBonus = 0;         // bonus por dificultad progresiva
    this.evolution = null;       // solo el jugador evoluciona
    this.lives = 0;              // vidas extra (solo el jugador)
    this.behavior = "wander";    // comportamiento de la IA

    // IA
    this.thinkTimer = rand(0, 0.25);
    this.aiWander = this.angle;
  }

  /** Radio del cuerpo (la Gigante es más grande). */
  get radius() {
    const cap = this.isBoss ? 30 : 15;
    return 7 + Math.min(cap, Math.sqrt(this.size) * 0.7);
  }

  /** Velocidad base (el multiplicador lo aplica Game). */
  get velocity() {
    const base = CONFIG.baseSpeed + this.points * CONFIG.speedGain + this.speedBonus;
    return Math.min(CONFIG.maxSpeed, base) * this.speedMult;
  }

  /* ------------------------- Actualización ------------------------- */

  update(dt, game) {
    if (!this.alive) return;

    if (this.invuln > 0) this.invuln -= dt;

    if (this.frozen > 0) {
      this.frozen -= dt;
      this.eatFlash = Math.max(0, this.eatFlash - dt * 3);
      return;
    }

    if (!this.isPlayer) {
      this.thinkTimer -= dt;
      if (this.thinkTimer <= 0) {
        this.thinkTimer = rand(0.12, 0.24);
        this.think(game);
      }
    }

    const maxTurn = Math.max(CONFIG.minTurn, CONFIG.baseTurn - this.points * CONFIG.turnLoss) * dt;
    this.angle = rotateToward(this.angle, this.targetAngle, maxTurn);

    const head = this.path[0];
    head.x += Math.cos(this.angle) * this.velocity * dt;
    head.y += Math.sin(this.angle) * this.velocity * dt;

    const next = this.path[1];
    if (next && distSq(head.x, head.y, next.x, next.y) >= CONFIG.segmentSpacing ** 2) {
      this.path.unshift({ x: head.x, y: head.y });
    }

    this.trimPath();
    this.segments = this.computeSegments();
    this.eatFlash = Math.max(0, this.eatFlash - dt * 3);
  }

  /** Corta la cola del camino para que no crezca sin control. */
  trimPath() {
    const path = this.path;
    const limit = (this.size - 1) * CONFIG.segmentSpacing + CONFIG.segmentSpacing * 6;
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      acc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      if (acc > limit) {
        path.length = i;
        return;
      }
    }
  }

  /** Posiciones exactas de cada segmento, separadas por `segmentSpacing`. */
  computeSegments() {
    const path = this.path;
    const spacing = CONFIG.segmentSpacing;
    const needed = (this.size - 1) * spacing;
    const out = [path[0]];
    let acc = 0;

    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg === 0) continue;
      if (acc + seg >= needed) {
        const t = (needed - acc) / seg;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        return out;
      }
      acc += seg;
      out.push(b);
    }

    // El camino aún es corto (recién creció): extendemos la cola
    const last = path[path.length - 1];
    const prev = path[path.length - 2] || last;
    let dx = last.x - prev.x;
    let dy = last.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx = (dx / len) * spacing;
    dy = (dy / len) * spacing;
    while (out.length < this.size) {
      const tail = out[out.length - 1];
      out.push({ x: tail.x + dx, y: tail.y + dy });
    }
    return out;
  }

  /** Mueve toda la serpiente a una nueva posición (teletransporte). */
  teleport(x, y) {
    const head = this.path[0];
    const dx = x - head.x;
    const dy = y - head.y;
    for (const node of this.path) {
      node.x += dx;
      node.y += dy;
    }
    this.segments = this.computeSegments();
  }

  /* --------------------------- IA --------------------------- */

  think(game) {
    const head = this.path[0];
    const b = game.bounds;
    const margin = this.isBoss ? 520 : 380;
    const cx = (b.l + b.r) / 2;
    const cy = (b.t + b.b) / 2;

    // 1) Cerca del borde: huye hacia el centro
    if (head.x < b.l + margin || head.y < b.t + margin || head.x > b.r - margin || head.y > b.b - margin) {
      this.targetAngle = Math.atan2(cy - head.y, cx - head.x);
      return;
    }

    // 2) Peligro al frente (se evalúa antes que la persecución)
    const danger = this.senseDanger(game);
    if (danger !== null) {
      this.targetAngle = danger;
      return;
    }

    // 3) Persecución: la Gigante y las serpientes "cazadoras"
    const player = game.player;
    const chases = this.isBoss || this.behavior === "hunter";
    if (chases && player && player.alive && player.invuln <= 0) {
      const range = this.isBoss ? 1100 : 820;
      const d = distSq(head.x, head.y, player.path[0].x, player.path[0].y);
      if (d < range * range) {
        this.targetAngle = Math.atan2(player.path[0].y - head.y, player.path[0].x - head.x);
        return;
      }
    }

    // 4) Comida cercana
    const food = game.nearestFood(head.x, head.y, 560);
    if (food) {
      this.targetAngle = Math.atan2(food.y - head.y, food.x - head.x);
      return;
    }

    // 5) Deambular
    this.aiWander += rand(-0.8, 0.8);
    this.targetAngle = normalizeAngle(this.aiWander);
  }

  /** Mira 3 puntos hacia adelante y esquiva lo que encuentre. */
  senseDanger(game) {
    const head = this.path[0];
    const r = this.radius;
    const probes = [r * 5, r * 9, r * 14];
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const b = game.bounds;

    for (const d of probes) {
      const px = head.x + fx * d;
      const py = head.y + fy * d;

      if (px < b.l || py < b.t || px > b.r || py > b.b) {
        return Math.atan2((b.t + b.b) / 2 - head.y, (b.l + b.r) / 2 - head.x);
      }

      for (const other of game.snakes) {
        if (other === this || !other.alive || other.size < this.size) continue;

        const radius = r + other.radius + 12;
        const radiusSq = radius * radius;
        const segs = other.segments;
        for (let i = 0; i < segs.length; i += 2) {
          if (distSq(px, py, segs[i].x, segs[i].y) < radiusSq) {
            const ox = segs[i].x - head.x;
            const oy = segs[i].y - head.y;
            const cross = fx * oy - fy * ox;
            return normalizeAngle(this.angle - (cross === 0 ? 1 : Math.sign(cross)) * 1.35);
          }
        }
      }
    }

    // El aura de fuego del jugador mata sin importar el tamaño
    const player = game.player;
    if (player && player.alive && player.evolution === "fuego") {
      const aura = CONFIG.fireAura + r + 90;
      const ph = player.path[0];
      if (distSq(head.x, head.y, ph.x, ph.y) < aura * aura) {
        return Math.atan2(head.y - ph.y, head.x - ph.x);
      }
    }

    return null;
  }
}

/* ============================================================
 * 6. CLASE GAME
 * ============================================================ */

class Game {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.minimap = minimap;
    this.mmCtx = minimap.getContext("2d");

    this.world = CONFIG.world;
    this.state = "menu"; // menu | playing | paused | dead | victory

    this.snakes = [];
    this.items = [];
    this.particles = [];
    this.meteors = [];

    this.player = null;
    this.boss = null;

    // Zonas (3x3) y sus decoraciones
    this.cells = [];
    this.deco = [];

    // Portales y obstáculos móviles
    this.portals = [];
    this.obstacles = [];

    // Límites jugables (se achican con un evento)
    this.inset = 0;
    this.bounds = { l: 0, t: 0, r: this.world, b: this.world };
    this.shrink = null;
    this.shrinkDone = false;

    // Poderes activos (segundos restantes) y sus recargas
    this.pw = { velocidad: 0, iman: 0, escudo: 0, congelar: 0, teletransporte: 0, fantasma: 0 };
    this.pwCd = { velocidad: 0, iman: 0, escudo: 0, congelar: 0, teletransporte: 0, fantasma: 0 };

    // Dificultad progresiva (crece con el tiempo de partida)
    this.difficulty = 1;

    // Evolución del jugador
    this.evoProgress = { fuego: 0, hielo: 0, cristal: 0, electrico: 0 };

    // Partida actual
    this.run = this.freshRun();

    // Eventos aleatorios
    this.eventChipT = 0;
    this.nextEventAt = 26;
    this.nextZoneChange = 30;
    this.bossSpawned = false;
    this.aiRespawnAt = 0;
    this.stormT = 0;
    this.lava = null;
    this.shockCd = 0;

    // Zona donde reaparece el jugador y protección inicial
    this.lastZone = "bosque";

    this.cam = { x: this.world / 2, y: this.world / 2 };
    this.zoom = 0.82;
    this.shake = 0;
    this.time = 0;

    // Temporizadores de interfaz
    this.itemTimer = 0;
    this.hudTimer = 0;
    this.rankTimer = 0;
    this.mapTimer = 0;

    this.dpr = 1;
    this.viewW = 0;
    this.viewH = 0;
    this.vignette = null;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  freshRun() {
    return { coins: 0, foods: 0, kills: 0, time: 0, points: 0, evos: 0, keys: 0, hits: 0 };
  }

  /* ------------------------ Ciclo de vida ------------------------ */

  /** Construye un mundo nuevo (también sirve para el menú). */
  reset(spawnPlayer) {
    this.snakes = [];
    this.items = [];
    this.particles = [];
    this.meteors = [];
    this.player = null;
    this.boss = null;
    this.shake = 0;

    // Límites y zonas
    this.inset = 0;
    this.bounds = { l: 0, t: 0, r: this.world, b: this.world };
    this.shrink = null;
    this.shrinkDone = false;
    this.initZones();

    // Poderes, recargas y evolución
    this.pw = { velocidad: 0, iman: 0, escudo: 0, congelar: 0, teletransporte: 0, fantasma: 0 };
    this.pwCd = { velocidad: 0, iman: 0, escudo: 0, congelar: 0, teletransporte: 0, fantasma: 0 };
    this.evoProgress = { fuego: 0, hielo: 0, cristal: 0, electrico: 0 };

    // Portales y obstáculos móviles
    this.makePortals();
    this.makeObstacles();

    // Partida y eventos
    this.run = this.freshRun();
    this.difficulty = 1;
    this.stormT = 0;
    this.lava = null;
    this.shockCd = 0;
    this.nextEventAt = 26;
    this.nextZoneChange = rand(CONFIG.zoneChangeMin, CONFIG.zoneChangeMax);
    this.bossSpawned = false;
    this.eventChipT = 0;
    this.aiRespawnAt = 0;

    // Población inicial del mundo
    for (const type of Object.keys(CONFIG.spawn)) {
      for (let i = 0; i < CONFIG.spawn[type]; i++) this.spawnItem(type);
    }
    for (const element of ELEMENT_KEYS) {
      for (let i = 0; i < CONFIG.orbsPerElement; i++) this.spawnOrb(element);
    }
    for (let i = 0; i < CONFIG.aiTarget; i++) this.spawnAI();

    if (spawnPlayer) this.spawnPlayer();

    this.cam.x = this.player ? this.player.path[0].x : this.world / 2;
    this.cam.y = this.player ? this.player.path[0].y : this.world / 2;
    this.zoom = this.player ? 1 : 0.82;
  }

  startGame() {
    this.reset(true);
    this.state = "playing";
    if (UI.clearFeed) UI.clearFeed();
    UI.showScreen(null);
    UI.showHud(true);
    UI.renderPowerButtons();
    UI.hideEventChip();
    UI.updateLives();
    this.updateHud(true);
  }

  toMenu() {
    this.state = "menu";
    this.reset(false);
    if (UI.clearFeed) UI.clearFeed();
    UI.showScreen("menu");
    UI.showHud(false);
    UI.renderMenu();
  }

  /* --------------------------- Zonas --------------------------- */

  initZones() {
    const c = CONFIG.grid;
    this.cells = [];
    this.deco = [];
    for (let y = 0; y < c; y++) {
      const row = [];
      const decoRow = [];
      for (let x = 0; x < c; x++) {
        const key = ZONE_KEYS[(x + y * 2 + randInt(0, 4)) % ZONE_KEYS.length];
        row.push(key);
        decoRow.push(this.makeDeco(x, y, key));
      }
      this.cells.push(row);
      this.deco.push(decoRow);
    }
  }

  /** Puntos decorativos de una celda (hojas, brasas, nieve...). */
  makeDeco(cx, cy, key) {
    const size = this.world / CONFIG.grid;
    const points = [];
    for (let i = 0; i < 26; i++) {
      points.push({
        x: (cx + rand(0.04, 0.96)) * size,
        y: (cy + rand(0.04, 0.96)) * size,
        s: rand(1.6, 4.4),
        a: rand(0.2, 0.65),
        ph: rand(0, TAU),
        shape: ZONES[key].shape,
      });
    }
    return points;
  }

  zoneKeyAt(x, y) {
    const c = CONFIG.grid;
    const size = this.world / c;
    const cx = clamp(Math.floor(x / size), 0, c - 1);
    const cy = clamp(Math.floor(y / size), 0, c - 1);
    return this.cells[cy][cx];
  }

  /** Cambia una zona al azar: sus orbes desaparecen y vuelven a generarse. */
  changeRandomZone() {
    const c = CONFIG.grid;
    const cx = randInt(0, c - 1);
    const cy = randInt(0, c - 1);
    const current = this.cells[cy][cx];

    let next = pick(ZONE_KEYS);
    while (next === current) next = pick(ZONE_KEYS);

    this.cells[cy][cx] = next;
    this.deco[cy][cx] = this.makeDeco(cx, cy, next);

    const size = this.world / c;
    this.items = this.items.filter(
      (it) =>
        !(it.type === "orbe" &&
          it.x >= cx * size && it.x < (cx + 1) * size &&
          it.y >= cy * size && it.y < (cy + 1) * size)
    );
    for (const element of ELEMENT_KEYS) {
      const count = this.items.filter((i) => i.type === "orbe" && i.element === element).length;
      for (let i = count; i < CONFIG.orbsPerElement; i++) this.spawnOrb(element);
    }

    if (this.player && this.player.alive) {
      const head = this.player.path[0];
      if (this.zoneKeyAt(head.x, head.y) === next) {
        this.toast(`Zona cambiada: ahora estás en ${ZONES[next].name}`, ZONES[next].tint);
      }
    }
  }

  /* ------------------- Portales y obstáculos ------------------- */

  /** Crea pares de portales: entrar en uno te saca por el otro. */
  makePortals() {
    this.portals = [];
    const palette = ["#a78bfa", "#22d3ee", "#f472b6", "#facc15"];
    for (let i = 0; i < CONFIG.portalPairs; i++) {
      const color = palette[i % palette.length];
      const a = this.findSpawnPoint(620);
      const b = this.findSpawnPoint(620);
      this.portals.push({ x: a.x, y: a.y, r: CONFIG.portalRadius, pair: i, color, cd: 0 });
      this.portals.push({ x: b.x, y: b.y, r: CONFIG.portalRadius, pair: i, color, cd: 0 });
    }
  }

  /** Roca que rueda por el mapa y derrota a quien la toque. */
  makeObstacles() {
    this.obstacles = [];
    const b = this.bounds;
    for (let i = 0; i < CONFIG.obstacleCount; i++) {
      const angle = rand(0, TAU);
      this.obstacles.push({
        x: rand(b.l + 200, b.r - 200),
        y: rand(b.t + 200, b.b - 200),
        vx: Math.cos(angle) * CONFIG.obstacleSpeed,
        vy: Math.sin(angle) * CONFIG.obstacleSpeed,
        r: CONFIG.obstacleRadius,
        rot: rand(0, TAU),
      });
    }
  }

  /** Teletransporta y limpia las recargas de los portales. */
  updatePortals(dt) {
    for (const p of this.portals) {
      if (p.cd > 0) p.cd -= dt;
    }

    for (const s of this.snakes) {
      if (!s.alive) continue;
      if (this.pw.fantasma > 0 && s.isPlayer) continue;

      const head = s.path[0];
      for (const p of this.portals) {
        if (p.cd > 0) continue;
        if (distSq(head.x, head.y, p.x, p.y) > (p.r + s.radius) ** 2) continue;

        const exit = this.portals.find((q) => q.pair === p.pair && q !== p);
        if (!exit) continue;

        s.teleport(exit.x + Math.cos(s.angle) * (exit.r + s.radius + 12),
                   exit.y + Math.sin(s.angle) * (exit.r + s.radius + 12));
        p.cd = CONFIG.portalCooldown;
        exit.cd = CONFIG.portalCooldown;

        if (s.isPlayer) {
          this.burst(exit.x, exit.y, exit.color, 18);
          this.toast("¡Portal!", exit.color);
        }
        break;
      }
    }
  }

  /** Mueve los obstáculos y derrota a quien choque contra ellos. */
  updateObstacles(dt) {
    const b = this.bounds;
    for (const o of this.obstacles) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += dt * 1.4;

      // Rebota en los bordes jugables
      if (o.x < b.l + o.r || o.x > b.r - o.r) {
        o.vx *= -1;
        o.x = clamp(o.x, b.l + o.r, b.r - o.r);
      }
      if (o.y < b.t + o.r || o.y > b.b - o.r) {
        o.vy *= -1;
        o.y = clamp(o.y, b.t + o.r, b.b - o.r);
      }

      // Choque con las serpientes
      for (const s of this.snakes) {
        if (!s.alive) continue;
        if (s.isPlayer) {
          if (this.pw.escudo > 0 || this.pw.fantasma > 0 || s.invuln > 0) continue;
        } else if (s.frozen > 0 && s.isBoss) {
          continue;
        }

        const head = s.path[0];
        if (distSq(head.x, head.y, o.x, o.y) < (o.r + s.radius) ** 2) {
          this.killSnake(s, { type: "roca", by: null });
        }
      }
    }
  }

  /** Dificultad progresiva: más enemigos y más velocidad con el tiempo. */
  updateDifficulty() {
    this.difficulty = 1 + Math.floor(this.run.time / CONFIG.aiRampTime) * 0.35;

    for (const s of this.snakes) {
      if (s.isPlayer || s.isBoss) continue;
      s.speedBonus = (this.difficulty - 1) * CONFIG.aiSpeedRamp * this.run.time;
    }

    const target = Math.min(CONFIG.aiMax, CONFIG.aiTarget + Math.floor(this.difficulty));
    const alive = this.snakes.filter((s) => !s.isPlayer && !s.isBoss && s.alive).length;
    if (alive < target && this.run.time >= this.aiRespawnAt) {
      this.spawnAI();
      this.aiRespawnAt = this.run.time + 2;
    }
  }

  /* ------------------------ Creación ------------------------ */

  findSpawnPoint(avoid) {
    const b = this.bounds;
    const margin = 320;
    const preferred = { x: this.cam.x, y: this.cam.y };

    for (let i = 0; i < 60; i++) {
      const base = i < 25 ? preferred : { x: rand(0, this.world), y: rand(0, this.world) };
      const point = {
        x: clamp(base.x + rand(-400, 400), b.l + margin, b.r - margin),
        y: clamp(base.y + rand(-400, 400), b.t + margin, b.b - margin),
      };

      let clear = true;
      for (const s of this.snakes) {
        if (!s.alive) continue;
        if (distSq(point.x, point.y, s.path[0].x, s.path[0].y) < avoid * avoid) {
          clear = false;
          break;
        }
      }
      if (clear) return point;
    }
    return { x: rand(b.l + margin, b.r - margin), y: rand(b.t + margin, b.b - margin) };
  }

  spawnPlayer() {
    const point = this.findSpawnPoint(560);
    const skin = SKINS.find((s) => s.id === SAVE.equipped) || SKINS[0];
    const look = SAVE.appearance;

    this.player = new Snake({
      x: point.x,
      y: point.y,
      name: SAVE.name.trim() || "Tú",
      color: SAVE.appearance.color || skin.color,
      mode: skin.mode,
      eyes: look.eyes,
      pattern: look.pattern,
      isPlayer: true,
      points: 0,
    });

    this.player.invuln = CONFIG.respawnShield;
    this.player.lives = 0;

    const toCenter = Math.atan2(this.world / 2 - point.y, this.world / 2 - point.x);
    this.player.targetAngle = toCenter;
    this.player.angle = toCenter;
    this.snakes.push(this.player);
  }

  spawnAI() {
    const point = this.findSpawnPoint(420);
    const used = new Set(this.snakes.map((s) => s.name));
    const free = CONFIG_NAMES.filter((n) => !used.has(n));
    const skin = pick(SKINS);

    const snake = new Snake({
      x: point.x,
      y: point.y,
      name: free.length ? pick(free) : `Bot ${randInt(1, 999)}`,
      color: skin.color,
      mode: skin.mode,
      eyes: pick(EYES).id,
      pattern: pick(PATTERNS).id,
      points: randInt(CONFIG.aiPoints[0], CONFIG.aiPoints[1]),
    });

    // Cada quinta serpiente sale a cazar al jugador
    snake.behavior = randInt(0, 4) === 0 ? "hunter" : "wander";
    snake.speedBonus = (this.difficulty - 1) * CONFIG.aiSpeedRamp * this.run.time;

    const toCenter = Math.atan2(this.world / 2 - point.y, this.world / 2 - point.x);
    snake.targetAngle = toCenter;
    snake.angle = toCenter;
    this.snakes.push(snake);
  }

  spawnBoss() {
    if (this.boss && this.boss.alive) return;
    this.bossSpawned = true;

    const point = this.findSpawnPoint(700);
    const boss = new Snake({
      x: point.x,
      y: point.y,
      name: "Serpiente Gigante",
      color: "#fbbf24",
      mode: "gold",
      isBoss: true,
      points: CONFIG.bossPoints,
    });

    const toCenter = Math.atan2(this.world / 2 - point.y, this.world / 2 - point.x);
    boss.targetAngle = toCenter;
    boss.angle = toCenter;
    this.snakes.push(boss);
    this.boss = boss;
  }

  /* ------------------------- Ítems ------------------------- */

  spawnItem(type, x, y, extra) {
    if (this.items.length > 720) return null;

    const def = ITEMS[type];
    const b = this.bounds;
    const item = {
      type,
      x: x ?? rand(b.l + 60, b.r - 60),
      y: y ?? rand(b.t + 60, b.b - 60),
      r: def.r,
      color: def.color,
      phase: rand(0, TAU),
      ...(def.temp ? { ttl: CONFIG.itemTtl } : {}),
      ...extra,
    };
    this.items.push(item);
    return item;
  }

  spawnOrb(element) {
    const zone = ELEMENTS[element].zone;
    const c = CONFIG.grid;
    const size = this.world / c;

    const cells = [];
    for (let y = 0; y < c; y++) {
      for (let x = 0; x < c; x++) {
        if (this.cells[y][x] === zone) cells.push({ x, y });
      }
    }
    const cell = cells.length ? pick(cells) : { x: randInt(0, c - 1), y: randInt(0, c - 1) };
    this.spawnItem(
      "orbe",
      rand(cell.x * size + 40, (cell.x + 1) * size - 40),
      rand(cell.y * size + 40, (cell.y + 1) * size - 40),
      { element, color: ELEMENTS[element].color }
    );
  }

  /** Mantiene los niveles de cada tipo de ítem en el mapa. */
  maintainItems() {
    const counts = {};
    for (const it of this.items) counts[it.type] = (counts[it.type] || 0) + 1;

    for (const type of Object.keys(CONFIG.spawn)) {
      let n = counts[type] || 0;
      while (n < CONFIG.spawn[type]) {
        this.spawnItem(type);
        n++;
      }
    }

    for (const element of ELEMENT_KEYS) {
      let n = this.items.filter((i) => i.type === "orbe" && i.element === element).length;
      while (n < CONFIG.orbsPerElement) {
        this.spawnOrb(element);
        n++;
      }
    }

    // Objetos temporales: la llave y la poción siempre hay una,
    // el corazón solo aparece de vez en cuando
    for (const type of ["llave", "pocion"]) {
      const n = this.items.filter((i) => i.type === type).length;
      if (n < 1) this.spawnItem(type);
    }
    if (Math.random() < 0.015 && !this.items.some((i) => i.type === "corazon")) {
      this.spawnItem("corazon");
    }
  }

  /* ------------------ Recogida, imán y aura ------------------ */

  updatePickups(dt) {
    const player = this.player;
    const head = player && player.alive ? player.path[0] : null;

    if (head) {
      // Imán: poder activo, evolución cristal o la región desértica
      let radius = 0;
      if (this.pw.iman > 0) radius = CONFIG.activeMagnet;
      else if (player.evolution === "cristal") radius = CONFIG.passiveMagnet;
      else if (this.zoneKeyAt(head.x, head.y) === "desierto") radius = 240;

      if (radius > 0) {
        const radiusSq = radius * radius;
        const step = 540 * dt;
        for (const it of this.items) {
          if (distSq(head.x, head.y, it.x, it.y) < radiusSq) {
            const d = Math.hypot(head.x - it.x, head.y - it.y) || 1;
            const move = Math.min(step, d);
            it.x += ((head.x - it.x) / d) * move;
            it.y += ((head.y - it.y) / d) * move;
          }
        }
      }

      // Aura de fuego: mata serpientes cercanas (así se derrota a la Gigante)
      if (player.evolution === "fuego") {
        const radiusSq = (CONFIG.fireAura + 30) ** 2;
        for (const s of this.snakes) {
          if (!s.alive || s.isPlayer) continue;
          if (distSq(head.x, head.y, s.path[0].x, s.path[0].y) < radiusSq) {
            this.killSnake(s, { type: "fuego", by: player });
          }
        }
      }
    }

    // Recogida de ítems (la IA solo come comida)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      // Los objetos temporales desaparecen con el tiempo
      if (item.ttl != null) {
        item.ttl -= dt;
        if (item.ttl <= 0) {
          this.items.splice(i, 1);
          continue;
        }
      }

      const def = ITEMS[item.type];
      for (const s of this.snakes) {
        if (!s.alive) continue;
        if (item.type !== "comida" && !s.isPlayer) continue;

        const h = s.path[0];
        const reach = s.radius + item.r + 2;
        if (distSq(h.x, h.y, item.x, item.y) < reach * reach) {
          this.items.splice(i, 1);
          this.applyItem(s, item, def);
          break;
        }
      }
    }
  }

  /** Aplica el efecto de un ítem recogido. */
  applyItem(snake, item, def) {
    // La región del bosque dobla los puntos de la comida
    let points = def.points;
    if (item.type === "comida" && snake.isPlayer) {
      const h = snake.path[0];
      if (this.zoneKeyAt(h.x, h.y) === "bosque") points *= 2;
    }

    snake.points += points;
    if (def.grow) snake.size += def.grow;
    snake.eatFlash = 1;

    if (!snake.isPlayer) return;

    if (item.type === "comida") this.run.foods += 1;
    if (def.coins) this.run.coins += def.coins;

    if (item.type === "orbe") {
      this.addEvolutionProgress(item.element);
      this.burst(item.x, item.y, item.color, 8, 90);
      return;
    }

    // Vida extra: suma una vida hasta un máximo de 3
    if (def.heart) {
      snake.lives = Math.min(3, snake.lives + 1);
      this.toast(`¡Vida extra! (${snake.lives})`, def.color);
      this.burst(item.x, item.y, def.color, 14, 130);
      return;
    }

    // Poción: regenera puntos y acelera un instante
    if (def.potion) {
      snake.size = Math.min(snake.size + 10, CONFIG.baseSegments + snake.points);
      this.pw.velocidad = Math.max(this.pw.velocidad, 4);
      this.toast("¡Poción bebida!", def.color);
      this.burst(item.x, item.y, def.color, 14, 130);
      return;
    }

    // Llave: abre un cofre de monedas y cuenta para el desafío diario
    if (def.key) {
      const bonus = randInt(12, 30);
      this.run.coins += bonus;
      this.run.keys += 1;
      this.toast(`Llave: +${bonus} monedas`, def.color);
      this.burst(item.x, item.y, def.color, 14, 130);
      return;
    }

    if (def.power) {
      const id = pick(POWER_IDS);
      SAVE.powers[id] += 1;
      persist();
      this.toast(`Estrella: poder ${POWERS[id].name} +1`, POWERS[id].color);
      this.burst(item.x, item.y, def.color, 12, 120);
      return;
    }

    if (def.box) {
      if (Math.random() < 0.55) {
        const id = pick(POWER_IDS);
        SAVE.powers[id] += 1;
        persist();
        this.toast(`Caja sorpresa: ¡${POWERS[id].name}!`, POWERS[id].color);
      } else {
        const bonus = randInt(15, 35);
        this.run.coins += bonus;
        this.toast(`Caja sorpresa: +${bonus} monedas`, "#fbbf24");
      }
      this.burst(item.x, item.y, def.color, 12, 120);
    }
  }

  /* ------------------------ Evolución ------------------------ */

  addEvolutionProgress(element) {
    this.evoProgress[element] += 1;

    if (this.evoProgress[element] >= CONFIG.evolveNeeded) {
      this.evoProgress[element] = 0;
      this.player.evolution = element;
      this.run.evos += 1;
      const info = ELEMENTS[element];
      this.toast(`¡Evolución: ${info.name}!`, info.color);
      this.burst(this.player.path[0].x, this.player.path[0].y, info.color, 26, 200);
      this.shake = Math.max(this.shake, 6);
    }
  }

  /* ------------------------- Poderes ------------------------- */

  usePower(id) {
    if (this.state !== "playing" || !this.player || !this.player.alive) return;

    if (SAVE.powers[id] <= 0) {
      this.toast("Sin poderes: compralos en la tienda", "#fb7185");
      return;
    }

    const def = POWERS[id];

    // Cada poder tiene su propia recarga
    if (this.pwCd[id] > 0) {
      this.toast(`${def.name}: recargando ${Math.ceil(this.pwCd[id])}s`, def.color);
      return;
    }

    // El teletransporte es instantáneo
    if (id === "teletransporte") {
      SAVE.powers[id] -= 1;
      persist();
      const point = this.findSpawnPoint(500);
      this.burst(this.player.path[0].x, this.player.path[0].y, def.color, 18, 160);
      this.player.teleport(point.x, point.y);
      this.cam.x = point.x;
      this.cam.y = point.y;
      this.pwCd[id] = def.cooldown;
      this.toast("¡Teletransporte!", def.color);
      UI.renderPowerButtons();
      return;
    }

    if (this.pw[id] > 0) return;

    SAVE.powers[id] -= 1;
    persist();
    this.pwCd[id] = def.cooldown;

    if (id === "congelar") {
      for (const s of this.snakes) {
        if (!s.isPlayer && s.alive) s.frozen = def.duration;
      }
      this.toast("¡Enemigos congelados!", def.color);
    } else if (id === "fantasma") {
      // Atraviesa cuerpos, portales y obstáculos durante un rato
      this.toast("¡Fantasma activado!", def.color);
      this.burst(this.player.path[0].x, this.player.path[0].y, def.color, 20, 150);
      this.pw[id] = def.duration;
    } else {
      this.pw[id] = def.duration;
      this.toast(`¡${def.name} activado!`, def.color);
    }

    UI.renderPowerButtons();
  }

  updatePowers(dt) {
    for (const id of POWER_IDS) {
      if (this.pw[id] > 0) this.pw[id] = Math.max(0, this.pw[id] - dt);
      if (this.pwCd[id] > 0) this.pwCd[id] = Math.max(0, this.pwCd[id] - dt);
    }
  }

  /** Multiplicadores del jugador, efectos de región y de la evolución. */
  applyEvoEffects() {
    const player = this.player;

    for (const s of this.snakes) if (!s.isPlayer) s.speedMult = 1;
    if (!player || !player.alive) return;

    // Región activa bajo los pies del jugador
    const zone = this.zoneKeyAt(player.path[0].x, player.path[0].y);
    const zoneSpeed = zone === "volcan" ? 1.12 : zone === "espacio" ? 1.18 : 1;

    player.speedMult =
      zoneSpeed *
      (this.pw.velocidad > 0 ? 1.75 : 1) *
      (player.evolution === "electrico" ? 1.3 : 1);

    if (player.evolution === "hielo") {
      const radiusSq = CONFIG.iceAura ** 2;
      const h = player.path[0];
      for (const s of this.snakes) {
        if (s.isPlayer || !s.alive) continue;
        if (distSq(h.x, h.y, s.path[0].x, s.path[0].y) < radiusSq) s.speedMult = 0.45;
      }
    }

    // Relámpago eléctrico: congela a los enemigos cercanos cada pocos segundos
    if (player.evolution === "electrico") {
      this.shockCd = (this.shockCd || 0) - 1 / 60;
      if (this.shockCd <= 0) {
        this.shockCd = 6;
        const radius = 340;
        const h = player.path[0];
        let hit = false;
        for (const s of this.snakes) {
          if (s.isPlayer || !s.alive) continue;
          if (distSq(h.x, h.y, s.path[0].x, s.path[0].y) < radius * radius) {
            s.frozen = 2;
            hit = true;
          }
        }
        if (hit) {
          this.burst(h.x, h.y, "#facc15", 22, 220);
          this.toast("¡Relámpago!", "#facc15");
        }
      }
    }
  }

  /* ------------------------- Eventos ------------------------- */

  scheduleEvents(dt) {
    if (this.state !== "playing") return;

    if (this.run.time >= this.nextEventAt) {
      this.nextEventAt = this.run.time + rand(CONFIG.eventMin, CONFIG.eventMax);

      const pool = ["monedas", "meteoros", "tormenta"];
      if (!this.shrinkDone && this.inset < CONFIG.maxInset - 100) pool.push("achatamiento");
      if (this.run.time > 55) pool.push("erupcion");
      if (!this.bossSpawned && this.run.time >= CONFIG.bossDelay) pool.push("jefe");

      this.startEvent(pick(pool));
    }

    if (this.run.time >= this.nextZoneChange) {
      this.nextZoneChange = this.run.time + rand(CONFIG.zoneChangeMin, CONFIG.zoneChangeMax);
      this.changeRandomZone();
    }
  }

  startEvent(kind) {
    const player = this.player;
    const center = player && player.alive ? player.path[0] : { x: this.world / 2, y: this.world / 2 };

    if (kind === "monedas") {
      for (let i = 0; i < 45; i++) {
        const x = clamp(center.x + rand(-800, 800), this.bounds.l + 60, this.bounds.r - 60);
        const y = clamp(center.y + rand(-800, 800), this.bounds.t + 60, this.bounds.b - 60);
        this.spawnItem("moneda", x, y);
      }
      this.showEvent("¡Lluvia de monedas!", "#fbbf24");
      this.burst(center.x, center.y, "#fbbf24", 22, 220);
      return;
    }

    if (kind === "meteoros") {
      for (let i = 0; i < 5; i++) {
        const x = clamp(center.x + rand(-750, 750), this.bounds.l + 140, this.bounds.r - 140);
        const y = clamp(center.y + rand(-750, 750), this.bounds.t + 140, this.bounds.b - 140);
        this.meteors.push({ x, y, t: CONFIG.meteorDelay + i * 0.25, r: CONFIG.meteorRadius });
      }
      this.showEvent("¡Meteoritos a la vista!", "#fb923c");
      return;
    }

    if (kind === "achatamiento") {
      this.shrinkDone = true;
      const to = Math.min(this.inset + CONFIG.shrinkInset, CONFIG.maxInset);
      this.shrink = { t: 0, dur: 5, from: this.inset, to };
      this.showEvent("¡El mapa se está achicando!", "#fb7185");
      return;
    }

    if (kind === "tormenta") {
      // Lluvia de comida y serpientes más lentas durante unos segundos
      this.stormT = 12;
      for (let i = 0; i < 40; i++) {
        const x = clamp(center.x + rand(-1100, 1100), this.bounds.l + 60, this.bounds.r - 60);
        const y = clamp(center.y + rand(-1100, 1100), this.bounds.t + 60, this.bounds.b - 60);
        this.spawnItem("comida", x, y);
      }
      this.showEvent("¡Tormenta!", "#38bdf8");
      this.shake = Math.max(this.shake, 5);
      return;
    }

    if (kind === "erupcion") {
      // Bombas de lava en todo el mapa
      this.lava = [];
      for (let i = 0; i < 7; i++) {
        this.lava.push({
          x: rand(this.bounds.l + 140, this.bounds.r - 140),
          y: rand(this.bounds.t + 140, this.bounds.b - 140),
          t: CONFIG.meteorDelay + i * 0.35,
          r: 115,
        });
      }
      this.showEvent("¡Erupción volcánica!", "#fb923c");
      this.shake = Math.max(this.shake, 7);
      return;
    }

    if (kind === "jefe") {
      this.spawnBoss();
      this.showEvent("¡Apareció la Serpiente Gigante!", "#fbbf24");
      this.toast("Consejo: usá Fuego o Escudo para derrotarla", "#fbbf24");
    }
  }

  showEvent(text, color) {
    UI.showEventChip(text, color);
    this.eventChipT = 4.5;
    this.toast(text, color);
  }

  updateMeteors(dt) {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t -= dt;
      if (m.t > 0) continue;

      this.meteors.splice(i, 1);
      this.burst(m.x, m.y, "#fb923c", 26, 280);
      this.shake = Math.max(this.shake, 9);

      const radiusSq = m.r * m.r;
      for (const s of [...this.snakes]) {
        if (!s.alive) continue;
        const immune = s.isPlayer && (this.pw.escudo > 0 || s.evolution === "cristal");
        if (immune) continue;
        if (distSq(s.path[0].x, s.path[0].y, m.x, m.y) < radiusSq) {
          this.killSnake(s, { type: "meteorito" });
        }
      }
    }
  }

  /** Bombas de lava de la erupción: caen y estallan. */
  updateLava(dt) {
    if (!this.lava || !this.lava.length) return;

    for (let i = this.lava.length - 1; i >= 0; i--) {
      const m = this.lava[i];
      m.t -= dt;
      if (m.t > 0) continue;

      this.lava.splice(i, 1);
      this.burst(m.x, m.y, "#f97316", 30, 320);
      this.shake = Math.max(this.shake, 8);

      const radiusSq = m.r * m.r;
      for (const s of [...this.snakes]) {
        if (!s.alive) continue;
        const safe =
          s.isPlayer &&
          (this.pw.escudo > 0 || this.pw.fantasma > 0 || s.invuln > 0);
        if (safe) continue;
        if (distSq(s.path[0].x, s.path[0].y, m.x, m.y) < radiusSq) {
          this.killSnake(s, { type: "erupcion" });
        }
      }
    }
  }

  updateShrink(dt) {
    if (!this.shrink) return;
    const s = this.shrink;
    s.t += dt;
    const k = clamp(s.t / s.dur, 0, 1);
    this.inset = lerp(s.from, s.to, k);
    this.bounds = {
      l: this.inset,
      t: this.inset,
      r: this.world - this.inset,
      b: this.world - this.inset,
    };
    if (k >= 1) this.shrink = null;
  }

  clampToBounds(snake) {
    const head = snake.path[0];
    head.x = clamp(head.x, this.bounds.l + 2, this.bounds.r - 2);
    head.y = clamp(head.y, this.bounds.t + 2, this.bounds.b - 2);
  }

  /* --------------------- Actualización --------------------- */

  update(dt) {
    this.time += dt;

    // Pausa: no avanza nada del mundo (solo se dibuja)
    if (this.state === "paused") return;

    if (this.eventChipT > 0) {
      this.eventChipT -= dt;
      if (this.eventChipT <= 0) UI.hideEventChip();
    }

    if (this.state === "playing") this.run.time += dt;

    // Dirección del jugador
    if (this.state === "playing" && this.player && this.player.alive) {
      const angle = INPUT.getAngle(this);
      if (angle !== null) this.player.targetAngle = angle;
    }

    this.updateShrink(dt);
    this.updatePowers(dt);
    this.applyEvoEffects();

    // La tormenta frena a todas las serpientes
    if (this.stormT > 0) {
      this.stormT = Math.max(0, this.stormT - dt);
      for (const s of this.snakes) if (s.alive) s.speedMult *= 0.85;
    }

    for (const snake of this.snakes) snake.update(dt, this);

    if (this.state === "playing") {
      this.updatePortals(dt);
      this.updateObstacles(dt);
      this.updateDifficulty();
    }

    this.itemTimer -= dt;
    if (this.itemTimer <= 0) {
      this.itemTimer = 1;
      this.maintainItems();
    }

    this.updatePickups(dt);
    this.handleCollisions();
    this.updateMeteors(dt);
    this.updateLava(dt);
    this.updateParticles(dt);
    this.removeDead();
    this.respawnAI();
    this.scheduleEvents(dt);

    this.updateCamera(dt);
    this.shake = Math.max(0, this.shake - dt * 40);

    this.hudTimer -= dt;
    this.rankTimer -= dt;
    this.mapTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.2; this.updateHud(); }
    if (this.rankTimer <= 0) { this.rankTimer = 0.4; this.updateRank(); }
    if (this.mapTimer <= 0) { this.mapTimer = 0.2; this.renderMinimap(); }
  }

  /* ----------------------- Colisiones ----------------------- */

  /**
   * Reglas de colisión:
   *  · fuera de los límites → morís (escudo, fantasma o achicamiento salván)
   *  · tu cabeza contra el cuerpo de otro → morís vos
   *  · la cabeza de otro contra tu cuerpo → muere él
   *  · cabeza contra cabeza → mueren los dos (salvo protección)
   *  · cuerpo contra cuerpo → nada
   */
  handleCollisions() {
    const shieldOn = this.pw.escudo > 0;
    const ghostOn = this.pw.fantasma > 0;
    const deaths = new Map();

    for (const a of this.snakes) {
      if (!a.alive) continue;
      const head = a.path[0];
      const aShield = (shieldOn || ghostOn) && a.isPlayer;
      const aSafe = aShield || a.invuln > 0;

      const outside =
        head.x < this.bounds.l || head.y < this.bounds.t ||
        head.x > this.bounds.r || head.y > this.bounds.b;

      if (outside) {
        if (aSafe || this.shrink) this.clampToBounds(a);
        else {
          deaths.set(a, { type: "pared" });
          continue;
        }
      }

      // El fantasma atraviesa cuerpos y cabezas
      if (a.isPlayer && ghostOn) continue;

      for (const b of this.snakes) {
        if (b === a || !b.alive) continue;
        if (b.isPlayer && ghostOn) continue;

        const bShield = (shieldOn || ghostOn) && b.isPlayer;
        const bSafe = bShield || b.invuln > 0;

        const reach = (a.radius + b.radius) * 0.78;
        const reachSq = reach * reach;
        const bHead = b.path[0];

        // Cabeza contra cabeza: mueren los dos menos el protegido
        const headReach = (a.radius + b.radius) * 0.85;
        if (distSq(head.x, head.y, bHead.x, bHead.y) < headReach * headReach) {
          if (aSafe && !bSafe) deaths.set(b, { type: "snake", by: a });
          else if (bSafe && !aSafe) deaths.set(a, { type: "snake", by: b });
          else if (!aSafe && !bSafe) {
            deaths.set(a, { type: "snake", by: b });
            deaths.set(b, { type: "snake", by: a });
          }
          continue;
        }

        // Cabeza de A contra el cuerpo de B (sin contar la cabeza)
        const segs = b.segments;
        let hit = false;
        for (let i = 1; i < segs.length; i++) {
          if (distSq(head.x, head.y, segs[i].x, segs[i].y) < reachSq) {
            hit = true;
            break;
          }
        }
        if (!hit) continue;

        if (aSafe) deaths.set(b, { type: "snake", by: a });
        else deaths.set(a, { type: "snake", by: b });
        break;
      }
    }

    deaths.forEach((cause, snake) => this.killSnake(snake, cause));
  }

  killSnake(snake, cause) {
    if (!snake.alive) return;

    // El jugador con vidas extra reaparece en el instante
    if (snake.isPlayer && snake.lives > 0) {
      snake.lives -= 1;
      this.respawnPlayer();
      return;
    }

    snake.alive = false;

    const head = snake.path[0];
    this.dropLoot(snake);
    this.burst(head.x, head.y, snake.color, snake.isBoss ? 46 : 26, 200);

    const killer = cause && cause.by;
    const who = causeLabel(cause);

    // Aviso de eliminaciones en pantalla
    if (snake.isPlayer) {
      this.feed(killer ? `${killer.name} eliminó a <b>vos</b>` : `<b>Vos</b> ${who}`, true);
    } else if (killer && killer.isPlayer) {
      this.feed(`<b>Vos</b> eliminaste a ${snake.name}`, true);
    } else if (killer) {
      this.feed(`${killer.name} eliminó a <b>${snake.name}</b>`);
    } else {
      this.feed(`<b>${snake.name}</b> ${who}`);
    }

    // El jugador se lleva la baja
    if (killer && killer.isPlayer && !snake.isPlayer) {
      this.run.kills += 1;
      this.toast(`¡${snake.name} fuera!`, "#4ade80");
      this.burst(head.x, head.y, "#fbbf24", 16, 170);

      if (snake.isBoss && this.state === "playing") {
        this.endRun(true);
        return;
      }
    }

    if (snake.isPlayer) this.endRun(false, cause);
  }

  /** Aviso del killfeed (parte de la interfaz). */
  feed(html, isYou) {
    if (UI && UI.feed) UI.feed(html, isYou);
  }

  /** Reaparece el jugador en un punto seguro con protección. */
  respawnPlayer() {
    const point = this.findSpawnPoint(560);
    this.player.teleport(point.x, point.y);
    this.player.invuln = CONFIG.respawnShield;
    this.cam.x = point.x;
    this.cam.y = point.y;
    this.burst(point.x, point.y, "#fb7185", 24, 200);
    this.shake = Math.max(this.shake, 6);
    this.toast(`¡Sobreviviste! Vidas: ${this.player.lives}`, "#fb7185");
    UI.updateLives();
  }

  /** El cuerpo muerto se convierte en comida y monedas. */
  dropLoot(snake) {
    const segs = snake.segments;
    for (let i = 0; i < segs.length; i += 2) {
      const x = segs[i].x + rand(-7, 7);
      const y = segs[i].y + rand(-7, 7);
      if (snake.isBoss || Math.random() < 0.28) this.spawnItem("moneda", x, y);
      else this.spawnItem("comida", x, y);
    }
    if (snake.isBoss) {
      for (let i = 0; i < 5; i++) {
        this.spawnItem("diamante", segs[0].x + rand(-90, 90), segs[0].y + rand(-90, 90));
      }
    }
  }

  removeDead() {
    this.snakes = this.snakes.filter((s) => s.alive || s.isPlayer);
  }

  respawnAI() {
    const aliveAI = this.snakes.filter((s) => !s.isPlayer && s.alive && !s.isBoss).length;
    const target = Math.min(CONFIG.aiMax, CONFIG.aiTarget + Math.floor(this.difficulty));
    if (aliveAI >= target) return;

    if (!this.aiRespawnAt) this.aiRespawnAt = this.time + CONFIG.aiRespawnDelay;
    if (this.time >= this.aiRespawnAt) {
      this.aiRespawnAt = 0;
      this.spawnAI();
    }
  }

  /* --------------------- Fin de partida --------------------- */

  endRun(victory, cause) {
    if (this.state !== "playing") return;

    const run = this.run;
    run.points = this.player.points;
    const bonus = victory ? CONFIG.victoryBonus : 0;

    this.state = victory ? "victory" : "dead";

    // Se depositan las monedas y se actualizan récord, misiones,
    // desafíos diarios y medallas
    SAVE.wallet += run.coins + bonus;
    SAVE.best = Math.max(SAVE.best, run.points);
    SAVE.stats.foods += run.foods;
    SAVE.stats.coins += run.coins;
    SAVE.stats.kills += run.kills;
    SAVE.stats.evos += run.evos;
    SAVE.stats.keys += run.keys;
    SAVE.stats.deaths += victory ? 0 : 1;
    SAVE.stats.bestTime = Math.max(SAVE.stats.bestTime, Math.floor(run.time));
    SAVE.stats.best = Math.max(SAVE.stats.best, run.points);
    if (victory) SAVE.stats.bosses += 1;

    bumpDaily("foods", run.foods);
    bumpDaily("coins", run.coins);
    bumpDaily("kills", run.kills);
    bumpDaily("evos", run.evos);
    bumpDaily("keys", run.keys);
    bumpDaily("time", Math.floor(run.time));
    if (victory) bumpDaily("bosses", 1);

    checkMedals();
    persist();

    UI.showHud(true);
    if (victory) UI.showVictory(this, bonus);
    else UI.showGameOver(this, cause);
  }

  /* ------------------------- Consultas ------------------------- */

  nearestFood(x, y, range) {
    let best = null;
    let bestSq = range * range;
    for (const item of this.items) {
      if (item.type !== "comida") continue;
      const d = distSq(x, y, item.x, item.y);
      if (d < bestSq) {
        bestSq = d;
        best = item;
      }
    }
    return best;
  }

  getRanking() {
    const rows = [...this.snakes]
      .filter((s) => s.alive || s.isPlayer)
      .sort((a, b) => b.points - a.points);

    // La corona es para quien lidera el ranking
    const leader = rows[0];
    for (const s of this.snakes) s.isLeader = s === leader;
    return rows;
  }

  /* ------------------------- Cámara ------------------------- */

  updateCamera(dt) {
    let tx;
    let ty;
    let tz;

    if (this.player && this.player.alive) {
      const head = this.player.path[0];
      tx = head.x;
      ty = head.y;
      tz = clamp(1.02 - this.player.points / 2600, 0.6, 1.02);
    } else if (!this.player) {
      tx = this.world / 2;
      ty = this.world / 2;
      tz = 0.78;
    } else {
      return; // jugador muerto: la cámara se queda donde estaba
    }

    this.cam.x = damp(this.cam.x, tx, 7, dt);
    this.cam.y = damp(this.cam.y, ty, 7, dt);
    this.zoom = damp(this.zoom, tz, 2.5, dt);
  }

  /* ----------------------- Partículas ----------------------- */

  burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 340) break;
      const angle = rand(0, TAU);
      const force = rand(speed * 0.3, speed);
      const life = rand(0.35, 0.9);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force,
        life,
        maxLife: life,
        color,
        size: rand(2, 5),
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
    }
  }

  toast(text, color) {
    UI.toast(text, color);
  }

  /* ------------------------- Render ------------------------- */

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);

    // Viñeta en espacio de pantalla (se genera una sola vez)
    const v = document.createElement("canvas");
    v.width = 512;
    v.height = 512;
    const vg = v.getContext("2d");
    const grad = vg.createRadialGradient(256, 256, 160, 256, 256, 360);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    vg.fillStyle = grad;
    vg.fillRect(0, 0, 512, 512);
    this.vignette = v;
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#04060d";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const shakeOn = SAVE.settings.shake ? 1 : 0;
    const shakeX = this.shake > 0 ? rand(-this.shake, this.shake) * shakeOn : 0;
    const shakeY = this.shake > 0 ? rand(-this.shake, this.shake) * shakeOn : 0;

    ctx.save();
    ctx.translate(this.viewW / 2 + shakeX, this.viewH / 2 + shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    const view = this.visibleBounds();
    this.drawZones(view);
    this.drawBounds();
    this.drawPortals(view);
    this.drawObstacles(view);
    this.drawItems(view);
    this.drawMeteors();
    this.drawLava();

    for (const snake of this.snakes) {
      if (snake.alive && !snake.isPlayer) this.drawSnake(snake);
    }
    if (this.player && this.player.alive) this.drawSnake(this.player);

    this.drawParticles();
    this.drawStorm(view);
    ctx.restore();

    ctx.drawImage(this.vignette, 0, 0, this.viewW, this.viewH);
  }

  visibleBounds() {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    return {
      left: this.cam.x - halfW,
      top: this.cam.y - halfH,
      right: this.cam.x + halfW,
      bottom: this.cam.y + halfH,
    };
  }

  /** Pinta las celdas de zona visibles y su decoración. */
  drawZones(view) {
    const ctx = this.ctx;
    const c = CONFIG.grid;
    const size = this.world / c;

    for (let y = 0; y < c; y++) {
      for (let x = 0; x < c; x++) {
        const x0 = x * size;
        const y0 = y * size;
        if (x0 > view.right || x0 + size < view.left || y0 > view.bottom || y0 + size < view.top) continue;

        const zone = ZONES[this.cells[y][x]];
        ctx.fillStyle = zone.fill;
        ctx.fillRect(x0, y0, size, size);

        for (const d of this.deco[y][x]) {
          const tw = 0.75 + Math.sin(this.time * 1.6 + d.ph) * 0.25;
          ctx.globalAlpha = d.a * tw;
          ctx.fillStyle = zone.tint;

          if (d.shape === "star") {
            ctx.fillRect(d.x - d.s / 2, d.y - d.s / 6, d.s, d.s / 3);
            ctx.fillRect(d.x - d.s / 6, d.y - d.s / 2, d.s / 3, d.s);
          } else if (d.shape === "bubble" || d.shape === "snow") {
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.s * 0.7, 0, TAU);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.ellipse(d.x, d.y, d.s, d.s * 0.6, d.ph, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    // Líneas divisorias entre zonas
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2 / this.zoom;
    ctx.beginPath();
    for (let i = 1; i < c; i++) {
      ctx.moveTo(i * size, 0);
      ctx.lineTo(i * size, this.world);
      ctx.moveTo(0, i * size);
      ctx.lineTo(this.world, i * size);
    }
    ctx.stroke();
  }

  /** Borde jugable (cambia si el mapa se achica). */
  drawBounds() {
    const ctx = this.ctx;
    const b = this.bounds;
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(251,113,133,0.14)";
    ctx.lineWidth = 26 / this.zoom;
    ctx.strokeRect(b.l, b.t, b.r - b.l, b.b - b.t);

    ctx.strokeStyle = "rgba(251,113,133,0.85)";
    ctx.lineWidth = 5 / this.zoom;
    ctx.strokeRect(b.l, b.t, b.r - b.l, b.b - b.t);
  }

  drawItems(view) {
    const ctx = this.ctx;
    const margin = 90;

    for (const item of this.items) {
      if (
        item.x < view.left - margin || item.x > view.right + margin ||
        item.y < view.top - margin || item.y > view.bottom + margin
      ) continue;

      const pulse = 1 + Math.sin(this.time * 3 + item.phase) * 0.12;
      const glow = item.r * 6.5 * pulse;

      ctx.globalAlpha = 0.88;
      ctx.drawImage(glowSprite(item.color), item.x - glow / 2, item.y - glow / 2, glow, glow);
      ctx.globalAlpha = 1;

      // Los objetos temporales parpadean cuando están por desaparecer
      if (item.ttl != null && item.ttl < 5) {
        ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(this.time * 9));
      }

      const r = item.r * pulse;
      ctx.fillStyle = item.color;

      switch (item.type) {
        case "diamante": {
          ctx.beginPath();
          ctx.moveTo(item.x, item.y - r);
          ctx.lineTo(item.x + r, item.y);
          ctx.lineTo(item.x, item.y + r);
          ctx.lineTo(item.x - r, item.y);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath();
          ctx.moveTo(item.x, item.y - r * 0.6);
          ctx.lineTo(item.x + r * 0.4, item.y);
          ctx.lineTo(item.x, item.y + r * 0.1);
          ctx.closePath();
          ctx.fill();
          break;
        }

        case "estrella": {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const ang = -Math.PI / 2 + (i * Math.PI) / 5;
            const rad = i % 2 === 0 ? r : r * 0.45;
            const px = item.x + Math.cos(ang) * rad;
            const py = item.y + Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }

        case "caja": {
          const w = r * 1.7;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(item.x - w / 2, item.y - w / 2, w, w, 3);
          else ctx.rect(item.x - w / 2, item.y - w / 2, w, w);
          ctx.fill();
          ctx.fillStyle = "rgba(15,23,42,0.75)";
          ctx.fillRect(item.x - w / 2, item.y - 2, w, 4);
          ctx.fillRect(item.x - 2, item.y - w / 2, 4, w);
          break;
        }

        case "moneda": {
          ctx.beginPath();
          ctx.arc(item.x, item.y, r, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "rgba(146,64,14,0.85)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(item.x, item.y, r * 0.55, 0, TAU);
          ctx.stroke();
          break;
        }

        case "orbe": {
          ctx.beginPath();
          ctx.arc(item.x, item.y, r, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(item.x, item.y, r + 3.5, 0, TAU);
          ctx.stroke();
          break;
        }

        case "corazon": {
          ctx.beginPath();
          ctx.moveTo(item.x, item.y + r * 0.8);
          ctx.bezierCurveTo(item.x - r * 1.6, item.y - r * 0.3, item.x - r * 0.6, item.y - r * 1.3, item.x, item.y - r * 0.3);
          ctx.bezierCurveTo(item.x + r * 0.6, item.y - r * 1.3, item.x + r * 1.6, item.y - r * 0.3, item.x, item.y + r * 0.8);
          ctx.fill();
          break;
        }

        case "pocion": {
          ctx.fillRect(item.x - r * 0.32, item.y - r, r * 0.64, r * 0.55);
          ctx.beginPath();
          ctx.ellipse(item.x, item.y + r * 0.15, r * 0.72, r * 0.75, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.beginPath();
          ctx.ellipse(item.x - r * 0.25, item.y + r * 0.1, r * 0.18, r * 0.3, -0.5, 0, TAU);
          ctx.fill();
          break;
        }

        case "llave": {
          ctx.lineWidth = r * 0.42;
          ctx.strokeStyle = item.color;
          ctx.beginPath();
          ctx.arc(item.x - r * 0.35, item.y - r * 0.35, r * 0.5, 0, TAU);
          ctx.moveTo(item.x - r * 0.02, item.y - r * 0.02);
          ctx.lineTo(item.x + r * 0.8, item.y + r * 0.8);
          ctx.moveTo(item.x + r * 0.5, item.y + r * 0.5);
          ctx.lineTo(item.x + r * 0.2, item.y + r * 0.8);
          ctx.stroke();
          break;
        }

        default: {
          ctx.beginPath();
          ctx.arc(item.x, item.y, r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath();
          ctx.arc(item.x - r * 0.3, item.y - r * 0.3, r * 0.3, 0, TAU);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    }
  }

  /** Portales: anillos dobles que teletransportan. */
  drawPortals(view) {
    const ctx = this.ctx;
    const margin = 120;

    for (const p of this.portals) {
      if (p.x < view.left - margin || p.x > view.right + margin ||
          p.y < view.top - margin || p.y > view.bottom + margin) continue;

      const spin = this.time * 2 + p.pair;
      const cool = p.cd > 0 ? 0.35 : 1;

      ctx.globalAlpha = cool;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 / this.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, spin, spin + Math.PI * 1.4);
      ctx.stroke();

      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.6, -spin, -spin + Math.PI * 1.4);
      ctx.stroke();

      ctx.globalAlpha = 0.25 * cool;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Roca rodante que derrota a quien la toca. */
  drawObstacles(view) {
    const ctx = this.ctx;
    const margin = 80;

    for (const o of this.obstacles) {
      if (o.x < view.left - margin || o.x > view.right + margin ||
          o.y < view.top - margin || o.y > view.bottom + margin) continue;

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);

      ctx.fillStyle = "#3f3f46";
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * TAU;
        const rad = o.r * (i % 2 ? 0.85 : 1);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.ellipse(-o.r * 0.3, -o.r * 0.3, o.r * 0.3, o.r * 0.18, 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Bombas de lava pendientes de estallar. */
  drawLava() {
    const ctx = this.ctx;
    if (!this.lava) return;

    for (const m of this.lava) {
      const k = clamp(1 - m.t / (CONFIG.meteorDelay + 0.5), 0, 1);
      ctx.strokeStyle = `rgba(249,115,22,${0.4 + k * 0.5})`;
      ctx.lineWidth = 3 / this.zoom;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * (0.4 + k * 0.6), 0, TAU);
      ctx.stroke();

      ctx.fillStyle = `rgba(249,115,22,${0.08 + k * 0.16})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * (0.4 + k * 0.6), 0, TAU);
      ctx.fill();
    }
  }

  /** Lluvia diagonal mientras dura la tormenta. */
  drawStorm(view) {
    if (this.stormT <= 0) return;
    const ctx = this.ctx;
    const alpha = Math.min(0.5, this.stormT / 4);

    ctx.save();
    ctx.strokeStyle = `rgba(125,211,252,${alpha})`;
    ctx.lineWidth = 2 / this.zoom;
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const seed = i * 137.5;
      const x = view.left + ((seed + this.time * 900) % (view.right - view.left + 400)) - 200;
      const y = view.top + ((seed * 1.7 + this.time * 1400) % (view.bottom - view.top + 400)) - 200;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 26, y + 46);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawMeteors() {
    const ctx = this.ctx;
    for (const m of this.meteors) {
      const k = clamp(1 - m.t / (CONFIG.meteorDelay + 0.25), 0, 1);
      const radius = m.r * (0.5 + k * 0.5);

      ctx.strokeStyle = `rgba(251,146,60,${0.35 + k * 0.5})`;
      ctx.lineWidth = 3 / this.zoom;
      ctx.beginPath();
      ctx.arc(m.x, m.y, radius, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = `rgba(251,146,60,${0.1 + k * 0.18})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, radius, 0, TAU);
      ctx.fill();

      if (m.t <= 0.5) {
        ctx.fillStyle = "#fed7aa";
        ctx.beginPath();
        ctx.arc(m.x, m.y, 10, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawSnake(snake) {
    const ctx = this.ctx;
    const segs = snake.segments;
    if (!segs || segs.length < 2) return;

    const r = snake.radius;
    const color = snake.evolution ? ELEMENTS[snake.evolution].color : snake.color;
    const flash = snake.eatFlash;
    const ghost = snake.isPlayer && this.pw.fantasma > 0;

    // El fantasma se ve translúcido
    if (ghost) ctx.globalAlpha = 0.45;

    // Aura de evolución
    if (snake.evolution === "fuego") this.drawAura(snake, CONFIG.fireAura, "#fb923c");
    if (snake.evolution === "hielo") this.drawAura(snake, CONFIG.iceAura, "#7dd3fc");
    if (snake.evolution === "cristal") this.drawAura(snake, CONFIG.passiveMagnet, "#a78bfa");

    // Burbuja de escudo
    if (snake.isPlayer && this.pw.escudo > 0) {
      const head = segs[0];
      ctx.fillStyle = "rgba(74,222,128,0.1)";
      ctx.beginPath();
      ctx.arc(head.x, head.y, r + 14, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(74,222,128,0.75)";
      ctx.lineWidth = 3 / this.zoom;
      ctx.beginPath();
      ctx.arc(head.x, head.y, r + 14, 0, TAU);
      ctx.stroke();
    }

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Halo neón y borde oscuro (la estela se puede desactivar)
    if (SAVE.settings.trails) {
      ctx.strokeStyle = hexToRgba(color, 0.13 + flash * 0.15);
      ctx.lineWidth = r * 2.7;
      this.strokePath(segs, 0);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.34)";
    ctx.lineWidth = r * 2 + 5;
    this.strokePath(segs, 0);

    // Cuerpo (por tramos si la skin tiene patrón)
    if (snake.mode === "solid") {
      ctx.strokeStyle = color;
      ctx.lineWidth = r * 2;
      this.strokePath(segs, 0);
    } else {
      const chunk = 5;
      for (let i = 0; i < segs.length - 1; i += chunk) {
        ctx.strokeStyle = bodyColor(snake.mode, i, color);
        ctx.lineWidth = r * 2;
        this.strokePath(segs, i);
      }
    }

    // Brillo superior
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = r * 0.75;
    this.strokePath(segs, Math.min(2, segs.length - 1));

    // Patrón elegido en la personalización
    if (snake.pattern && snake.pattern !== "liso") this.drawPattern(snake, segs, r);

    // Cabeza
    const head = segs[0];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(head.x, head.y, r, 0, TAU);
    ctx.fill();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.45})`;
      ctx.beginPath();
      ctx.arc(head.x, head.y, r, 0, TAU);
      ctx.fill();
    }

    this.drawEyes(snake, head, r);
    if (snake.isBoss) this.drawCrown(head, r);
    else if (snake.isLeader) this.drawCrown(head, r * 0.7);

    // Protección temporal al reaparecer
    if (snake.invuln > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(226,232,240,${0.35 + Math.sin(this.time * 9) * 0.3})`;
      ctx.lineWidth = 3 / this.zoom;
      ctx.beginPath();
      ctx.arc(head.x, head.y, r + 12, 0, TAU);
      ctx.stroke();
      if (ghost) ctx.globalAlpha = 0.45;
    }

    // Tinte de congelamiento
    if (snake.frozen > 0) {
      ctx.fillStyle = "rgba(125,211,252,0.4)";
      ctx.beginPath();
      ctx.arc(head.x, head.y, r + 5, 0, TAU);
      ctx.fill();
    }

    // Nombre sobre la cabeza (se puede ocultar en configuración)
    if (SAVE.settings.names || snake.isPlayer) {
      const labelY = head.y - r - (snake.isBoss ? r * 2.6 : 9 / this.zoom);
      ctx.font = `700 ${13 / this.zoom}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 3 / this.zoom;
      ctx.strokeStyle = "rgba(2,6,23,0.8)";
      ctx.strokeText(snake.name, head.x, labelY);
      ctx.fillStyle = snake.isPlayer ? "#e0f2fe" : snake.isBoss ? "#fde68a" : "rgba(255,255,255,0.86)";
      ctx.fillText(snake.name, head.x, labelY);
    }

    ctx.globalAlpha = 1;
  }

  /** Rayas, puntos o anillos sobre el cuerpo. */
  drawPattern(snake, segs, r) {
    const ctx = this.ctx;

    if (snake.pattern === "rayas") {
      const chunk = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = r * 1.5;
      for (let i = 0; i < segs.length - 1; i += chunk * 2) {
        this.strokePath(segs.slice(i, Math.min(i + chunk, segs.length)), 0);
      }
      return;
    }

    if (snake.pattern === "puntos") {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 2; i < segs.length; i += 4) {
        ctx.beginPath();
        ctx.arc(segs[i].x, segs[i].y, r * 0.4, 0, TAU);
        ctx.fill();
      }
      return;
    }

    if (snake.pattern === "anillos") {
      ctx.strokeStyle = "rgba(2,6,23,0.5)";
      ctx.lineWidth = Math.max(2, r * 0.45);
      for (let i = 3; i < segs.length; i += 5) {
        const prev = segs[i - 1];
        const ang = Math.atan2(segs[i].y - prev.y, segs[i].x - prev.x) + Math.PI / 2;
        const nx = Math.cos(ang) * r;
        const ny = Math.sin(ang) * r;
        ctx.beginPath();
        ctx.moveTo(segs[i].x - nx, segs[i].y - ny);
        ctx.lineTo(segs[i].x + nx, segs[i].y + ny);
        ctx.stroke();
      }
    }
  }

  drawAura(snake, radius, color) {
    const ctx = this.ctx;
    const head = snake.path[0];
    const grad = ctx.createRadialGradient(head.x, head.y, radius * 0.2, head.x, head.y, radius);
    grad.addColorStop(0, hexToRgba(color, 0.18));
    grad.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(head.x, head.y, radius, 0, TAU);
    ctx.fill();
  }

  drawCrown(head, r) {
    const ctx = this.ctx;
    const w = r * 1.7;
    const h = r * 1.05;
    const baseY = head.y - r * 1.35;

    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(head.x - w / 2, baseY);
    ctx.lineTo(head.x - w / 2, baseY - h);
    ctx.lineTo(head.x - w / 4, baseY - h * 0.45);
    ctx.lineTo(head.x, baseY - h);
    ctx.lineTo(head.x + w / 4, baseY - h * 0.45);
    ctx.lineTo(head.x + w / 2, baseY - h);
    ctx.lineTo(head.x + w / 2, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fde68a";
    ctx.fillRect(head.x - w / 2, baseY - 4, w, 4);
  }

  strokePath(segs, from) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(segs[from].x, segs[from].y);
    for (let i = from + 1; i < segs.length; i++) ctx.lineTo(segs[i].x, segs[i].y);
    ctx.stroke();
  }

  drawEyes(snake, head, r) {
    const ctx = this.ctx;
    const fx = Math.cos(snake.angle);
    const fy = Math.sin(snake.angle);
    const px = -fy;
    const py = fx;
    const eyeR = Math.max(2.5, r * 0.4);
    const forward = r * 0.3;
    const side = r * 0.5;
    const kind = snake.eyes || "normal";

    // Ojos cerrados (tranquilo): dos rayitas
    if (kind === "tranquilo") {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      for (const sign of [-1, 1]) {
        const ex = head.x + fx * forward + px * side * sign;
        const ey = head.y + fy * forward + py * side * sign;
        ctx.beginPath();
        ctx.moveTo(ex - px * eyeR, ey - py * eyeR);
        ctx.lineTo(ex + px * eyeR, ey + py * eyeR);
        ctx.stroke();
      }
      return;
    }

    for (const sign of [-1, 1]) {
      const ex = head.x + fx * forward + px * side * sign;
      const ey = head.y + fy * forward + py * side * sign;

      // Robot: cuadrado con iris encendido
      if (kind === "robot") {
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(ex - eyeR * 0.9, ey - eyeR * 0.9, eyeR * 1.8, eyeR * 1.8);
        ctx.fillStyle = "#22d3ee";
        ctx.fillRect(ex - eyeR * 0.3, ey - eyeR * 0.3, eyeR * 0.6, eyeR * 0.6);
        continue;
      }

      const scale = kind === "agudo" ? 0.85 : 1;

      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR * scale, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "#0b1020";
      ctx.beginPath();
      ctx.arc(ex + fx * eyeR * 0.4, ey + fy * eyeR * 0.4, eyeR * (kind === "agudo" ? 0.42 : 0.5), 0, TAU);
      ctx.fill();

      // Ceño fruncido
      if (kind === "enojado") {
        ctx.strokeStyle = "#0b1020";
        ctx.lineWidth = Math.max(1.5, r * 0.2);
        ctx.beginPath();
        ctx.moveTo(ex - px * eyeR * sign, ey - py * eyeR * sign);
        ctx.lineTo(ex + px * eyeR * sign + fx * eyeR * 0.9, ey + py * eyeR * sign + fy * eyeR * 0.9);
        ctx.stroke();
      }
    }
  }

  drawParticles() {
    if (!SAVE.settings.particles) return;
    const ctx = this.ctx;
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------ Minimapa ------------------------ */

  renderMinimap() {
    const ctx = this.mmCtx;
    const size = this.minimap.width;
    const scale = size / this.world;
    const c = CONFIG.grid;
    const cell = (this.world / c) * scale;

    ctx.clearRect(0, 0, size, size);

    for (let y = 0; y < c; y++) {
      for (let x = 0; x < c; x++) {
        ctx.fillStyle = hexToRgba(ZONES[this.cells[y][x]].tint, 0.14);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    ctx.strokeStyle = "rgba(251,113,133,0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      this.bounds.l * scale,
      this.bounds.t * scale,
      (this.bounds.r - this.bounds.l) * scale,
      (this.bounds.b - this.bounds.t) * scale
    );

    // Portales y obstáculos móviles
    for (const p of this.portals) {
      ctx.fillStyle = p.cd > 0 ? hexToRgba(p.color, 0.35) : p.color;
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, 3, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(148,163,184,0.85)";
    for (const o of this.obstacles) {
      ctx.beginPath();
      ctx.arc(o.x * scale, o.y * scale, 2.5, 0, TAU);
      ctx.fill();
    }

    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      const head = snake.path[0];
      const x = head.x * scale;
      const y = head.y * scale;
      const dot = snake.isBoss ? 7 : snake.isPlayer ? 5 : 3 + Math.min(3, snake.points / 120);

      if (snake.isPlayer) {
        ctx.fillStyle = "rgba(34,211,238,0.3)";
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, TAU);
        ctx.fill();
      }

      ctx.fillStyle = snake.isPlayer ? "#e0f2fe" : snake.isBoss ? "#fbbf24" : snake.color;
      ctx.beginPath();
      ctx.arc(x, y, dot, 0, TAU);
      ctx.fill();
    }
  }

  /* --------------------------- HUD --------------------------- */

  updateHud(force) {
    if (this.state === "menu" && !force) return;

    const score = this.player ? this.player.points : 0;
    UI.setStats(score, this.run.coins, SAVE.best);
    UI.renderPowerButtons();
    UI.renderTimers(this.pw);
    UI.updateLives();

    const player = this.player;
    if (player && player.alive) {
      const head = player.path[0];
      UI.updateZoneChip(this.zoneKeyAt(head.x, head.y));

      if (player.evolution) {
        const info = ELEMENTS[player.evolution];
        UI.updateEvoChip(info.name, info.color, true);
      } else {
        let bestEl = null;
        let bestVal = 0;
        for (const key of ELEMENT_KEYS) {
          if (this.evoProgress[key] > bestVal) {
            bestVal = this.evoProgress[key];
            bestEl = key;
          }
        }
        if (bestEl) {
          const info = ELEMENTS[bestEl];
          UI.updateEvoChip(`${info.name} ${bestVal}/${CONFIG.evolveNeeded}`, info.color, false);
        } else {
          UI.hideEvoChip();
        }
      }
    }
  }

  updateRank() {
    const rows = this.getRanking().slice(0, CONFIG.rankRows);
    UI.setRank(rows, this.player);
  }
}

/* ============================================================
 * 7. CLASE INPUT
 * ============================================================ */

const KEY_ANGLES = {
  ArrowUp: -Math.PI / 2,
  ArrowDown: Math.PI / 2,
  ArrowLeft: Math.PI,
  ArrowRight: 0,
  w: -Math.PI / 2,
  s: Math.PI / 2,
  a: Math.PI,
  d: 0,
};

const POWER_KEYS = {
  "1": "velocidad",
  "2": "iman",
  "3": "escudo",
  "4": "congelar",
  "5": "teletransporte",
  "6": "fantasma",
};

class Input {
  constructor(game) {
    this.game = game;
    this.mouse = { x: 0, y: 0, active: false };
    this.joy = { active: false, id: null, baseX: 0, baseY: 0, x: 0, y: 0 };
    this.keys = [];
    this.bind();
  }

  bind() {
    const canvas = this.game.canvas;

    /* --- Ratón: la serpiente sigue el cursor --- */
    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
    });

    document.addEventListener("mouseleave", () => {
      this.mouse.active = false;
    });

    /* --- Teclado: flechas/WASD, 1-6 para poderes y Esc para pausa --- */
    window.addEventListener("keydown", (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (Object.prototype.hasOwnProperty.call(KEY_ANGLES, key)) {
        e.preventDefault();
        if (!this.keys.includes(key)) this.keys.push(key);
        this.mouse.active = false;
        return;
      }

      if (Object.prototype.hasOwnProperty.call(POWER_KEYS, key)) {
        e.preventDefault();
        this.game.usePower(POWER_KEYS[key]);
        return;
      }

      if (key === "Escape" || key === "p") {
        if (this.game.state === "playing" || this.game.state === "paused") {
          e.preventDefault();
          UI.togglePause();
        }
        return;
      }

      if (key === " " || key === "Enter") {
        if (this.game.state === "menu") {
          e.preventDefault();
          UI.openSetup();
        } else if (this.game.state === "paused") {
          e.preventDefault();
          UI.resume();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys = this.keys.filter((k) => k !== key);
    });

    /* --- Táctil: joystick virtual donde tocás --- */
    const startTouch = (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      e.preventDefault();

      this.joy.active = true;
      this.joy.id = touch.identifier;
      this.joy.baseX = touch.clientX;
      this.joy.baseY = touch.clientY;
      this.joy.x = touch.clientX;
      this.joy.y = touch.clientY;
      this.mouse.active = false;

      UI.showJoystick(touch.clientX, touch.clientY);
    };

    const moveTouch = (e) => {
      if (!this.joy.active) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier !== this.joy.id) continue;
        e.preventDefault();
        this.joy.x = touch.clientX;
        this.joy.y = touch.clientY;
        UI.moveJoystick(touch.clientX, touch.clientY, this.joy.baseX, this.joy.baseY);
      }
    };

    const endTouch = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier !== this.joy.id) continue;
        this.joy.active = false;
        this.joy.id = null;
        UI.hideJoystick();
      }
    };

    canvas.addEventListener("touchstart", startTouch, { passive: false });
    canvas.addEventListener("touchmove", moveTouch, { passive: false });
    canvas.addEventListener("touchend", endTouch);
    canvas.addEventListener("touchcancel", endTouch);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Dirección deseada por el jugador (null = sin input nuevo). */
  getAngle(game) {
    // 1) Teclado
    if (this.keys.length) {
      const key = this.keys[this.keys.length - 1];
      if (KEY_ANGLES[key] !== undefined) return KEY_ANGLES[key];
    }

    // 2) Joystick táctil
    if (this.joy.active) {
      const dx = this.joy.x - this.joy.baseX;
      const dy = this.joy.y - this.joy.baseY;
      if (Math.hypot(dx, dy) < 16) return null;
      return Math.atan2(dy, dx);
    }

    // 3) Ratón (dirección de la cabeza hacia el cursor)
    if (this.mouse.active && game.player && game.player.alive) {
      const head = game.player.path[0];
      const screenX = game.viewW / 2 + (head.x - game.cam.x) * game.zoom;
      const screenY = game.viewH / 2 + (head.y - game.cam.y) * game.zoom;
      const dx = this.mouse.x - screenX;
      const dy = this.mouse.y - screenY;
      if (Math.hypot(dx, dy) < 26) return null; // zona muerta sobre la cabeza
      return Math.atan2(dy, dx);
    }

    return null;
  }
}

/* ============================================================
 * 8. INTERFAZ
 * ============================================================ */

const UI = {
  el: {},
  toastTimer: null,

  init() {
    const ids = [
      "hud", "score", "runCoins", "best", "rankList", "rankCount", "lives", "livesStat",
      "zoneChip", "evoChip", "eventChip", "timers", "powers", "pauseBtn", "killFeed",
      "minimap", "joystick", "joystickKnob", "toast",
      "menuScreen", "shopScreen", "missionsScreen", "gameOverScreen", "victoryScreen",
      "setupScreen", "settingsScreen", "pauseScreen",
      "playBtn", "shopBtn", "missionsBtn", "configBtn", "menuBest", "menuWallet", "menuSkinName", "skinStrip",
      "shopWallet", "skinShop", "powerShop", "shopBack",
      "missionsWallet", "missionList", "dailyList", "medalList", "dailyDate", "missionsBack",
      "goReason", "goScore", "goCoins", "goTime", "goKills", "goBest", "goRank", "goAgain", "goMenu",
      "vScore", "vCoins", "vBonus", "vTime", "vKills", "vWallet", "vAgain", "vMenu",
      "nameInput", "nameError", "setupPlay", "setupBack", "colorStrip", "eyeStrip", "patternStrip",
      "previewCanvas", "settingsBack", "resetSaveBtn",
      "setName", "setMinimap", "setParticles", "setShake", "setTrails",
      "resumeBtn", "pauseMenuBtn", "paScore", "paTime", "paKills",
    ];
    ids.forEach((id) => (this.el[id] = document.getElementById(id)));

    // Pantallas principales
    this.el.playBtn.addEventListener("click", () => this.openSetup());
    this.el.goAgain.addEventListener("click", () => GAME.startGame());
    this.el.vAgain.addEventListener("click", () => GAME.startGame());
    this.el.goMenu.addEventListener("click", () => GAME.toMenu());
    this.el.vMenu.addEventListener("click", () => GAME.toMenu());

    this.el.shopBtn.addEventListener("click", () => {
      this.renderShop();
      this.showScreen("shop");
    });
    this.el.missionsBtn.addEventListener("click", () => {
      this.renderMissions();
      this.showScreen("missions");
    });
    this.el.shopBack.addEventListener("click", () => this.showScreen("menu"));
    this.el.missionsBack.addEventListener("click", () => this.showScreen("menu"));

    // Presentación: nombre y apariencia
    this.el.setupBack.addEventListener("click", () => this.showScreen("menu"));
    this.el.setupPlay.addEventListener("click", () => this.startFromSetup());
    this.el.nameInput.addEventListener("input", () => (this.el.nameError.hidden = true));
    this.el.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.startFromSetup();
    });
    this.el.colorStrip.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-color]");
      if (!btn) return;
      SAVE.appearance.color = btn.dataset.color;
      persist();
      this.renderSetup();
    });
    this.el.eyeStrip.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-eyes]");
      if (!btn) return;
      SAVE.appearance.eyes = btn.dataset.eyes;
      persist();
      this.renderSetup();
    });
    this.el.patternStrip.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-pattern]");
      if (!btn) return;
      SAVE.appearance.pattern = btn.dataset.pattern;
      persist();
      this.renderSetup();
    });

    // Configuración
    this.el.configBtn.addEventListener("click", () => this.openSettings());
    this.el.settingsBack.addEventListener("click", () => this.showScreen("menu"));
    const toggles = [
      ["setName", "names"],
      ["setMinimap", "minimap"],
      ["setParticles", "particles"],
      ["setShake", "shake"],
      ["setTrails", "trails"],
    ];
    for (const [id, key] of toggles) {
      this.el[id].addEventListener("change", (e) => {
        SAVE.settings[key] = e.target.checked;
        persist();
        this.applySettings();
      });
    }
    this.el.resetSaveBtn.addEventListener("click", () => this.resetSave());

    // Pausa
    this.el.pauseBtn.addEventListener("click", () => this.togglePause());
    this.el.resumeBtn.addEventListener("click", () => this.resume());
    this.el.pauseMenuBtn.addEventListener("click", () => GAME.toMenu());

    // Barra de poderes
    this.el.powers.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-power]");
      if (btn) GAME.usePower(btn.dataset.power);
    });

    // Selección rápida de skin en el menú
    this.el.skinStrip.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-skin]");
      if (!btn) return;
      if (!SAVE.skins.includes(btn.dataset.skin)) return;
      SAVE.equipped = btn.dataset.skin;
      persist();
      this.renderMenu();
    });

    // Tienda: skins
    this.el.skinShop.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const skin = SKINS.find((s) => s.id === btn.dataset.id);
      if (!skin) return;

      if (btn.dataset.action === "buy") {
        if (SAVE.wallet < skin.price) return this.toast("Monedas insuficientes", "#fb7185");
        SAVE.wallet -= skin.price;
        SAVE.skins.push(skin.id);
        SAVE.equipped = skin.id;
        persist();
        this.toast(`Skin ${skin.name} comprada`, skin.color);
      } else {
        SAVE.equipped = skin.id;
        persist();
      }
      this.renderShop();
      this.renderMenu();
    });

    // Tienda: poderes
    this.el.powerShop.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-buy-power]");
      if (!btn) return;
      const id = btn.dataset.buyPower;
      const def = POWERS[id];
      if (SAVE.wallet < def.price) return this.toast("Monedas insuficientes", "#fb7185");
      SAVE.wallet -= def.price;
      SAVE.powers[id] += 1;
      persist();
      this.toast(`${def.name} +1`, def.color);
      this.renderShop();
    });

    // Misiones: reclamar recompensa
    this.el.missionList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-claim]");
      if (!btn) return;
      const mission = MISSIONS.find((m) => m.id === btn.dataset.claim);
      if (!mission) return;

      const progress = SAVE.stats[mission.stat] || 0;
      if (progress < mission.target || SAVE.claimed[mission.id]) return;

      SAVE.claimed[mission.id] = true;
      SAVE.wallet += mission.reward;
      persist();
      this.toast(`+${mission.reward} monedas`, "#fbbf24");
      this.renderMissions();
      this.renderMenu();
    });

    // Desafíos diarios: reclamar
    this.el.dailyList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-claim-daily]");
      if (!btn) return;
      const daily = ensureDaily();
      const def = DAILY_POOL.find((d) => d.id === btn.dataset.claimDaily);
      if (!def) return;

      const progress = daily.progress[def.id] || 0;
      if (progress < def.target || daily.claimed[def.id]) return;

      daily.claimed[def.id] = true;
      SAVE.wallet += def.reward;
      persist();
      this.toast(`+${def.reward} monedas`, "#fbbf24");
      this.renderMissions();
      this.renderMenu();
    });

    // Medallas: reclamar
    this.el.medalList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-claim-medal]");
      if (!btn) return;
      const def = ACHIEVEMENTS.find((a) => a.id === btn.dataset.claimMedal);
      if (!def) return;

      const progress = SAVE.stats[def.stat] || 0;
      if (progress < def.target || SAVE.claimed[`m_${def.id}`]) return;

      SAVE.claimed[`m_${def.id}`] = true;
      SAVE.wallet += def.reward;
      persist();
      this.toast(`+${def.reward} monedas`, "#fbbf24");
      this.renderMissions();
      this.renderMenu();
    });

    // Estado inicial de la interfaz
    this.applySettings();
    this.el.rankCount.textContent = CONFIG.rankRows;
  },

  /* ---------------------- Pantallas ---------------------- */
  showScreen(name) {
    const map = {
      menu: "menuScreen",
      shop: "shopScreen",
      missions: "missionsScreen",
      gameover: "gameOverScreen",
      victory: "victoryScreen",
      setup: "setupScreen",
      settings: "settingsScreen",
      pause: "pauseScreen",
    };
    for (const key of Object.keys(map)) {
      this.el[map[key]].classList.toggle("is-visible", key === name);
    }
  },

  showHud(visible) {
    this.el.hud.classList.toggle("is-visible", visible);
    this.el.powers.classList.toggle("is-visible", visible);
    this.el.minimap.classList.toggle("is-visible", visible);
    this.el.rankCount.textContent = CONFIG.rankRows;
  },

  /* -------------------- Nombre y apariencia -------------------- */

  /** Pantalla previa al juego: nombre, color, ojos y patrón. */
  openSetup() {
    this.el.nameInput.value = SAVE.name || "";
    this.el.nameError.hidden = true;
    this.renderSetup();
    this.showScreen("setup");
    this.el.nameInput.focus();
  },

  renderSetup() {
    const skin = SKINS.find((s) => s.id === SAVE.equipped) || SKINS[0];
    const colors = [skin.color, "#22d3ee", "#4ade80", "#f472b6", "#facc15", "#a78bfa", "#fb7185", "#e2e8f0"];
    const current = SAVE.appearance.color || "";

    this.el.colorStrip.innerHTML = colors
      .map(
        (c, i) => `<button type="button" class="swatch ${current === (i === 0 ? "" : c) || (i === 0 && !current) ? "is-equipped" : ""}"
          style="--c:${c}" data-color="${i === 0 ? "" : c}" title="Color ${i + 1}"></button>`
      )
      .join("");

    this.el.eyeStrip.innerHTML = EYES.map(
      (e) => `<button type="button" class="pill ${SAVE.appearance.eyes === e.id ? "is-on" : ""}"
        data-eyes="${e.id}">${e.name}</button>`
    ).join("");

    this.el.patternStrip.innerHTML = PATTERNS.map(
      (p) => `<button type="button" class="pill ${SAVE.appearance.pattern === p.id ? "is-on" : ""}"
        data-pattern="${p.id}">${p.name}</button>`
    ).join("");

    this.drawPreview();
  },

  /** Mini dibujo de la serpiente con la apariencia elegida. */
  drawPreview() {
    const cv = this.el.previewCanvas;
    if (!cv || !cv.getContext) return;

    const ctx = cv.getContext("2d");
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);

    const look = SAVE.appearance;
    const skin = SKINS.find((s) => s.id === SAVE.equipped) || SKINS[0];
    const color = look.color || skin.color;
    const t = performance.now() / 1000;

    const pts = [];
    for (let i = 0; i <= 44; i++) {
      const k = i / 44;
      pts.push({
        x: 34 + k * (w - 80),
        y: h / 2 + Math.sin(k * Math.PI * 2.4 + t * 1.6) * 18,
      });
    }

    const r = 9;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.34)";
    ctx.lineWidth = r * 2 + 4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2;
    ctx.stroke();

    if (look.pattern === "puntos") {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 3; i < pts.length - 4; i += 5) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, r * 0.4, 0, TAU);
        ctx.fill();
      }
    } else if (look.pattern === "rayas") {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = r * 1.4;
      for (let i = 2; i < pts.length - 6; i += 7) {
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[Math.min(i + 3, pts.length - 1)].x, pts[Math.min(i + 3, pts.length - 1)].y);
        ctx.stroke();
      }
    } else if (look.pattern === "anillos") {
      ctx.strokeStyle = "rgba(2,6,23,0.5)";
      ctx.lineWidth = 3;
      for (let i = 4; i < pts.length - 4; i += 6) {
        const prev = pts[i - 1];
        const ang = Math.atan2(pts[i].y - prev.y, pts[i].x - prev.x) + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(pts[i].x - Math.cos(ang) * r, pts[i].y - Math.sin(ang) * r);
        ctx.lineTo(pts[i].x + Math.cos(ang) * r, pts[i].y + Math.sin(ang) * r);
        ctx.stroke();
      }
    }

    // Cabeza con ojos
    const head = pts[pts.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(head.x, head.y, r, 0, TAU);
    ctx.fill();

    const eyes = look.eyes;
    if (eyes === "robot") {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(head.x - 1, head.y - 6, 7, 5);
      ctx.fillRect(head.x - 1, head.y + 1, 7, 5);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(head.x + 3, head.y - 5, 3, 3);
      ctx.fillRect(head.x + 3, head.y + 2, 3, 3);
    } else if (eyes === "tranquilo") {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(head.x + 1, head.y - 5);
      ctx.lineTo(head.x + 7, head.y - 5);
      ctx.moveTo(head.x + 1, head.y + 5);
      ctx.lineTo(head.x + 7, head.y + 5);
      ctx.stroke();
    } else {
      const size = eyes === "agudo" ? 3 : 4;
      for (const dy of [-5, 5]) {
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.arc(head.x + 2, head.y + dy, size, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#0b1020";
        ctx.beginPath();
        ctx.arc(head.x + 4, head.y + dy, size * 0.5, 0, TAU);
        ctx.fill();
      }
      if (eyes === "enojado") {
        ctx.strokeStyle = "#0b1020";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(head.x - 2, head.y - 9);
        ctx.lineTo(head.x + 7, head.y - 4);
        ctx.moveTo(head.x - 2, head.y + 9);
        ctx.lineTo(head.x + 7, head.y + 4);
        ctx.stroke();
      }
    }
  },

  /** Valida el nombre y arranca la partida. */
  startFromSetup() {
    const value = this.el.nameInput.value.trim().replace(/\s+/g, " ");
    const valid = /^[A-Za-zÀ-ÿ0-9 ._-]{1,16}$/.test(value);

    if (!valid) {
      this.el.nameError.hidden = false;
      return;
    }

    SAVE.name = value;
    persist();
    GAME.startGame();
  },

  /* ------------------------ Configuración ------------------------ */

  openSettings() {
    this.el.setName.checked = SAVE.settings.names;
    this.el.setMinimap.checked = SAVE.settings.minimap;
    this.el.setParticles.checked = SAVE.settings.particles;
    this.el.setShake.checked = SAVE.settings.shake;
    this.el.setTrails.checked = SAVE.settings.trails;
    this.showScreen("settings");
  },

  applySettings() {
    this.el.minimap.classList.toggle("is-hidden", !SAVE.settings.minimap);
  },

  resetSave() {
    if (!window.confirm("¿Borrar todo el progreso?")) return;
    for (const key of Object.keys(SAVE)) delete SAVE[key];
    Object.assign(SAVE, defaultSave());
    persist();
    this.applySettings();
    this.renderMenu();
    this.showScreen("menu");
    this.toast("Progreso borrado", "#fb7185");
  },

  /* --------------------------- Pausa --------------------------- */

  togglePause() {
    if (GAME.state === "playing") this.pause();
    else if (GAME.state === "paused") this.resume();
  },

  pause() {
    if (GAME.state !== "playing") return;
    GAME.state = "paused";
    this.el.paScore.textContent = GAME.player ? GAME.player.points : 0;
    this.el.paTime.textContent = `${Math.floor(GAME.run.time)}s`;
    this.el.paKills.textContent = GAME.run.kills;
    this.showScreen("pause");
  },

  resume() {
    if (GAME.state !== "paused") return;
    GAME.state = "playing";
    this.showScreen(null);
  },

  /* -------------------------- Killfeed -------------------------- */

  feed(html, isYou) {
    if (!this.el.killFeed || typeof document.createElement !== "function") return;

    const el = document.createElement("div");
    el.className = `killfeed__item${isYou ? " is-you" : ""}`;
    el.innerHTML = html;
    this.el.killFeed.appendChild(el);

    while (this.el.killFeed.children.length > 5) {
      this.el.killFeed.removeChild(this.el.killFeed.firstChild);
    }

    setTimeout(() => el.classList.add("is-out"), 3600);
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 4200);
  },

  clearFeed() {
    if (this.el.killFeed) this.el.killFeed.innerHTML = "";
  },

  /* ---------------------- Estadísticas ---------------------- */

  setStats(score, coins, best) {
    this.el.score.textContent = score;
    this.el.runCoins.textContent = coins;
    this.el.best.textContent = best;
  },

  /** Muestra las vidas extra solo cuando el jugador tiene alguna. */
  updateLives() {
    const stat = this.el.livesStat;
    if (!stat) return;
    const lives = GAME.player ? GAME.player.lives : 0;
    stat.hidden = lives <= 0;
    this.el.lives.textContent = lives;
  },

  setRank(rows, player) {
    this.el.rankList.innerHTML = rows
      .map((snake) => {
        const isYou = snake === player;
        return `<li class="${isYou ? "is-you" : ""}">
          <i style="background:${snake.color};color:${snake.color}"></i>
          <span>${snake.name}${isYou ? " (vos)" : ""}</span>
          <b>${snake.points}</b>
        </li>`;
      })
      .join("");
  },

  updateZoneChip(key) {
    const zone = ZONES[key];
    const chip = this.el.zoneChip;
    chip.querySelector("i").style.setProperty("--c", zone.tint);
    chip.querySelector("span").textContent = zone.effect ? `${zone.name} · ${zone.effect}` : zone.name;
  },

  updateEvoChip(text, color, active) {
    const chip = this.el.evoChip;
    chip.hidden = false;
    chip.style.color = color;
    chip.style.borderColor = hexToRgba(color, 0.55);
    chip.querySelector("i").style.setProperty("--c", color);
    chip.querySelector("span").textContent = active ? `${text} activa` : text;
  },

  hideEvoChip() {
    this.el.evoChip.hidden = true;
  },

  showEventChip(text, color) {
    const chip = this.el.eventChip;
    chip.hidden = false;
    chip.textContent = text;
    chip.style.background = `linear-gradient(135deg, ${color}, #f97316)`;
  },

  hideEventChip() {
    this.el.eventChip.hidden = true;
  },

  renderPowerButtons() {
    for (const id of POWER_IDS) {
      const btn = this.el.powers.querySelector(`[data-power="${id}"]`);
      if (!btn) continue;
      const count = SAVE.powers[id] || 0;
      const def = POWERS[id];
      const cd = (GAME.pwCd && GAME.pwCd[id]) || 0;

      btn.style.setProperty("--c", def.color);
      btn.querySelector(`[data-count="${id}"]`).textContent = count;
      btn.classList.toggle("is-empty", count <= 0);
      btn.classList.toggle("is-active", GAME.pw[id] > 0);
      btn.classList.toggle("is-cooling", cd > 0);

      // Cuenta atrás de la recarga
      let cdEl = btn.querySelector(".power__cd");
      if (cd > 0) {
        if (!cdEl && typeof document.createElement === "function") {
          cdEl = document.createElement("span");
          cdEl.className = "power__cd";
          btn.appendChild(cdEl);
        }
        if (cdEl) cdEl.textContent = `${Math.ceil(cd)}s`;
      } else if (cdEl && cdEl.parentNode) {
        cdEl.parentNode.removeChild(cdEl);
      }
    }
  },

  renderTimers(pw) {
    const active = POWER_IDS.filter((id) => pw[id] > 0);
    const signature = active.map((id) => `${id}:${Math.ceil(pw[id])}`).join("|");
    if (signature === this.el.timers.dataset.sig) return;
    this.el.timers.dataset.sig = signature;

    this.el.timers.innerHTML = active
      .map(
        (id) =>
          `<span class="timer" style="border-color:${hexToRgba(POWERS[id].color, 0.5)}">
            ${POWERS[id].name} <b>${Math.ceil(pw[id])}s</b>
          </span>`
      )
      .join("");
  },

  /* ------------------------- Toast ------------------------- */

  toast(text, color) {
    const el = this.el.toast;
    el.textContent = text;
    el.style.color = color || "#e5edf7";
    el.style.borderColor = color ? hexToRgba(color, 0.5) : "rgba(148,163,184,0.18)";
    el.classList.add("is-visible");

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
  },

  /* ------------------------ Joystick ------------------------ */

  showJoystick(x, y) {
    const joy = this.el.joystick;
    joy.style.left = `${x}px`;
    joy.style.top = `${y}px`;
    joy.classList.add("is-active");
    this.el.joystickKnob.style.transform = "translate(0px, 0px)";
  },

  moveJoystick(x, y, baseX, baseY) {
    let dx = x - baseX;
    let dy = y - baseY;
    const max = 44;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.el.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  },

  hideJoystick() {
    this.el.joystick.classList.remove("is-active");
  },

  /* -------------------------- Menú -------------------------- */

  renderMenu() {
    this.el.menuBest.textContent = SAVE.best;
    this.el.menuWallet.textContent = SAVE.wallet;

    const skin = SKINS.find((s) => s.id === SAVE.equipped) || SKINS[0];
    this.el.menuSkinName.textContent = skin.name;

    this.el.skinStrip.innerHTML = SKINS.map((s) => {
      const owned = SAVE.skins.includes(s.id);
      const equipped = SAVE.equipped === s.id;
      return `<button class="swatch ${owned ? "" : "is-locked"} ${equipped ? "is-equipped" : ""}"
        style="--c:${s.color}" data-skin="${s.id}" title="${s.name}" type="button"></button>`;
    }).join("");
  },

  /* -------------------------- Tienda -------------------------- */

  renderShop() {
    this.el.shopWallet.textContent = SAVE.wallet;

    this.el.skinShop.innerHTML = SKINS.map((s) => {
      const owned = SAVE.skins.includes(s.id);
      const equipped = SAVE.equipped === s.id;

      let btn;
      if (equipped) btn = `<button class="shop-item__btn is-owned" type="button" disabled>Equipada</button>`;
      else if (owned) btn = `<button class="shop-item__btn" data-action="equip" data-id="${s.id}" type="button">Equipar</button>`;
      else btn = `<button class="shop-item__btn" data-action="buy" data-id="${s.id}" type="button">${s.price}</button>`;

      return `<div class="shop-item">
        <span class="shop-item__swatch" style="--c:${s.color}">${s.name[0]}</span>
        <span class="shop-item__body">
          <span class="shop-item__name">${s.name}</span>
          <span class="shop-item__meta">${owned ? "En tu colección" : "Skin"}</span>
        </span>
        ${btn}
      </div>`;
    }).join("");

    this.el.powerShop.innerHTML = POWER_IDS.map((id) => {
      const def = POWERS[id];
      const owned = SAVE.powers[id] || 0;
      const cant = SAVE.wallet < def.price;
      return `<div class="shop-item">
        <span class="shop-item__swatch" style="--c:${def.color}">${def.short[0]}</span>
        <span class="shop-item__body">
          <span class="shop-item__name">${def.name}</span>
          <span class="shop-item__meta">Tenés ${owned} · ${def.duration ? `${def.duration}s` : "instantáneo"}</span>
        </span>
        <button class="shop-item__btn" data-buy-power="${id}" type="button" ${cant ? "disabled" : ""}>${def.price}</button>
      </div>`;
    }).join("");
  },

  /* ------------------------- Misiones ------------------------- */

  renderMissions() {
    this.el.missionsWallet.textContent = SAVE.wallet;

    // Misiones fijas
    this.el.missionList.innerHTML = MISSIONS.map((m) =>
      this.missionCard({
        name: m.name,
        reward: m.reward,
        progress: SAVE.stats[m.stat] || 0,
        target: m.target,
        claimed: !!SAVE.claimed[m.id],
        claimAttr: `data-claim="${m.id}"`,
      })
    ).join("");

    // Desafíos diarios (3 al azar que cambian cada día)
    const daily = ensureDaily();
    this.el.dailyDate.textContent = daily.date;
    this.el.dailyList.innerHTML = daily.ids
      .map((id) => {
        const def = DAILY_POOL.find((d) => d.id === id);
        if (!def) return "";
        return this.missionCard({
          name: def.name,
          reward: def.reward,
          progress: daily.progress[id] || 0,
          target: def.target,
          claimed: !!daily.claimed[id],
          claimAttr: `data-claim-daily="${id}"`,
        });
      })
      .join("");

    // Medallas
    this.el.medalList.innerHTML = ACHIEVEMENTS.map((a) => {
      const value = SAVE.stats[a.stat] || 0;
      return this.missionCard({
        name: a.name,
        desc: a.desc,
        reward: a.reward,
        progress: value,
        target: a.target,
        claimed: !!SAVE.claimed[`m_${a.id}`],
        claimAttr: `data-claim-medal="${a.id}"`,
        medal: value >= a.target,
      });
    }).join("");
  },

  /** Tarjeta común para misiones, desafíos diarios y medallas. */
  missionCard({ name, desc, reward, progress, target, claimed, claimAttr, medal }) {
    const value = Math.min(target, progress);
    const pct = Math.round((value / target) * 100);
    const done = value >= target;

    let button;
    if (claimed) button = `<button class="shop-item__btn is-owned" type="button" disabled>Reclamada</button>`;
    else if (done) button = `<button class="shop-item__btn" ${claimAttr} type="button">Reclamar</button>`;
    else button = `<button class="shop-item__btn" type="button" disabled>En curso</button>`;

    const classes = `mission ${done ? "is-done" : ""} ${medal ? "is-unlocked" : ""}`;
    const icon = medal ? `<span class="medal__icon">${name[0]}</span>` : "";

    return `<div class="${medal ? "medal " : ""}${classes}">
      ${icon}
      <div class="mission__body">
        <div class="mission__top">
          <span class="mission__name">${name}${desc ? ` <em>${desc}</em>` : ""}</span>
          <span class="mission__reward">+${reward} monedas</span>
        </div>
        <div class="mission__bar"><i style="width:${pct}%"></i></div>
        <div class="mission__foot">
          <span>${value} / ${target} (${pct}%)</span>
          ${button}
        </div>
      </div>
    </div>`;
  },

  /* ---------------- Game over / victoria ---------------- */

  showGameOver(game, cause) {
    const run = game.run;
    const type = cause ? cause.type : "";

    const reasons = {
      pared: "Chocaste contra el borde del mapa.",
      roca: "Chocaste contra una roca rodante.",
      meteorito: "Te alcanzó un meteorito.",
      erupcion: "Te alcanzó la erupción volcánica.",
      fuego: "Entraste en el aura de fuego.",
      snake: cause && cause.by ? `Chocaste contra ${cause.by.name}.` : "Chocaste contra otra serpiente.",
    };

    this.el.goReason.textContent = reasons[type] || "Perdiste.";
    this.el.goScore.textContent = run.points;
    this.el.goCoins.textContent = run.coins;
    this.el.goTime.textContent = `${Math.floor(run.time)}s`;
    this.el.goKills.textContent = run.kills;
    this.el.goBest.textContent = SAVE.best;

    const ranking = game.getRanking();
    const position = ranking.findIndex((s) => s === game.player) + 1;
    this.el.goRank.textContent = position > 0 ? `#${position}` : `#${ranking.length}`;

    this.showScreen("gameover");
  },

  showVictory(game, bonus) {
    const run = game.run;
    this.el.vScore.textContent = run.points;
    this.el.vCoins.textContent = run.coins;
    this.el.vBonus.textContent = `+${bonus}`;
    this.el.vTime.textContent = `${Math.floor(run.time)}s`;
    this.el.vKills.textContent = run.kills;
    this.el.vWallet.textContent = SAVE.wallet;
    this.showScreen("victory");
  },
};

/* ============================================================
 * 9. ARRANQUE
 * ============================================================ */

const GAME = new Game(
  document.getElementById("gameCanvas"),
  document.getElementById("minimap")
);

const INPUT = new Input(GAME);

UI.init();
UI.showScreen("menu");
UI.renderMenu();
GAME.reset(false);

let lastTime = performance.now();

function frame(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05; // evita saltos al volver a la pestaña

  GAME.update(dt);
  GAME.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
