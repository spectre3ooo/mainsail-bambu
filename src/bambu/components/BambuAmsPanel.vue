<template>
    <panel v-if="showPanel" :icon="mdiMulticast" title="Bambu AMS" :collapsible="true" card-class="bambu-ams-panel">
        <v-card-text class="bambu-ams-panel__body">
            <div class="bambu-ams-bay">
                <bambu-ams-nozzle-half
                    v-for="nozzle in nozzles"
                    :key="nozzle.side"
                    :side="nozzle.side"
                    :sources="nozzle.sources"
                    @open-humidity="openHumidity"
                    @select-spool="onSpoolClicked" />
            </div>

            <div class="bambu-ams-actions">
                <div class="bambu-ams-actions-left">
                    <v-btn
                        outlined
                        small
                        disabled
                        class="bambu-ams-action-btn bambu-ams-action-btn--secondary"
                        title="Auto-refill not yet wired through bambu-raker">
                        <v-icon size="15" left>{{ mdiRefresh }}</v-icon>
                        Auto-refill
                    </v-btn>
                </div>
                <div class="bambu-ams-actions-right">
                    <v-btn
                        outlined
                        small
                        disabled
                        class="bambu-ams-action-btn bambu-ams-action-btn--secondary"
                        title="Unload not yet wired through bambu-raker">
                        Unload
                    </v-btn>
                    <v-btn
                        small
                        disabled
                        class="bambu-ams-action-btn bambu-ams-action-btn--primary"
                        title="Load not yet wired through bambu-raker">
                        Load
                    </v-btn>
                </div>
            </div>

            <bambu-ams-humidity-modal
                v-model="humidityOpen"
                :unit-name="humiditySource ? humiditySource.label : ''"
                :humidity="humiditySource ? humiditySource.humidity : null"
                :temperature="humiditySource ? humiditySource.temperature : null"
                :dry-time-seconds="humiditySource ? humiditySource.dryTimeSeconds : 0" />

            <spoolman-change-spool-dialog
                v-model="spoolDialogOpen"
                :set-active-spool="false"
                @select-spool="onSpoolPicked" />
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import { isBambuRakerBackend } from '@/bambu/detection'
import BambuAmsHumidityModal from '@/bambu/components/BambuAmsHumidityModal.vue'
import BambuAmsNozzleHalf, { BambuAmsGate, BambuAmsSource } from '@/bambu/components/BambuAmsNozzleHalf.vue'
import SpoolmanChangeSpoolDialog from '@/components/dialogs/SpoolmanChangeSpoolDialog.vue'
import { ServerSpoolmanStateSpool } from '@/store/server/spoolman/types'
import { mdiMulticast, mdiRefresh } from '@mdi/js'

interface BambuMmuState {
    is_in_print?: boolean
    print_state?: string
    gate?: number
    tool?: number
    gate_status?: number[]
    gate_color?: string[]
}

interface BambuMmuMachineUnit {
    name: string
    vendor: string
    num_gates: number
    first_gate: number
}

interface BambuMmuMachineState {
    num_units?: number
    [key: string]: number | BambuMmuMachineUnit | null | undefined
}

interface BambuNativeAmsUnit {
    id: number
    name: string
    humidity_percent: number
    humidity_raw: number
    temperature_c: number
    dry_time_seconds: number
}

interface BambuNativeAmsActiveSource {
    type: string
    unit_id: number | null
    tray_id: number | null
    global_index: number | null
}

interface BambuNativeAmsState {
    units?: BambuNativeAmsUnit[]
    external_spool?: unknown
    active_source?: BambuNativeAmsActiveSource
    external_feed_active?: boolean
}

interface NozzleView {
    side: 'left' | 'right'
    sources: BambuAmsSource[]
}

@Component({
    components: {
        Panel,
        BambuAmsHumidityModal,
        BambuAmsNozzleHalf,
        SpoolmanChangeSpoolDialog,
    },
})
export default class BambuAmsPanel extends Mixins(BaseMixin) {
    mdiMulticast = mdiMulticast
    mdiRefresh = mdiRefresh

