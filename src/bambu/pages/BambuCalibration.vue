<template>
    <v-container fluid py-0 px-0>
        <v-alert v-if="!isBambuRaker" type="warning" outlined>
            This calibration runner is available only when connected to bambu-raker.
        </v-alert>

        <div v-else class="bambu-calibration-page">
            <section class="bambu-calibration-hero">
                <div>
                    <div class="bambu-calibration-hero__eyebrow">Bambu calibration</div>
                    <h1>Run verified printer calibrations</h1>
                    <p>
                        Only command shapes captured successfully from bambu-raker are enabled. Unsupported Bambu Studio
                        calibrations stay visible but locked until their MQTT mappings are verified.
                    </p>
                </div>
                <div class="bambu-calibration-hero__status">
                    <span>{{ klipperReadyForGui ? 'Printer ready' : 'Waiting for printer' }}</span>
                    <strong>{{ printerIsPrinting ? 'Printing' : 'Idle' }}</strong>
                </div>
            </section>

            <v-alert v-if="printerIsPrinting" type="warning" text dense class="mb-4">
                Calibration commands are disabled while a print is active.
            </v-alert>

            <v-alert v-if="successMessage" type="success" text dismissible class="mb-4" @input="successMessage = null">
                {{ successMessage }}
            </v-alert>
            <v-alert v-if="errorMessage" type="error" text dismissible class="mb-4" @input="errorMessage = null">
                {{ errorMessage }}
            </v-alert>

            <v-row>
                <v-col cols="12" lg="7">
                    <v-card class="bambu-calibration-card" outlined>
                        <v-card-title class="bambu-calibration-card__title">Calibration menu</v-card-title>
                        <v-card-text>
                            <button
                                v-for="action in calibrationActions"
                                :key="action.id"
                                type="button"
                                class="bambu-calibration-action"
                                :class="{
                                    'bambu-calibration-action--selected': selectedActionId === action.id,
                                    'bambu-calibration-action--disabled': action.disabled,
                                }"
                                :disabled="action.disabled || runningAction !== null"
                                @click="selectAction(action)">
                                <span class="bambu-calibration-action__check">
                                    <v-icon small>
                                        {{
                                            selectedActionId === action.id ? mdiCheckboxMarked : mdiCheckboxBlankOutline
                                        }}
                                    </v-icon>
                                </span>
                                <span class="bambu-calibration-action__content">
                                    <span class="bambu-calibration-action__eyebrow">{{ action.eyebrow }}</span>
                                    <span class="bambu-calibration-action__name">{{ action.name }}</span>
                                    <span class="bambu-calibration-action__description">{{ action.description }}</span>
                                    <span v-if="action.blockedReason" class="bambu-calibration-action__blocked">
                                        {{ action.blockedReason }}
                                    </span>
                                </span>
                                <span class="bambu-calibration-action__state">
                                    {{ action.disabled ? 'Locked' : 'Verified' }}
                                </span>
                            </button>
                        </v-card-text>
                    </v-card>
                </v-col>

                <v-col cols="12" lg="5">
                    <v-card class="bambu-calibration-card bambu-calibration-run-card" outlined>
                        <v-card-title class="bambu-calibration-card__title">Start calibration</v-card-title>
                        <v-card-text>
                            <div class="bambu-calibration-run-card__selected">
                                <span>Selected</span>
                                <strong>{{ selectedAction?.name ?? 'None' }}</strong>
                            </div>
                            <p class="bambu-calibration-run-card__copy">
                                {{ selectedAction?.description ?? 'Select a verified calibration to continue.' }}
                            </p>
                            <v-btn
                                color="primary"
                                large
                                block
                                depressed
                                :loading="runningAction === 'vibration'"
                                :disabled="!canRunSelectedAction"
                                @click="runSelectedAction">
                                <v-icon left>{{ mdiPlay }}</v-icon>
                                Start Calibration
                            </v-btn>
                            <div class="bambu-calibration-run-card__note">
                                The printer acknowledges the command immediately; follow printer state and HMS
                                notifications for physical progress or failures.
                            </div>
                        </v-card-text>
                    </v-card>

                    <v-card class="bambu-calibration-card mt-4" outlined>
                        <v-card-title class="bambu-calibration-card__title">Pre-print calibration flags</v-card-title>
                        <v-card-text>
                            <div class="bambu-calibration-facts">
                                <div>Bed leveling, flow calibration, and vibration calibration are wired into</div>
                                <strong>printer.print.start</strong>
                                <div>They run with a selected print file, not as standalone buttons here.</div>
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>

            <v-row class="mt-1">
                <v-col cols="12">
                    <v-card class="bambu-calibration-card" outlined>
                        <v-card-title class="bambu-calibration-card__title">
                            AMS extrusion calibration selection
                        </v-card-title>
                        <v-card-text>
                            <v-row align="center">
                                <v-col cols="12" md="5">
                                    <v-select
                                        v-model="selectedSlotKey"
                                        :items="extrusionSlotItems"
                                        label="AMS slot"
                                        item-text="text"
                                        item-value="value"
                                        outlined
                                        dense
                                        hide-details="auto"
                                        :disabled="extrusionSlots.length === 0 || runningAction !== null" />
                                </v-col>
                                <v-col cols="12" md="4">
                                    <div
                                        v-if="selectedExtrusionSlot"
                                        class="bambu-calibration-slot"
                                        :style="slotStyle(selectedExtrusionSlot)">
                                        <span class="bambu-calibration-slot__swatch" />
                                        <div>
                                            <strong>{{ selectedExtrusionSlot.name }}</strong>
                                            <span>
                                                {{ selectedExtrusionSlot.filamentId }} ·
                                                {{ selectedExtrusionSlot.label }}
                                            </span>
                                        </div>
                                    </div>
                                    <v-alert v-else type="info" text dense class="mb-0">
                                        No loaded native AMS slot with a filament id is available.
                                    </v-alert>
                                </v-col>
                                <v-col cols="12" md="3">
                                    <v-btn
                                        color="primary"
                                        block
                                        depressed
                                        :loading="runningAction === 'extrusion'"
                                        :disabled="!canApplyExtrusionSelection"
                                        @click="applyExtrusionCalibration">
                                        Apply selection
                                    </v-btn>
                                </v-col>
                            </v-row>
                            <div class="bambu-calibration-run-card__note mt-3">
                                This sends the verified
                                <code>print.extrusion_cali_sel</code>
                                payload for the selected AMS slot. It does not invent flow-dynamics or max-volumetric
                                calibration routines.
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>
        </div>
    </v-container>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { isBambuRakerBackend } from '@/bambu/detection'
