import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { ParticleShape } from "@vtt/shared";
import { drawSparks, mix, WHITE, type Spark } from "./fxKit";

const textures = new Map<string, Texture>();
let unavailable = false;

/** Shared white particle artwork: colour and lifetime are sprite properties, not new paths. */
function particleTexture(kind: ParticleShape | "halo"): Texture | null {
  const known = textures.get(kind);
  if (known) return known;
  if (unavailable) return null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) { unavailable = true; return null; }
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  if (kind === "halo") {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,0.5)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  } else if (kind === "square") {
    ctx.fillRect(1, 1, 62, 62);
  } else if (kind === "star") {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const r = i % 2 ? 12 : 31;
      if (i === 0) ctx.moveTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      else ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === "shard") {
    ctx.moveTo(63, 32); ctx.lineTo(64 / 3, 1); ctx.lineTo(1, 32); ctx.lineTo(64 / 3, 63); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(32, 32, kind === "ring" ? 27 : 31, 0, Math.PI * 2);
    if (kind === "ring") { ctx.lineWidth = 7; ctx.stroke(); }
    else ctx.fill();
  }
  const texture = Texture.from(canvas);
  textures.set(kind, texture);
  return texture;
}

/** Bounded reusable sprites replace per-frame spark tessellation and blurred copies of it. */
export class SparkRenderer {
  readonly container = new Container();
  private pool: Array<{ core: Sprite; halo: Sprite }> = [];
  private fallback: Graphics | null = null;

  constructor() { this.container.eventMode = "none"; }

  draw(list: readonly Spark[], look: ParticleShape = "spark") {
    this.container.visible = list.length > 0;
    if (list.length === 0) return;
    const texture = particleTexture(look);
    const haloTexture = particleTexture("halo");
    if (!texture || !haloTexture) {
      this.fallback ??= this.container.addChild(new Graphics());
      this.fallback.blendMode = "add";
      this.fallback.clear();
      drawSparks(this.fallback, list, look);
      return;
    }
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      let item = this.pool[i];
      if (!item) {
        const core = new Sprite(texture);
        const halo = new Sprite(haloTexture);
        core.blendMode = halo.blendMode = "add";
        halo.anchor.set(0.5);
        this.container.addChild(halo, core);
        item = { core, halo };
        this.pool.push(item);
      }
      const { core, halo } = item;
      const alpha = Math.max(0, 1 - s.age / s.life);
      core.texture = texture;
      core.anchor.set(look === "shard" ? 1 / 3 : 0.5, 0.5);
      core.position.set(s.x, s.y);
      core.tint = mix(s.color, WHITE, 0.5);
      core.alpha = alpha;
      core.visible = true;
      core.rotation = look === "shard" ? Math.atan2(s.vy, s.vx) : look === "star" || look === "square" ? s.rot : 0;
      const diameter = s.size * (look === "star" ? 5.2 : look === "square" ? 2.2 : look === "ring" ? 3.9 : look === "shard" ? 4.5 : 2);
      core.width = diameter;
      core.height = look === "shard" ? s.size * 1.4 : diameter;
      halo.visible = look !== "shard" && look !== "ring";
      halo.position.set(s.x, s.y);
      halo.tint = s.color;
      halo.alpha = alpha * (look === "square" ? 0.5 : 0.75);
      halo.width = halo.height = s.size * (look === "spark" ? 5.8 : 5);
    }
    for (let i = list.length; i < this.pool.length; i++) {
      this.pool[i]!.core.visible = this.pool[i]!.halo.visible = false;
    }
  }
}
