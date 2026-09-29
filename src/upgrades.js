// Upgrade paths, BTD6 shape: three paths per piñata, four tiers each.
//
// Restriction rule (BTD6's 5-2-0, scaled to four tiers): at most two paths may
// be opened at all, and only one of them may go past tier 2. That is what
// forces a tower to have an identity instead of everything becoming the same
// maxed blob.
//
// A tier's `mod` is applied in order over the base stats. `add` first, then
// `mul`, so a tier can both raise damage and cut cooldown without the order of
// the two mattering.

import { RANGE_MUL } from "./data.js";

export const MAX_TIER = 3;

// Price multiplier on the deep tiers (3 and 4). This is the lever that targets
// *investment depth* specifically: raising enemy health or cutting income hits
// wide and narrow builds alike, but deep-tier pricing only bites a player who
// pours everything into a few carries.
//
// It deliberately starts at tier 3, not 4. A full 15-wave campaign never reaches
// tier 4 at all — a measured tier histogram across a winning `focused` run came
// out 13/4/2/2/0, with its best tower at 3-0-1 — so a tier-4-only multiplier has
// nothing to bite on. Tier 4 is freeplay content.
export const DEEP_TIER_FROM = 2; // zero-based: the third tier

// Scales the additive part of every *top* tier (index 3). Depth has to compete
// with breadth: 2100 candy spent maxing one path buys about ten fresh piñatas
// instead, and ten fresh piñatas win on raw damage. A top tier therefore has to
// be a genuine power spike or nobody should ever buy one — measured, the saving
// bot that does reach tier 4 finished on 3 lives where the greedy one finished
// on 45. This is the knob that makes depth a real choice rather than a trap.
// 3: measured, this is where saving up for a top tier stops being a trap.
// Lives% left, spread / deep / focused, at Plaza difficulty across three boards:
//
//   power   Plaza del Sol      El Mercado        Cementerio
//   1x      32 /  0 / 44       10 /  6 / 68      37 /  0 / 42
//   2x      32 / 24 / 44       10 / 48 / 68      37 /  0 / 42
//   3x      32 / 42 / 44       10 / 58 / 68      37 / 18 / 42
//   4x      32 / 42 / 44       10 / 58 / 68      37 / 38 / 42
//
// `focused` never moves, which is the proof it never reaches a top tier: only a
// bot that *saves* can, and a greedy buyer never accumulates. 3x leaves depth
// viable without ever beating breadth, and keeps Cementerio favouring breadth,
// which suits a board whose whole identity is reach.
// Was 3, to make a tier nobody ever reached feel worth saving for. The
// capstone carries both folded rungs' stats and is now reachable, so the sum
// IS the spike — measured at a 4.7x median jump over the rung below it — and
// tripling that on top produced a 9-15x cliff. Kept as a knob for the sweep.
export const DEEP_POWER = Number(globalThis.PU_DEEP_POWER ?? 1);
export const TOP_TIER_MUL = Number(globalThis.PU_TOP_TIER_MUL ?? 1);
export const MAX_OPEN_PATHS = 2;
export const CROSSPATH_CAP = 2;

/**
 * One tier of one path.
 *
 * `special` is the fifth argument and it is the difference between an upgrade
 * and a bigger number: a NAMED ability the sim branches on. Only tier 4 carries
 * one, so the top of a path is a thing the piñata can now DO rather than a
 * larger figure in the same column.
 */
const T = (name, cost, blurb, mod, special) => ({ name, cost, blurb, mod, special });

/**
 * The three upgrade paths for each piñata.
 *
 * `art` is the path's VISUAL theme, and it is load-bearing rather than
 * decorative: without it every upgrade looked the same on the board, so a fire
 * path and a damage path were distinguishable only by the number in the panel —
 * which is what makes upgrades feel like a spreadsheet. A piñata that has bought
 * "Hotter" is tinted toward flame and wears fire; one that bought "Stickier" is
 * blue and dripping. See THEMES in art.js.
 */
