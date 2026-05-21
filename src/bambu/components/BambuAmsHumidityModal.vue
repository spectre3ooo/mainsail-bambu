<template>
    <v-dialog v-model="dialog" :max-width="480" content-class="bambu-humidity-dialog">
        <v-card class="bambu-humidity-card">
            <div class="bambu-humidity-titlebar">
                <span class="bambu-humidity-titlebar__name">{{ unitName }}</span>
                <v-btn icon small class="bambu-humidity-close" @click="dialog = false">
                    <v-icon size="20">{{ mdiClose }}</v-icon>
                </v-btn>
            </div>
            <v-card-text class="bambu-humidity-body">
                <div class="bambu-humidity-droplet">
                    <svg viewBox="0 0 80 96" class="bambu-humidity-droplet-svg" aria-hidden="true">
                        <defs>
                            <clipPath :id="clipId">
                                <path d="M40 4 C40 4 6 44 6 68 C6 84 21 92 40 92 C59 92 74 84 74 68 C74 44 40 4 40 4 Z" />
                            </clipPath>
                        </defs>
                        <path
                            class="bambu-humidity-droplet-outline"
                            d="M40 4 C40 4 6 44 6 68 C6 84 21 92 40 92 C59 92 74 84 74 68 C74 44 40 4 40 4 Z" />
                        <!-- Wavy water-line on top of a filled rect, matching BS's
                             humidity modal. Two cubic-bezier humps along the
                             top edge keep it readable at any fill level. -->
                        <path
                            :clip-path="`url(#${clipId})`"
                            :d="waveFillPath"
                            class="bambu-humidity-droplet-fill" />
                    </svg>
                </div>

                <div class="bambu-humidity-state">
                    <v-icon
                        size="18"
                        class="bambu-humidity-state-icon"
                        :class="{ 'bambu-humidity-state-icon--drying': drying }">{{ stateIcon }}</v-icon>
                    <span>{{ stateLabel }}</span>
                </div>

                <div class="bambu-humidity-stats">
                    <div class="bambu-humidity-stat">
                        <div class="bambu-humidity-stat-label">Humidity</div>
                        <div class="bambu-humidity-stat-value">{{ humidityDisplay }}</div>
                    </div>
                    <div class="bambu-humidity-stat">
                        <div class="bambu-humidity-stat-label">Temperature</div>
                        <div class="bambu-humidity-stat-value">{{ temperatureDisplay }}</div>
                    </div>
                    <div class="bambu-humidity-stat">
                        <div class="bambu-humidity-stat-label">Remaining</div>
                        <div class="bambu-humidity-stat-value">{{ remainingDisplay }}</div>
                    </div>
                </div>

                <!-- Cannot-dry reasons (e.g. "AMS busy", "Insufficient power"). Only
                     rendered when the printer is reporting any — usually empty. -->
                <div v-if="cannotDryLabels.length" class="bambu-humidity-blockers">
                    <div class="bambu-humidity-blockers__heading">
                        <v-icon size="14" color="warning">{{ mdiAlertCircleOutline }}</v-icon>
                        Cannot start drying:
                    </div>
                    <ul class="bambu-humidity-blockers__list">
                        <li v-for="(reason, idx) in cannotDryLabels" :key="idx">{{ reason }}</li>
                    </ul>
                </div>

                <!-- Drying controls. Server backs us with /server/bambu/ams/dry/start
                     + /dry/stop. We only render when we know the amsUnitId; on
                     externals / unknown backends the modal degrades to humidity-only. -->
                <div v-if="canControl" class="bambu-humidity-controls">
                    <template v-if="drying">
                        <v-btn
                            block
                            color="warning"
                            :loading="busy"
                            :disabled="busy"
                            @click="onStopClicked">
                            <v-icon left size="16">{{ mdiStopCircleOutline }}</v-icon>
                            Stop drying
                        </v-btn>
                    </template>
                    <template v-else>
                        <div class="bambu-humidity-form">
                            <v-text-field
                                v-model.number="formTempC"
                                label="Temp (°C)"
                                type="number"
                                dense
                                hide-details
                                outlined
                                class="bambu-humidity-form__field" />
                            <v-text-field
                                v-model.number="formHours"
                                label="Hours"
                                type="number"
                                dense
                                hide-details
                                outlined
                                class="bambu-humidity-form__field" />
                            <v-text-field
                                v-model="formFilament"
                                label="Filament"
                                dense
                                hide-details
                                outlined
                                class="bambu-humidity-form__field bambu-humidity-form__field--filament" />
                        </div>
                        <v-btn
                            block
                            color="primary"
                            :loading="busy"
                            :disabled="busy || !canStart"
                            class="mt-3"
                            @click="onStartClicked">
                            <v-icon left size="16">{{ mdiPlayCircleOutline }}</v-icon>
                            Start drying
                        </v-btn>
                    </template>
                </div>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { mdiAlertCircleOutline, mdiClose, mdiPlayCircleOutline, mdiStopCircleOutline, mdiWhiteBalanceSunny } from '@mdi/js'
