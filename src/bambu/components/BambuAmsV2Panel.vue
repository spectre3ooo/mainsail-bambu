<template>
    <panel
        v-if="showPanel"
        :icon="mdiMulticast"
        title="Bambu AMS (v2)"
        :collapsible="true"
        card-class="bambu-ams-panel">
        <template #buttons>
            <v-menu :offset-y="true" :close-on-content-click="false" left>
                <template #activator="{ on, attrs }">
                    <v-btn icon v-bind="attrs" title="AMS panel settings" v-on="on">
                        <v-icon>{{ mdiCog }}</v-icon>
                    </v-btn>
                </template>
                <v-list dense>
                    <v-list-item @click="toggleHideEmptyExternals">
                        <v-list-item-action>
                            <v-switch :input-value="hideEmptyExternals" dense hide-details readonly />
                        </v-list-item-action>
                        <v-list-item-title>Hide empty externals</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
        </template>
        <v-card-text class="bambu-ams-panel__body">
            <!-- auto-refill-off warning banner (unchanged from v1) -->
            <v-alert
                v-if="showAutoRefillBanner"
                type="info"
                dense
                dismissible
                class="mb-3"
                @input="onBannerDismiss">
                Auto-refill is OFF — backup pools won't trigger.
            </v-alert>

            <!-- v2 layout: every AMS / external unit shown at once (no
                 left/right nozzle split). Each tile carries its own L/R
                 extruder marker showing which nozzle it currently feeds. -->
            <div class="bambu-ams-v2-stack">
                <bambu-ams-unit-tile
                    v-for="src in unitSources"
                    :key="src.key"
                    :source="src"
                    :dual-extruder="hasDualExtruder"
                    @open-humidity="openHumidity"
                    @select-spool="onSelectSpool" />
            </div>

            <bambu-ams-humidity-modal
                v-model="humidityOpen"
                :unit-name="humiditySource ? humiditySource.displayName : ''"
                :humidity="humiditySource ? humiditySource.humidity : null"
                :temperature="humiditySource ? humiditySource.temperature : null"
                :dry-time-seconds="humiditySource ? humiditySource.dryTimeSeconds : 0"
                :ams-unit-id="humiditySource ? humiditySource.amsUnitId : null"
                :dryer="humiditySource ? humiditySource.dryer : null" />

            <spoolman-change-spool-dialog
                v-model="spoolDialogOpen"
                :set-active-spool="false"
                :allow-clear="true"
                @select-spool="onSpoolPicked"
                @clear-spool="onClearAssignment" />

            <tray-details-dialog
                :dialog="detailsOpen"
                :tray="detailsTray"
                :ams-name="detailsAmsName"
                :spoolman-spool="detailsSpoolmanSpool"
                @close="detailsOpen = false"
                @change-spool="onDetailsRequestChangeSpool"
                @clear-spool="onDetailsRequestClearSpool" />
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import { isBambuRakerBackend } from '@/bambu/detection'
import BambuAmsHumidityModal from '@/bambu/components/BambuAmsHumidityModal.vue'
import BambuAmsUnitTile, { BambuAmsUnitSource } from '@/bambu/components/BambuAmsUnitTile.vue'
import SpoolmanChangeSpoolDialog from '@/components/dialogs/SpoolmanChangeSpoolDialog.vue'
import TrayDetailsDialog from '@/bambu/components/TrayDetailsDialog.vue'
import { ServerSpoolmanStateSpool } from '@/store/server/spoolman/types'
import { mdiMulticast, mdiCog } from '@mdi/js'
import type { BambuAmsDryerState } from '@/bambu/components/BambuAmsNozzleHalf.vue'
import type { BambuNativeAmsView } from './BambuAmsPanel.helpers'

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

interface BambuNativeAmsTray {
    id: number
    global_index: number
    color_hex: string
    material: string
    sub_brands: string
    nozzle_temp_min: number
    nozzle_temp_max: number
    bed_temp: number
    tag_uid: string
    spool_id: number | null
}