// Three tiers, not four. See tools/fold-tiers.mjs for why: tier 4 was never
// bought in a campaign, so every special ability in the game was freeplay-only
// content. The old third and fourth rungs are merged — the capstone keeps the
// fourth's name, ability and art, and carries both their stats.
export const PATHS = {
  "candy": [
    {
      "name": "Harder candy",
      "art": "sharp",
      "tiers": [
        {
          "name": "Boiled sweets",
          "cost": 140,
          "blurb": "Denser candy hits harder.",
          "mod": {
            "damage": {
              "add": 3
            }
          }
        },
        {
          "name": "Jawbreakers",
          "cost": 320,
          "blurb": "Much heavier shot.",
          "mod": {
            "damage": {
              "add": 6
            }
          }
        },
        {
          "name": "Gobstopper volley",
          "cost": 1935,
          "blurb": "Enormous damage, ignores half of any resistance.",
          "mod": {
            "damage": {
              "add": 37
            },
            "sharpPierce": {
              "add": 0.55
            }
          },
          "special": "execute"
        }
      ]
    },
    {
      "name": "Faster spout",
      "art": "swift",
      "tiers": [
        {
          "name": "Loose wrapper",
          "cost": 120,
          "blurb": "Fires noticeably quicker.",
          "mod": {
            "rate": {
              "mul": 0.82
            }
          }
        },
        {
          "name": "Wide spout",
          "cost": 280,
          "blurb": "Quicker again.",
          "mod": {
            "rate": {
              "mul": 0.78
            }
          }
        },
        {
          "name": "Endless bag",
          "cost": 1745,
          "blurb": "A continuous hail of sweets.",
          "mod": {
            "rate": {
              "mul": 0.432
            },
            "damage": {
              "add": 4
            }
          },
          "special": "volley"
        }
      ]
    },
    {
      "name": "Scattershot",
      "art": "spread",
      "tiers": [
        {
          "name": "Handful",
          "cost": 160,
          "blurb": "Each shot passes through one more.",
          "mod": {
            "pierce": {
              "add": 1
            }
          }
        },
        {
          "name": "Long throw",
          "cost": 340,
          "blurb": "Reaches further down the lane.",
          "mod": {
            "range": {
              "add": 34
            }
          }
        },
        {
          "name": "Whole piñata",
          "cost": 2140,
          "blurb": "Shots pierce a crowd and fly further.",
          "mod": {
            "pierce": {
              "add": 6
            },
            "range": {
              "add": 46
            }
          },
          "special": "pierceAll"
        }
      ]
    }
  ],
  "chili": [
    {
      "name": "Hotter",
      "art": "fire",
      "tiers": [
        {
          "name": "Jalapeño",
          "cost": 180,
          "blurb": "Burn does more each tick.",
          "mod": {
            "burnDps": {
              "add": 6
            }
          }
        },
        {
          "name": "Habanero",
          "cost": 420,
          "blurb": "Considerably hotter.",
          "mod": {
            "burnDps": {
              "add": 13
            }
          }
        },
        {
          "name": "Carolina reaper",
          "cost": 2410,
          "blurb": "Sears anything that steps into range.",
          "mod": {
            "burnDps": {
              "add": 88
            },
            "damage": {
              "add": 20
            }
          },
          "special": "execute"
        }
      ]
    },
    {
      "name": "Lingering",
      "art": "ember",
      "tiers": [
        {
          "name": "Slow burn",
          "cost": 150,
          "blurb": "Burn lasts longer.",
          "mod": {
            "burnSecs": {
              "add": 1.6
            }
          }
        },
        {
          "name": "Deep heat",
          "cost": 360,
          "blurb": "Longer still.",
          "mod": {
            "burnSecs": {
              "add": 2.4
            }
          }
        },
        {
          "name": "Eternal flame",
          "cost": 2145,
          "blurb": "Burns for the rest of the lane, and spreads on contact.",
          "mod": {
            "burnSecs": {
              "add": 13
            },
            "burnSpread": {
              "add": 62
            }
          },
          "special": "wildfire"
        }
      ]
    },
    {
      "name": "Splash of salsa",
      "art": "spread",
      "tiers": [
        {
          "name": "Loose lid",
          "cost": 200,
          "blurb": "Shots splash a little on impact.",
          "mod": {
            "splash": {
              "add": 30
            }
          }
        },
        {
          "name": "Thrown jar",
          "cost": 460,
          "blurb": "Wider splash.",
          "mod": {
            "splash": {
              "add": 22
            },
            "range": {
              "add": 20
            }
          }
        },
        {
          "name": "Molten pool",
          "cost": 2695,
          "blurb": "Leaves a burning pool the whole group has to walk through.",
          "mod": {
            "splash": {
              "add": 82
            },
            "damage": {
              "add": 8
            },
            "burnDps": {
              "add": 20
            }
          },
          "special": "wildfire"
        }
      ]
    }
  ],
  "gum": [
    {
      "name": "Stickier",
      "art": "sticky",
      "tiers": [
        {
          "name": "Chewed longer",
          "cost": 200,
          "blurb": "Slows them harder.",
          "mod": {
            "slow": {
              "mul": 0.86
            }
          }
        },
        {
          "name": "Tar toffee",
          "cost": 460,
          "blurb": "Much harder to walk through.",
          "mod": {
            "slow": {
              "mul": 0.8
            }
          }
        },
        {
          "name": "Set in stone",
          "cost": 2640,
          "blurb": "Almost stops them dead.",
          "mod": {
            "slow": {
              "mul": 0.396
            },
            "slowSecs": {
              "add": 2.4000000000000004
            }
          },
          "special": "freeze"
        }
      ]
    },
    {
      "name": "Bubble trap",
      "art": "bubble",
      "tiers": [
        {
          "name": "Small bubble",
          "cost": 240,
          "blurb": "The gum splatters onto neighbours.",
          "mod": {
            "slowSplash": {
              "add": 46
            }
          }
        },
        {
          "name": "Big bubble",
          "cost": 540,
          "blurb": "A wider splatter.",
          "mod": {
            "slowSplash": {
              "add": 26
            },
            "range": {
              "add": 22
            }
          }
        },
        {
          "name": "Sticky floor",
          "cost": 2955,
          "blurb": "Coats the lane; almost nothing gets past clean.",
          "mod": {
            "slowSplash": {
              "add": 110
            },
            "slowSecs": {
              "add": 3.4
            },
            "pierce": {
              "add": 3
            }
          },
          "special": "freeze"
        }
      ]
    },
    {
      "name": "Sour core",
      "art": "acid",
      "tiers": [
        {
          "name": "Sherbet centre",
          "cost": 210,
          "blurb": "Gum actually hurts now.",
          "mod": {
            "damage": {
              "add": 5
            }
          }
        },
        {
          "name": "Acid drop",
          "cost": 490,
          "blurb": "Considerably more damage.",
          "mod": {
            "damage": {
              "add": 12
            }
          }
        },
        {
          "name": "Toxic chew",
          "cost": 2830,
          "blurb": "Heavy damage on top of the slow.",
          "mod": {
            "damage": {
              "add": 88
            },
            "rate": {
              "mul": 0.615
            }
          },
          "special": "execute"
        }
      ]
    }
  ],
  "maraca": [
    {
      "name": "Louder",
      "art": "sound",
      "tiers": [
        {
          "name": "Full of beans",
          "cost": 230,
          "blurb": "Holds them a little longer.",
          "mod": {
            "stun": {
              "add": 0.18
            }
          }
        },
        {
          "name": "Seed shot",
          "cost": 520,
          "blurb": "A noticeably longer hold.",
          "mod": {
            "stun": {
              "add": 0.3
            }
          }
        },
        {
          "name": "Earthquake",
          "cost": 3010,
          "blurb": "Almost nothing walks through this.",
          "mod": {
            "stun": {
              "add": 1.6
            },
            "damage": {
              "add": 40
            }
          },
          "special": "shockwave"
        }
      ]
    },
    {
      "name": "Whole band",
      "art": "drum",
      "tiers": [
        {
          "name": "Second maraca",
          "cost": 250,
          "blurb": "The rattle catches neighbours too.",
          "mod": {
            "stunSplash": {
              "add": 52
            }
          }
        },
        {
          "name": "Güiro",
          "cost": 570,
          "blurb": "A wider rattle.",
          "mod": {
            "stunSplash": {
              "add": 30
            },
            "range": {
              "add": 24
            }
          }
        },
        {
          "name": "Carnival drums",
          "cost": 3165,
          "blurb": "The entire stretch of lane freezes.",
          "mod": {
            "stunSplash": {
              "add": 124
            },
            "pierce": {
              "add": 2
            },
            "stun": {
              "add": 0.35
            }
          },
          "special": "shockwave"
        }
      ]
    },
    {
      "name": "Quicker hands",
      "art": "swift",
      "tiers": [
        {
          "name": "Loose grip",
          "cost": 200,
          "blurb": "Rattles more often.",
          "mod": {
            "rate": {
              "mul": 0.84
            }
          }
        },
        {
          "name": "Practised",
          "cost": 470,
          "blurb": "Faster again.",
          "mod": {
            "rate": {
              "mul": 0.8
            }
          }
        },
        {
          "name": "Never stops",
          "cost": 2745,
          "blurb": "There is barely a gap between holds.",
          "mod": {
            "rate": {
              "mul": 0.432
            },
            "damage": {
              "add": 30
            }
          },
          "special": "volley"
        }
      ]
    }
  ],
  "papel": [
    {
      "name": "Finer cuts",
      "art": "sharp",
      "tiers": [
        {
          "name": "Crisper paper",
          "cost": 210,
          "blurb": "A sharper edge.",
          "mod": {
            "damage": {
              "add": 2
            }
          }
        },
        {
          "name": "Layered",
          "cost": 480,
          "blurb": "Several sheets at once.",
          "mod": {
            "damage": {
              "add": 4
            }
          }
        },
        {
          "name": "Guillotine",
          "cost": 2745,
          "blurb": "Nothing walks under this twice.",
          "mod": {
            "damage": {
              "add": 29
            },
            "sharpPierce": {
              "add": 0.45
            }
          },
          "special": "pierceAll"
        }
      ]
    },
    {
      "name": "More paper",
      "art": "reach",
      "tiers": [
        {
          "name": "Longer strings",
          "cost": 230,
          "blurb": "Strung wider.",
          "mod": {
            "range": {
              "add": 14
            }
          }
        },
        {
          "name": "Across the plaza",
          "cost": 520,
          "blurb": "Wider again.",
          "mod": {
            "range": {
              "add": 18
            }
          }
        },
        {
          "name": "Roofed over",
          "cost": 2900,
          "blurb": "The lane below is simply covered.",
          "mod": {
            "range": {
              "add": 56
            },
            "damage": {
              "add": 4
            }
          },
          "special": "pierceAll"
        }
      ]
    },
    {
      "name": "Tangled",
      "art": "sticky",
      "tiers": [
        {
          "name": "Loose ends",
          "cost": 250,
          "blurb": "Paper catches on them.",
          "mod": {
            "slow": {
              "mul": 0.88
            }
          }
        },
        {
          "name": "Streamers",
          "cost": 560,
          "blurb": "Harder to push through.",
          "mod": {
            "slow": {
              "mul": 0.82
            }
          }
        },
        {
          "name": "Cocoon",
          "cost": 3005,
          "blurb": "Almost pinned in place under the paper.",
          "mod": {
            "slow": {
              "mul": 0.4712
            },
            "slowSecs": {
              "add": 1.5
            }
          },
          "special": "freeze"
        }
      ]
    }
  ],
  "firecracker": [
    {
      "name": "Bigger bang",
      "art": "blast",
      "tiers": [
        {
          "name": "Double charge",
          "cost": 260,
          "blurb": "More damage per burst.",
          "mod": {
            "damage": {
              "add": 12
            }
          }
        },
        {
          "name": "Packed powder",
          "cost": 620,
          "blurb": "Considerably more.",
          "mod": {
            "damage": {
              "add": 26
            }
          }
        },
        {
          "name": "Castillo",
          "cost": 3590,
          "blurb": "A tower-sized detonation.",
          "mod": {
            "damage": {
              "add": 198
            },
            "splash": {
              "add": 20
            }
          },
          "special": "volley"
        }
      ]
    },
    {
      "name": "Wider blast",
      "art": "spread",
      "tiers": [
        {
          "name": "Loose packing",
          "cost": 240,
          "blurb": "Blast reaches further.",
          "mod": {
            "splash": {
              "add": 22
            }
          }
        },
        {
          "name": "Shrapnel",
          "cost": 560,
          "blurb": "Wider blast again.",
          "mod": {
            "splash": {
              "add": 28
            }
          }
        },
        {
          "name": "Whole crate",
          "cost": 3380,
          "blurb": "Clears an entire stretch of lane at once.",
          "mod": {
            "splash": {
              "add": 114
            },
            "range": {
              "add": 74
            }
          },
          "special": "shockwave"
        }
      ]
    },
    {
      "name": "Short fuse",
      "art": "swift",
      "tiers": [
        {
          "name": "Trimmed fuse",
          "cost": 220,
          "blurb": "Fires faster.",
          "mod": {
            "rate": {
              "mul": 0.84
            }
          }
        },
        {
          "name": "Quick match",
          "cost": 520,
          "blurb": "Faster again.",
          "mod": {
            "rate": {
              "mul": 0.79
            }
          }
        },
        {
          "name": "Machine gun cohete",
          "cost": 3170,
          "blurb": "Continuous bombardment.",
          "mod": {
            "rate": {
              "mul": 0.385
            },
            "speed": {
              "mul": 1.89
            }
          },
          "special": "volley"
        }
      ]
    }
  ],
  "ribbon": [
    {
      "name": "Longer ribbon",
      "art": "chain",
      "tiers": [
        {
          "name": "Second streamer",
          "cost": 260,
          "blurb": "One more luchador per throw.",
          "mod": {
            "chain": {
              "add": 1
            }
          }
        },
        {
          "name": "Silk train",
          "cost": 600,
          "blurb": "Another, and it reaches further.",
          "mod": {
            "chain": {
              "add": 1
            },
            "chainRange": {
              "add": 14
            }
          }
        },
        {
          "name": "Carnival spiral",
          "cost": 3320,
          "blurb": "It barely stops before the lane is empty.",
          "mod": {
            "chain": {
              "add": 3
            },
            "chainRange": {
              "add": 32
            },
            "damage": {
              "add": 6
            }
          },
          "special": "pierceAll"
        }
      ]
    },
    {
      "name": "Sharper silk",
      "art": "sharp",
      "tiers": [
        {
          "name": "Starched",
          "cost": 240,
          "blurb": "Stiffer ribbon bites harder.",
          "mod": {
            "damage": {
              "add": 4
            }
          }
        },
        {
          "name": "Wire core",
          "cost": 540,
          "blurb": "There is a wire in there now.",
          "mod": {
            "damage": {
              "add": 8
            }
          }
        },
        {
          "name": "Cut of the bull",
          "cost": 3060,
          "blurb": "One pass takes the wave apart.",
          "mod": {
            "damage": {
              "add": 49
            },
            "sharpPierce": {
              "add": 0.5
            }
          },
          "special": "execute"
        }
      ]
    },
    {
      "name": "Faster feet",
      "art": "swift",
      "tiers": [
        {
          "name": "Light on her feet",
          "cost": 220,
          "blurb": "Throws more often.",
          "mod": {
            "rate": {
              "mul": 0.86
            }
          }
        },
        {
          "name": "Spin",
          "cost": 500,
          "blurb": "Faster again.",
          "mod": {
            "rate": {
              "mul": 0.82
            }
          }
        },
        {
          "name": "Never stops turning",
          "cost": 2850,
          "blurb": "A constant streamer.",
          "mod": {
            "rate": {
              "mul": 0.444
            },
            "chainFalloff": {
              "add": 0.14
            },
            "damage": {
              "add": 16
            }
          },
          "special": "volley"
        }
      ]
    }
  ],
  "mariachi": [
    {
      "name": "Faster tempo",
      "art": "music",
      "tiers": [
        {
          "name": "Quick step",
          "cost": 260,
          "blurb": "Neighbours swing faster still.",
          "mod": {
            "auraRate": {
              "add": 0.05
            }
          }
        },
        {
          "name": "Son jarocho",
          "cost": 600,
          "blurb": "A brisker tune.",
          "mod": {
            "auraRate": {
              "add": 0.06
            }
          }
        },
        {
          "name": "Never a rest",
          "cost": 3270,
          "blurb": "The whole corner plays double time.",
          "mod": {
            "auraRate": {
              "add": 0.2
            },
            "auraRange": {
              "add": 20
            }
          },
          "special": "encore"
        }
      ]
    },
    {
      "name": "Brass section",
      "art": "brass",
      "tiers": [
        {
          "name": "Trumpet",
          "cost": 280,
          "blurb": "Neighbours hit harder as well.",
          "mod": {
            "auraDamage": {
              "add": 0.1
            }
          }
        },
        {
          "name": "Second trumpet",
          "cost": 640,
          "blurb": "Harder again.",
          "mod": {
            "auraDamage": {
              "add": 0.12
            }
          }
        },
        {
          "name": "Grito",
          "cost": 3480,
          "blurb": "Everything in earshot hits like a tier above.",
          "mod": {
            "auraDamage": {
              "add": 0.48
            },
            "auraRange": {
              "add": 18
            }
          },
          "special": "encore"
        }
      ]
    },
    {
      "name": "Marching band",
      "art": "reach",
      "tiers": [
        {
          "name": "Step out",
          "cost": 240,
          "blurb": "Heard further away.",
          "mod": {
            "auraRange": {
              "add": 40
            }
          }
        },
        {
          "name": "Round the plaza",
          "cost": 540,
          "blurb": "Further again.",
          "mod": {
            "auraRange": {
              "add": 50
            }
          }
        },
        {
          "name": "Whole town out",
          "cost": 3060,
          "blurb": "There is nowhere in the plaza it does not reach.",
          "mod": {
            "auraRange": {
              "add": 180
            },
            "auraRate": {
              "add": 0.04
            }
          },
          "special": "encore"
        }
      ]
    }
  ],
  "sparkler": [
    {
      "name": "Brighter",
      "art": "light",
      "tiers": [
        {
          "name": "Long burn",
          "cost": 320,
          "blurb": "A heavier hit.",
          "mod": {
            "damage": {
              "add": 40
            }
          }
        },
        {
          "name": "Magnesium",
          "cost": 760,
          "blurb": "Considerably heavier.",
          "mod": {
            "damage": {
              "add": 95
            }
          }
        },
        {
          "name": "Roman candle",
          "cost": 4110,
          "blurb": "One shot, one mask.",
          "mod": {
            "damage": {
              "add": 840
            },
            "sharpPierce": {
              "add": 0.4
            }
          },
          "special": "execute"
        }
      ]
    },
    {
      "name": "Further",
      "art": "reach",
      "tiers": [
        {
          "name": "Raised stand",
          "cost": 280,
          "blurb": "Sees further down the lane.",
          "mod": {
            "range": {
              "add": 60
            }
          }
        },
        {
          "name": "Watchtower",
          "cost": 640,
          "blurb": "Further still.",
          "mod": {
            "range": {
              "add": 80
            }
          }
        },
        {
          "name": "Every corner",
          "cost": 3480,
          "blurb": "Range stops being a consideration.",
          "mod": {
            "range": {
              "add": 540
            },
            "damage": {
              "add": 130
            }
          },
          "special": "volley"
        }
      ]
    },
    {
      "name": "Faster fuse",
      "art": "swift",
      "tiers": [
        {
          "name": "Dry powder",
          "cost": 300,
          "blurb": "Reloads quicker.",
          "mod": {
            "rate": {
              "mul": 0.85
            }
          }
        },
        {
          "name": "Twin sticks",
          "cost": 700,
          "blurb": "Quicker again.",
          "mod": {
            "rate": {
              "mul": 0.8
            }
          }
        },
        {
          "name": "Fountain",
          "cost": 3795,
          "blurb": "Fires almost continuously.",
          "mod": {
            "rate": {
              "mul": 0.41759999999999997
            },
            "pierce": {
              "add": 3
            }
          },
          "special": "volley"
        }
      ]
    }
  ],
  "coin": [
    {
      "name": "Richer",
      "art": "gold",
      "tiers": [
        {
          "name": "Fuller purse",
          "cost": 260,
          "blurb": "Pays more each wave.",
          "mod": {
            "income": {
              "add": 90
            }
          }
        },
        {
          "name": "Silver",
          "cost": 600,
          "blurb": "Pays considerably more.",
          "mod": {
            "income": {
              "add": 190
            }
          }
        },
        {
          "name": "Treasury",
          "cost": 3430,
          "blurb": "Pays for a tower every wave on its own.",
          "mod": {
            "income": {
              "add": 1420
            }
          },
          "special": "payday"
        }
      ]
    },
    {
      "name": "Compounding",
      "art": "vault",
      "tiers": [
        {
          "name": "Piggy bank",
          "cost": 300,
          "blurb": "Also pays 2% of the candy you are holding.",
          "mod": {
            "interest": {
              "add": 0.02
            }
          }
        },
        {
          "name": "Savings jar",
          "cost": 700,
          "blurb": "4% of the bank, each wave.",
          "mod": {
            "interest": {
              "add": 0.02
            }
          }
        },
        {
          "name": "Cartel accountant",
          "cost": 3910,
          "blurb": "12% of the bank, each wave.",
          "mod": {
            "interest": {
              "add": 0.08
            }
          },
          "special": "payday"
        }
      ]
    },
    {
      "name": "Sugar rush",
      "art": "music",
      "tiers": [
        {
          "name": "Sweet air",
          "cost": 280,
          "blurb": "Nearby piñatas fire 8% faster.",
          "mod": {
            "auraRate": {
              "add": 0.08
            },
            "auraRange": {
              "add": 118
            }
          }
        },
        {
          "name": "Sugar high",
          "cost": 640,
          "blurb": "16% faster, wider reach.",
          "mod": {
            "auraRate": {
              "add": 0.08
            },
            "auraRange": {
              "add": 30
            }
          }
        },
        {
          "name": "Carnival",
          "cost": 3750,
          "blurb": "40% faster and 40% harder for everything near it.",
          "mod": {
            "auraRate": {
              "add": 0.24000000000000002
            },
            "auraDamage": {
              "add": 0.4
            },
            "auraRange": {
              "add": 70
            }
          },
          "special": "encore"
        }
      ]
    }
  ]
};

