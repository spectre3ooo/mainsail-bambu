<template>
    <panel v-if="showPanel" :icon="mdiMulticast" title="Bambu AMS" :collapsible="true" card-class="bambu-ams-panel">
        <v-card-text class="bambu-ams-panel__body">
            <div class="bambu-ams-bay">
                <bambu-ams-nozzle-half
                    v-for="nozzle in nozzles"
                    :key="nozzle.side"
                    :side="nozzle.side"
                    :sources="nozzle.sources"
                    :is-active="nozzle.isActive"
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
                        :disabled="isPrinting"
                        class="bambu-ams-action-btn bambu-ams-action-btn--secondary"
                        :title="isPrinting ? 'Disabled while printing' : 'Unload filament from the active nozzle'"
                        @click="onUnloadClicked">
                        Unload
                    </v-btn>
                    <v-btn
                        small
                        :disabled="isPrinting"
                        class="bambu-ams-action-btn bambu-ams-action-btn--primary"
                        :title="isPrinting ? 'Disabled while printing' : 'Load filament from the selected slot'"
                        @click="onLoadClicked">
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
    // On dual-nozzle hardware: 0 = right nozzle (main extruder),
    // 1 = left nozzle (deputy), 0xE = both via FilaSwitch accessory.
    // Decoded from `print.ams.ams[i].info` bits 8-11.
    bound_extruder_id?: number
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
    // Per-nozzle source on dual-extruder hardware. `nozzle_sources[0]`
    // = left, `[1]` = right. Each entry has the same shape as
    // `active_source` and reflects what's actually loaded into THAT
    // specific nozzle. Empty array on single-extruder printers.
    nozzle_sources?: BambuNativeAmsActiveSource[]
}

interface NozzleView {
    side: 'left' | 'right'
    sources: BambuAmsSource[]
    loadedGate: number | null
    // True when this nozzle is the one currently being held at
    // printing temperature (target > 50 °C). Drives the green
    // "active extruder" highlight in BambuAmsNozzleHalf's SVG.
    isActive: boolean
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

    get loadedGatePerNozzle(): (number | null)[] {
        // bambu_ams.nozzle_sources[i].global_index is what's loaded into
        // the i-th extruder. -1 means external (gate 0 in the mmu layout).
        // null/undefined means no filament loaded.
        const sources = this.bambuAms?.nozzle_sources ?? []
        return sources.map((src) => {
            if (!src || src.type === 'none' || !src.type) return null
            if (src.type === 'external') return 0
            return src.global_index ?? null
        })
    }

