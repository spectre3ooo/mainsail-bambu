<template>
    <panel v-if="showPanel" :icon="mdiMulticast" title="Bambu AMS" :collapsible="true" card-class="bambu-ams-panel">
        <v-card-text class="bambu-ams-panel__body">
            <div class="bambu-ams-overview">
                <div>
                    <div class="bambu-ams-overview__eyebrow">Filament system</div>
                    <div class="bambu-ams-overview__title">AMS filament bay</div>
                </div>
                <div class="bambu-ams-overview__stats">
                    <span>{{ totalLoaded }} / {{ totalSlots }} loaded</span>
                    <span v-if="externalFeedActive" class="bambu-ams-overview__active">External feed</span>
                </div>
            </div>

            <div v-if="missingWeightData" class="bambu-ams-message bambu-ams-message--info mb-3">
                Remaining spool weight is unavailable for at least one loaded slot.
            </div>

            <div v-if="externalFeedActive" class="bambu-ams-message bambu-ams-message--success mb-3">
                External spool feed is active. AMS slots are visible but not currently feeding.
            </div>

            <section
                v-for="unit in units"
                :key="unit.key"
                class="bambu-ams-unit mb-4"
                :class="{ 'bambu-ams-unit--external': unit.external, 'bambu-ams-unit--blocked': externalFeedActive && !unit.external }">
                <div class="bambu-ams-unit__header">
                    <div>
                        <div class="bambu-ams-unit__title">{{ unit.title }}</div>
                        <div class="bambu-ams-unit__subtitle">{{ unit.subtitle }}</div>
                    </div>
                    <div class="bambu-ams-unit__chips">
                        <span>{{ unit.loadedCount }} / {{ unit.slots.length }}</span>
                        <span v-if="unit.humidity !== null">{{ unit.humidity }}% RH</span>
                    </div>
                </div>

                <div class="bambu-ams-device">
                    <div class="bambu-ams-slots">
                        <div
                            v-for="slot in unit.slots"
                            :key="slot.gate"
                            class="bambu-ams-slot"
                            :class="{ 'bambu-ams-slot--active': slot.active, 'bambu-ams-slot--empty': !slot.loaded }"
                            :style="slotStyle(slot)">
                            <div class="bambu-ams-slot__colorbar" />

                            <div class="bambu-ams-slot__topline">
                                <span class="bambu-ams-slot__label">{{ slot.label }}</span>
                                <span v-if="slot.active" class="bambu-ams-slot__active-pill">In use</span>
                                <span class="bambu-ams-slot__swatch" :style="swatchStyle(slot)" />
                            </div>

                            <div class="bambu-ams-slot__name">
                                {{ slot.name }}
                            </div>
                            <div class="bambu-ams-slot__meta text-truncate">
                                {{ slot.materialText }}
                            </div>

                            <div v-if="slot.remainingPercent !== null" class="bambu-ams-slot__remaining">
                                <div class="bambu-ams-slot__remaining-label">
                                    <span>Remaining</span>
                                    <strong>{{ slot.remainingPercent }}%</strong>
                                </div>
                                <div class="bambu-ams-slot__remaining-track">
                                    <span :style="remainingStyle(slot)" />
                                </div>
                            </div>

                            <div class="bambu-ams-slot__facts">
                                <span v-if="slot.humidity !== null">{{ slot.humidity }}% RH</span>
                                <span v-if="slot.temperature > 0">{{ slot.temperature }} C</span>
                            </div>

                            <div v-if="slot.spoolId !== null" class="bambu-ams-slot__spool">
                                Spool #{{ slot.spoolId }}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
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
    weight: number | null
    remainingPercent: number | null
}

interface BambuAmsUnitView {
    key: string
    title: string
    subtitle: string
    external: boolean
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

    get totalLoaded(): number {
        return this.units.reduce((sum, unit) => sum + unit.loadedCount, 0)
    }

