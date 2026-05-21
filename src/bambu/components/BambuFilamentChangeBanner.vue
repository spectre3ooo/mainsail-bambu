<template>
    <v-card v-if="visible" outlined class="bambu-fila-banner pa-2">
        <div class="bambu-fila-banner__row">
            <v-icon size="20" color="primary" class="mr-2">{{ mdiSwapHorizontalBold }}</v-icon>
            <span class="bambu-fila-banner__title">Filament change</span>
            <span v-for="ext in activeExtruders" :key="ext.extruder_id" class="bambu-fila-banner__ext">
                <span class="bambu-fila-banner__nozzle">{{ nozzleLabel(ext.extruder_id) }}</span>
                <span class="bambu-fila-banner__step">{{ ext.step_label ?? `Step ${ext.step_code}` }}</span>
            </span>
            <span v-if="nextLabel" class="bambu-fila-banner__next">
                <v-icon size="14" class="mx-1">{{ mdiChevronRight }}</v-icon>
                {{ nextLabel }}
            </span>
        </div>
    </v-card>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiChevronRight, mdiSwapHorizontalBold } from '@mdi/js'

// Mirrors `BambuFilamentChange` on the server side.
interface FilamentChangeExtruder {
    extruder_id: number
    step_code: number
    step_label: string | null
    active: boolean
}

interface FilamentChangeView {
    extruders: FilamentChangeExtruder[]
    queue: number[]
    queue_labels: (string | null)[]
    any_active: boolean
}

@Component
export default class BambuFilamentChangeBanner extends Mixins(BaseMixin) {
    mdiSwapHorizontalBold = mdiSwapHorizontalBold
    mdiChevronRight = mdiChevronRight

    get view(): FilamentChangeView | null {
        const v = (this.$store.state.printer as Record<string, unknown>).bambu_filament_change
        return (v as FilamentChangeView | undefined) ?? null
    }

    get visible(): boolean {
        return this.view !== null && this.view.any_active
    }

    get activeExtruders(): FilamentChangeExtruder[] {
        return (this.view?.extruders ?? []).filter((e) => e.active)
    }

    get nextLabel(): string | null {
        // Show the next step in the queue if there's anything queued
        // beyond what's actively happening. Pick the first label that's
        // not the same as any currently-active step (avoids "Heating
        // nozzle · then Heating nozzle" duplication).
        const v = this.view
        if (v === null || !v.queue_labels?.length) return null
        const activeLabels = new Set(this.activeExtruders.map((e) => e.step_label))
        for (const label of v.queue_labels) {
            if (label && !activeLabels.has(label)) return label
        }
        return null
    }

    nozzleLabel(extruderId: number): string {
        // 0 = MAIN/right, 1 = DEPUTY/left. Match the dashboard's L/R chips.
        return extruderId === 1 ? 'L' : 'R'
    }
}
</script>

<style scoped>
.bambu-fila-banner {
    background: rgba(33, 150, 243, 0.08);
    border-color: rgba(33, 150, 243, 0.32);
    margin-bottom: 8px;
}

.bambu-fila-banner__row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    line-height: 24px;
}

.bambu-fila-banner__title {
    font-weight: 600;
    font-size: 14px;
    margin-right: 4px;
}

.bambu-fila-banner__ext {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: rgba(33, 150, 243, 0.14);
    border-radius: 12px;
    font-size: 13px;
}

.bambu-fila-banner__nozzle {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: rgba(33, 150, 243, 0.95);
}

.bambu-fila-banner__step {
    opacity: 0.92;
}

.bambu-fila-banner__next {
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    opacity: 0.7;
}

html.theme--light .bambu-fila-banner {
    background: rgba(33, 150, 243, 0.06);
    border-color: rgba(33, 150, 243, 0.32);
}
</style>