/** Is buying the next tier on `path` allowed under the restriction rule? */
export function canBuy(tiers, path) {
  const next = tiers[path] + 1;
  if (next > MAX_TIER) return false;
  const open = tiers.filter((t) => t > 0).length;
  if (tiers[path] === 0 && open >= MAX_OPEN_PATHS) return false;
  if (next > CROSSPATH_CAP && tiers.some((t, i) => i !== path && t > CROSSPATH_CAP)) return false;
  return true;
}

/**
 * Why a purchase is refused, as a code plus both the phrasings the UI needs.
 *
 * Split out of `blockedReason` because the panel needs three things that must
 * never disagree: a badge short enough to sit in a row, a sentence to say out
 * loud when the click is refused, and a way to tell "you may not" apart from
 * "there is nothing left to buy". Those used to be one string and the panel
 * drew a padlock on a *fully upgraded* path, which reads as a rule you broke.
 */
export const BLOCKS = {
  MAXED: { code: "MAXED", short: "MAX", why: "Fully upgraded" },
  PATHS: { code: "PATHS", short: "2 paths max", why: "Only two paths per piñata" },
  CROSS: {
    code: "CROSS",
    short: `1 path past T${CROSSPATH_CAP}`,
    why: `Only one path may pass tier ${CROSSPATH_CAP}`,
  },
};

