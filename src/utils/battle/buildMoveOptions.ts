import { LegalLockedFormats } from '@showdex/consts';
import { formatId } from '@showdex/utils/app';
// import { env } from '@showdex/utils/core';
import { percentage } from '@showdex/utils/humanize';
import type { MoveName } from '@smogon/calc/dist/data/interface';
import type { DropdownOption } from '@showdex/components/form';
import type { CalcdexPokemon } from '@showdex/redux/store';
import { detectGenFromFormat } from './detectGenFromFormat';
// import { detectLegacyGen } from './detectLegacyGen';
import { flattenAlt, flattenAlts } from './flattenAlts';
import { getMaxMove } from './getMaxMove';
import { getZMove } from './getZMove';
import { getPokemonLearnset } from './getPokemonLearnset';
import { usageAltPercentFinder } from './usageAltPercentFinder';

export type PokemonMoveOption = DropdownOption<MoveName>;

/**
 * Builds the value for the `options` prop of the move `Dropdown` component in `PokeMoves`.
 *
 * @since 0.1.3
 */
export const buildMoveOptions = (
  // dex: Generation,
  format: string,
  pokemon: DeepPartial<CalcdexPokemon>,
): PokemonMoveOption[] => {
  // const gen = dex?.num || <GenerationNum> env.int('calcdex-default-gen');
  const options: PokemonMoveOption[] = [];

  if (!pokemon?.speciesForme) {
    return options;
  }

  const gen = detectGenFromFormat(format);
  const genlessFormat = format?.replace(/^gen\d+/i, '');
  const showAllMoves = !genlessFormat || !LegalLockedFormats.includes(genlessFormat);

  const ability = pokemon.dirtyAbility ?? pokemon.ability;
  const item = pokemon.dirtyItem ?? pokemon.item;

  const {
    serverSourced,
    speciesForme,
    transformedForme,
    moves,
    serverMoves,
    transformedMoves,
    altMoves,
    // moveState,
    revealedMoves,
    useZ,
    useMax,
  } = pokemon;

  // keep track of what moves we have so far to avoid duplicate options
  const filterMoves: MoveName[] = [];

  // create usage percent finder (to show them in any of the option groups)
  const findUsagePercent = usageAltPercentFinder(altMoves, true);

  // since we pass useZ into createSmogonMove(), we need to keep the original move name as the value
  // (but we'll show the corresponding Z move to the user, if any)
  // (also, non-Z moves may appear under the Z-PWR group in the dropdown, but oh well)
  if (useZ && !useMax && moves?.length) {
    options.push({
      label: 'Z-PWR',
      options: moves.map((name) => ({
        label: getZMove(name, item) || name,
        value: name,
      })),
    });

    filterMoves.push(...moves);
  }

  // note: entirely possible to have both useZ and useMax enabled, such as in nationaldexag
  if (useMax && moves?.length) {
    options.push({
      label: 'Max',
      options: moves.map((name) => ({
        label: getMaxMove(name, ability, speciesForme) || name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...moves);
  }

  if (serverSourced && serverMoves?.length) {
    const filteredServerMoves = serverMoves.filter((n) => !!n && !filterMoves.includes(n));

    options.push({
      label: transformedForme ? 'Pre-Transform' : 'Current',
      options: filteredServerMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...filteredServerMoves);
  }

  if (transformedForme && transformedMoves?.length) {
    const filteredTransformedMoves = transformedMoves.filter((n) => !!n && !filterMoves.includes(n));

    options.unshift({
      label: 'Transformed',
      options: filteredTransformedMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...filteredTransformedMoves);
  }

  if (revealedMoves?.length) {
    const filteredRevealedMoves = revealedMoves
      .filter((n) => !!n && !filterMoves.includes(n));

    options.push({
      label: 'Revealed',
      options: filteredRevealedMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...filteredRevealedMoves);
  }

  if (altMoves?.length) {
    const unsortedPoolMoves = altMoves
      .filter((a) => !!a && !filterMoves.includes(flattenAlt(a)));

    const hasUsageStats = !!altMoves?.length && altMoves
      .some((a) => Array.isArray(a) && typeof a[1] === 'number');

    const poolMoves = hasUsageStats
      ? unsortedPoolMoves
      : flattenAlts(unsortedPoolMoves).sort();

    options.push({
      label: 'Pool',
      options: poolMoves.map((alt) => ({
        label: flattenAlt(alt),
        rightLabel: Array.isArray(alt) ? percentage(alt[1], 2) : null,
        value: flattenAlt(alt),
      })),
    });

    filterMoves.push(...flattenAlts(poolMoves));
  }

  // const learnset: MoveName[] = [...(<MoveName[]> moveState?.learnset || [])];
  // const isCap = format.includes('cap');

  // if (isCap && typeof Dex !== 'undefined' && typeof BattleTeambuilderTable !== 'undefined') {
  //   const speciesFormeId = formatId(pokemon.speciesForme);
  //   const learnsetsFromTable = Object.keys(BattleTeambuilderTable.learnsets?.[speciesFormeId] || {})
  //     .map((n) => !!n && <MoveName> Dex.forGen(gen).moves.get(n)?.name)
  //     .filter(Boolean);
  //
  //   if (learnsetsFromTable.length) {
  //     learnset.push(...learnsetsFromTable);
  //   }
  // }

  const learnset = getPokemonLearnset(format, speciesForme, showAllMoves);

  if (transformedForme) {
    learnset.push(...getPokemonLearnset(format, transformedForme, showAllMoves));
  }

  if (learnset.length) {
    const learnsetMoves = Array.from(new Set(learnset))
      .filter((n) => !!n && !formatId(n).startsWith('hiddenpower') && !filterMoves.includes(n))
      .sort();

    options.push({
      label: 'Learnset',
      options: learnsetMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...learnsetMoves);
  }

  // Hidden Power moves were introduced in gen 2
  if (gen > 1) {
    // regex filters out 'hiddenpowerfighting70', which is 'hiddenpowerfighting' (BP 60),
    // but with a BP of 70 lol (don't care about the BP here though, we just need the name)
    const unsortedHpMoves = Object.keys(BattleMovedex || {})
      .map((moveid) => <MoveName> Dex.forGen(gen).moves.get(moveid)?.name)
      .filter((n) => !!n && /^hiddenpower[a-z]*$/i.test(formatId(n)) && !filterMoves.includes(n));

    // using a Set makes sure we have no duplicate entries in the array
    const hpMoves = Array.from(new Set(unsortedHpMoves)).sort();

    options.push({
      label: 'Hidden Power',
      options: hpMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...hpMoves);
  }

  // show all possible moves if format is not provided, is not legal-locked, or
  // no learnset is available (probably because the Pokemon doesn't exist in the `dex`'s gen)
  if (showAllMoves || !learnset.length) {
    const otherMoves = Object.keys(BattleMovedex || {})
      .map((moveid) => <MoveName> Dex.forGen(gen).moves.get(moveid)?.name)
      .filter((n) => !!n && !filterMoves.includes(n))
      .sort();

    // note: since we need to filter out HP moves, but keep the group last, this is the workaround.
    // splice() will insert at the provided start index, even if an element exists at that index.
    const hiddenPowerIndex = options.findIndex((o) => o.label === 'Hidden Power');
    const insertionIndex = Math.max(hiddenPowerIndex, 0);

    // make sure this comes before the Hidden Power moves
    options.splice(insertionIndex, 0, {
      label: 'All',
      options: otherMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });
  }

  return options;
};
