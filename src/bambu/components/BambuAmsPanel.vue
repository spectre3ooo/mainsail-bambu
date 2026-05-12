<template>
    <panel v-if="showPanel" :icon="mdiMulticast" title="Bambu AMS" :collapsible="true" card-class="bambu-ams-panel">
        <v-card-text class="bambu-ams-panel__body">
            <div class="bambu-ams-toolbar">
                <div
                    v-for="unit in unitsWithHumidity"
                    :key="`hum-${unit.key}`"
                    class="bambu-ams-humidity-chip"
                    role="button"
                    tabindex="0"
                    @click="openHumidity(unit)"
                    @keydown.enter="openHumidity(unit)"
                    @keydown.space.prevent="openHumidity(unit)">
                    <v-icon size="14" class="bambu-ams-humidity-chip-icon">{{ mdiWaterPercent }}</v-icon>
                    <span class="bambu-ams-humidity-chip-value">{{ unit.humidity }}%</span>
                    <v-icon size="14" class="bambu-ams-humidity-chip-state">{{
                        unit.drying ? mdiAirHumidifier : mdiWhiteBalanceSunny
                    }}</v-icon>
                </div>
            </div>

            <div class="bambu-ams-bay">
                <section v-if="externalUnit" class="bambu-ams-section bambu-ams-section--ext">
                    <div class="bambu-ams-section-header">Ext</div>
                    <div class="bambu-ams-slotrow bambu-ams-slotrow--solo">
                        <div
                            v-for="slot in externalUnit.slots"
                            :key="slot.key"
                            class="bambu-ams-slot-wrap">
                            <div class="bambu-ams-slot-cap bambu-ams-slot-cap--ext">
                                <span class="bambu-ams-slot-cap-label">{{ slot.label }}</span>
                            </div>
                            <div
                                class="bambu-ams-slot"
                                :class="slotClasses(slot)"
                                :style="slotStyle(slot)"
                                role="button"
                                tabindex="0"
                                @click="openSlotEdit(slot)"
                                @keydown.enter="openSlotEdit(slot)">
                                <div class="bambu-ams-slot-material">{{ slot.materialLabel }}</div>
                                <v-icon size="14" class="bambu-ams-slot-edit">{{ mdiPencil }}</v-icon>
                            </div>
                        </div>
                    </div>
                    <div class="bambu-ams-rail bambu-ams-rail--ext" />
                </section>

                <section
                    v-for="unit in amsUnits"
                    :key="unit.key"
                    class="bambu-ams-section bambu-ams-section--ams"
                    :class="{ 'bambu-ams-section--blocked': externalFeedActive }">
                    <div class="bambu-ams-section-header">{{ unit.title }}</div>
                    <div class="bambu-ams-slotrow">
                        <div v-for="slot in unit.slots" :key="slot.key" class="bambu-ams-slot-wrap">
                            <div class="bambu-ams-slot-cap" :class="{ 'bambu-ams-slot-cap--active': slot.active }">
                                <v-icon size="11" class="bambu-ams-slot-cap-icon">{{ mdiRefresh }}</v-icon>
                                <span class="bambu-ams-slot-cap-label">{{ slot.label }}</span>
                            </div>
                            <div
                                class="bambu-ams-slot"
                                :class="slotClasses(slot)"
                                :style="slotStyle(slot)"
                                role="button"
                                tabindex="0"
                                @click="openSlotEdit(slot)"
                                @keydown.enter="openSlotEdit(slot)">
                                <div class="bambu-ams-slot-material">{{ slot.materialLabel }}</div>
                                <v-icon size="14" class="bambu-ams-slot-edit">{{ mdiPencil }}</v-icon>
                            </div>
                        </div>
                    </div>
                    <div class="bambu-ams-rail" />
                </section>
            </div>

            <div class="bambu-ams-hub-row">
                <div class="bambu-ams-hub" :title="hubTitle">
                    <v-icon size="14" class="bambu-ams-hub-icon">{{ mdiCog }}</v-icon>
                    <v-icon size="14" class="bambu-ams-hub-icon">{{ mdiCog }}</v-icon>
                </div>
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
                    <v-icon
                        size="22"
                        class="bambu-ams-actions-retract"
                        :title="'Retract path indicator'">{{ mdiCircleSlice8 }}</v-icon>
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
                :unit-name="humidityUnit?.title ?? ''"
                :humidity="humidityUnit?.humidity ?? null"
                :temperature="humidityUnit?.temperature ?? null"
                :dry-time-seconds="humidityUnit?.dryTimeSeconds ?? 0" />
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import { isBambuRakerBackend } from '@/bambu/detection'
import { ServerSpoolmanStateSpool } from '@/store/server/spoolman/types'
import BambuAmsHumidityModal from '@/bambu/components/BambuAmsHumidityModal.vue'
import {
    mdiMulticast,
    mdiWaterPercent,
    mdiWhiteBalanceSunny,
    mdiAirHumidifier,
    mdiRefresh,
    mdiPencil,
    mdiCog,
    mdiCircleSlice8,
} from '@mdi/js'

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
    key: string
    gate: number
    label: string
    loaded: boolean
    active: boolean
    isExternal: boolean
    materialLabel: string
    detail: string
    manufacturer: string
    subBrand: string
    color: string
    isLightColor: boolean
    humidity: number | null
    temperature: number
    spoolId: number | null
    weight: number | null
    remainingPercent: number | null
    tagUid: string
    trayInfoIdx: string
}