interface BambuNativeAmsUnit {
    id: number
    name: string
    humidity_percent: number
    humidity_raw: number
    temperature_c: number
    dry_time_seconds: number
    bound_extruder_id?: number
    dryer?: BambuAmsDryerState | null
    trays: BambuNativeAmsTray[]
}

interface BambuNativeAmsBackupGroup {
    extruder_id: number
    tray_global_indexes: number[]
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
    nozzle_sources?: BambuNativeAmsActiveSource[]
    nozzle_view?: BambuNativeAmsView
    backup_groups?: BambuNativeAmsBackupGroup[]
    auto_refill_enabled?: boolean
}

@Component({
    components: {
        Panel,
        BambuAmsHumidityModal,
        BambuAmsUnitTile,
        SpoolmanChangeSpoolDialog,
        TrayDetailsDialog,
    },
})
export default class BambuAmsV2Panel extends Mixins(BaseMixin) {
    mdiMulticast = mdiMulticast
    mdiCog = mdiCog

    humidityOpen = false
    humiditySourceKey: string | null = null
    spoolDialogOpen = false
    pendingGateIndex: number | null = null

    detailsOpen = false
    detailsTray: BambuNativeAmsTray | null = null
    detailsAmsName = ''

    autoRefillBannerDismissed = false

    // Panel setting: hide external-spool tiles that have no spool loaded.
    // Persisted in localStorage so the choice survives reloads (prototype-
    // grade; a real release would route this through the gui settings store).
    private static readonly HIDE_EMPTY_EXT_KEY = 'bambuAmsV2.hideEmptyExternals'
    hideEmptyExternals = false

    created(): void {
        this.hideEmptyExternals =
            window.localStorage.getItem(BambuAmsV2Panel.HIDE_EMPTY_EXT_KEY) === '1'
    }