import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiPlay } from '@mdi/js'

interface CalibrationAction {
    id: 'vibration' | 'bed-leveling' | 'flow-rate' | 'flow-dynamics' | 'max-volumetric'
    eyebrow: string
    name: string
    description: string
    disabled: boolean
    blockedReason?: string
}

interface BambuNativeAmsTray {
    id: number
    empty: boolean
    color_hex: string
    material: string
    sub_brands: string
    tray_info_idx: string
}

interface BambuNativeAmsUnit {
    id: number
    trays: BambuNativeAmsTray[]
}

interface BambuNativeAmsState {
    units?: BambuNativeAmsUnit[]
}

interface ExtrusionSlot {
    key: string
    label: string
    amsId: number
    slotId: number
    filamentId: string
    name: string
    color: string
}

@Component
export default class BambuCalibration extends Mixins(BaseMixin) {
    mdiCheckboxBlankOutline = mdiCheckboxBlankOutline
    mdiCheckboxMarked = mdiCheckboxMarked
    mdiPlay = mdiPlay

    selectedActionId: CalibrationAction['id'] = 'vibration'
    selectedSlotKey = ''
    runningAction: 'vibration' | 'extrusion' | null = null
    successMessage: string | null = null
    errorMessage: string | null = null

    calibrationActions: CalibrationAction[] = [
        {
            id: 'vibration',
            eyebrow: 'Standalone command',
            name: 'Vibration compensation',
            description: 'Runs the verified print.calibration option 4 command captured from the H2C.',
            disabled: false,
        },
        {
            id: 'bed-leveling',
            eyebrow: 'Print-start flag',
            name: 'Bed leveling',
            description: 'Verified through printer.print.start auto_bed_leveling, not as a standalone command.',
            disabled: true,
            blockedReason: 'Run this when starting a print file with calibration flags.',
        },
        {
            id: 'flow-rate',
            eyebrow: 'Print-start flow',
            name: 'Flow rate',
            description: 'Captured as a print-start calibration flow; standalone MQTT mapping is not verified.',
            disabled: true,
            blockedReason: 'Locked until a standalone command succeeds in discovery.',
        },
        {
            id: 'flow-dynamics',
            eyebrow: 'AMS selection only',
            name: 'Flow dynamics / K value',
            description: 'The slot selection command is verified below; the full calibration runner is not.',
            disabled: true,
            blockedReason: 'Use the AMS extrusion selection card for the verified command.',
        },
        {
            id: 'max-volumetric',
            eyebrow: 'Not verified',
            name: 'Max volumetric speed',
            description: 'No successful bambu-raker command shape has been captured yet.',
            disabled: true,
            blockedReason: 'Not exposed until discovery proves the command.',
        },
    ]

