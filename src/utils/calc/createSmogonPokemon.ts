import { type MoveName, type Specie, Pokemon as SmogonPokemon } from '@smogon/calc';
import { PokemonToggleAbilities } from '@showdex/consts/dex';
import { type CalcdexBattleField, type CalcdexPokemon } from '@showdex/redux/store';
import { formatId, nonEmptyObject } from '@showdex/utils/core';
import { logger } from '@showdex/utils/debug';
import {
  detectGenFromFormat,
  detectLegacyGen,
  getGenDexForFormat,
  notFullyEvolved,
} from '@showdex/utils/dex';
import { calcPokemonHpPercentage } from './calcPokemonHp';

export type SmogonPokemonOptions = ConstructorParameters<typeof SmogonPokemon>[2];
export type SmogonPokemonOverrides = SmogonPokemonOptions['overrides'];

const l = logger('@showdex/utils/calc/createSmogonPokemon()');

/**
 * Factory that essentially converts a `CalcdexPokemon` into an instantiated `Pokemon` class from `@smogon/calc`.
 *
 * * This is basically the thing that "plugs-in" all the parameters for a Pokemon in the damage calculator.
 * * Includes special handling for situations such as legacy gens, mega items, and type changes.
 *
 * @since 0.1.0
 */
export const createSmogonPokemon = (
  format: string,
  pokemon: CalcdexPokemon,
  moveName?: MoveName,
  opponentPokemon?: CalcdexPokemon,
  field?: CalcdexBattleField,
): SmogonPokemon => {
  const dex = getGenDexForFormat(format);
  const gen = detectGenFromFormat(format);

  if (!dex || gen < 1 || !pokemon?.calcdexId || !pokemon.speciesForme) {
    return null;
  }

  const legacy = detectLegacyGen(gen);
  const defaultIv = legacy ? 30 : 31;
  const defaultEv = legacy ? 252 : 0;

  // nullish-coalescing (`??`) here since `item` can be cleared by the user (dirtyItem) in PokeInfo
  // (note: when cleared, `dirtyItem` will be set to null, which will default to `item`)
  const item = (gen > 1 && (pokemon.dirtyItem ?? pokemon.item)) || null;

  // shouldn't happen, but just in case, ja feel
  if (!pokemon.speciesForme) {
    if (__DEV__) {
      l.warn(
        'Failed to detect speciesForme from Pokemon', pokemon.ident,
        '\n', 'speciesForme', pokemon.speciesForme,
        '\n', 'gen', gen,
        '\n', 'pokemon', pokemon,
        '\n', '(You will only see this warning on development.)',
      );
    }

    return null;
  }

  // const hasMegaItem = !!item
  //   && /(?:ite|z$)/.test(formatId(item))
  //   && formatId(item) !== 'eviolite'; // oh god

  // if applicable, convert the '???' status into an empty string
  // (don't apply the status if the Pokemon is fainted tho)
  const status = pokemon.dirtyStatus && pokemon.dirtyStatus !== '???'
    ? pokemon.dirtyStatus === 'ok'
      ? null
      : pokemon.dirtyStatus
    : pokemon.status === '???'
      ? null
      : pokemon.status;

  const ability = (!legacy && (pokemon.dirtyAbility ?? pokemon.ability)) || null;
  const abilityId = formatId(ability);

  const doubles = field?.gameType === 'Doubles';

  // note: these are in the PokemonToggleAbilities list, but isn't technically toggleable, per se.
  // but we're allowing the effects of these abilities to be toggled on/off
  // update (2023/01/31): Ruin abilities aren't designed to be toggleable in Singles, only Doubles.
  const pseudoToggleAbility = !!abilityId
    && PokemonToggleAbilities
      .map((a) => (formatId(a).endsWith('ofruin') && !doubles ? null : formatId(a)))
      .filter(Boolean)
      .includes(abilityId);

  const pseudoToggled = pseudoToggleAbility
    && pokemon.abilityToggleable // update (2023/01/31): don't think we really need to populate this lol
    && pokemon.abilityToggled;

  const options: SmogonPokemonOptions = {
    // note: curHP and originalCurHP in the SmogonPokemon's constructor both set the originalCurHP
    // of the class instance with curHP's value taking precedence over originalCurHP's value
    // (in other words, seems safe to specify either one, but if none, defaults to rawStats.hp)
    // ---
    // also note: seems that maxhp is internally calculated in the instance's rawStats.hp,
    // so we can't specify it here
    curHP: (() => { // js wizardry
      const shouldMultiscale = pseudoToggled
        && ['multiscale', 'shadowshield'].includes(abilityId);

      // note that spreadStats may not be available yet, hence the fallback object
      const { hp: maxHp } = pokemon.spreadStats
        || { hp: pokemon.maxhp || 100 };

      if (pokemon.serverSourced) {
        return shouldMultiscale && !pokemon.hp ? maxHp : pokemon.hp;
      }

      const hpPercentage = calcPokemonHpPercentage(pokemon);

      // if the Pokemon is dead, assume it has full HP as to not break the damage calc
      // return Math.floor((shouldMultiscale ? 0.99 : hpPercentage || 1) * hpStat);
      return Math.floor((shouldMultiscale && !pokemon.hp ? 1 : hpPercentage || 1) * maxHp);
    })(),

    level: pokemon.level,
    gender: pokemon.gender,

    teraType: (pokemon.terastallized && pokemon.teraType) || null,
    status,
    toxicCounter: pokemon.toxicCounter,

    // if the move has been manually overridden, don't specify this property
    // (e.g., don't apply Supreme Overlord boosts when user overrides a move's base power)
    alliesFainted: (
      (!moveName || !nonEmptyObject(pokemon.moveOverrides?.[moveName]))
        && (pokemon.dirtyFaintCounter ?? (pokemon.faintCounter || 0))
    ),

    // appears that the SmogonPokemon will automatically double both the HP and max HP if this is true,
    // which I'd imagine affects the damage calculations in the matchup
    isDynamaxed: pokemon.useMax,
    isSaltCure: 'saltcure' in pokemon.volatiles,

    // cheeky way to allow the user to "turn off" Multiscale w/o editing the HP value
    ability: pseudoToggleAbility && !pseudoToggled ? 'Pressure' : ability,
    abilityOn: pseudoToggled,
    item,
    nature: legacy ? null : pokemon.nature,
    moves: pokemon.moves,

    ivs: {
      hp: pokemon.ivs?.hp ?? defaultIv,
      atk: pokemon.ivs?.atk ?? defaultIv,
      def: pokemon.ivs?.def ?? defaultIv,
      spa: pokemon.ivs?.spa ?? defaultIv,
      spd: pokemon.ivs?.spd ?? defaultIv,
      spe: pokemon.ivs?.spe ?? defaultIv,
    },

    evs: {
      hp: pokemon.evs?.hp ?? defaultEv,
      atk: pokemon.evs?.atk ?? defaultEv,
      def: pokemon.evs?.def ?? defaultEv,
      spa: pokemon.evs?.spa ?? defaultEv,
      spd: pokemon.evs?.spd ?? defaultEv,
      spe: pokemon.evs?.spe ?? defaultEv,
    },

    // update (2023/05/15): typically only used to provide the client-reported stat
    // from Protosynthesis & Quark Drive (populated in syncPokemon() via `volatiles`)
    boostedStat: pokemon.boostedStat,

    boosts: {
      atk: pokemon.dirtyBoosts?.atk ?? pokemon.boosts?.atk ?? 0,
      def: pokemon.dirtyBoosts?.def ?? pokemon.boosts?.def ?? 0,
      spa: pokemon.dirtyBoosts?.spa ?? pokemon.boosts?.spa ?? 0,
      spd: pokemon.dirtyBoosts?.spd ?? pokemon.boosts?.spd ?? 0,
      spe: pokemon.dirtyBoosts?.spe ?? pokemon.boosts?.spe ?? 0,
    },

    overrides: {
      // update (2022/11/06): now allowing base stat editing as a setting
      baseStats: {
        ...(pokemon.baseStats as Required<Showdown.StatsTable>),

        // only spread non-negative numerical values
        ...Object.entries(pokemon.dirtyBaseStats || {}).reduce((prev, [stat, value]) => {
          if (typeof value !== 'number' || value < 0) {
            return prev;
          }

          prev[stat] = value;

          return prev;
        }, {}),
      },

      // note: there's a cool utility called expand() that merges two objects together,
      // which also merges array values, keeping the array length of the source object.
      // for instance, Greninja, who has the types ['Water', 'Dark'] and the Protean ability
      // can 'typechange' into ['Poison'], but passing in only ['Poison'] here causes expand()
      // to merge ['Water', 'Dark'] and ['Poison'] into ['Poison', 'Dark'] ... oh noo :o
      types: [
        ...(pokemon.dirtyTypes?.length ? pokemon.dirtyTypes : pokemon.types),
        null,
        null, // update (2022/11/02): hmm... don't think @smogon/calc supports 3 types lol
      ].slice(0, 2) as SmogonPokemonOverrides['types'],
    },
  };

  // in legacy gens, make sure that the SPD DVs match the SPA DVs
  // (even though gen 1 doesn't have SPD [or even SPA, technically], doesn't hurt to set it anyways)
  if (legacy) {
    options.ivs.spd = options.ivs.spa;
  }

  // in gen 1, we must set any SPA boosts to SPD as well
  // (in gen 2, they're separate boosts)
  if (gen === 1) {
    options.evs.spd = options.evs.spa;
    options.boosts.spd = options.boosts.spa;

    if (options.overrides.baseStats.spd !== options.overrides.baseStats.spa) {
      (options.overrides as DeepWritable<SmogonPokemonOverrides>).baseStats.spd = options.overrides.baseStats.spa;
    }
  }

  // typically (in gen 9), the Booster Energy will be consumed in battle, so there'll be no item.
  // unfortunately, we must forcibly set the item to Booster Energy to "activate" these abilities
  // update (2023/01/02): added a @smogon/calc patch for these abilities to ignore item/field checks if abilityOn is true
  // if (pseudoToggled && ['protosynthesis', 'quarkdrive'].includes(abilityId) && options.item !== 'Booster Energy') {
  //   const {
  //     weather,
  //     terrain,
  //   } = field || {};
  //
  //   // update (2022/12/11): no need to forcibly set the item if the field conditions activate the abilities
  //   const fieldActivated = (abilityId === 'protosynthesis' && ['Sun', 'Harsh Sunshine'].includes(weather))
  //     || (abilityId === 'quarkdrive' && terrain === 'Electric');
  //
  //   if (!fieldActivated) {
  //     options.item = <ItemName> 'Booster Energy';
  //   }
  // }

  // also in gen 9, Supreme Overlord! (tf who named these lol)
  // (workaround cause @smogon/calc doesn't support this ability yet)
  // update: whoops nvm, looks like Showdown applies it to the move's BP instead
  // if (abilityId === 'supremeoverlord' && field?.attackerSide) {
  //   const fieldKey: keyof CalcdexBattleField = pokemon.playerKey === 'p2' ? 'defenderSide' : 'attackerSide';
  //   const { faintedCount = 0 } = field[fieldKey] || {};
  //
  //   // Supreme Overlord boosts the ATK & SPA by 10% for each fainted teammate
  //   if (faintedCount > 0) {
  //     const { atk, spa } = options.overrides.baseStats;
  //     const modifier = 1 + (0.1 * faintedCount);
  //
  //     /** @todo my lazy ass should just fix the typing at this point lol */
  //     (<DeepWritable<SmogonPokemonOverrides>> options.overrides).baseStats.atk = Math.floor(atk * modifier);
  //     (<DeepWritable<SmogonPokemonOverrides>> options.overrides).baseStats.spa = Math.floor(spa * modifier);
  //   }
  // }

  // calc will apply STAB boosts for ALL moves regardless of the Pokemon's changed type and the move's type
  // if the Pokemon has Protean or Libero; we don't want this to happen since the client reports the changed typings
  // update (2023/05/17): it appears people want this back, so allowing it unless the 'typechange' volatile exists
  // (note: there's no volatile for when the Pokemon Terastallizes, so we're good on that front; @smogon/calc will
  // also ignore Protean STAB once Terastallized, so we're actually doubly good)
  // update (2023/06/02): imagine working on this for 2 weeks. naw I finally have some time at 4 AM to do this lol
  if (['protean', 'libero'].includes(abilityId) && !pokemon.abilityToggled) {
    options.ability = 'Pressure';
  }

  // calc will auto +1 ATK/SPA, which the client will have already reported the boosts,
  // so we won't report these abilities to the calc to avoid unintentional double boostage
  if (['intrepidsword', 'download'].includes(abilityId)) {
    options.ability = 'Pressure';
  }

  // for Ruin abilities (gen 9), if BOTH Pokemon have the same type of Ruin ability, they'll cancel each other out
  // (@smogon/calc does not implement this mechanic yet, applying stat drops to BOTH Pokemon)
  if (!legacy && abilityId?.endsWith('ofruin') && opponentPokemon?.speciesForme) {
    const opponentAbilityId = formatId(opponentPokemon.dirtyAbility || opponentPokemon.ability);

    if (opponentAbilityId?.endsWith('ofruin') && opponentAbilityId === abilityId) {
      options.ability = 'Pressure';
    }
  }

  // need to update the base HP stat for transformed Pokemon
  // (otherwise, damage calculations may be incorrect!)
  if (pokemon.transformedForme) {
    const {
      baseStats,
      transformedBaseStats,
    } = pokemon;

    (options.overrides as DeepWritable<SmogonPokemonOverrides>).baseStats = {
      ...(transformedBaseStats as Required<Omit<Showdown.StatsTable, 'hp'>>),
      hp: baseStats.hp,
    };
  }

  // update (2023/07/27): TIL @smogon/calc doesn't implement 'Power Trick' at all LOL
  // (I'm assuming most people were probably manually switching ATK/DEF in the calc to workaround this)
  if (nonEmptyObject(pokemon.volatiles) && 'powertrick' in pokemon.volatiles) {
    const { atk, def } = options.overrides.baseStats;

    (options.overrides as DeepWritable<SmogonPokemonOverrides>).baseStats.atk = def;
    (options.overrides as DeepWritable<SmogonPokemonOverrides>).baseStats.def = atk;
  }

  const smogonPokemon = new SmogonPokemon(
    dex,
    pokemon.speciesForme,
    options,
  );

  if (typeof smogonPokemon?.species?.nfe !== 'boolean') {
    (smogonPokemon.species as Writable<Specie>).nfe = notFullyEvolved(pokemon.speciesForme);
  }

  return smogonPokemon;
};