interface BambuAmsUnitView {
    key: string
    title: string
    external: boolean
    humidity: number | null
    temperature: number | null
    dryTimeSeconds: number
    drying: boolean
    loadedCount: number
    slots: BambuAmsSlot[]
}

@Component({
    components: {
        Panel,
        BambuAmsHumidityModal,
    },
})
export default class BambuAmsPanel extends Mixins(BaseMixin) {
    mdiMulticast = mdiMulticast
    mdiWaterPercent = mdiWaterPercent
    mdiWhiteBalanceSunny = mdiWhiteBalanceSunny
    mdiAirHumidifier = mdiAirHumidifier
    mdiRefresh = mdiRefresh
    mdiPencil = mdiPencil
    mdiCog = mdiCog
    mdiCircleSlice8 = mdiCircleSlice8

    humidityOpen = false
    humidityUnitKey: string | null = null

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

    get amsUnits(): BambuAmsUnitView[] {
        return this.units.filter((unit) => !unit.external)
    }

    get externalUnit(): BambuAmsUnitView | null {
        return this.units.find((unit) => unit.external) ?? null
    }

    get unitsWithHumidity(): BambuAmsUnitView[] {
        return this.amsUnits.filter((unit) => unit.humidity !== null)
    }

    get humidityUnit(): BambuAmsUnitView | null {
        if (!this.humidityUnitKey) return null

        return this.units.find((unit) => unit.key === this.humidityUnitKey) ?? null
    }

    get externalFeedActive(): boolean {
        if (this.hasNativeAmsData) return this.bambuAms?.external_feed_active ?? false

        return this.units.some((unit) => unit.external && unit.slots.some((slot) => slot.active))
    }

    get hubTitle(): string {
        return this.externalFeedActive ? 'External spool feeding' : 'AMS hub'
    }