    get isBambuRaker(): boolean {
        return isBambuRakerBackend(this.$store)
    }

    get selectedAction(): CalibrationAction | null {
        return this.calibrationActions.find((action) => action.id === this.selectedActionId) ?? null
    }

    get canRunSelectedAction(): boolean {
        return (
            this.selectedAction?.id === 'vibration' &&
            this.klipperReadyForGui &&
            !this.printerIsPrinting &&
            this.runningAction === null
        )
    }

    get nativeAms(): BambuNativeAmsState | null {
        return this.$store.state.printer.bambu_ams ?? null
    }

    get extrusionSlots(): ExtrusionSlot[] {
        const units = this.nativeAms?.units ?? []
        return units.flatMap((unit, unitIndex) => {
            const letter = String.fromCharCode(65 + unitIndex)
            return unit.trays
                .filter((tray) => !tray.empty && Boolean(tray.tray_info_idx))
                .map((tray, trayIndex) => {
                    const material = tray.material || 'Filament'
                    const subBrand = tray.sub_brands && tray.sub_brands !== material ? tray.sub_brands : ''
                    return {
                        key: `${unit.id}:${tray.id}`,
                        label: `AMS ${letter}${trayIndex + 1}`,
                        amsId: unit.id,
                        slotId: tray.id,
                        filamentId: tray.tray_info_idx,
                        name: [subBrand, material].filter(Boolean).join(' · ') || 'Loaded spool',
                        color: this.normalizedColor(tray.color_hex),
                    }
                })
        })
    }

    get extrusionSlotItems(): { text: string; value: string }[] {
        return this.extrusionSlots.map((slot) => ({
            text: `${slot.label} · ${slot.name}`,
            value: slot.key,
        }))
    }

    get selectedExtrusionSlot(): ExtrusionSlot | null {
        return this.extrusionSlots.find((slot) => slot.key === this.selectedSlotKey) ?? null
    }

    get canApplyExtrusionSelection(): boolean {
        return (
            this.selectedExtrusionSlot !== null &&
            this.klipperReadyForGui &&
            !this.printerIsPrinting &&
            this.runningAction === null
        )
    }

    @Watch('extrusionSlots', { immediate: true })
    extrusionSlotsChanged(): void {
        this.ensureSelectedSlot()
    }

    selectAction(action: CalibrationAction): void {
        if (action.disabled || this.runningAction !== null) return
        this.selectedActionId = action.id
    }

