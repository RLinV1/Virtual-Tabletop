import type { AnimationDef } from "@vtt/shared";

/** What the Animations tab shows for a shape. */
export const SHAPE_LABELS: Record<AnimationDef["shape"], string> = {
  slash: "Slash (melee)",
  claw: "Claw rake (melee)",
  whirlwind: "Whirlwind (melee)",
  slam: "Ground slam (melee)",
  shadow: "Shadow strike (melee)",
  projectile: "Projectile (ranged)",
  volley: "Arrow volley (ranged)",
  dagger: "Thrown daggers (ranged)",
  fireball: "Fireball (ranged)",
  meteor: "Meteor (falls on target)",
  explosion: "Explosion (delayed blast)",
  bolt: "Bolt (magic)",
  chain: "Chain lightning (magic)",
  beam: "Beam (magic)",
  frost: "Frost spikes (magic)",
  poison: "Poison cloud (magic)",
  smite: "Smite (pillar of light)",
  sonic: "Sonic wave (cone)",
  tornado: "Tornado (travels to target)",
  nuke: "Nuke (map blast)",
};