/** Which rule stops this purchase, or null when it is allowed. */
export function blockedBy(tiers, path) {
  if (tiers[path] >= MAX_TIER) return BLOCKS.MAXED;
  const open = tiers.filter((t) => t > 0).length;
  if (tiers[path] === 0 && open >= MAX_OPEN_PATHS) return BLOCKS.PATHS;
  if (tiers[path] + 1 > CROSSPATH_CAP && tiers.some((t, i) => i !== path && t > CROSSPATH_CAP))
    return BLOCKS.CROSS;
  return null;
}

/** Why a purchase is blocked, as a sentence. Null when it is allowed. */
export function blockedReason(tiers, path) {
  return blockedBy(tiers, path)?.why ?? null;
}

export function tierCost(type, path, tier) {
  const base = PATHS[type][path].tiers[tier].cost;
  return Math.round(tier >= DEEP_TIER_FROM ? base * TOP_TIER_MUL : base);
}

/** Apply every purchased tier over the base stats, in path then tier order. */
export function computeStats(type, base, tiers) {
  const s = {
    ...base,
    burnDps: base.burn?.dps ?? 0,
    burnSecs: base.burn?.secs ?? 0,
    splash: base.splash ?? 0,
    income: base.income ?? 0,
    // Read from the base, not zeroed. These began as upgrade-only fields — only
    // the coin's Sugar rush path used them — so they were initialised to 0 after
    // the base was spread in, which silently deleted any tower that came with one
    // of its own. The mariachi trio's whole mechanic vanished this way.
    interest: base.interest ?? 0,
    auraRate: base.auraRate ?? 0,
    auraDamage: base.auraDamage ?? 0,
    auraRange: base.auraRange ?? 0,
    sharpPierce: base.sharpPierce ?? 0,
    burnSpread: base.burnSpread ?? 0,
    slow: base.slow ?? 0,
    slowSecs: base.slowSecs ?? 0,
    slowSplash: base.slowSplash ?? 0,
    stun: base.stun ?? 0,
    stunSplash: base.stunSplash ?? 0,
  };
  const adds = [];
  const muls = [];
  // What the piñata can DO, and what it throws. Both come from the deepest path
  // you have bought, because a piñata with one identity reads and a piñata with
  // three does not.
  s.special = [];
  let leadTier = 0;
  PATHS[type].forEach((p, pi) => {
    if (tiers[pi] >= 2 && tiers[pi] > leadTier) {
      leadTier = tiers[pi];
      s.shotArt = p.art;
    }
    for (let t = 0; t < tiers[pi]; t++) {
      if (p.tiers[t].special) s.special.push(p.tiers[t].special);
      const mod = p.tiers[t].mod;
      const top = t === MAX_TIER - 1;
      for (const [key, delta] of Object.entries(mod)) {
        if (delta.add !== undefined) adds.push([key, delta.add * (top ? DEEP_POWER : 1)]);
        if (delta.mul !== undefined) muls.push([key, delta.mul]);
      }
    }
  });
  for (const [k, v] of adds) s[k] = (s[k] ?? 0) + v;
  for (const [k, v] of muls) s[k] = (s[k] ?? 0) * v;
  if (s.burnDps > 0) s.burn = { dps: s.burnDps, secs: s.burnSecs };
  s.range *= RANGE_MUL;
  s.auraRange *= RANGE_MUL;
  return s;
}

