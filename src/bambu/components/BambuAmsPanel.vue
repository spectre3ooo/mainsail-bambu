<template>
    <panel v-if="showPanel" :icon="mdiMulticast" title="Bambu AMS" :collapsible="true" card-class="bambu-ams-panel">
        <v-card-text class="bambu-ams-panel__body">
            <v-alert v-if="missingWeightData" dense text type="info" class="mb-4">
                Remaining spool weight is unavailable for at least one loaded slot.
            </v-alert>

            <v-alert v-if="externalFeedActive" dense text color="success" class="mb-4">
                External spool feed is active. AMS slots are shown read-only until the feed path changes.
            </v-alert>

            <div v-for="unit in units" :key="unit.key" class="bambu-ams-unit mb-4">
                <div class="bambu-ams-unit__header mb-2">
                    <div>
                        <div class="text-subtitle-1 font-weight-medium white--text">{{ unit.title }}</div>
                        <div class="text-caption text--secondary">{{ unit.subtitle }}</div>
                    </div>
                    <div class="bambu-ams-unit__chips">
                        <v-chip x-small label color="rgba(255, 255, 255, 0.08)">
                            {{ unit.loadedCount }} / {{ unit.slots.length }} loaded
                        </v-chip>
                        <v-chip v-if="unit.humidity !== null" x-small label color="success" text-color="white">
                            {{ unit.humidity }}% RH
                        </v-chip>
                    </div>
                </div>

                <div class="bambu-ams-slots">
                    <div
                        v-for="slot in unit.slots"
                        :key="slot.gate"
                        class="bambu-ams-slot"
                        :class="{ 'bambu-ams-slot--active': slot.active, 'bambu-ams-slot--empty': !slot.loaded }"
                        :style="slotStyle(slot)">
                        <div class="bambu-ams-slot__topline">
                            <span class="bambu-ams-slot__label">{{ slot.label }}</span>
                            <span class="bambu-ams-slot__swatch" :style="swatchStyle(slot)" />
                        </div>

                        <div class="bambu-ams-slot__name text-truncate">
                            {{ slot.name }}
                        </div>
                        <div class="bambu-ams-slot__meta text-truncate">
                            {{ slot.materialText }}
                        </div>

                        <div class="bambu-ams-slot__details mt-3">
                            <span v-if="slot.humidity !== null">{{ slot.humidity }}% RH</span>
                            <span v-if="slot.temperature > 0">{{ slot.temperature }} C nozzle</span>
                            <span v-if="slot.weight !== null">{{ slot.weight }} g left</span>
                            <span v-if="slot.spoolId !== null">Spool #{{ slot.spoolId }}</span>
                            <span v-if="slot.rfid">RFID {{ slot.rfid }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import { isBambuRakerBackend } from '@/bambu/detection'
import { ServerSpoolmanStateSpool } from '@/store/server/spoolman/types'
import { mdiMulticast } from '@mdi/js'

interface BambuMmuState {
    is_in_print?: boolean
    print_state?: string
    gate?: number
    tool?: number
    gate_status?: number[]
    gate_filament_name?: string[]
    gate_material?: string[]
    gate_color?: string[]
    gate_temperature?: number[]
    gate_spool_id?: number[]
    gate_humidity?: number[]
    gate_tag_uid?: string[]
    gate_sub_brands?: string[]
    gate_weight_g?: number[]
}

interface BambuMmuMachineUnit {
    name: string
    vendor: string
    num_gates: number
    first_gate: number
    selector_type: string
}

interface BambuMmuMachineState {
    num_units?: number
    [key: string]: number | BambuMmuMachineUnit | null | undefined
}

interface BambuNativeAmsTray {
    id: number
    global_index: number
    empty: boolean
    color_hex: string
    material: string
    sub_brands: string
    tray_info_idx: string
    nozzle_temp_min: number
    nozzle_temp_max: number
    bed_temp: number
    tag_uid: string
    tray_uuid: string
    total_len_mm: number
    weight_g: number
    spool_id: number | null
}

interface BambuNativeAmsUnit {
    id: number
    name: string
    humidity_percent: number
    humidity_raw: number
    temperature_c: number
    dry_time_seconds: number
    trays: BambuNativeAmsTray[]
}

interface BambuNativeAmsActiveSource {
    type: string
    unit_id: number | null
    tray_id: number | null
    global_index: number | null
}

interface BambuNativeAmsState {
    units?: BambuNativeAmsUnit[]
    external_spool?: BambuNativeAmsTray | null
    active_source?: BambuNativeAmsActiveSource
    external_feed_active?: boolean
}

interface BambuAmsSlot {
    gate: number
    label: string
    loaded: boolean
    active: boolean
    name: string
    materialText: string
    manufacturer: string
    color: string
    humidity: number | null
    temperature: number
    spoolId: number | null
    rfid: string
    weight: number | null
}

interface BambuAmsUnitView {
    key: string
    title: string
    subtitle: string
    humidity: number | null
    loadedCount: number
    slots: BambuAmsSlot[]
}

@Component({
    components: {
        Panel,
    },
})
export default class BambuAmsPanel extends Mixins(BaseMixin) {
    mdiMulticast = mdiMulticast

    get showPanel(): boolean {
        return this.klipperReadyForGui && this.isBambuRaker && this.units.length > 0
    }

    get isBambuRaker(): boolean {
        return isBambuRakerBackend(this.$store)
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

    get spoolmanSpools(): ServerSpoolmanStateSpool[] {
        return this.$store.state.server.spoolman?.spools ?? []
    }

    get hasNativeAmsData(): boolean {
        const native = this.bambuAms
        if (!native) return false

        return (native.units?.length ?? 0) > 0 || native.external_spool != null
    }

    get units(): BambuAmsUnitView[] {
        if (this.hasNativeAmsData) return this.nativeUnits

        return this.compatUnits
    }

    get nativeUnits(): BambuAmsUnitView[] {
        const native = this.bambuAms
        if (!native) return []

        const units: BambuAmsUnitView[] = []
        if (native.external_spool) {
            const externalSlot = this.buildNativeSlot(native.external_spool, 'Ext', null)
            units.push({
                key: 'external',
                title: 'External spool',
                subtitle: 'Direct feed path',
                humidity: null,
                loadedCount: externalSlot.loaded ? 1 : 0,
                slots: [externalSlot],
            })
        }

        const amsUnits = native.units ?? []
        amsUnits.forEach((unit, index) => {
            const letter = String.fromCharCode(65 + index)
            const unitHumidity = unit.humidity_raw > 0 ? unit.humidity_raw : null
            const slots = unit.trays.map((tray, trayIndex) =>
                this.buildNativeSlot(tray, `${letter}${trayIndex + 1}`, unitHumidity)
            )
            const subtitleParts = [`${unit.trays.length} slot Bambu AMS unit`]
            if (unit.temperature_c > 0) subtitleParts.push(`${unit.temperature_c.toFixed(1)} C`)
            if (unit.dry_time_seconds > 0) subtitleParts.push(`${Math.ceil(unit.dry_time_seconds / 60)} min dry time`)

            units.push({
                key: `native-${unit.id}`,
                title: `AMS ${letter}`,
                subtitle: subtitleParts.join(' · '),
                humidity: unitHumidity,
                loadedCount: slots.filter((slot) => slot.loaded).length,
                slots,
            })
        })

        return units
    }

    get compatUnits(): BambuAmsUnitView[] {
        const machine = this.mmuMachine
        if (!this.mmu || !machine?.num_units) return []

        const units: BambuAmsUnitView[] = []
        let amsOrdinal = 0

        for (let index = 0; index < machine.num_units; index++) {
            const unit = machine[`unit_${index}`]
            if (!this.isMachineUnit(unit)) continue

            const isExternal = unit.name === 'Ext'
            const letter = isExternal ? '' : String.fromCharCode(65 + amsOrdinal++)
            const slots = this.buildCompatSlots(unit, letter, isExternal)
            const humidities = slots.map((slot) => slot.humidity).filter((value): value is number => value !== null)
            const humidity = humidities.length
                ? Math.round(humidities.reduce((sum, value) => sum + value, 0) / humidities.length)
                : null

            units.push({
                key: `${index}-${unit.first_gate}`,
                title: isExternal ? 'External spool' : `AMS ${letter}`,
                subtitle: isExternal ? 'Direct feed path' : `${unit.num_gates} slot Bambu AMS unit`,
                humidity,
                loadedCount: slots.filter((slot) => slot.loaded).length,
                slots,
            })
        }

        return units
    }

    get externalFeedActive(): boolean {
        if (this.hasNativeAmsData) return this.bambuAms?.external_feed_active ?? false

        return this.units.some((unit) => unit.title === 'External spool' && unit.slots.some((slot) => slot.active))
    }

    get missingWeightData(): boolean {
        return this.units.some((unit) => unit.slots.some((slot) => slot.loaded && slot.weight === null))
    }

    slotStyle(slot: BambuAmsSlot): Record<string, string> {
        return {
            '--bambu-slot-color': `#${slot.color}`,
            '--bambu-slot-tint': this.colorTint(slot.color),
        }
    }

    swatchStyle(slot: BambuAmsSlot): Record<string, string> {
        return {
            backgroundColor: `#${slot.color}`,
        }
    }

    private buildNativeSlot(
        tray: BambuNativeAmsTray,
        label: string,
        humidity: number | null
    ): BambuAmsSlot {
        const loaded = !tray.empty
        const material = tray.material ?? ''
        const subBrand = tray.sub_brands ?? ''
        const spoolId = typeof tray.spool_id === 'number' && tray.spool_id >= 0 ? tray.spool_id : null
        const manufacturer = this.manufacturerForSpoolId(spoolId)
        const color = this.normalizedColor(tray.color_hex ?? '')

        return {
            gate: tray.global_index,
            label,
            loaded,
            active: this.isNativeActiveTray(tray),
            name: loaded ? subBrand || material || 'Loaded spool' : 'Empty',
            materialText: loaded
                ? [manufacturer, material, subBrand && subBrand !== material ? subBrand : '']
                      .filter(Boolean)
                      .join(' · ')
                : 'No spool loaded',
            manufacturer,
            color,
            humidity,
            temperature: tray.nozzle_temp_max ?? 0,
            spoolId,
            rfid: this.shortRfid(tray.tag_uid ?? ''),
            weight: typeof tray.weight_g === 'number' && tray.weight_g > 0 ? tray.weight_g : null,
        }
    }

    private buildCompatSlots(unit: BambuMmuMachineUnit, letter: string, isExternal: boolean): BambuAmsSlot[] {
        const slots: BambuAmsSlot[] = []
        for (let offset = 0; offset < unit.num_gates; offset++) {
            const gate = unit.first_gate + offset
            slots.push(this.buildCompatSlot(gate, isExternal ? 'Ext' : `${letter}${offset + 1}`))
        }

        return slots
    }

    private buildCompatSlot(gate: number, label: string): BambuAmsSlot {
        const mmu = this.mmu
        const loaded = (mmu?.gate_status?.[gate] ?? 0) > 0
        const material = mmu?.gate_material?.[gate] ?? ''
        const subBrand = mmu?.gate_sub_brands?.[gate] ?? ''
        const filamentName = mmu?.gate_filament_name?.[gate] ?? ''
        const tagUid = mmu?.gate_tag_uid?.[gate] ?? ''
        const spoolId = mmu?.gate_spool_id?.[gate] ?? -1
        const mappedSpoolId = spoolId >= 0 ? spoolId : null
        const manufacturer = this.manufacturerForSpoolId(mappedSpoolId)
        const humidity = mmu?.gate_humidity?.[gate] ?? null
        const weight = mmu?.gate_weight_g?.[gate] ?? null
        const color = this.normalizedColor(mmu?.gate_color?.[gate] ?? '')

        return {
            gate,
            label,
            loaded,
            active: this.isCompatActiveGate(gate),
            name: loaded ? filamentName || subBrand || material || 'Loaded spool' : 'Empty',
            materialText: loaded
                ? [manufacturer, material, subBrand && subBrand !== filamentName ? subBrand : '']
                      .filter(Boolean)
                      .join(' · ')
                : 'No spool loaded',
            manufacturer,
            color,
            humidity: typeof humidity === 'number' && humidity > 0 ? humidity : null,
            temperature: mmu?.gate_temperature?.[gate] ?? 0,
            spoolId: mappedSpoolId,
            rfid: this.shortRfid(tagUid),
            weight: typeof weight === 'number' && weight > 0 ? weight : null,
        }
    }

    private isNativeActiveTray(tray: BambuNativeAmsTray): boolean {
        const source = this.bambuAms?.active_source
        if (!source) return false
        if (source.type === 'external') return tray.global_index === -1
        if (source.type !== 'ams') return false

        return source.global_index === tray.global_index
    }

    private isCompatActiveGate(gate: number): boolean {
        const mmu = this.mmu
        const activeGate = mmu?.gate ?? mmu?.tool ?? -1
        return activeGate === gate && (mmu?.is_in_print === true || ['printing', 'paused'].includes(mmu?.print_state ?? ''))
    }

    private isMachineUnit(value: unknown): value is BambuMmuMachineUnit {
        return typeof value === 'object' && value !== null && 'num_gates' in value && 'first_gate' in value
    }

    private manufacturerForSpoolId(spoolId: number | null): string {
        if (spoolId === null) return ''

        const spool = this.spoolmanSpools.find((spool) => spool.id === spoolId)
        const name = spool?.filament?.vendor?.name
        return typeof name === 'string' ? name.trim() : ''
    }

    private normalizedColor(value: string): string {
        const color = value.replace(/^#/, '').slice(0, 6)
        return /^[0-9a-fA-F]{6}$/.test(color) ? color : '303030'
    }

    private colorTint(color: string): string {
        const r = parseInt(color.slice(0, 2), 16)
        const g = parseInt(color.slice(2, 4), 16)
        const b = parseInt(color.slice(4, 6), 16)
        return `rgba(${r}, ${g}, ${b}, 0.16)`
    }

    private shortRfid(value: string): string {
        if (!value || /^0+$/.test(value)) return ''
        return value.length <= 8 ? value : value.slice(-8)
    }
}
</script>

<style scoped>
.bambu-ams-panel__body {
    background: #1f1f1f;
}

.bambu-ams-unit__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.bambu-ams-unit__chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
}

.bambu-ams-slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    gap: 10px;
}

.bambu-ams-slot {
    min-height: 154px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background:
        linear-gradient(145deg, var(--bambu-slot-tint), transparent 58%),
        #252525;
    color: inherit;
    text-align: left;
}

.bambu-ams-slot--active {
    border-color: #3caf50;
    box-shadow: 0 0 0 1px rgba(60, 175, 80, 0.8), 0 0 18px rgba(60, 175, 80, 0.25);
}

.bambu-ams-slot--empty {
    opacity: 0.58;
}

.bambu-ams-slot__topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.bambu-ams-slot__label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #3caf50;
}

.bambu-ams-slot__swatch {
    width: 22px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 50%;
}

.bambu-ams-slot__name {
    margin-top: 14px;
    font-size: 1rem;
    font-weight: 600;
    color: #fff;
}

.bambu-ams-slot__meta {
    min-height: 18px;
    color: rgba(255, 255, 255, 0.62);
    font-size: 0.78rem;
}

.bambu-ams-slot__details {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.bambu-ams-slot__details span {
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.74);
    font-size: 0.7rem;
}
</style>