import type { BambuAmsDryerState } from '@/bambu/components/BambuAmsNozzleHalf.vue'

@Component
export default class BambuAmsHumidityModal extends Vue {
    mdiClose = mdiClose
    mdiAlertCircleOutline = mdiAlertCircleOutline
    mdiPlayCircleOutline = mdiPlayCircleOutline
    mdiStopCircleOutline = mdiStopCircleOutline

    @Prop({ type: Boolean, default: false }) readonly value!: boolean
    @Prop({ type: String, default: '' }) readonly unitName!: string
    @Prop({ type: Number, default: null }) readonly humidity!: number | null
    @Prop({ type: Number, default: null }) readonly temperature!: number | null
    // Despite the prop name, the printer reports drying time in MINUTES
    // (Bambu's `dry_time` field), NOT seconds.
    @Prop({ type: Number, default: 0 }) readonly dryTimeSeconds!: number
    // Bambu unit id (0/1/128 for AMS A/B/HT). Null means we can't issue
    // dryer commands for this source (externals, unknown backends).
    @Prop({ type: Number, default: null }) readonly amsUnitId!: number | null
    // Full dryer view from server, when surfaced.
    @Prop({ type: Object, default: null }) readonly dryer!: BambuAmsDryerState | null

    busy = false
    // Form state for the Start panel. Pre-fill from the printer's last
    // configured settings when available; otherwise reasonable PLA-safe
    // defaults — user can override per cycle.
    formTempC: number = 50
    formHours: number = 6
    formFilament: string = 'PLA'

    @Watch('dryer', { immediate: true })
    syncFormFromDryer(next: BambuAmsDryerState | null) {
        if (next === null) return
        // Only seed when the user hasn't actively typed something else
        // in this dialog session — heuristic: only when the dialog isn't
        // currently open. Avoids stomping in-progress edits.
        if (this.dialog) return
        if (typeof next.target_temp_c === 'number') this.formTempC = next.target_temp_c
        if (typeof next.target_duration_hours === 'number') this.formHours = next.target_duration_hours
        if (next.filament_type) this.formFilament = next.filament_type
    }

    get dialog(): boolean {
        return this.value
    }
    set dialog(open: boolean) {
        this.$emit('input', open)
    }

    get clipId(): string {
        return `bambu-humidity-clip-${(this as any)._uid ?? ''}`
    }

    get hasHumidity(): boolean {
        return typeof this.humidity === 'number' && this.humidity >= 0
    }

    get drying(): boolean {
        // Prefer the server's enriched `active` flag — it covers
        // Checking / Drying / Error / heat-out-of-control. Falls back
        // to the legacy "time remaining > 0" heuristic.
        if (this.dryer !== null) return this.dryer.active
        return this.dryTimeSeconds > 0
    }

    get canControl(): boolean {
        // Need both the server route (signaled by a non-null dryer view)
        // and a known ams_id (externals carry null).
        return this.amsUnitId !== null && this.dryer !== null
    }

    get canStart(): boolean {
        return (
            this.formTempC > 0 &&
            this.formTempC <= 90 &&
            this.formHours > 0 &&
            this.formHours <= 24 &&
            !!this.formFilament.trim()
        )
    }

    get cannotDryLabels(): string[] {
        if (this.dryer === null) return []
        const seen = new Set<string>()
        const out: string[] = []
        const labels = this.dryer.cannot_dry_reason_labels ?? []
        const codes = this.dryer.cannot_dry_reasons ?? []
        for (let i = 0; i < codes.length; i++) {
            const label = labels[i] ?? `Reason ${codes[i]}`
            if (seen.has(label)) continue
            seen.add(label)
            out.push(label)
        }
        return out
    }

    get fillY(): number {
        if (!this.hasHumidity) return 96

        const percent = Math.max(0, Math.min(100, this.humidity as number))
        return Math.round(96 - (percent / 100) * 88)
    }

    get waveFillPath(): string {
        const y = this.fillY
        return [
            `M 0 ${y + 3}`,
            `C 13 ${y - 3}, 27 ${y - 3}, 40 ${y + 3}`,
            `C 53 ${y + 9}, 67 ${y + 9}, 80 ${y + 3}`,
            `L 80 96`,
            `L 0 96`,
            `Z`,
        ].join(' ')
    }

    get stateIcon(): string {
        return mdiWhiteBalanceSunny
    }

    get stateLabel(): string {
        // Prefer the BS-canonical label from the server when available,
        // including the substatus when it adds detail (Heating / Dehumidify).
        if (this.dryer !== null && this.dryer.status_label) {
            const sub = this.dryer.substatus_label
            if (sub && sub !== 'Off' && this.dryer.status_label === 'Drying') {
                return `${this.dryer.status_label} · ${sub}`
            }
            return this.dryer.status_label
        }
        if (this.drying) return 'Drying'
        return 'Idle'
    }

    get humidityDisplay(): string {
        return this.hasHumidity ? `${Math.round(this.humidity as number)}%` : '—'
    }