    toggleHideEmptyExternals(): void {
        this.hideEmptyExternals = !this.hideEmptyExternals
        window.localStorage.setItem(
            BambuAmsV2Panel.HIDE_EMPTY_EXT_KEY,
            this.hideEmptyExternals ? '1' : '0'
        )
    }

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
        // the i-th extruder (0 = right/MAIN, 1 = left/DEPUTY). -1 means
        // external (gate 0 in the mmu layout); null means nothing loaded.
        const sources = this.bambuAms?.nozzle_sources ?? []
        return sources.map((src) => {
            if (!src || src.type === 'none' || !src.type) return null
            if (src.type === 'external') return 0
            return src.global_index ?? null
        })
    }

    // Empty-state per external unit name ("Ext L" / "Ext R"), read from
    // nozzle_view. column.extruder_id 0 = right/MAIN (Ext R), 1 = left/
    // DEPUTY (Ext L); column.external.empty is true when no spool is loaded.
    get externalEmptyByName(): Record<string, boolean> {
        const out: Record<string, boolean> = {}
        for (const col of this.bambuAms?.nozzle_view?.columns ?? []) {
            if (!col.external) continue
            const name = col.extruder_id === 1 ? 'Ext L' : 'Ext R'
            out[name] = col.external.empty ?? false
        }
        return out
    }

    // One tile per mmu_machine unit (AMS + external), shown once. The
    // per-nozzle feed story lives in activeRightGate / activeLeftGate
    // instead of in a left/right column split.
    get unitSources(): BambuAmsUnitSource[] {
        const rGate = this.loadedGatePerNozzle[0] ?? null
        const lGate = this.hasDualExtruder ? this.loadedGatePerNozzle[1] ?? null : null

        // Pair each mmu_machine unit with its bambu_ams native unit BY NAME.
        // The two lists share identical AMS names ("AMS A" / "AMS B" /
        // "AMS HT"); ordinal pairing breaks because mmu_machine also lists
        // the per-side externals ("Ext L" / "Ext R") that bambu_ams omits.
        const nativeByName = new Map<string, BambuNativeAmsUnit>()
        for (const u of this.bambuAms?.units ?? []) nativeByName.set(u.name, u)

        const emptyByName = this.externalEmptyByName
        const out: BambuAmsUnitSource[] = []

        this.mmuMachineUnits.forEach((unit, unitIndex) => {
            const isExternal = unit.name.toLowerCase().startsWith('ext')
            const inRange = (g: number | null): boolean =>
                g !== null && g >= unit.first_gate && g < unit.first_gate + unit.num_gates
            const activeRightGate = inRange(rGate) ? rGate : null
            const activeLeftGate = inRange(lGate) ? lGate : null

            if (isExternal) {
                out.push({
                    key: `ext-${unit.first_gate}`,
                    type: 'ext',
                    displayName: unit.name,
                    unitIndex,
                    numGates: unit.num_gates,
                    firstGate: unit.first_gate,
                    humidity: null,
                    temperature: null,
                    dryTimeSeconds: 0,
                    drying: false,
                    dryer: null,
                    amsUnitId: null,
                    activeRightGate,
                    activeLeftGate,
                    empty: emptyByName[unit.name] ?? false,
                })
                return
            }

            const native = nativeByName.get(unit.name) ?? null
            out.push({
                key: `ams-${unit.first_gate}`,
                type: 'ams',
                displayName: native?.name || unit.name,
                unitIndex,
                numGates: unit.num_gates,
                firstGate: unit.first_gate,
                humidity: native && native.humidity_raw > 0 ? native.humidity_raw : null,
                temperature: native && native.temperature_c > 0 ? native.temperature_c : null,
                dryTimeSeconds: native?.dry_time_seconds ?? 0,
                drying: native?.dryer?.active ?? (native?.dry_time_seconds ?? 0) > 0,
                dryer: native?.dryer ?? null,
                amsUnitId: native?.id ?? null,
                activeRightGate,
                activeLeftGate,
                empty: false,
            })
        })

        // Display order: externals first, then by slot count ascending so
        // the narrow single-slot units (Ext, Ext, AMS HT) lead and the wide
        // 4-slot AMSes follow. Ties keep mmu order (first_gate), so Ext L
        // precedes Ext R and AMS A precedes AMS B.
        out.sort((a, b) => {
            const aExt = a.type === 'ext' ? 0 : 1
            const bExt = b.type === 'ext' ? 0 : 1
            if (aExt !== bExt) return aExt - bExt
            if (a.numGates !== b.numGates) return a.numGates - b.numGates
            return a.firstGate - b.firstGate
        })

        return this.hideEmptyExternals ? out.filter((s) => !(s.type === 'ext' && s.empty)) : out
    }

    get humiditySource(): BambuAmsUnitSource | null {
        if (!this.humiditySourceKey) return null
        return this.unitSources.find((src) => src.key === this.humiditySourceKey) ?? null
    }

    get detailsSpoolmanSpool(): ServerSpoolmanStateSpool | null {
        if (!this.detailsTray || !this.detailsTray.spool_id) return null
        const spools: ServerSpoolmanStateSpool[] = this.$store.state.server.spoolman?.spools || []
        return spools.find((s) => s.id === this.detailsTray!.spool_id) || null
    }

    get showAutoRefillBanner(): boolean {
        if (this.autoRefillBannerDismissed) return false
        const ba = this.bambuAms
        if (!ba) return false
        const hasGroups = (ba.backup_groups || []).length > 0
        return hasGroups && ba.auto_refill_enabled === false
    }

    openHumidity(source: BambuAmsUnitSource): void {
        this.humiditySourceKey = source.key
        this.humidityOpen = true
    }

    // Bridge from the gate-index emit (MmuUnitGate → tile → here) to the
    // richer TrayDetailsDialog flow. Identical to v1.
    onSelectSpool(gateIndex: number): void {
        const units = this.bambuAms?.units
        const ref = units ? this.gateIndexToAmsSlot(gateIndex) : null

        if (!units || !ref || ref.amsUnit === -1) {
            this.pendingGateIndex = gateIndex
            this.spoolDialogOpen = true
            return
        }

        const unit = units.find((u) => u.id === ref.amsUnit)
        const foundTray = unit?.trays.find((t) => t.id === ref.slot)
        if (!unit || !foundTray) {
            this.pendingGateIndex = gateIndex
            this.spoolDialogOpen = true
            return
        }

        this.pendingGateIndex = gateIndex
        this.detailsTray = foundTray
        this.detailsAmsName = unit.name || String(unit.id)
        this.detailsOpen = true
    }

    onDetailsRequestChangeSpool(): void {
        this.detailsOpen = false
        this.spoolDialogOpen = true
    }

    onDetailsRequestClearSpool(): void {
        this.detailsOpen = false
        if (this.pendingGateIndex === null) return
        this.onClearAssignment()
    }

    onBannerDismiss(): void {
        this.autoRefillBannerDismissed = true
    }

    onSpoolPicked(spool: ServerSpoolmanStateSpool): void {
        if (this.pendingGateIndex === null) return

        const slotId = this.pendingGateIndex
        this.pendingGateIndex = null
        const ref = this.gateIndexToAmsSlot(slotId)
        if (ref === null) {
            window.console.error('No AMS unit covers gate index', slotId)
            return
        }

        this.$store.dispatch('server/addEvent', {
            message: `Assign Spoolman spool ${spool.id} to AMS slot ${slotId}`,
            type: 'command',
        })

        fetch('/server/bambu/ams/map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ams_unit: ref.amsUnit,
                slot: ref.slot,
                spool_id: spool.id,
                push_to_printer: true,
            }),
        }).catch((err) => {
            window.console.error('Failed to assign spool to AMS slot', err)
            this.$store.dispatch('server/addEvent', {
                message: `Failed to assign spool ${spool.id} to slot ${slotId}: ${err}`,
                type: 'response',
            })
        })
    }

    onClearAssignment(): void {
        if (this.pendingGateIndex === null) return

        const slotId = this.pendingGateIndex
        this.pendingGateIndex = null
        const ref = this.gateIndexToAmsSlot(slotId)
        if (ref === null) {
            window.console.error('No AMS unit covers gate index', slotId)
            return
        }

        this.$store.dispatch('server/addEvent', {
            message: `Clear Spoolman assignment from AMS slot ${slotId}`,
            type: 'command',
        })

        const qs = new URLSearchParams({
            ams_unit: String(ref.amsUnit),
            slot: String(ref.slot),
        })
        fetch(`/server/bambu/ams/map?${qs.toString()}`, { method: 'DELETE' })
            .then((r) => {
                if (!r.ok && r.status !== 404) {
                    window.console.error('Failed to clear AMS slot assignment', r.status)
                    this.$store.dispatch('server/addEvent', {
                        message: `Failed to clear slot ${slotId}: HTTP ${r.status}`,
                        type: 'response',
                    })
                }
            })
            .catch((err) => {
                window.console.error('Failed to clear AMS slot assignment', err)
                this.$store.dispatch('server/addEvent', {
                    message: `Failed to clear slot ${slotId}: ${err}`,
                    type: 'response',
                })
            })
    }

    private gateIndexToAmsSlot(gateIndex: number): { amsUnit: number; slot: number } | null {
        let amsOrdinal = 0
        for (const unit of this.mmuMachineUnits) {
            const inRange = gateIndex >= unit.first_gate && gateIndex < unit.first_gate + unit.num_gates
            const isExternal = unit.name === 'Ext' || unit.name.toLowerCase() === 'ext'
            if (inRange) {
                if (isExternal) return { amsUnit: -1, slot: gateIndex - unit.first_gate }
                const native = this.bambuAms?.units?.[amsOrdinal] ?? null
                if (!native) return null
                return { amsUnit: native.id, slot: gateIndex - unit.first_gate }
            }
            if (!isExternal) amsOrdinal += 1
        }
        return null
    }

    private isMachineUnit(value: unknown): value is BambuMmuMachineUnit {
        return typeof value === 'object' && value !== null && 'num_gates' in value && 'first_gate' in value
    }
}
</script>

<style scoped>
.bambu-ams-panel__body {
    background: #1d1d1d;
    color: rgba(255, 255, 255, 0.88);
    padding: 16px 18px 18px !important;
}

.bambu-ams-v2-stack {
    /* Tiles flow left-to-right and wrap as whole units. On each row the
       first/last hug the edges and the rest are spaced equally
       (space-between). row-gap separates wrapped rows; column-gap is the
       minimum horizontal spacing that space-between then expands. */
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
</style>
