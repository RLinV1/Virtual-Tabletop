# Attack and animation performance review

Reviewed against `main` at `e5adc64`, October 18, 2026.

## Why attacks appeared to do no damage

The empty attack list offered a generic d20 **Roll to hit** action. That action creates a
to-hit roll, which can be marked Hit or Miss but cannot lower HP. It has no configured
damage dice. A named attack supplies those dice; a custom roll can also explicitly select
Damage. The GM applies the resulting damage roll to subtract its total from current HP.

The empty state now asks the user to create an attack or use Custom roll, with both actions
visible. It no longer offers the generic to-hit shortcut. The server's existing damage
rules remain unchanged: GM only, current target HP, one application per roll.

## Findings addressed

| Finding | Change | Evidence |
| --- | --- | --- |
| Trail emissions and impact bursts each received a fresh particle allowance. Dense strikes reached 160 live particles even on Low. | Both now share the same live-particle allowance for the effect. | Regression tests exercise every strike shape with 12 projectiles and overlapping trails/impacts at all three quality settings. Before the fix, all three tests peaked at 160 and failed. |
| A Pixi strike also mounted the DOM overlay, which rendered nothing for strikes while loading its animation and particle dependencies. | Strikes now bypass the overlay queue and its removal timers. | Source review of `Board.playEffect` and `EffectsOverlay.AttackEffectView`. |
| Reduced-motion Hit effects registered a canvas animation loop even though their shake amplitude was zero. | Reduced-motion hits use the overlay's still marker without a canvas loop. | Source review of `BoardView.playAttackEffect`. |
| Camera focus had a separate animation-frame callback that survived board teardown. | Board teardown now cancels that callback. | Source review of camera focus and `BoardView.destroy`. |
| The initial application imported room and library pages eagerly, including the board renderer and animation editor. | Room, library and dashboard pages now load on demand behind an accessible loading state. | Route-loading regression test verifies that the home page imports none of those modules and that visiting room/library routes renders the correct page. |

## Runtime budgets and safeguards

The nuke's stem now extends farther below the impact point while its cap rises, producing
an approximately 45% taller cloud in landscape views. Viewport bounds, sprite counts and
particle budgets stay unchanged. Reduced animations is available in Settings; its duplicate
Table effects control has been removed.

Nuke follow-up: visible HP and health meters now wait for the bomb's first impact frame.
`MapNuked` is announced before the damage events, and the renderer releases the temporary
HP presentation hold on impact. Commands still read authoritative state, so a heal during
the drop cannot accidentally restore nuke damage. Replaced nukes, hidden tabs, snapshots,
reduced motion and a missing WebGL renderer have bounded cleanup/fallback paths. The server
keeps the damage and undo batch atomic.

| Quality | Strike particles per effect | Heavy-effect frame limit | Canvas pixel-density cap | Condition particle emitters |
| --- | ---: | ---: | ---: | ---: |
| Low | 28 | 24 fps | 1x | 0 |
| Balanced | 56 | 30 fps | 2x | 6 |
| High | 80 | 30 fps | 2x | 12 |

At most four Pixi effects run concurrently. At Balanced quality, the tested worst-case
particle ceiling falls from 640 to 224 across four strikes, a 65% reduction. This measures
particle counts, not an FPS improvement.

Existing safeguards remain useful: idle boards draw on demand; condition particles are
limited to nearby on-screen tokens; particle canvases stop in hidden tabs; heavy Pixi
effects are disposed when the tab hides; reduced-motion strikes use static markers and
timers; previews stop on hide/unmount; thumbnails share one offscreen renderer and a
bounded cache; spark sprites reuse shared textures; the nuke uses cached billow textures
instead of full-screen blur passes. Low quality disables strike glow.

## Limits

The production entry JavaScript fell from **1,410.98 kB (423.27 kB gzip)** before route
splitting to **454.03 kB (137.92 kB gzip)** afterwards, approximately **67% less entry
JavaScript**. This moves room/library code to later requests; it does not reduce the
total code required to visit every page. The shared editor/renderer chunk remains
567.73 kB (176.61 kB gzip), so the build still reports its 500 kB chunk warning.

Validation: lint, all workspace typechecks and the production build pass; 623 shared
tests, 423 server tests and 782 web tests pass, including the route-loading and nuke-impact
regression tests. The server suite skips 35 tests requiring optional backing services.
The follow-up broad run hit wall-detection/account import timeouts under load; wall detection
passed on its isolated rerun and all 84 web suites passed with four workers.
The two latency benchmark tests also pass when run alone: all 300 messages arrived for
each recipient, with p95 latency of 137.6 ms for the GM and 137.0 ms for the player
against the 150 ms target. An earlier run during concurrent builds/tests measured
183.2 ms and failed; these are synthetic transport measurements, not animation timings.

This review validates source behavior, particle budgets, cleanup paths and production
bundling. It does not establish a GPU frame-time guarantee on phones or integrated
graphics. Multiple glowing strikes still tessellate geometry and use blur passes, and a
player's animated fog or frightened tokens still require periodic board redraws. Device
profiling is needed before claiming a sustained frame rate on large maps.