    get totalSlots(): number {
        return this.units.reduce((sum, unit) => sum + unit.slots.length, 0)
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
                external: true,
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
                external: false,
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
                external: isExternal,
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

    remainingStyle(slot: BambuAmsSlot): Record<string, string> {
        return {
            width: `${slot.remainingPercent ?? 0}%`,
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
        const remaining = this.remainingForSpoolId(spoolId, tray.weight_g)
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
            weight: remaining.weight,
            remainingPercent: remaining.percent,
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
        const spoolId = mmu?.gate_spool_id?.[gate] ?? -1
        const mappedSpoolId = spoolId >= 0 ? spoolId : null
        const manufacturer = this.manufacturerForSpoolId(mappedSpoolId)
        const humidity = mmu?.gate_humidity?.[gate] ?? null
        const weight = mmu?.gate_weight_g?.[gate] ?? null
        const remaining = this.remainingForSpoolId(mappedSpoolId, weight)
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
            weight: remaining.weight,
            remainingPercent: remaining.percent,
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

}
</script>

<style scoped>
.bambu-ams-panel__body {
    background:
        radial-gradient(circle at top left, rgba(60, 175, 80, 0.08), transparent 36%),
        #181818;
    color: rgba(255, 255, 255, 0.88);
}

.bambu-ams-overview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
    padding: 14px 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(157, 140, 69, 0.18), rgba(34, 34, 34, 0.86));
}

.bambu-ams-overview__eyebrow {
    color: #c7b768;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1.1;
    text-transform: uppercase;
}

.bambu-ams-overview__title {
    margin-top: 4px;
    color: #fff;
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1.2;
}

.bambu-ams-overview__stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.bambu-ams-overview__stats span,
.bambu-ams-message,
.bambu-ams-unit__chips span,
.bambu-ams-slot__active-pill {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.72rem;
    font-weight: 600;
}

.bambu-ams-overview__stats span {
    padding: 5px 9px;
}

.bambu-ams-overview__stats .bambu-ams-overview__active {
    border-color: rgba(60, 175, 80, 0.4);
    background: rgba(60, 175, 80, 0.18);
    color: #a7e3a9;
}

.bambu-ams-message {
    padding: 9px 12px;
    border-radius: 12px;
}

.bambu-ams-message--info {
    border-color: rgba(95, 174, 255, 0.24);
    background: rgba(95, 174, 255, 0.1);
    color: rgba(214, 234, 255, 0.92);
}

.bambu-ams-message--success {
    border-color: rgba(60, 175, 80, 0.3);
    background: rgba(60, 175, 80, 0.12);
    color: #b7e7b8;
}

.bambu-ams-unit {
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 42%),
        #222;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.bambu-ams-unit--blocked .bambu-ams-slot {
    opacity: 0.72;
}

.bambu-ams-unit__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 13px 15px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.bambu-ams-unit__title {
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.2;
}

.bambu-ams-unit__subtitle {
    margin-top: 2px;
    color: rgba(255, 255, 255, 0.52);
    font-size: 0.78rem;
}

.bambu-ams-unit__chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
}

.bambu-ams-unit__chips span {
    padding: 4px 8px;
}

.bambu-ams-device {
    position: relative;
    padding: 13px;
}

.bambu-ams-slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    gap: 9px;
}

.bambu-ams-slot {
    position: relative;
    overflow: hidden;
    min-height: 182px;
    padding: 11px;
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 14px;
    background:
        radial-gradient(circle at 50% 16%, var(--bambu-slot-tint), transparent 56%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.12)),
        #2a2a2a;
    color: inherit;
    text-align: center;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

.bambu-ams-slot__colorbar {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 5px;
    background: var(--bambu-slot-color);
    opacity: 0.86;
}

.bambu-ams-slot--active {
    border-color: #3caf50;
    box-shadow:
        0 0 0 2px rgba(60, 175, 80, 0.75),
        0 0 22px rgba(60, 175, 80, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.bambu-ams-slot--empty {
    color: rgba(255, 255, 255, 0.58);
}

.bambu-ams-slot__topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.bambu-ams-slot__label {
    min-width: 26px;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.26);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #9fe3a1;
    text-align: left;
}

.bambu-ams-slot__active-pill {
    padding: 2px 6px;
    border-color: rgba(60, 175, 80, 0.4);
    background: rgba(60, 175, 80, 0.2);
    color: #c4f1c5;
    font-size: 0.64rem;
}

.bambu-ams-slot__swatch {
    width: 24px;
    height: 24px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
}

.bambu-ams-slot__name {
    display: -webkit-box;
    min-height: 44px;
    margin-top: 19px;
    overflow: hidden;
    color: #fff;
    font-size: 1.02rem;
    font-weight: 800;
    line-height: 1.18;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.bambu-ams-slot__meta {
    margin-top: 7px;
    min-height: 18px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.78rem;
    font-weight: 600;
}

.bambu-ams-slot__remaining {
    margin-top: 13px;
    text-align: left;
}

.bambu-ams-slot__remaining-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.bambu-ams-slot__remaining-label strong {
    color: rgba(255, 255, 255, 0.82);
    font-size: 0.74rem;
}

.bambu-ams-slot__remaining-track {
    height: 6px;
    margin-top: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
}

.bambu-ams-slot__remaining-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(60, 175, 80, 0.92), var(--bambu-slot-color));
    box-shadow: 0 0 10px var(--bambu-slot-tint);
}

.bambu-ams-slot__facts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 10px;
    color: rgba(255, 255, 255, 0.62);
    font-size: 0.72rem;
    font-weight: 700;
}

.bambu-ams-slot__spool {
    margin-top: 7px;
    color: rgba(255, 255, 255, 0.42);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.04em;
}

@media (max-width: 600px) {
    .bambu-ams-overview,
    .bambu-ams-unit__header {
        align-items: flex-start;
        flex-direction: column;
    }

    .bambu-ams-overview__stats,
    .bambu-ams-unit__chips {
        justify-content: flex-start;
    }

    .bambu-ams-slots {
        grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
    }

    .bambu-ams-slot {
        min-height: 174px;
        padding: 10px;
    }
}
</style>