    get nativeUnits(): BambuAmsUnitView[] {
        const native = this.bambuAms
        if (!native) return []

        const units: BambuAmsUnitView[] = []
        if (native.external_spool) {
            const slot = this.buildNativeSlot(native.external_spool, 'Ext', null, true)
            units.push({
                key: 'external',
                title: 'External',
                external: true,
                humidity: null,
                temperature: null,
                dryTimeSeconds: 0,
                drying: false,
                loadedCount: slot.loaded ? 1 : 0,
                slots: [slot],
            })
        }

        const amsUnits = native.units ?? []
        amsUnits.forEach((unit, index) => {
            const letter = String.fromCharCode(65 + index)
            const unitHumidity = unit.humidity_raw > 0 ? unit.humidity_raw : null
            const slots = unit.trays.map((tray, trayIndex) =>
                this.buildNativeSlot(tray, `${letter}${trayIndex + 1}`, unitHumidity, false)
            )
            units.push({
                key: `native-${unit.id}`,
                title: `AMS ${letter}`,
                external: false,
                humidity: unitHumidity,
                temperature: unit.temperature_c > 0 ? unit.temperature_c : null,
                dryTimeSeconds: unit.dry_time_seconds,
                drying: unit.dry_time_seconds > 0,
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
                title: isExternal ? 'External' : `AMS ${letter}`,
                external: isExternal,
                humidity,
                temperature: null,
                dryTimeSeconds: 0,
                drying: false,
                loadedCount: slots.filter((slot) => slot.loaded).length,
                slots,
            })
        }

        return units
    }

    slotStyle(slot: BambuAmsSlot): Record<string, string> {
        if (!slot.loaded) return {}

        return {
            '--bambu-slot-color': `#${slot.color}`,
            '--bambu-slot-fg': slot.isLightColor ? '#1d1d1d' : '#ffffff',
            '--bambu-slot-fg-dim': slot.isLightColor ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)',
        }
    }

    slotClasses(slot: BambuAmsSlot): Record<string, boolean> {
        return {
            'bambu-ams-slot--active': slot.active,
            'bambu-ams-slot--empty': !slot.loaded,
            'bambu-ams-slot--light': slot.loaded && slot.isLightColor,
        }
    }

    openHumidity(unit: BambuAmsUnitView): void {
        this.humidityUnitKey = unit.key
        this.humidityOpen = true
    }

    openSlotEdit(_slot: BambuAmsSlot): void {
        // Phase 3 Task 3.2 — slot-edit dialog. Not yet implemented.
    }

    private buildNativeSlot(
        tray: BambuNativeAmsTray,
        label: string,
        humidity: number | null,
        isExternal: boolean
    ): BambuAmsSlot {
        const loaded = !tray.empty
        const material = tray.material ?? ''
        const subBrand = tray.sub_brands ?? ''
        const spoolId = typeof tray.spool_id === 'number' && tray.spool_id >= 0 ? tray.spool_id : null
        const manufacturer = this.manufacturerForSpoolId(spoolId)
        const remaining = this.remainingForSpoolId(spoolId, tray.weight_g)
        const color = this.normalizedColor(tray.color_hex ?? '')
        const isLightColor = this.colorIsLight(color)

        return {
            key: `${isExternal ? 'ext' : 'ams'}-${tray.global_index}`,
            gate: tray.global_index,
            label,
            loaded,
            active: this.isNativeActiveTray(tray),
            isExternal,
            materialLabel: loaded ? this.shortMaterialLabel(material, subBrand) : '',
            detail: loaded
                ? [manufacturer, material, subBrand && subBrand !== material ? subBrand : '']
                      .filter(Boolean)
                      .join(' · ')
                : 'Empty',
            manufacturer,
            subBrand,
            color,
            isLightColor,
            humidity,
            temperature: tray.nozzle_temp_max ?? 0,
            spoolId,
            weight: remaining.weight,
            remainingPercent: remaining.percent,
            tagUid: tray.tag_uid ?? '',
            trayInfoIdx: tray.tray_info_idx ?? '',
        }
    }

    private buildCompatSlots(unit: BambuMmuMachineUnit, letter: string, isExternal: boolean): BambuAmsSlot[] {
        const slots: BambuAmsSlot[] = []
        for (let offset = 0; offset < unit.num_gates; offset++) {
            const gate = unit.first_gate + offset
            slots.push(this.buildCompatSlot(gate, isExternal ? 'Ext' : `${letter}${offset + 1}`, isExternal))
        }

        return slots
    }

