// Turns the sim's event list into particles, sound, banners and modals.
//
// This lives apart from main.js so it can be exercised in Node with stub
// effects. It is the layer that produced the one crash the pure-sim suite
// could never see (`MAP is not defined` in the leak handler), because nothing
// but a real losing run in a browser ever ran it.
//
// It touches no globals: everything it needs arrives on `ctx`.

import { WAVES } from "./data.js";

export const MASK_COLOR = {
  plateado: "#b9c6d4",
  nino: "#f2789b",
  matador: "#e8524f",
  tecnico: "#4d84e0",
  colgado: "#5fbf6e",
  rudo: "#5b4a72",
  toro: "#8a4b3a",
  campeon: "#e0a52c",
  coloso: "#ffd45e",
};

/**
 * @param {Array} events   what `sim.update()` returned
 * @param {object} ctx     { state, fx, sfx, banner, modal, recordBest,
 *                           recordMasks, difficultyName, budget }
 *   `budget` caps sounds per frame so a busy wave does not turn into noise;
 *   it is an object so the count carries across one frame's calls.
 */
export function handleEvents(events, ctx) {
  const { state, fx, sfx, banner, modal, recordBest, recordMasks } = ctx;
  const budget = ctx.budget ?? { sound: 4, resist: 1 };

  for (const e of events) {
    switch (e.t) {
      case "hit":
        if (e.resisted && budget.resist-- > 0) {
          fx.floatText(e.x, e.y - 50, "shrugged off", "#c9d6e2", 14);
          fx.burst(e.x, e.y - 24, { n: 4, colors: ["#c9d6e2", "#8fa3b5"], spd: 90, size: 3, life: 0.35 });
        }
        fx.burst(e.x, e.y - 18, {
          n: 3,
          colors: e.dmgType === "burn" ? ["#ff9a3c", "#f2c53d"] : ["#f2789b", "#fdfbf5"],
          spd: 90,
          size: 2.6,
          life: 0.32,
        });
        if (budget.sound-- > 0) sfx.hit(Math.min(1, e.amount / 18));
        break;

      case "shrug":
        fx.floatText(e.x, e.y - 56, "no!", "#ffd9d8", 15);
        fx.burst(e.x, e.y - 20, { n: 4, colors: ["#ffb3e0"], spd: 120, size: 3, life: 0.3 });
        break;

      case "stunned":
        fx.ring(e.x, e.y - 22, 30, "#ffe08a");
        fx.burst(e.x, e.y - 26, {
          n: 5,
          colors: ["#f2c53d", "#fff8e2"],
          spd: 130,
          size: 3.4,
          life: 0.4,
        });
        if (budget.sound-- > 0) sfx.stun();
        break;

      case "slowed":
        fx.burst(e.x, e.y - 10, { n: 3, colors: ["#ffb3e0", "#a06cd5"], spd: 70, size: 3, life: 0.3 });
        break;

      case "deflect": {
        const swung = e.how === "sway";
        fx.ring(e.x, e.y - 20, swung ? 40 : 34, swung ? "#c9f0cf" : "#ffd9d8");
        fx.floatText(
          e.x,
          e.y - 44,
          swung ? "swung clear!" : "olé!",
          swung ? "#c9f0cf" : "#ffd9d8",
          15,
        );
        if (budget.sound-- > 0) sfx.deflect();
        break;
      }

      // The ribbon's jump. Drawn as chips laid along the hop rather than a burst
      // at each end: the player needs to see that the two luchadores were linked,
      // which is the whole reason the tower is worth buying where they bunch.
      case "chain": {
        const steps = 5;
        for (let i = 1; i <= steps; i++) {
          const k = i / (steps + 1);
          fx.burst(e.x + (e.tx - e.x) * k, e.y + (e.ty - e.y) * k, {
            n: 2,
            colors: ["#ff8fd8", "#ffe6f9"],
            spd: 40,
            size: 3,
            grav: 60,
            life: 0.22,
          });
        }
        sfx.coin();
        break;
      }

      // One snip of the papel picado, drawn once for the whole field rather than
      // per victim: the per-enemy `hit` events already carry the chips.
      case "cut":
        fx.ring(e.x, e.y - 20, e.r, "#ffd45e");
        if (budget.sound-- > 0) sfx.hit(0.35);
        break;

      case "burst":
        fx.ring(e.x, e.y, e.r * 1.5, "#ffe08a");
        fx.burst(e.x, e.y, { n: 16, colors: ["#f2c53d", "#ff9a3c", "#fdfbf5"], spd: 260, size: 4.5 });
        fx.shake(5);
        sfx.burst();
        break;

      case "mask":
        fx.burst(e.x, e.y - 26, {
          n: 7,
          colors: [MASK_COLOR[e.type] ?? "#f2c53d", "#fdfbf5"],
          spd: 210,
          size: 5,
          life: 0.75,
          shape: "streamer",
        });
        if (budget.sound-- > 0) sfx.mask();
        break;

      case "defeat":
        fx.burst(e.x, e.y - 16, {
          n: e.boss ? 40 : 10,
          colors: ["#f2789b", "#3fc4c9", "#f2c53d", "#7ec850", "#a06cd5"],
          spd: e.boss ? 400 : 180,
          size: e.boss ? 6 : 3.5,
          life: e.boss ? 1.1 : 0.6,
        });
        fx.shake(e.boss ? 12 : 2);
        if (e.boss) banner("Unmasked!", "El Campeón is down", "boss");
        for (const t of state.towers)
          if (Math.hypot(t.x - e.x, t.y - e.y) < t.def.range + 8) t.defeats += 1;
        break;

      case "tag":
        fx.floatText(e.x, e.y - 60, "TAG IN!", "#ffe08a", 24);
        fx.shake(7);
        sfx.tag();
        break;

      case "collect":
        if (budget.sound-- > 0) sfx.coin();
        break;

      case "leak": {
        const [bx, by] = state.map.base;
        fx.burst(bx, by - 30, { n: 14, colors: ["#f28b3c", "#ffe6cf", "#d95d1b"], spd: 220, size: 4.5 });
        fx.floatText(bx, by - 76, `-${e.amount}`, "#ffb0ae", 22);
        fx.shake(8);
        sfx.leak();
        break;
      }

      case "waveEnd":
        recordMasks();
        banner(
          `Wave ${e.wave} held`,
          `+${Math.round(e.bonus)} candy` +
            (e.income ? ` · ${Math.round(e.income)} income` : "") +
            (e.interest ? ` · ${e.interest} interest` : ""),
        );
        sfx.waveEnd();
        break;

      // The top-tier abilities announce themselves. An upgrade you cannot see
      // fire is an upgrade the player believes did nothing.
      case "execute":
        fx.ring(e.x, e.y, 26, "#fdfbf5");
        fx.burst(e.x, e.y, { n: 7, colors: ["#fdfbf5", "#ffd45e"], spd: 190, size: 3 });
        sfx.execute();
        break;

      case "payday":
        fx.floatText(e.x, e.y - 26, `+${e.amount}`, "#ffd45e", 15);
        sfx.coin();
        break;

      case "quake":
        fx.shake(4);
        fx.ring(e.x, e.y, 64, "#c8fbfd");
        sfx.quake();
        break;

      // A phase change is the fight telling you it has changed. Loud on purpose:
      // this is the moment a build that was working stops working.
      case "phase":
        banner(e.name, e.boss, "boss");
        fx.shake(7);
        fx.ring(e.x, e.y - 30, 70, "#ffd45e");
        fx.burst(e.x, e.y - 30, {
          n: 18,
          colors: ["#ffd45e", "#e8524f", "#fdfbf5"],
          spd: 240,
          size: 4.5,
        });
        sfx.boss();
        break;

      case "boss":
        banner("El Campeón", "Tag team champion of the plaza", "boss");
        fx.shake(6);
        sfx.boss();
        break;

      case "over":
        recordBest();
        recordMasks();
        // "of 15" is wrong once freeplay is running, and freeplay now runs long
        // enough to matter — the saving bot reaches wave 34 on El Mercado.
        modal(
          "The piñata is broken",
          state.freeplay
            ? `They got through on wave ${state.wave} — ${state.wave - WAVES.length} past the ` +
              `campaign. ${state.stats.defeated} masks taken before it fell.`
            : `They got through on wave ${state.wave} of ${WAVES.length}. ` +
              `${state.stats.defeated} masks taken before it fell.`,
        );
        sfx.over();
        break;

      case "won":
        recordBest();
        recordMasks();
        modal(
          "El Coloso is down",
          `Unmasked on ${ctx.difficultyName}, with ${Math.ceil(state.lives)} of ` +
            `${state.maxLives} lives left and ${state.stats.defeated} masks taken.`,
          true,
        );
        sfx.won();
        break;
    }
  }
}

/** Every event kind this module handles. Used to keep its test honest. */
export const HANDLED = [
  "hit", "shrug", "slowed", "deflect", "burst", "mask", "defeat",
  "tag", "collect", "leak", "waveEnd", "boss", "over", "won", "stunned", "chain", "cut", "phase",
  "execute", "quake", "payday",
];