    sourcesFor(nozzleIndex: number): BambuAmsSource[] {
        // nozzleIndex matches `extruder.info[i]` and Bambu's MAIN/DEPUTY
        // convention: 0 = right nozzle (main), 1 = left nozzle (deputy).
        // Filter AMS units by `bound_extruder_id` so each half shows
        // only the AMSes physically routed to that nozzle, matching how
        // Bambu Studio renders the per-nozzle tab strips.
        const loadedGate = this.loadedGatePerNozzle[nozzleIndex] ?? null
        const sources: BambuAmsSource[] = []
        let amsOrdinal = 0

        // mmuMachineUnits preserves the order of `mmu_machine.unit_N`,
        // so the array index IS the unit-index that MmuUnit expects.
        this.mmuMachineUnits.forEach((unit, unitIndex) => {
            const isExternal = unit.name === 'Ext' || unit.name.toLowerCase() === 'ext'
            const gates = this.buildGates(unit, isExternal, amsOrdinal, loadedGate)

            if (isExternal) {
                // External spool feeds both nozzles on H2C/H2D (tube
                // can be plugged into either inlet). Always include.
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
                    isFeeding: gates.some((g) => g.isActive),
                    gates,
                    unitIndex,
                })
            } else {
                const native = this.bambuAms?.units?.[amsOrdinal] ?? null
                amsOrdinal += 1
                const boundExt = native?.bound_extruder_id ?? 0
                // 0xE = bound to both via FilaSwitch — always visible.
                // Otherwise the AMS shows only on the matching nozzle's half.
                if (boundExt !== 0xE && boundExt !== nozzleIndex) return
                // Use the unit name straight from mmu_machine so the tab
                // label matches what MmuUnit's footer (also reading
                // unit.name from the store) renders. Fork-side ordinal
                // letters would diverge from the footer text.
                const displayName = native?.name || unit.name || `AMS ${amsOrdinal - 1}`
                sources.push({
                    key: `ams-${unit.first_gate}`,
                    type: 'ams',
                    label: displayName,
                    shortLabel: displayName,
                    swatchColors: gates.map((g) => `#${g.colorHex}`),
                    humidity: native && native.humidity_raw > 0 ? native.humidity_raw : null,
                    temperature: native && native.temperature_c > 0 ? native.temperature_c : null,
                    dryTimeSeconds: native?.dry_time_seconds ?? 0,
                    drying: (native?.dry_time_seconds ?? 0) > 0,
                    isFeeding: gates.some((g) => g.isActive),
                    gates,
                    unitIndex,
                })
            }
        })

        return sources
    }

    get sources(): BambuAmsSource[] {
        // Generic source list (no per-nozzle highlighting) — kept for
        // backwards compatibility with the humidity-modal lookup below.
        return this.sourcesFor(0)
    }

    get nozzles(): NozzleView[] {
        // Bambu's extruder indexing: info[0] = MAIN = right, info[1] = DEPUTY = left.
        // Display order is left-then-right to match BS's visual layout, but
        // the data indices point at the correct extruder per side.
        const rightTarget = this.$store.state.printer.extruder?.target ?? 0
        const leftTarget = this.$store.state.printer.extruder1?.target ?? 0
        const ACTIVE_TEMP_THRESHOLD = 50

        if (!this.hasDualExtruder) {
            return [
                {
                    side: 'left',
                    sources: this.sourcesFor(0),
                    loadedGate: this.loadedGatePerNozzle[0] ?? null,
                    isActive: rightTarget > ACTIVE_TEMP_THRESHOLD,
                },
            ]
        }
        return [
            {
                side: 'left',
                sources: this.sourcesFor(1),
                loadedGate: this.loadedGatePerNozzle[1] ?? null,
                isActive: leftTarget > ACTIVE_TEMP_THRESHOLD,
            },
            {
                side: 'right',
                sources: this.sourcesFor(0),
                loadedGate: this.loadedGatePerNozzle[0] ?? null,
                isActive: rightTarget > ACTIVE_TEMP_THRESHOLD,
            },
        ]
    }

    get humiditySource(): BambuAmsSource | null {
        if (!this.humiditySourceKey) return null

        return this.sources.find((src) => src.key === this.humiditySourceKey) ?? null
    }

    private buildGates(
        unit: BambuMmuMachineUnit,
        isExternal: boolean,
        amsOrdinal: number,
        loadedGate: number | null
    ): BambuAmsGate[] {
        const gates: BambuAmsGate[] = []

        for (let i = 0; i < unit.num_gates; i++) {
            const gateIndex = unit.first_gate + i
            const colorHex = this.normalizedColor(this.mmu?.gate_color?.[gateIndex] ?? '')
            gates.push({
                gateIndex,
                // Per-gate label is unused now that MmuUnit owns slot
                // labeling; left in the type for forward compatibility.
                label: isExternal ? 'Ext' : `${gateIndex}`,
                colorHex,
                // Active = "loaded into THIS specific nozzle right now".
                // Driven by bambu_ams.nozzle_sources, not the global
                // mmu.gate, so the two halves can show different active
                // slots simultaneously.
                isActive: loadedGate !== null && gateIndex === loadedGate,
            })
        }

        return gates
    }

    get isPrinting(): boolean {
        const state = this.$store.state.printer.print_stats?.state ?? ''
        return state === 'printing' || state === 'paused'
    }

    openHumidity(source: BambuAmsSource): void {
        this.humiditySourceKey = source.key
        this.humidityOpen = true
    }

    onSpoolClicked(gateIndex: number): void {
        this.pendingGateIndex = gateIndex
        this.spoolDialogOpen = true
    }

    onLoadClicked(): void {
        // Standard Klipper macro; bambu-raker's gcode translation handles
        // the actual Bambu MQTT command sequence (when implemented).
        this.sendGcode('LOAD_FILAMENT')
    }

    onUnloadClicked(): void {
        this.sendGcode('UNLOAD_FILAMENT')
    }

    private sendGcode(gcode: string): void {
        this.$store.dispatch('server/addEvent', { message: gcode, type: 'command' })
        this.$socket.emit('printer.gcode.script', { script: gcode })
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
