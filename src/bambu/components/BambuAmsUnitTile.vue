<template>
    <section class="v2-tile" :class="{ 'v2-tile--feeding': isFeeding, 'v2-tile--drying': source.drying }">
        <!-- Title bar: name on the left, temp/humidity as compact clickable
             values on the right (narrow single-slot units click the whole
             bar instead). Minimal height. -->
        <div
            class="v2-tile__titlebar"
            :class="{ 'v2-tile__titlebar--clickable': isNarrowAms }"
            @click="onTitleBarClick">
            <span class="v2-tile__name" :title="source.displayName">{{ source.displayName }}</span>
            <button
                v-if="isWideAms"
                type="button"
                class="v2-tile__env"
                :class="{ 'v2-tile__env--drying': source.drying }"
                :title="`${source.displayName} humidity / temperature`"
                @click="$emit('open-humidity', source)">
                <v-icon size="13" class="v2-tile__env-icon v2-tile__env-icon--hum">{{ mdiWaterPercent }}</v-icon>
                <span class="v2-tile__env-val">{{ source.humidity !== null ? source.humidity : '—' }}%</span>
                <template v-if="source.temperature !== null">
                    <v-icon size="13" class="v2-tile__env-icon v2-tile__env-icon--temp">{{ mdiThermometer }}</v-icon>
                    <span class="v2-tile__env-val">{{ source.temperature.toFixed(0) }}°C</span>
                </template>
            </button>
            <v-icon
                v-else-if="isNarrowAms"
                size="14"
                class="v2-tile__env-hint"
                :class="{ 'v2-tile__env-hint--drying': source.drying }"
                :title="`${source.displayName} humidity / temperature`">{{ mdiWaterPercent }}</v-icon>
        </div>

        <!-- Spools + continuous gate bar. Each gate is wrapped so an L/R
             nozzle badge can sit on the active slot's tag, perfectly aligned
             to its gate (no separate marker row). MmuUnit's exact container
             markup keeps the bar flush and edge-to-edge. -->
        <div
            class="d-flex flex-wrap pt-3 px-4 position-relative v2-tile__spools"
            :class="{ 'v2-tile__spools--fill': source.numGates <= 1 }">
            <div v-for="i in source.numGates" :key="i" class="v2-gate-col">
                <mmu-unit-gate
                    :gate-index="source.firstGate + (i - 1)"
                    :mmu-machine-unit="mmuMachineUnit"
                    :show-details="true"
                    :show-context-menu="false"
                    :unhighlight-spools="false"
                    :selected-gate="selectedGate"
                    :has-bypass="false"
                    @select-gate="$emit('select-spool', $event)" />
                <span
                    v-if="nozzleLetterFor(source.firstGate + (i - 1))"
                    class="v2-nozzle-tag"
                    :title="`Feeding the ${nozzleLetterFor(source.firstGate + (i - 1)) === 'R' ? 'right' : 'left'} nozzle`">{{ nozzleLetterFor(source.firstGate + (i - 1)) }}</span>
            </div>
        </div>
    </section>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import MmuMixin from '@/components/mixins/mmu'
import MmuUnitGate from '@/components/panels/Mmu/MmuUnitGate.vue'
import { mdiWaterPercent, mdiThermometer } from '@mdi/js'
import type { BambuAmsDryerState } from '@/bambu/components/BambuAmsNozzleHalf.vue'

// One AMS / external unit, rendered once (no per-nozzle split). The
// active-feed story is told by an L/R badge on the feeding slot's tag.
export interface BambuAmsUnitSource {
    key: string
    type: 'ams' | 'ext'
    displayName: string
    // mmu_machine.unit_N index — drives MmuUnitGate gate lookup.
    unitIndex: number
    numGates: number
    firstGate: number
    humidity: number | null
    temperature: number | null
    dryTimeSeconds: number
    drying: boolean
    dryer: BambuAmsDryerState | null
    amsUnitId: number | null
    // Global gate index feeding the right (MAIN) / left (DEPUTY) nozzle,
    // null when this unit isn't feeding that nozzle. Drives the badge.
    activeRightGate: number | null
    activeLeftGate: number | null
    // External-only: no spool currently loaded. Lets the panel optionally
    // hide empty externals. Always false for AMS units.
    empty: boolean
}

@Component({
    components: { MmuUnitGate },
})
export default class BambuAmsUnitTile extends Mixins(BaseMixin, MmuMixin) {
    mdiWaterPercent = mdiWaterPercent
    mdiThermometer = mdiThermometer

    @Prop({ required: true }) readonly source!: BambuAmsUnitSource
    // Reserved for future single- vs dual-nozzle styling differences.
    @Prop({ default: true }) readonly dualExtruder!: boolean

    get mmuMachineUnit() {
        return this.getMmuMachineUnit(this.source.unitIndex)
    }