    private buildCompatSlot(gate: number, label: string, isExternal: boolean): BambuAmsSlot {
        const mmu = this.mmu
        const loaded = (mmu?.gate_status?.[gate] ?? 0) > 0
        const material = mmu?.gate_material?.[gate] ?? ''
        const subBrand = mmu?.gate_sub_brands?.[gate] ?? ''
        const filamentName = mmu?.gate_filament_name?.[gate] ?? ''
        const spoolId = mmu?.gate_spool_id?.[gate] ?? -1
        const mappedSpoolId = spoolId >= 0 ? spoolId : null
        const manufacturer = this.manufacturerForSpoolId(mappedSpoolId)
        const humidity = mmu?.gate_humidity?.[gate] ?? null
        const weight = mmu?.gate_weight_g?.[gate] ?? null
        const remaining = this.remainingForSpoolId(mappedSpoolId, weight)
        const color = this.normalizedColor(mmu?.gate_color?.[gate] ?? '')
        const isLightColor = this.colorIsLight(color)

        return {
            key: `compat-${gate}`,
            gate,
            label,
            loaded,
            active: this.isCompatActiveGate(gate),
            isExternal,
            materialLabel: loaded ? this.shortMaterialLabel(material, subBrand || filamentName) : '',
            detail: loaded
                ? [manufacturer, material, subBrand && subBrand !== filamentName ? subBrand : '']
                      .filter(Boolean)
                      .join(' · ')
                : 'Empty',
            manufacturer,
            subBrand: subBrand || filamentName,
            color,
            isLightColor,
            humidity: typeof humidity === 'number' && humidity > 0 ? humidity : null,
            temperature: mmu?.gate_temperature?.[gate] ?? 0,
            spoolId: mappedSpoolId,
            weight: remaining.weight,
            remainingPercent: remaining.percent,
            tagUid: mmu?.gate_tag_uid?.[gate] ?? '',
            trayInfoIdx: '',
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

    private remainingForSpoolId(
        spoolId: number | null,
        fallbackWeight: number | null
    ): { weight: number | null; percent: number | null } {
        if (spoolId !== null) {
            const spool = this.spoolmanSpools.find((spool) => spool.id === spoolId)
            const remainingWeight = spool?.remaining_weight
            const totalWeight = spool?.initial_weight ?? spool?.filament?.weight ?? null

            if (typeof remainingWeight === 'number' && remainingWeight >= 0) {
                return {
                    weight: Math.round(remainingWeight),
                    percent:
                        typeof totalWeight === 'number' && totalWeight > 0
                            ? Math.round(Math.max(0, Math.min(100, (remainingWeight / totalWeight) * 100)))
                            : null,
                }
            }
        }

        return {
            weight: typeof fallbackWeight === 'number' && fallbackWeight > 0 ? Math.round(fallbackWeight) : null,
            percent: null,
        }
    }

    private shortMaterialLabel(material: string, subBrand: string): string {
        // BS shows just the polymer family on the slot tile (PLA, PETG, ABS…).
        // Pull the leading word from material; if absent, fall back to subBrand.
        const primary = material.trim().split(/[\s_-]+/)[0]
        if (primary) return primary

        const fallback = subBrand.trim().split(/[\s_-]+/)[0]
        return fallback || 'Filament'
    }

    private normalizedColor(value: string): string {
        const color = value.replace(/^#/, '').slice(0, 6)
        return /^[0-9a-fA-F]{6}$/.test(color) ? color : '303030'
    }

    private colorIsLight(color: string): boolean {
        const r = parseInt(color.slice(0, 2), 16)
        const g = parseInt(color.slice(2, 4), 16)
        const b = parseInt(color.slice(4, 6), 16)
        // Perceived luminance (Rec. 709)
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        return luminance > 0.62
    }
}
</script>

<style scoped>
/* ---------- Panel shell ---------- */
.bambu-ams-panel__body {
    background: #1d1d1d;
    color: rgba(255, 255, 255, 0.88);
    padding: 16px 18px 18px !important;
}

/* ---------- Top toolbar (humidity chips) ---------- */
.bambu-ams-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-bottom: 12px;
    min-height: 24px;
}

.bambu-ams-humidity-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 4px;
    background: #2b2b2b;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
}

.bambu-ams-humidity-chip:hover,
.bambu-ams-humidity-chip:focus {
    background: #353535;
    border-color: rgba(255, 255, 255, 0.28);
    outline: none;
}

.bambu-ams-humidity-chip-icon {
    color: #79bff0 !important;
}

.bambu-ams-humidity-chip-state {
    color: rgba(255, 255, 255, 0.55) !important;
}

/* ---------- Bay (Ext + AMS sections) ---------- */
.bambu-ams-bay {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: stretch;
}

.bambu-ams-section {
    position: relative;
    flex: 1 1 220px;
    padding: 18px 18px 22px;
    background: #232323;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 4px;
}

.bambu-ams-section--ext {
    flex: 0 1 220px;
}

.bambu-ams-section--ams {
    flex: 2 1 360px;
}

.bambu-ams-section--blocked .bambu-ams-slot {
    opacity: 0.6;
}

.bambu-ams-section-header {
    position: absolute;
    top: 10px;
    left: 14px;
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.92rem;
    font-weight: 600;
}

/* ---------- Slot row + caps ---------- */
.bambu-ams-slotrow {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 6px;
    margin-top: 28px;
}

.bambu-ams-slotrow--solo {
    display: flex;
    justify-content: center;
}

.bambu-ams-slot-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
}