    humidityOpen = false
    humiditySourceKey: string | null = null
    spoolDialogOpen = false
    pendingGateIndex: number | null = null

    get showPanel(): boolean {
        return this.klipperReadyForGui && this.isBambuRaker && this.mmuMachineUnits.length > 0
    }

    get isBambuRaker(): boolean {
        return isBambuRakerBackend(this.$store)
    }

    get hasDualExtruder(): boolean {
        return !!this.$store.state.printer.extruder1
    }

    get mmu(): BambuMmuState | null {
        return this.$store.state.printer.mmu ?? null
    }

    get mmuMachine(): BambuMmuMachineState | null {
        return this.$store.state.printer.mmu_machine ?? null
    }

    get bambuAms(): BambuNativeAmsState | null {
        return this.$store.state.printer.bambu_ams ?? null
    }

    get mmuMachineUnits(): BambuMmuMachineUnit[] {
        const machine = this.mmuMachine
        if (!machine?.num_units) return []

        const units: BambuMmuMachineUnit[] = []
        for (let i = 0; i < machine.num_units; i++) {
            const unit = machine[`unit_${i}`]
            if (this.isMachineUnit(unit)) units.push(unit)
        }

        return units
    }

    get activeGate(): number {
        // Source-of-truth for the currently-feeding global gate index.
        // bambu-raker keeps `mmu.gate` aligned with this regardless of
        // whether the source is an AMS slot or the external spool.
        // Per-nozzle filament tracking is not yet wired; both halves
        // currently reflect the same active gate.
        const mmu = this.mmu
        if (!mmu) return -1

        return mmu.gate ?? mmu.tool ?? -1
    }

    get sources(): BambuAmsSource[] {
        const sources: BambuAmsSource[] = []
        const amsLetters = ['A', 'B', 'C', 'D']
        let amsOrdinal = 0

        for (const unit of this.mmuMachineUnits) {
            const isExternal = unit.name === 'Ext' || unit.name.toLowerCase() === 'ext'
            const gates = this.buildGates(unit, isExternal, amsOrdinal)

            if (isExternal) {
                sources.push({
                    key: `ext-${unit.first_gate}`,
                    type: 'ext',
                    label: 'External spool',
                    shortLabel: 'Ext',
                    swatchColors: gates.map((g) => `#${g.colorHex}`),
                    humidity: null,
                    temperature: null,
                    dryTimeSeconds: 0,
                    drying: false,
                    isFeeding: this.bambuAms?.external_feed_active ?? gates.some((g) => g.isActive),
                    gates,
                })
            } else {
                const native = this.bambuAms?.units?.[amsOrdinal] ?? null
                const letter = amsLetters[amsOrdinal] ?? `${amsOrdinal + 1}`
                amsOrdinal += 1
                sources.push({
                    key: `ams-${unit.first_gate}`,
                    type: 'ams',
                    label: `AMS ${letter}`,
                    shortLabel: `AMS ${letter}`,
                    swatchColors: gates.map((g) => `#${g.colorHex}`),
                    humidity: native && native.humidity_raw > 0 ? native.humidity_raw : null,
                    temperature: native && native.temperature_c > 0 ? native.temperature_c : null,
                    dryTimeSeconds: native?.dry_time_seconds ?? 0,
                    drying: (native?.dry_time_seconds ?? 0) > 0,
                    isFeeding: gates.some((g) => g.isActive),
                    gates,
                })
            }
        }

        return sources
    }

    get nozzles(): NozzleView[] {
        const sources = this.sources
        const views: NozzleView[] = [{ side: 'left', sources }]
        if (this.hasDualExtruder) views.push({ side: 'right', sources })

        return views
    }

    get humiditySource(): BambuAmsSource | null {
        if (!this.humiditySourceKey) return null

        return this.sources.find((src) => src.key === this.humiditySourceKey) ?? null
    }