    // Wide AMS (>1 slot): show temp/hum inline in the title bar.
    get isWideAms(): boolean {
        return this.source.type === 'ams' && this.source.numGates > 1
    }

    // Narrow single-slot AMS (HT): no room for inline temp/hum, so the
    // whole title bar opens the humidity modal instead.
    get isNarrowAms(): boolean {
        return this.source.type === 'ams' && this.source.numGates <= 1
    }

    onTitleBarClick(): void {
        if (this.isNarrowAms) this.$emit('open-humidity', this.source)
    }

    get isFeeding(): boolean {
        return this.source.activeRightGate !== null || this.source.activeLeftGate !== null
    }

    // MmuUnitGate highlights its `selected-gate`. A unit can feed both
    // nozzles at once (FTS); highlight the right-nozzle slot first, else
    // the left, else nothing.
    get selectedGate(): number {
        return this.source.activeRightGate ?? this.source.activeLeftGate ?? -1
    }

    isRight(gateIndex: number): boolean {
        return this.source.activeRightGate === gateIndex
    }

    isLeft(gateIndex: number): boolean {
        return this.source.activeLeftGate === gateIndex
    }

    // 'R' / 'L' for the nozzle this slot feeds, or null when it isn't
    // feeding. Drives the extruder icon on the spool's feed point.
    nozzleLetterFor(gateIndex: number): string | null {
        if (this.isRight(gateIndex)) return 'R'
        if (this.isLeft(gateIndex)) return 'L'
        return null
    }
}
</script>

<style scoped>
.v2-tile {
    /* inline-flex shrink-to-fit (like MmuUnit) so the tile is exactly as
       wide as its spools and the gate bar reaches the tile edges. The bar
       runs to the tile bottom; overflow:hidden + border-radius rounds it. */
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    background: #232323;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    overflow: hidden;
}

.v2-tile--feeding {
    border-color: rgba(60, 175, 80, 0.4);
}

.v2-tile--drying {
    border-color: rgba(240, 96, 48, 0.45);
}

.v2-tile__titlebar {
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 3px 12px;
    background: rgba(255, 255, 255, 0.04);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.v2-tile__titlebar--clickable {
    cursor: pointer;
}

.v2-tile__titlebar--clickable:hover {
    background: rgba(255, 255, 255, 0.08);
}

.v2-tile__name {
    font-size: 0.84rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
}

.v2-tile__env-hint {
    color: #79bff0 !important;
    opacity: 0.85;
}

.v2-tile__env-hint--drying {
    color: #f0a070 !important;
    opacity: 1;
}

.v2-tile__env {
    /* Plain clickable values flush at the title bar's right inset — no box,
       no padding doubling. Hover brightens the text instead of drawing a
       background. */
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
}

.v2-tile__env:hover {
    color: #fff;
}

.v2-tile__env-icon--hum {
    color: #79bff0 !important;
}

.v2-tile__env-icon--temp {
    color: #f0a070 !important;
    margin-left: 7px;
}

.v2-tile__env--drying {
    color: #f0a070;
}

.v2-tile__spools {
    /* Full tile width so the gate bar fills the tile even when the title
       bar is wider than the spools (AMS HT). Center the gates so a single-
       slot unit's spool + tag sit in the middle. */
    align-self: stretch;
    flex-wrap: nowrap !important;
    justify-content: center;
}

/* Single-slot units: stretch the lone gate to fill the tile width so its
   bar fills the whole tile. */
.v2-tile__spools--fill > * {
    flex: 1 1 auto;
}

/* ...and center the tag in that now-full-width gate (the gate label is
   left-aligned in its w-100 row by default, which reads as off-center
   once the gate is stretched). */
.v2-tile__spools--fill ::v-deep .gate-contents {
    justify-content: center;
}

/* Flatten the gate boxes' bottom corners; the tile's overflow:hidden +
   border-radius then rounds the whole bar's bottom uniformly (no inner
   scallops between gates). */
.v2-tile__spools ::v-deep .mmu-unit-box {
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
}

.v2-gate-col {
    /* Wraps one gate so the L/R badge can be absolutely positioned over
       its tag. No layout change vs a bare gate (the gate fills the col). */
    position: relative;
    display: flex;
    flex-direction: column;
}

.v2-nozzle-tag {
    /* Styled like a slot tag (2px green border, rounded, bold label) but
       with a dark fill so it stays legible over the colored spool. Sits at
       the spool's bottom-center feed point (the glow), above the slot tag. */
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 6;
    min-width: 20px;
    padding: 0 4px;
    border: 2px solid green;
    border-radius: 4px;
    /* Match the active (feeding) slot-tag style: limegreen fill, black label. */
    background: limegreen;
    color: #000000;
    font-weight: bold;
    font-size: 12px;
    line-height: 15px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    animation: v2-tag-in 0.18s ease;
}

@keyframes v2-tag-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}
</style>
