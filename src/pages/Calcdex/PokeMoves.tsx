import * as React from 'react';
import cx from 'classnames';
import { PokeType, useColorScheme } from '@showdex/components/app';
import { Dropdown } from '@showdex/components/form';
import { TableGrid, TableGridItem } from '@showdex/components/layout';
import { Button, Tooltip } from '@showdex/components/ui';
import { buildMoveOptions } from '@showdex/utils/battle';
import type { MoveName } from '@pkmn/data';
import type { GenerationNum } from '@pkmn/types';
import type { CalcdexBattleRules, CalcdexPokemon } from '@showdex/redux/store';
import type { SmogonMatchupHookCalculator } from './useSmogonMatchup';
import styles from './PokeMoves.module.scss';

export interface PokeMovesProps {
  className?: string;
  style?: React.CSSProperties;
  // dex: Generation;
  gen: GenerationNum;
  format?: string;
  rules?: CalcdexBattleRules;
  pokemon: CalcdexPokemon;
  movesCount?: number;
  calculateMatchup: SmogonMatchupHookCalculator;
  onPokemonChange?: (pokemon: DeepPartial<CalcdexPokemon>) => void;
}

export const PokeMoves = ({
  className,
  style,
  // dex,
  gen,
  format,
  rules,
  pokemon,
  movesCount = 4,
  calculateMatchup,
  onPokemonChange,
}: PokeMovesProps): JSX.Element => {
  const colorScheme = useColorScheme();

  // const gen = dex?.num; // this is undefined lmao

  const pokemonKey = pokemon?.calcdexId || pokemon?.name || '???';
  const friendlyPokemonName = pokemon?.speciesForme || pokemon?.name || pokemonKey;

  const moveOptions = buildMoveOptions(format, pokemon);

  return (
    <TableGrid
      className={cx(
        styles.container,
        !!colorScheme && styles[colorScheme],
        className,
      )}
      style={style}
    >
      {/* table headers */}
      <TableGridItem
        className={styles.movesHeader}
        align="left"
        header
      >
        Moves

        {
          (format?.includes('nationaldex') || gen === 6 || gen === 7) &&
          <>
            {' '}
            <Button
              className={styles.toggleButton}
              labelClassName={cx(
                styles.toggleButtonLabel,
                !pokemon?.useZ && styles.inactive,
              )}
              label="Z-PWR"
              tooltip={`${pokemon?.useZ ? 'Deactivate' : 'Activate'} Max Moves`}
              disabled={!pokemon}
              onPress={() => onPokemonChange?.({
                useZ: !pokemon?.useZ,
              })}
            />
          </>
        }

        {
          ((format?.includes('nationaldex') || gen === 8) && !rules?.dynamax) &&
          <>
            {' '}
            <Button
              className={styles.toggleButton}
              labelClassName={cx(
                styles.toggleButtonLabel,
                !pokemon?.useMax && styles.inactive,
              )}
              // label={gen === 6 || gen === 7 ? 'Z-PWR' : 'Max'}
              label="Max"
              // tooltip={`${pokemon?.useUltimateMoves ? 'Deactivate' : 'Activate'} ${gen === 6 || gen === 7 ? 'Z-Power' : 'Max'} Moves`}
              tooltip={`${pokemon?.useMax ? 'Deactivate' : 'Activate'} Max Moves`}
              // absoluteHover
              disabled={!pokemon}
              onPress={() => onPokemonChange?.({
                // useUltimateMoves: !pokemon?.useUltimateMoves,
                useMax: !pokemon?.useMax,
              })}
            />
          </>
        }
      </TableGridItem>

      <TableGridItem
        className={styles.dmgHeader}
        header
      >
        DMG

        {' '}
        <Button
          className={styles.toggleButton}
          labelClassName={cx(
            styles.toggleButtonLabel,
            !pokemon?.criticalHit && styles.inactive,
          )}
          label="Crit"
          tooltip={`${pokemon?.criticalHit ? 'Hide' : 'Show'} Critical Hit Damages`}
          // absoluteHover
          disabled={!pokemon?.speciesForme}
          onPress={() => onPokemonChange?.({
            criticalHit: !pokemon?.criticalHit,
          })}
        />
      </TableGridItem>

      <TableGridItem header>
        KO %
      </TableGridItem>

      {/* (actual) moves */}
      {Array(movesCount).fill(null).map((_, i) => {
        const moveName = pokemon?.moves?.[i];
        const move = moveName ? Dex?.moves?.get?.(moveName) : null;

        // const transformed = !!moveid && moveid?.charAt(0) === '*'; // moves used by a transformed Ditto
        // const moveName = (transformed ? moveid.substring(1) : moveid) as MoveName;

        // const maxPp = move?.noPPBoosts ? (move?.pp || 0) : Math.floor((move?.pp || 0) * (8 / 5));
        // const remainingPp = Math.max(maxPp - (ppUsed || maxPp), 0);

        const {
          move: calculatorMove,
          description,
          damageRange,
          koChance,
          koColor,
        } = calculateMatchup?.(moveName) || {};

        // Z/Max/G-Max moves bypass the original move's accuracy
        // (only time these moves can "miss" is if the opposing Pokemon is in a semi-vulnerable state,
        // after using moves like Fly, Dig, Phantom Force, etc.)
        const showAccuracy = !pokemon?.useMax
          && typeof move?.accuracy !== 'boolean'
          && (move?.accuracy || -1) > 0
          && move.accuracy !== 100;

        // const showMoveStats = !!move?.type;

        return (
          <React.Fragment
            key={`PokeMoves:MoveTrack:${pokemonKey}:${moveName || '???'}:${i}`}
          >
            <TableGridItem align="left">
              <Dropdown
                aria-label={`Move Slot ${i + 1} for Pokemon ${friendlyPokemonName}`}
                hint="--"
                tooltip={calculatorMove?.type ? (
                  <div className={styles.moveTooltip}>
                    <PokeType type={calculatorMove.type} />

                    {
                      !!calculatorMove.category &&
                      <>
                        <span className={styles.label}>
                          {' '}{calculatorMove.category.slice(0, 4)}
                        </span>
                        {calculatorMove?.bp ? ` ${calculatorMove.bp}` : null}
                      </>
                    }

                    {
                      showAccuracy &&
                      <>
                        <span className={styles.label}>
                          {' '}ACC{' '}
                        </span>
                        {move.accuracy}%
                      </>
                    }

                    {
                      !!calculatorMove?.priority &&
                      <>
                        <span className={styles.label}>
                          {' '}PRI{' '}
                        </span>
                        {calculatorMove.priority > 0 ? `+${calculatorMove.priority}` : calculatorMove.priority}
                      </>
                    }
                  </div>
                ) : null}
                input={{
                  name: `PokeMoves:MoveTrack:Move:${pokemonKey}:${i}`,
                  value: moveName,
                  onChange: (name: MoveName) => {
                    const moves = [...(pokemon?.moves || [] as MoveName[])];

                    if (!Array.isArray(moves) || (moves?.[i] && moves[i] === name)) {
                      return;
                    }

                    // when move is cleared, `name` will be null/undefined, so coalesce into an empty string
                    moves[i] = (name?.replace('*', '') ?? '') as MoveName;

                    onPokemonChange?.({
                      moves,
                    });
                  },
                }}
                options={moveOptions}
                noOptionsMessage="No Moves Found"
                disabled={!pokemon?.speciesForme}
              />
            </TableGridItem>

            <TableGridItem
              style={!damageRange || damageRange === '0%' ? { opacity: 0.5 } : undefined}
            >
              {/* [XXX.X% &ndash;] XXX.X% */}
              {/* (note: '0 - 0%' damageRange will be reported as '0%') */}
              {damageRange === '0%' ? 'N/A' : damageRange}
            </TableGridItem>

            <Tooltip
              content={description ? (
                <div className={styles.descTooltip}>
                  {description}
                </div>
              ) : null}
              offset={[0, 10]}
              delay={[1000, 150]}
              trigger="mouseenter"
              touch="hold"
              disabled={!description}
            >
              <TableGridItem
                style={{
                  ...(!koChance ? { opacity: 0.3 } : null),
                  ...(koColor ? { color: koColor } : null),
                }}
              >
                {/* XXX% XHKO */}
                {koChance}
              </TableGridItem>
            </Tooltip>
          </React.Fragment>
        );
      })}
    </TableGrid>
  );
};
