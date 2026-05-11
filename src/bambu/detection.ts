// Backend detection for Bambu-aware features.
//
// The bambu-raker backend (https://github.com/spectre3ooo/bambu-raker)
// advertises itself in `server.info.components` as `"bambu_raker"`.
// Vanilla Moonraker never emits this string, so this single check is
// sufficient to gate all Bambu-aware UI: panels, modals, hidden
// affordances. Reading directly from the existing `server` Vuex
// module's state means we add zero new store modules, getters, or
// mutations — keeping merge conflicts on upstream rebase to zero.

import type { Store } from 'vuex'
import type { RootState } from '@/store/types'

export const isBambuRakerBackend = (store: Store<RootState>): boolean => {
    const components = store.state.server?.components
    return Array.isArray(components) && components.includes('bambu_raker')
}
