<template>
    <section class="bambu-ams-half" :class="{ 'bambu-ams-half--right': side === 'right' }">
        <div class="bambu-ams-half__tabs">
            <button
                v-for="(src, idx) in sources"
                :key="src.key"
                type="button"
                class="bambu-ams-tab"
                :class="{
                    'bambu-ams-tab--selected': idx === selectedIndex,
                    'bambu-ams-tab--active': src.isFeeding,
                    'bambu-ams-tab--drying': src.type === 'ams' && src.drying,
                }"
                :title="src.label"
                @click="selectTab(idx)">
                <span v-if="src.type === 'ext'" class="bambu-ams-tab__ext-icon">
                    <v-icon size="14">{{ mdiAlphaXBoxOutline }}</v-icon>
                </span>
                <svg
                    v-else
                    class="bambu-ams-tab__ams-icon"
                    :viewBox="`0 0 ${tabIconWidth(src.swatchColors.length)} 16`"
                    :width="tabIconWidth(src.swatchColors.length)"
                    height="16"
                    aria-hidden="true">
                    <!-- Solid dark backdrop so light bars register against
                         the (potentially light-themed) tab background. -->
                    <rect
                        x="0"
                        y="0"
                        :width="tabIconWidth(src.swatchColors.length)"
                        height="16"
                        rx="2"
                        fill="rgba(0, 0, 0, 0.32)" />
                    <!-- One rect per filament slot, fixed 4px wide with
                         1px gap — deterministic via viewBox math, no flex
                         rounding or inline-block whitespace artifacts.
                         Dark backdrop above provides contrast for light
                         filament colors without per-rect borders. -->
                    <rect
                        v-for="(color, ci) in src.swatchColors"
                        :key="ci"
                        :x="2 + ci * 5"
                        y="2"
                        width="4"
                        height="12"
                        rx="1"
                        :fill="color" />
                </svg>
                <span class="bambu-ams-tab__label">{{ src.shortLabel }}</span>
            </button>
        </div>

        <div class="bambu-ams-half__panel">
            <div v-if="selectedSource" class="bambu-ams-half__mmu-wrap">
                <div class="bambu-ams-half__mmu-stack">
                    <mmu-unit
                        :unit-index="selectedSource.unitIndex"
                        :selected-gate="loadedGateForSelected"
                        :show-details="true"
                        :show-context-menu="false"
                        :hide-bypass="true"
                        :unhighlight-spools="false"
                        @select-gate="$emit('select-spool', $event)" />
                </div>
            </div>

            <!-- Humidity / temperature panel-corner widget. Lives at the
                 panel level (not on the MmuUnit) so it stays at the
                 right edge regardless of how wide the AMS unit itself
                 is — single-slot AMS HT has a narrow MmuUnit but the
                 panel is still full-width. -->
            <button
                v-if="selectedSource && selectedSource.type === 'ams'"
                type="button"
                class="bambu-ams-humidity-chip bambu-ams-half__humidity-corner"
                :class="{ 'bambu-ams-humidity-chip--drying': selectedSource.drying }"
                :title="`${selectedSource.label} humidity`"
                @click="$emit('open-humidity', selectedSource)">
                <v-icon size="16" class="bambu-ams-humidity-chip__icon">{{ mdiWaterPercent }}</v-icon>
                <span class="bambu-ams-humidity-chip__num">{{
                    selectedSource.humidity !== null ? selectedSource.humidity : '—'
                }}</span>
                <span class="bambu-ams-humidity-chip__unit">%</span>

                <template v-if="selectedSource.temperature !== null">
                    <v-icon size="16" class="bambu-ams-humidity-chip__temp-icon">{{ mdiThermometer }}</v-icon>
                    <span class="bambu-ams-humidity-chip__num">{{ selectedSource.temperature.toFixed(0) }}</span>
                    <span class="bambu-ams-humidity-chip__unit">°C</span>
                </template>
            </button>

            <svg v-if="selectedSource" class="bambu-ams-half__paths" viewBox="0 0 100 60" preserveAspectRatio="none">
                <!-- Single feed line from bottom-center of the AMS down
                     to the extruder. Colored + thicker when a gate is
                     loaded into this nozzle, thin gray otherwise.
                     A lighter underlay line keeps dark filaments
                     (#000000 / etc) readable on the dark panel bg. -->
                <line
                    v-if="anyActive"
                    x1="50"
                    y1="0"
                    x2="50"
                    y2="60"
                    stroke="rgba(255,255,255,0.28)"
                    stroke-width="5"
                    stroke-linecap="round" />
                <line
                    x1="50"
                    y1="0"
                    x2="50"
                    y2="60"
                    :stroke="feedLineColor"
                    :stroke-width="anyActive ? 3 : 1"
                    stroke-linecap="round" />
            </svg>

            <div class="bambu-ams-half__extruder">
                <svg viewBox="0 0 64 58" class="bambu-ams-half__extruder-svg">
                    <rect x="22" y="0" width="20" height="14" rx="2" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" stroke-width="1" />
                    <text
                        x="32"
                        y="11"
                        text-anchor="middle"
                        font-size="11"
                        font-weight="700"
                        fill="rgba(255,255,255,0.78)">{{ side === 'left' ? 'L' : 'R' }}</text>
                    <rect
                        x="20"
                        y="14"
                        width="24"
                        height="22"
                        rx="2"
                        :fill="extruderBodyFill"
                        :stroke="extruderActive ? '#3caf50' : 'rgba(255,255,255,0.22)'"
                        stroke-width="1.4" />
                    <circle
                        cx="32"
                        cy="25"
                        r="5"
                        :fill="extruderActive ? '#3caf50' : 'transparent'"
                        :stroke="extruderActive ? '#3caf50' : 'rgba(255,255,255,0.32)'"
                        stroke-width="1.2" />
                    <polygon
                        points="26,36 38,36 34,46 30,46"
                        :fill="extruderActive ? '#3caf50' : 'rgba(255,255,255,0.18)'" />
                    <!-- Lighter underlay so dark filaments stay visible
                         against the dark panel background. -->
                    <line
                        v-if="extruderActive"
                        x1="32"
                        y1="46"
                        x2="32"
                        y2="58"
                        stroke="rgba(255,255,255,0.28)"
                        stroke-width="5"
                        stroke-linecap="round" />
                    <line
                        x1="32"
                        y1="46"
                        x2="32"
                        y2="58"
                        :stroke="loadedColorForExtruder"
                        :stroke-width="extruderActive ? 3 : 1"
                        stroke-linecap="round" />
                </svg>
            </div>
        </div>
    </section>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import MmuUnit from '@/components/panels/Mmu/MmuUnit.vue'
import { mdiWaterPercent, mdiAlphaXBoxOutline, mdiThermometer } from '@mdi/js'

export interface BambuAmsGate {
    gateIndex: number
    label: string
    colorHex: string
    isActive: boolean
}

export interface BambuAmsSource {
    key: string
    type: 'ams' | 'ext'
    label: string
    shortLabel: string
    swatchColors: string[]
    humidity: number | null
    temperature: number | null
    dryTimeSeconds: number
    drying: boolean
    isFeeding: boolean
    gates: BambuAmsGate[]
    // mmu_machine.unit_N index for rendering via Mainsail's MmuUnit
    // component (which expects a unit-index prop and looks up
    // first_gate/num_gates from the printer state).
    unitIndex: number
}

@Component({
    components: { MmuUnit },
})
export default class BambuAmsNozzleHalf extends Mixins(BaseMixin) {
    mdiWaterPercent = mdiWaterPercent
    mdiThermometer = mdiThermometer
    mdiAlphaXBoxOutline = mdiAlphaXBoxOutline

    @Prop({ required: true }) readonly side!: 'left' | 'right'
    @Prop({ required: true }) readonly sources!: BambuAmsSource[]
    @Prop({ default: false }) readonly isActive!: boolean

    selectedIndex = 0
    userTouchedTab = false

    @Watch('sources', { immediate: true })
    onSourcesChanged(next: BambuAmsSource[]) {
        if (this.selectedIndex >= next.length) this.selectedIndex = 0
        if (this.userTouchedTab) return

        // Default each nozzle to a different source so the two halves
        // don't look identical out of the box. Prefer the actively-
        // feeding source for the right nozzle (matches BS's behavior
        // of surfacing the loaded slot). Falls back to ordinal pick.
        if (this.side === 'left') {
            const feedingIdx = next.findIndex((src) => src.type === 'ext' && src.isFeeding)
            this.selectedIndex = feedingIdx >= 0 ? feedingIdx : 0
        } else {
            const feedingIdx = next.findIndex((src) => src.type === 'ams' && src.isFeeding)
            const firstAms = next.findIndex((src) => src.type === 'ams')
            this.selectedIndex = feedingIdx >= 0 ? feedingIdx : firstAms >= 0 ? firstAms : Math.min(1, next.length - 1)
        }
    }

    selectTab(idx: number): void {
        this.userTouchedTab = true
        this.selectedIndex = idx
    }

    tabIconWidth(slotCount: number): number {
        // viewBox math for the tab AMS icon: 2px left padding +
        // (slotCount × 4px bars) + ((slotCount-1) × 1px gaps) + 2px right padding.
        return 2 + slotCount * 4 + Math.max(0, slotCount - 1) + 2
    }

    get selectedSource(): BambuAmsSource | null {
        return this.sources[this.selectedIndex] ?? null
    }

    get activeGates(): BambuAmsGate[] {
        if (!this.selectedSource) return []
        return this.selectedSource.gates.filter((g) => g.isActive)
    }

    get anyActive(): boolean {
        return this.activeGates.length > 0
    }

    get extruderActive(): boolean {
        // Green styling on the SVG nozzle body fires only on the
        // extruder that's currently being held at print temperature,
        // not just any nozzle that happens to have filament loaded.
        return this.isActive
    }

    get loadedColorForExtruder(): string {
        return this.activeGates.length ? `#${this.activeGates[0].colorHex}` : 'rgba(255,255,255,0.14)'
    }

    get extruderBodyFill(): string {
        return this.extruderActive ? 'rgba(60,175,80,0.12)' : 'rgba(255,255,255,0.04)'
    }

    get feedLineColor(): string {
        // Color the single feed line with the loaded filament's color
        // when a gate is feeding this nozzle, otherwise dim gray.
        return this.activeGates.length
            ? `#${this.activeGates[0].colorHex}`
            : 'rgba(255,255,255,0.18)'
    }

    get loadedGateForSelected(): number {
        // MmuUnit's `selected-gate` prop expects a global gate index;
        // pass -1 when nothing in this source is currently loaded into
        // the nozzle so no spool is "selected" (lifted/highlighted).
        if (!this.selectedSource) return -1
        const active = this.selectedSource.gates.find((g) => g.isActive)
        return active ? active.gateIndex : -1
    }
}
</script>

<style scoped>
.bambu-ams-half {
    flex: 1 1 320px;
    min-width: 0;
    padding: 12px;
    background: #232323;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.bambu-ams-half__tabs {
    display: flex;
    gap: 4px;
}

.bambu-ams-tab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: #2c2c2c;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
}

