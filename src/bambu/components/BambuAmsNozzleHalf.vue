<template>
    <section class="bambu-ams-half" :class="{ 'bambu-ams-half--right': side === 'right' }">
        <div class="bambu-ams-half__tabs">
            <button
                v-for="(src, idx) in sources"
                :key="src.key"
                type="button"
                class="bambu-ams-tab"
                :class="{ 'bambu-ams-tab--selected': idx === selectedIndex, 'bambu-ams-tab--active': src.isFeeding }"
                :title="src.label"
                @click="selectedIndex = idx">
                <span v-if="src.type === 'ext'" class="bambu-ams-tab__ext-icon">
                    <v-icon size="14">{{ mdiAlphaXBoxOutline }}</v-icon>
                </span>
                <span v-else class="bambu-ams-tab__ams-icon">
                    <span
                        v-for="(color, ci) in src.swatchColors"
                        :key="ci"
                        class="bambu-ams-tab__ams-icon-bar"
                        :style="{ background: color }" />
                </span>
                <span class="bambu-ams-tab__label">{{ src.shortLabel }}</span>
            </button>
        </div>

        <div class="bambu-ams-half__panel">
            <div v-if="selectedSource && selectedSource.type === 'ams'" class="bambu-ams-half__topbar">
                <button
                    type="button"
                    class="bambu-ams-humidity-chip"
                    :title="`AMS ${selectedSource.shortLabel} humidity`"
                    @click="$emit('open-humidity', selectedSource)">
                    <v-icon size="13" class="bambu-ams-humidity-chip__icon">{{ mdiWaterPercent }}</v-icon>
                    <span class="bambu-ams-humidity-chip__value">{{
                        selectedSource.humidity !== null ? `${selectedSource.humidity}%` : '—'
                    }}</span>
                    <v-icon size="13" class="bambu-ams-humidity-chip__state">{{
                        selectedSource.drying ? mdiAirHumidifier : mdiWhiteBalanceSunny
                    }}</v-icon>
                </button>
            </div>

            <div v-if="selectedSource" class="bambu-ams-half__slotrow" :class="`bambu-ams-half__slotrow--n${selectedSource.gates.length}`">
                <div
                    v-for="gate in selectedSource.gates"
                    :key="gate.gateIndex"
                    class="bambu-ams-half__slot">
                    <div class="bambu-ams-half__slot-cap" :class="{ 'bambu-ams-half__slot-cap--active': gate.isActive }">
                        <v-icon v-if="selectedSource.type === 'ams'" size="10" class="bambu-ams-half__slot-cap-icon">{{
                            mdiRefresh
                        }}</v-icon>
                        <span class="bambu-ams-half__slot-cap-label">{{ gate.label }}</span>
                    </div>
                    <mmu-unit-gate-spool
                        :gate-index="gate.gateIndex"
                        :show-details="true"
                        :is-selected="gate.isActive"
                        :unhighlight-spools="anyActive && !gate.isActive"
                        svg-class="bambu-ams-half__spool-svg"
                        @select-gate="$emit('select-spool', gate.gateIndex)" />
                </div>
            </div>

            <svg v-if="selectedSource" class="bambu-ams-half__paths" :viewBox="pathsViewBox" preserveAspectRatio="none">
                <line
                    v-for="(gate, idx) in selectedSource.gates"
                    :key="`rail-${gate.gateIndex}`"
                    :x1="slotCenterX(idx, selectedSource.gates.length)"
                    y1="0"
                    :x2="slotCenterX(idx, selectedSource.gates.length)"
                    y2="20"
                    :stroke="gate.isActive ? `#${gate.colorHex}` : 'rgba(255,255,255,0.18)'"
                    :stroke-width="gate.isActive ? 3 : 1"
                    stroke-linecap="round" />
                <line
                    :x1="railLeft(selectedSource.gates.length)"
                    y1="20"
                    :x2="railRight(selectedSource.gates.length)"
                    y2="20"
                    stroke="rgba(255,255,255,0.32)"
                    stroke-width="1" />
                <line
                    v-for="gate in activeGates"
                    :key="`feed-${gate.gateIndex}`"
                    :x1="slotCenterX(activeGateIndex(selectedSource, gate), selectedSource.gates.length)"
                    y1="20"
                    x2="50"
                    y2="58"
                    :stroke="`#${gate.colorHex}`"
                    stroke-width="3"
                    stroke-linecap="round" />
                <line x1="0" y1="20" x2="100" y2="20" stroke="transparent" />
            </svg>

            <div class="bambu-ams-half__extruder">
                <svg viewBox="0 0 64 70" class="bambu-ams-half__extruder-svg">
                    <rect x="22" y="6" width="20" height="14" rx="2" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" stroke-width="1" />
                    <rect
                        x="20"
                        y="20"
                        width="24"
                        height="22"
                        rx="2"
                        :fill="extruderBodyFill"
                        :stroke="extruderActive ? '#3caf50' : 'rgba(255,255,255,0.22)'"
                        stroke-width="1.4" />
                    <circle
                        cx="32"
                        cy="31"
                        r="5"
                        :fill="extruderActive ? '#3caf50' : 'transparent'"
                        :stroke="extruderActive ? '#3caf50' : 'rgba(255,255,255,0.32)'"
                        stroke-width="1.2" />
                    <polygon
                        points="26,42 38,42 34,52 30,52"
                        :fill="extruderActive ? '#3caf50' : 'rgba(255,255,255,0.18)'" />
                    <line
                        x1="32"
                        y1="52"
                        x2="32"
                        y2="64"
                        :stroke="loadedColorForExtruder"
                        :stroke-width="extruderActive ? 3 : 1"
                        stroke-linecap="round" />
                </svg>
                <div class="bambu-ams-half__extruder-label">{{ side === 'left' ? 'Left' : 'Right' }} Nozzle</div>
            </div>
        </div>
    </section>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import MmuUnitGateSpool from '@/components/panels/Mmu/MmuUnitGateSpool.vue'