    async runSelectedAction(): Promise<void> {
        if (!this.canRunSelectedAction) return
        this.startRun('vibration')
        try {
            const result = await this.$socket.emitAndWait('printer.calibration.vibration', undefined, {
                loading: 'bambuCalibrationVibration',
            })
            this.successMessage = `Vibration calibration accepted: ${result.detail}`
        } catch (error) {
            this.errorMessage = `Vibration calibration failed: ${this.errorToMessage(error)}`
        } finally {
            this.runningAction = null
        }
    }

    async applyExtrusionCalibration(): Promise<void> {
        const slot = this.selectedExtrusionSlot
        if (!slot || !this.canApplyExtrusionSelection) return
        this.startRun('extrusion')
        try {
            const result = await this.$socket.emitAndWait(
                'printer.calibration.extrusion_cali_sel',
                {
                    ams_id: slot.amsId,
                    slot_id: slot.slotId,
                    filament_id: slot.filamentId,
                    nozzle_diameter: '0.4',
                    cali_idx: -1,
                },
                { loading: 'bambuCalibrationExtrusionSelection' }
            )
            this.successMessage = `Extrusion calibration selection applied for ${slot.label}: ${result.detail}`
        } catch (error) {
            this.errorMessage = `Extrusion calibration selection failed: ${this.errorToMessage(error)}`
        } finally {
            this.runningAction = null
        }
    }

    slotStyle(slot: ExtrusionSlot): Record<string, string> {
        return {
            '--bambu-slot-color': `#${slot.color}`,
        }
    }

    private startRun(action: 'vibration' | 'extrusion'): void {
        this.successMessage = null
        this.errorMessage = null
        this.runningAction = action
    }

    private ensureSelectedSlot(): void {
        if (this.extrusionSlots.length === 0) {
            this.selectedSlotKey = ''
            return
        }
        if (!this.extrusionSlots.some((slot) => slot.key === this.selectedSlotKey)) {
            this.selectedSlotKey = this.extrusionSlots[0].key
        }
    }

    private normalizedColor(value: string): string {
        const color = (value || '').replace(/^#/, '').slice(0, 6)
        return /^[0-9a-fA-F]{6}$/.test(color) ? color : '303030'
    }

    private errorToMessage(error: unknown): string {
        if (error instanceof Error) return error.message
        if (typeof error === 'object' && error !== null) {
            const candidate = error as { message?: unknown; detail?: unknown }
            if (typeof candidate.message === 'string') return candidate.message
            if (typeof candidate.detail === 'string') return candidate.detail
        }
        return String(error)
    }
}
</script>

<style scoped>
.bambu-calibration-page {
    color: var(--v-text-base);
}

.bambu-calibration-hero {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 20px;
    padding: 28px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 28px;
    background:
        radial-gradient(circle at 12% 0%, rgba(72, 214, 169, 0.32), transparent 34%),
        linear-gradient(135deg, rgba(24, 33, 43, 0.96), rgba(12, 16, 22, 0.96));
    color: #f7fbfa;
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.22);
}

.bambu-calibration-hero__eyebrow,
.bambu-calibration-action__eyebrow {
    color: #56d9ae;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}

.bambu-calibration-hero h1 {
    margin: 8px 0;
    font-size: clamp(2rem, 4vw, 3.8rem);
    font-weight: 800;
    letter-spacing: -0.05em;
    line-height: 0.95;
}

.bambu-calibration-hero p {
    max-width: 680px;
    margin: 0;
    color: rgba(247, 251, 250, 0.74);
    font-size: 1rem;
}

.bambu-calibration-hero__status {
    min-width: 170px;
    align-self: flex-start;
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.1);
    text-align: right;
}

.bambu-calibration-hero__status span,
.bambu-calibration-hero__status strong {
    display: block;
}

.bambu-calibration-hero__status span {
    color: rgba(247, 251, 250, 0.68);
    font-size: 0.78rem;
    text-transform: uppercase;
}