.bambu-ams-tab:hover {
    background: #353535;
}

.bambu-ams-tab--selected {
    border-color: #3caf50;
    color: #fff;
}

.bambu-ams-tab--active {
    box-shadow: 0 0 0 1px rgba(60, 175, 80, 0.5);
}

.bambu-ams-tab--drying {
    /* Warm orange→red glow signals "this AMS is heated for drying"
       without competing with the green --selected outline. Selection
       is a sharp border (filled/primary visual weight); drying is a
       diffuse halo (ambient/secondary cue). A tab can be both at
       once and read correctly: the green outline still dominates. */
    box-shadow:
        0 0 0 1px rgba(240, 96, 48, 0.55),
        0 0 10px 1px rgba(220, 64, 48, 0.45);
}

.bambu-ams-tab__ams-icon {
    /* Inline SVG — sizing comes from the `width` + `height` attributes
       and the viewBox. Display:block keeps it from picking up baseline
       quirks of inline SVG inside the flex tab. */
    display: block;
}

.bambu-ams-tab__ext-icon {
    display: inline-flex;
    align-items: center;
    color: rgba(255, 255, 255, 0.7);
}

.bambu-ams-tab__label {
    line-height: 1;
}

.bambu-ams-half__panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #1d1d1d;
    border-radius: 4px;
    min-height: 220px;
    position: relative;
    /* Stretch to fill the parent .bambu-ams-half so two halves with
       different content lengths still produce panels of equal height. */
    flex: 1 1 auto;
}

