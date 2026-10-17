import { z } from "zod";

/**
 * A board animation as plain data (ADR 0038). Flat and bounded, so the server can validate it
 * from any client, a GM can edit it in a form, and one renderer plays every look. The built-in
 * attack styles and the nuke are values of this type too.
 */
export const ANIMATION_SHAPES = ["slash", "projectile", "bolt", "nuke"] as const;
export const AnimationShape = z.enum(ANIMATION_SHAPES);
export type AnimationShape = z.infer<typeof AnimationShape>;

/** How an attack is drawn when the attack names no animation of its own. */
export const AttackStyle = z.enum(["melee", "ranged", "magic"]);
export type AttackStyle = z.infer<typeof AttackStyle>;

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour like #ff8800");
const Unit = z.number().min(0).max(1);

export const MAX_ANIMATION_NAME = 60;
/** Animations one GM may keep in the library. */
export const MAX_LIBRARY_ANIMATIONS = 100;

export const AnimationDef = z.object({
  shape: AnimationShape,
  /** Seconds the effect plays for. */
  duration: z.number().min(0.2).max(4),
  primary: HexColor,
  secondary: HexColor,
  /** Scales the effect against the token it is drawn on, 1 = a token's size. */
  size: z.number().min(0.5).max(3),
  /** Sparks thrown out on impact. */
  particles: z.number().int().min(0).max(120),
  glow: Unit,
  shake: Unit,
  flash: Unit,
});
export type AnimationDef = z.infer<typeof AnimationDef>;

/** A strike animation: anything but the map-wide nuke. */
export const StrikeAnimationDef = AnimationDef.refine((a) => a.shape !== "nuke", { message: "A nuke cannot be used for an attack" });
/** The blast animation of a nuke. */
export const NukeAnimationDef = AnimationDef.refine((a) => a.shape === "nuke", { message: "Only a nuke animation can be used for a nuke" });

/** The most damage one nuke may deal to each token. */
export const MAX_NUKE_DAMAGE = 999;

export const AnimationName = z.string().trim().min(1).max(MAX_ANIMATION_NAME);
