<template>
    <v-chip
        v-if="isBambuRaker"
        x-small
        color="success"
        class="bambu-pill ml-1"
        :ripple="false"
        text-color="white">
        Bambu
    </v-chip>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import { isBambuRakerBackend } from '@/bambu/detection'

// Tiny visible marker that the connected backend is bambu-raker.
//
// Renders only when `server.components` includes `bambu_raker`. On a
// vanilla Moonraker setup the chip simply doesn't appear, so the
// fork's appearance is indistinguishable from upstream Mainsail for
// non-Bambu users.
//
// Purpose at this stage of the fork is to validate the
// conditional-render plumbing end-to-end before investing in real
// Bambu-aware panels. See Phase 1 of
// docs/superpowers/plans/2026-05-11-mainsail-fork.md in the
// bambu-raker repo.
@Component
export default class BambuPill extends Vue {
    get isBambuRaker(): boolean {
        return isBambuRakerBackend(this.$store)
    }
}
</script>

<style scoped>
.bambu-pill {
    font-weight: 500;
    letter-spacing: 0.02em;
}
</style>