import {
    mdiWaterPercent,
    mdiWhiteBalanceSunny,
    mdiAirHumidifier,
    mdiRefresh,
    mdiAlphaXBoxOutline,
} from '@mdi/js'

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
}

@Component({
    components: { MmuUnitGateSpool },
})
export default class BambuAmsNozzleHalf extends Mixins(BaseMixin) {
    mdiWaterPercent = mdiWaterPercent
    mdiWhiteBalanceSunny = mdiWhiteBalanceSunny
    mdiAirHumidifier = mdiAirHumidifier
    mdiRefresh = mdiRefresh
    mdiAlphaXBoxOutline = mdiAlphaXBoxOutline

    @Prop({ required: true }) readonly side!: 'left' | 'right'
    @Prop({ required: true }) readonly sources!: BambuAmsSource[]

    selectedIndex = 0

    @Watch('sources', { immediate: true })
    onSourcesChanged(next: BambuAmsSource[]) {
        if (this.selectedIndex >= next.length) this.selectedIndex = 0
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
        return this.anyActive
    }

    get loadedColorForExtruder(): string {
        return this.activeGates.length ? `#${this.activeGates[0].colorHex}` : 'rgba(255,255,255,0.14)'
    }

    get extruderBodyFill(): string {
        return this.extruderActive ? 'rgba(60,175,80,0.12)' : 'rgba(255,255,255,0.04)'
    }

    get pathsViewBox(): string {
        return '0 0 100 60'
    }

    slotCenterX(idx: number, total: number): number {
        // Distribute slot centers evenly across the viewBox (0..100).
        if (total <= 1) return 50
        const span = 80
        const start = 10
        return start + (span * idx) / (total - 1)
    }

    railLeft(total: number): number {
        return total <= 1 ? 35 : this.slotCenterX(0, total) - 2
    }

    railRight(total: number): number {
        return total <= 1 ? 65 : this.slotCenterX(total - 1, total) + 2
    }

    activeGateIndex(source: BambuAmsSource, gate: BambuAmsGate): number {
        return source.gates.findIndex((g) => g.gateIndex === gate.gateIndex)
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

.bambu-ams-tab__ams-icon {
    display: inline-flex;
    gap: 1px;
    padding: 2px 3px;
    background: rgba(0, 0, 0, 0.32);
    border-radius: 2px;
}

.bambu-ams-tab__ams-icon-bar {
    display: inline-block;
    width: 4px;
    height: 12px;
    border-radius: 1px;
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
}

.bambu-ams-half__topbar {
    display: flex;
    justify-content: flex-end;
}

.bambu-ams-humidity-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    background: #2b2b2b;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
}

.bambu-ams-humidity-chip:hover {
    background: #353535;
}

.bambu-ams-humidity-chip__icon {
    color: #79bff0 !important;
}

.bambu-ams-humidity-chip__state {
    color: rgba(255, 255, 255, 0.55) !important;
}

.bambu-ams-half__slotrow {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 4px;
    justify-items: center;
    padding: 0 8px;
}

.bambu-ams-half__slotrow--n1 {
    justify-content: center;
    grid-auto-columns: 80px;
}

.bambu-ams-half__slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 0;
    width: 100%;
}

.bambu-ams-half__slot-cap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 20px;
    min-width: 32px;
    padding: 0 8px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.7rem;
    font-weight: 600;
}

.bambu-ams-half__slot-cap--active {
    border-color: rgba(60, 175, 80, 0.85);
    color: #aef0b0;
}

.bambu-ams-half__slot-cap-icon {
    color: rgba(255, 255, 255, 0.45) !important;
}

.bambu-ams-half__slot-cap--active .bambu-ams-half__slot-cap-icon {
    color: #aef0b0 !important;
}

.bambu-ams-half__spool-svg {
    max-width: 100%;
    height: auto;
}

.bambu-ams-half__paths {
    width: 100%;
    height: 60px;
    margin-top: -6px;
}

.bambu-ams-half__extruder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.bambu-ams-half__extruder-svg {
    width: 64px;
    height: 70px;
}

.bambu-ams-half__extruder-label {
    color: rgba(255, 255, 255, 0.62);
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.02em;
}
</style>