    private buildGates(unit: BambuMmuMachineUnit, isExternal: boolean, amsOrdinal: number): BambuAmsGate[] {
        const letter = isExternal ? '' : (['A', 'B', 'C', 'D'][amsOrdinal] ?? `${amsOrdinal + 1}`)
        const gates: BambuAmsGate[] = []

        for (let i = 0; i < unit.num_gates; i++) {
            const gateIndex = unit.first_gate + i
            const colorHex = this.normalizedColor(this.mmu?.gate_color?.[gateIndex] ?? '')
            gates.push({
                gateIndex,
                label: isExternal ? 'Ext' : `${letter}${i + 1}`,
                colorHex,
                isActive: this.isPrintingState && gateIndex === this.activeGate,
            })
        }

        return gates
    }

    get isPrintingState(): boolean {
        const mmu = this.mmu
        if (!mmu) return false

        return mmu.is_in_print === true || ['printing', 'paused'].includes(mmu.print_state ?? '')
    }

    openHumidity(source: BambuAmsSource): void {
        this.humiditySourceKey = source.key
        this.humidityOpen = true
    }

    onSpoolClicked(gateIndex: number): void {
        this.pendingGateIndex = gateIndex
        this.spoolDialogOpen = true
    }

    onSpoolPicked(spool: ServerSpoolmanStateSpool): void {
        if (this.pendingGateIndex === null) return

        const slotId = this.pendingGateIndex
        this.pendingGateIndex = null

        // POST to bambu-raker's AMS map endpoint with push_to_printer so
        // the slot label, Spoolman backlink, AND the printer's onboard
        // filament setting all sync in one round-trip.
        this.$store.dispatch('server/addEvent', {
            message: `Assign Spoolman spool ${spool.id} to AMS slot ${slotId}`,
            type: 'command',
        })

        fetch('/server/bambu/ams/map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slot_id: slotId,
                spool_id: spool.id,
                push_to_printer: true,
            }),
        }).catch((err) => {
            // Surface the failure loudly rather than letting the UI claim success.
            window.console.error('Failed to assign spool to AMS slot', err)
            this.$store.dispatch('server/addEvent', {
                message: `Failed to assign spool ${spool.id} to slot ${slotId}: ${err}`,
                type: 'response',
            })
        })
    }

    private isMachineUnit(value: unknown): value is BambuMmuMachineUnit {
        return typeof value === 'object' && value !== null && 'num_gates' in value && 'first_gate' in value
    }

    private normalizedColor(value: string): string {
        const color = value.replace(/^#/, '').slice(0, 6)
        return /^[0-9a-fA-F]{6}$/.test(color) ? color : '303030'
    }
}
</script>

<style scoped>
.bambu-ams-panel__body {
    background: #1d1d1d;
    color: rgba(255, 255, 255, 0.88);
    padding: 16px 18px 18px !important;
}

.bambu-ams-bay {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: stretch;
}

.bambu-ams-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 14px;
}

.bambu-ams-actions-left,
.bambu-ams-actions-right {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.bambu-ams-action-btn {
    text-transform: none !important;
    letter-spacing: 0.01em !important;
    font-weight: 600 !important;
    min-width: 92px !important;
}

.bambu-ams-action-btn--secondary {
    background: #2b2b2b !important;
    color: rgba(255, 255, 255, 0.85) !important;
    border-color: rgba(255, 255, 255, 0.14) !important;
}

.bambu-ams-action-btn--primary {
    background: #3caf50 !important;
    color: #fff !important;
}

.bambu-ams-action-btn--primary.v-btn--disabled {
    background: rgba(60, 175, 80, 0.42) !important;
    color: rgba(255, 255, 255, 0.7) !important;
}

@media (max-width: 820px) {
    .bambu-ams-bay {
        flex-direction: column;
    }

    .bambu-ams-actions {
        flex-direction: column;
        align-items: stretch;
    }

    .bambu-ams-actions-left,
    .bambu-ams-actions-right {
        justify-content: space-between;
    }
}
</style>