.bambu-calibration-hero__status strong {
    margin-top: 4px;
    font-size: 1.3rem;
}

.bambu-calibration-card {
    overflow: hidden;
    border-radius: 22px !important;
}

.bambu-calibration-card__title {
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.bambu-calibration-action {
    display: grid;
    width: 100%;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: start;
    margin-bottom: 12px;
    padding: 16px;
    border: 1px solid rgba(120, 130, 140, 0.24);
    border-radius: 18px;
    background: rgba(120, 130, 140, 0.07);
    color: inherit;
    text-align: left;
    transition:
        border-color 120ms ease,
        background 120ms ease,
        transform 120ms ease;
}

.bambu-calibration-action:not(.bambu-calibration-action--disabled):hover {
    border-color: rgba(86, 217, 174, 0.7);
    transform: translateY(-1px);
}

.bambu-calibration-action--selected {
    border-color: rgba(86, 217, 174, 0.82);
    background: rgba(86, 217, 174, 0.1);
}

.bambu-calibration-action--disabled {
    cursor: not-allowed;
    opacity: 0.58;
}

.bambu-calibration-action__content,
.bambu-calibration-action__name,
.bambu-calibration-action__description,
.bambu-calibration-action__blocked {
    display: block;
}

.bambu-calibration-action__name {
    margin-top: 4px;
    font-size: 1.08rem;
    font-weight: 800;
}

.bambu-calibration-action__description,
.bambu-calibration-run-card__copy,
.bambu-calibration-run-card__note,
.bambu-calibration-action__blocked {
    color: var(--v-secondary-lighten2);
}

.bambu-calibration-action__blocked {
    margin-top: 7px;
    font-size: 0.82rem;
    font-weight: 700;
}

.bambu-calibration-action__state {
    padding: 4px 9px;
    border-radius: 999px;
    background: rgba(86, 217, 174, 0.13);
    color: #21a77a;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
}

.bambu-calibration-action--disabled .bambu-calibration-action__state {
    background: rgba(120, 130, 140, 0.16);
    color: inherit;
}

.bambu-calibration-run-card__selected {
    padding: 18px;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(86, 217, 174, 0.16), rgba(86, 217, 174, 0.05));
}

.bambu-calibration-run-card__selected span,
.bambu-calibration-run-card__selected strong {
    display: block;
}

.bambu-calibration-run-card__selected span {
    color: var(--v-secondary-lighten2);
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.bambu-calibration-run-card__selected strong {
    margin-top: 4px;
    font-size: 1.3rem;
}

.bambu-calibration-run-card__copy {
    margin: 16px 0;
}

.bambu-calibration-run-card__note {
    margin-top: 14px;
    font-size: 0.86rem;
}

.bambu-calibration-facts {
    display: grid;
    gap: 6px;
    padding: 16px;
    border-radius: 18px;
    background: rgba(120, 130, 140, 0.08);
}

.bambu-calibration-facts strong {
    color: #21a77a;
}

.bambu-calibration-slot {
    display: flex;
    gap: 12px;
    align-items: center;
    min-height: 40px;
}

.bambu-calibration-slot__swatch {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border: 2px solid rgba(255, 255, 255, 0.45);
    border-radius: 50%;
    background: var(--bambu-slot-color);
    box-shadow: 0 0 0 4px rgba(120, 130, 140, 0.14);
}

.bambu-calibration-slot strong,
.bambu-calibration-slot span {
    display: block;
}

.bambu-calibration-slot span {
    color: var(--v-secondary-lighten2);
    font-size: 0.82rem;
}

@media (max-width: 760px) {
    .bambu-calibration-hero {
        flex-direction: column;
        padding: 22px;
    }

    .bambu-calibration-hero__status {
        width: 100%;
        text-align: left;
    }

    .bambu-calibration-action {
        grid-template-columns: auto 1fr;
    }

    .bambu-calibration-action__state {
        grid-column: 2;
        justify-self: start;
    }
}
</style>
