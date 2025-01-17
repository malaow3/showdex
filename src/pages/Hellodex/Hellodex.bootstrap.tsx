import * as React from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { type ShowdexBootstrapper } from '@showdex/main';
import { renderCalcdex } from '@showdex/pages/Calcdex';
import { type CalcdexSliceState, calcdexSlice, showdexSlice } from '@showdex/redux/store';
import {
  createCalcdexRoom,
  createHellodexRoom,
  getBattleRoom,
  getCalcdexRoomId,
} from '@showdex/utils/app';
import { env, formatId } from '@showdex/utils/core';
import { logger, runtimer } from '@showdex/utils/debug';
import { Hellodex } from './Hellodex';

const l = logger('@showdex/pages/Hellodex/Hellodex.bootstrap');

export const hellodexBootstrapper: ShowdexBootstrapper = (store) => {
  const endTimer = runtimer(l.scope, l);

  l.debug(
    'Hellodex bootstrapper was invoked;',
    'determining if there\'s anything to do...',
  );

  if (typeof app?.user?.finishRename === 'function') {
    l.debug('Hooking into the client\'s app.user.finishRename()...');

    const userFinishRename = app.user.finishRename.bind(app.user) as typeof app.user.finishRename;

    app.user.finishRename = (name, assertion) => {
      // call the original function
      userFinishRename(name, assertion);

      // l.debug(
      //   'app.user.finishRename()',
      //   '\n', 'name', name,
      //   '\n', 'assertion', assertion,
      // );

      // determine if the user logged in
      // assertion seems to be some sha256, then the user ID, then 4?, then some timestamp,
      // then some server url, then some sha1, then some half of a sha1 (lol), finally some super long sha hash
      if (name && assertion?.includes(',')) {
        const assertions = assertion.split(',');
        const userId = assertions[1];

        if (formatId(name) === userId) {
          l.debug(
            'Logged in as', name, '(probably)',
            '\n', 'assertions', assertions,
          );

          store.dispatch(showdexSlice.actions.setAuthUsername(name));
        }
      }
    };
  }

  if (!env.bool('hellodex-enabled')) {
    l.debug(
      'Hellodex bootstrap request was ignored',
      'since it has been disabled by the environment.',
    );

    return endTimer('(hellodex denied)');
  }

  const openCalcdexInstance = (battleId: string) => {
    if (typeof app === 'undefined' || !Object.keys(app.rooms || {}).length || !battleId) {
      return;
    }

    // attempt to grab the current battle state
    const battleState = (store.getState()?.calcdex as CalcdexSliceState)?.[battleId];

    // shouldn't be the case, but we'll check again anyways
    if (!battleState?.battleId) {
      return;
    }

    // attempt to grab the current battle room
    const battleRoom = getBattleRoom(battleId);

    // note: battleRoom.id should equal battleRoom.battle.id,
    // which is where battleId should be derived from when the Calcdex state was initialized
    const battleRoomId = battleRoom?.id || battleId;

    // check if the Calcdex is rendered as an overlay for this battle
    if (battleState.renderMode === 'overlay') {
      // if we're not even in the battleRoom anymore, destroy the state
      if (!(battleRoomId in (app.rooms || {}))) {
        store.dispatch(calcdexSlice.actions.destroy(battleRoomId));

        return;
      }

      const shouldFocus = !app.curRoom?.id || app.curRoom.id !== battleRoomId;

      if (shouldFocus) {
        app.focusRoom(battleRoomId);
      }

      // we'll toggle it both ways here (only if we didn't have to focus the room),
      // for use as an "emergency exit" (hehe) should the "Close Calcdex" go missing...
      // but it shouldn't tho, think I covered all the bases... hopefully :o
      if (!shouldFocus || !battleState.overlayVisible) {
        battleRoom.toggleCalcdexOverlay?.();
      }

      // for overlays, this is all we'll do since the Calcdex is rendered inside the battle frame
      // (entirely possible to do more like reopen as a tab later, but for v1.0.3, nah)
      return;
    }

    // check if the Calcdex tab is already open
    const calcdexRoomId = getCalcdexRoomId(battleId);

    if (calcdexRoomId in app.rooms) {
      // no need to call app.topbar.updateTabbar() since app.focusRoomRight() will call it for us
      // (app.focusRoomRight() -> app.updateLayout() -> app.topbar.updateTabbar())
      app.focusRoomRight(calcdexRoomId);
    } else {
      // at this point, we need to recreate the room
      // (we should also be in the 'panel' renderMode now)
      const calcdexRoom = createCalcdexRoom(battleId, true, store);

      renderCalcdex(
        calcdexRoom.reactRoot,
        store,
        battleRoom?.battle?.id || battleId,
        // battleRoom,
      );

      // if the battleRoom exists, attach the created room to the battle object
      if (battleRoom?.battle?.id) {
        battleRoom.battle.calcdexDestroyed = false; // just in case
        battleRoom.battle.calcdexRoom = calcdexRoom;
        // battleRoom.battle.calcdexReactRoot = calcdexReactRoot;
      }
    }

    // refocus the battleRoom that the tabbed Calcdex pertains to, if still joined
    if ((!app.curRoom?.id || app.curRoom.id !== battleRoomId) && battleRoomId in (app.rooms || {})) {
      app.focusRoom(battleRoomId);
    }
  };

  const hellodexRoom = createHellodexRoom(store);

  if (!hellodexRoom?.reactRoot) {
    l.error(
      'ReactDOM root has not been initialized by createHellodexRoom().',
      'Something is horribly wrong here!',
      '\n', 'hellodexRoom', '(type)', typeof hellodexRoom, '(now)', hellodexRoom,
      '\n', 'reactRoot', '(type)', typeof hellodexRoom?.reactRoot, '(now)', hellodexRoom?.reactRoot,
    );

    return endTimer('(bad reactRoot)');
  }

  hellodexRoom.reactRoot.render((
    <ReduxProvider store={store}>
      <Hellodex
        openCalcdexInstance={openCalcdexInstance}
      />
    </ReduxProvider>
  ));

  endTimer('(bootstrap complete)');
};