    get temperatureDisplay(): string {
        if (typeof this.temperature !== 'number' || this.temperature <= 0) return '—'
        return `${this.temperature.toFixed(0)} °C`
    }

    get remainingDisplay(): string {
        // bambu-raker now exposes seconds via dryer.remaining_seconds,
        // and the legacy `dry_time` is minutes. Prefer the new value
        // when available; format as H:MM.
        let minutes: number
        if (this.dryer !== null) {
            minutes = Math.floor(this.dryer.remaining_seconds / 60)
        } else {
            minutes = Math.max(0, Math.floor(this.dryTimeSeconds))
        }
        if (!this.drying || minutes <= 0) return 'Idle'
        const hours = Math.floor(minutes / 60)
        const rem = minutes % 60
        return `${hours}:${rem.toString().padStart(2, '0')}`
    }

    async onStartClicked(): Promise<void> {
        if (this.amsUnitId === null || !this.canStart) return
        const body = {
            ams_id: this.amsUnitId,
            filament_type: this.formFilament.trim(),
            target_temp_c: Math.round(this.formTempC),
            duration_hours: Math.round(this.formHours),
        }
        await this.postDryer('/server/bambu/ams/dry/start', body, `Start drying ${this.unitName}`)
    }

    async onStopClicked(): Promise<void> {
        if (this.amsUnitId === null) return
        await this.postDryer(
            '/server/bambu/ams/dry/stop',
            { ams_id: this.amsUnitId },
            `Stop drying ${this.unitName}`
        )
    }

    private async postDryer(path: string, body: object, label: string): Promise<void> {
        this.busy = true
        this.$store.dispatch('server/addEvent', { message: `${label} (POST ${path})`, type: 'command' })
        try {
            const resp = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!resp.ok) {
                const text = await resp.text()
                this.$store.dispatch('server/addEvent', {
                    message: `${label} failed: HTTP ${resp.status} ${text}`,
                    type: 'response',
                })
            } else {
                this.$store.dispatch('server/addEvent', {
                    message: `${label}: accepted`,
                    type: 'response',
                })
            }
        } catch (e) {
            this.$store.dispatch('server/addEvent', {
                message: `${label} error: ${e}`,
                type: 'response',
            })
        } finally {
            this.busy = false
        }
    }
}
</script>

<style scoped>
.bambu-humidity-card {
    overflow: hidden;
    background: #2b2b2b;
    color: rgba(255, 255, 255, 0.9);
}

.bambu-humidity-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 36px;
    padding: 0 14px 0 18px;
    background: #9d8c45;
    color: #fff;
    font-weight: 600;
}

.bambu-humidity-titlebar__name {
    font-size: 0.95rem;
    letter-spacing: 0.02em;
}

.bambu-humidity-close {
    color: #fff !important;
}

.bambu-humidity-body {
    padding: 26px 30px 30px !important;
}

.bambu-humidity-title {
    margin-bottom: 18px;
    color: #fff;
    font-size: 1.1rem;
    font-weight: 700;
    text-align: center;
}

.bambu-humidity-droplet {
    display: flex;
    justify-content: center;
    margin-bottom: 8px;
}

.bambu-humidity-droplet-svg {
    width: 96px;
    height: 116px;
}

.bambu-humidity-droplet-outline {
    fill: none;
    stroke: rgba(255, 255, 255, 0.78);
    stroke-width: 3;
}

.bambu-humidity-droplet-fill {
    /* Always blue — drying state shows via the red sun icon below,
       not by swapping the water color (BS keeps it blue too). */
    fill: #79bff0;
    transition: d 0.6s ease;
}

.bambu-humidity-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 22px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.95rem;
}

.bambu-humidity-state-icon {
    color: rgba(255, 255, 255, 0.65) !important;
}

.bambu-humidity-state-icon--drying {
    /* Red sun when the AMS is actively heating to dry filament —
       matches Bambu Studio's modal. */
    color: #e55050 !important;
}

.bambu-humidity-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.bambu-humidity-stat {
    text-align: center;
}

.bambu-humidity-stat-label {
    margin-bottom: 6px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.82rem;
}

.bambu-humidity-stat-value {
    color: #fff;
    font-size: 1.05rem;
    font-weight: 600;
}

.bambu-humidity-blockers {
    margin-top: 18px;
    padding: 10px 12px;
    background: rgba(255, 152, 0, 0.08);
    border: 1px solid rgba(255, 152, 0, 0.32);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.85rem;
}

.bambu-humidity-blockers__heading {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-weight: 600;
}

.bambu-humidity-blockers__list {
    margin: 0;
    padding-left: 22px;
    line-height: 1.45;
}

.bambu-humidity-controls {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.bambu-humidity-form {
    display: grid;
    grid-template-columns: 1fr 1fr 1.4fr;
    gap: 10px;
}

.bambu-humidity-form__field {
    min-width: 0;
}

.bambu-humidity-form__field--filament {
    /* Filament needs the most room because labels like "PETG-CF" run long. */
}
</style>