/**
 * A tier's effect as short chips: "+6 dmg", "-16% cool", "+2 chain".
 *
 * Read straight off the same `mod` the sim applies, so the panel cannot promise
 * something the tower does not do — the alternative is a hand-written sentence
 * per tier, which is 36 sentences that go stale silently. Words are the thing
 * being removed here: a player reading an upgrade wants the number.
 */
// [label, scale, invert]. `invert` is for the values where DOWN is better: a
// multiplier of 0.72 on `slow` means they walk 28% slower, and "-28% slow" reads
// as a nerf to anyone who has not read the source.
const CHIP = {
  damage: ["dmg", 1],
  range: ["range", 1],
  rate: ["cool", 1],
  pierce: ["pierce", 1],
  splash: ["splash", 1],
  chain: ["chain", 1],
  chainRange: ["reach", 1],
  chainFalloff: ["keep", 100],
  slow: ["slow", 100, true],
  slowSecs: ["slow s", 1],
  slowSplash: ["glue", 1],
  stun: ["stun s", 1],
  stunSplash: ["shock", 1],
  burnDps: ["burn", 1],
  burnSecs: ["burn s", 1],
  burnSpread: ["spread", 1],
  sharpPierce: ["pierce", 100],
  income: ["/wave", 1],
  interest: ["interest", 100],
  auraRate: ["near rate", 100],
  auraDamage: ["near dmg", 100],
  auraRange: ["earshot", 1],
};