.bambu-ams-humidity-chip {
    /* Two-row × three-column grid: icon | number (right) | unit (left).
       The icon column auto-sizes, the number column is right-aligned
       so the 0%/99% digits stack neatly, and the unit column is
       left-aligned so % / °C line up vertically across the two rows. */
    display: inline-grid;
    grid-template-columns: auto max-content max-content;
    align-items: center;
    column-gap: 6px;
    row-gap: 2px;
    padding: 6px 12px;
    background: #2b2b2b;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    line-height: 1.15;
}

.bambu-ams-humidity-chip:hover {
    background: #353535;
}

.bambu-ams-humidity-chip__icon {
    color: #79bff0 !important;
}

.bambu-ams-humidity-chip__temp-icon {
    color: #f0a070 !important;
}

.bambu-ams-humidity-chip__num {
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.bambu-ams-humidity-chip__unit {
    text-align: left;
    color: rgba(255, 255, 255, 0.7);
}

.bambu-ams-humidity-chip--drying {
    /* Same warm glow as the drying tab — diffuse halo, not a fill,
       so it reads as ambient "heated" cue rather than primary
       button state. Border keeps subtle warm tint for contrast. */
    border-color: rgba(240, 96, 48, 0.55) !important;
    box-shadow: 0 0 12px 1px rgba(220, 64, 48, 0.45);
}

.bambu-ams-half__mmu-wrap {
    display: flex;
    justify-content: center;
}

.bambu-ams-half__mmu-stack {
    display: inline-flex;
}

.bambu-ams-half__humidity-corner {
    /* Pinned to the bottom-right of the panel so the widget never
       collides with a narrow MmuUnit (single-slot AMS HT). z-index
       just to sit above the extruder-bottom margin in case they
       overlap on very short panels. */
    position: absolute;
    bottom: 10px;
    right: 12px;
    z-index: 5;
}

.bambu-ams-half__paths {
    width: 100%;
    height: 30px;
    margin-top: -6px;
    /* Cancel the panel's gap: 8px so the extruder SVG butts directly
       against the bottom of this filament line (no visible gap). */
    margin-bottom: -8px;
}

.bambu-ams-half__extruder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    /* Pin extruder to the bottom of the panel — any extra vertical
       space from a missing humidity chip / fewer slots ends up between
       the paths SVG and the extruder, not below the extruder. */
    margin-top: auto;
}

.bambu-ams-half__extruder-svg {
    width: 64px;
    height: 58px;
    /* The path SVG above ends with the filament line at y=60; this
       extruder SVG starts with the L/R label rect at y=0 so they
       butt up directly with no visual gap. */
    display: block;
}
</style>