.bambu-ams-slot-cap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 22px;
    min-width: 38px;
    padding: 0 8px;
    margin-bottom: 8px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    background: transparent;
}

.bambu-ams-slot-cap--ext {
    border-color: rgba(255, 255, 255, 0.18);
}

.bambu-ams-slot-cap--active {
    border-color: rgba(60, 175, 80, 0.85);
    color: #aef0b0;
}

.bambu-ams-slot-cap-icon {
    color: rgba(255, 255, 255, 0.45) !important;
}

.bambu-ams-slot-cap--active .bambu-ams-slot-cap-icon {
    color: #aef0b0 !important;
}

/* ---------- Slot tile (the colored card) ---------- */
.bambu-ams-slot {
    --bambu-slot-color: #424242;
    --bambu-slot-fg: rgba(255, 255, 255, 0.85);
    --bambu-slot-fg-dim: rgba(255, 255, 255, 0.55);

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    max-width: 86px;
    aspect-ratio: 3 / 4;
    padding: 8px 6px 10px;
    border-radius: 6px;
    background: var(--bambu-slot-color);
    color: var(--bambu-slot-fg);
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
}

.bambu-ams-slot--empty {
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.16);
    box-shadow: none;
    color: rgba(255, 255, 255, 0.32);
}

.bambu-ams-slot--light {
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16);
}

.bambu-ams-slot--active {
    outline: 2px solid #3caf50;
    outline-offset: 2px;
}

.bambu-ams-slot:hover {
    transform: translateY(-1px);
}

.bambu-ams-slot:focus {
    outline: 2px solid #3caf50;
    outline-offset: 2px;
}

.bambu-ams-slot-material {
    color: var(--bambu-slot-fg);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
    letter-spacing: 0.01em;
}

.bambu-ams-slot-edit {
    color: var(--bambu-slot-fg-dim) !important;
}

.bambu-ams-slot--empty .bambu-ams-slot-edit {
    display: none;
}

/* ---------- Rail line under each section ---------- */
.bambu-ams-rail {
    position: absolute;
    left: 18px;
    right: 18px;
    bottom: 10px;
    height: 1px;
    background: rgba(255, 255, 255, 0.32);
}

.bambu-ams-rail--ext {
    left: 50%;
    right: 18px;
}

/* ---------- Hub (gear pair between Ext and AMS) ---------- */
.bambu-ams-hub-row {
    display: flex;
    justify-content: center;
    margin: -8px 0 8px;
}

.bambu-ams-hub {
    display: inline-flex;
    gap: 0;
    padding: 3px 7px;
    border-radius: 4px;
    background: #232323;
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.bambu-ams-hub-icon {
    color: #3caf50 !important;
}

/* ---------- Bottom action bar ---------- */
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

.bambu-ams-actions-retract {
    color: rgba(255, 255, 255, 0.45) !important;
}

/* ---------- Responsive ---------- */
@media (max-width: 720px) {
    .bambu-ams-bay {
        flex-direction: column;
    }

    .bambu-ams-section--ext,
    .bambu-ams-section--ams {
        flex: 1 1 auto;
    }

    .bambu-ams-slot {
        max-width: 72px;
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