/**
 * What each named ability is, in as few words as a row can hold.
 *
 * The panel showed "+26 dmg" for an upgrade that also finishes anything under a
 * tenth of its health, so the interesting half of the purchase was invisible and
 * every top tier read as a number. The ability gets its own chip, first.
 */
export const ABILITY = {
  execute: "finishes the weak",
  pierceAll: "never stops",
  volley: "throws two",
  wildfire: "fire spreads",
  shockwave: "shakes the ground",
  freeze: "holds them still",
  payday: "a cut of every kill",
  encore: "buffs everyone",
};

export function describeMod(mod, { top = false, special = null } = {}) {
  const out = [];
  if (special && ABILITY[special]) out.push(ABILITY[special]);
  for (const [key, delta] of Object.entries(mod)) {
    const [label, scale, invert] = CHIP[key] ?? [key, 1];
    if (delta.add !== undefined) {
      // Percent-scaled values are fractions of a whole, so cap the display at
      // 100: DEEP_POWER triples a top tier's additive part and "+105% pierce"
      // is a promise the sim cannot keep.
      let v = delta.add * (top ? DEEP_POWER : 1) * scale;
      if (scale === 100) v = Math.min(100, v);
      out.push(`${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}${scale === 100 ? "%" : ""} ${label}`);
    }
    if (delta.mul !== undefined) {
      const pct = Math.round((1 - delta.mul) * 100);
      const gain = invert ? pct : -pct;
      out.push(`${gain >= 0 ? "+" : "-"}${Math.abs(pct)}% ${label}`);
    }
  }
  return out;
}

export const totalTiers = (tiers) => tiers.reduce((a, b) => a + b, 0);

/** Sell value: base cost plus everything spent on upgrades, at 70%. */
export function sellValue(type, base, tiers) {
  // Returns 0 rather than throwing for anything with no upgrade paths — heroes,
  // chiefly. `sim.sellTower` refuses heroes outright and that is the real rule,
  // but the UI also reads this to LABEL the sell button, a frame before any
  // click. A label path that throws takes the frame loop down, which is exactly
  // how "clicking your own hero froze the game" happened here. Two independent
  // guards, because this crash class keeps reappearing somewhere new.
  const paths = PATHS[type];
  if (!paths) return 0;
  let spent = base.cost;
  paths.forEach((p, pi) => {
    for (let t = 0; t < tiers[pi]; t++) spent += tierCost(type, pi, t);
  });
  return Math.floor(spent * 0.7);
}
