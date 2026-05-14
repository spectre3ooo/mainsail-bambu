<template>
    <v-dialog v-model="dialog" :max-width="480" content-class="bambu-humidity-dialog">
        <v-card class="bambu-humidity-card">
            <div class="bambu-humidity-titlebar">
                <v-btn icon small class="bambu-humidity-close" @click="dialog = false">
                    <v-icon size="20">{{ mdiClose }}</v-icon>
                </v-btn>
            </div>
            <v-card-text class="bambu-humidity-body">
                <div class="bambu-humidity-title">Current AMS humidity</div>

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
                        <div class="bambu-humidity-stat-label">Remaining Time</div>
                        <div class="bambu-humidity-stat-value">{{ remainingDisplay }}</div>
                    </div>
                </div>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { mdiClose, mdiWhiteBalanceSunny } from '@mdi/js'

@Component
export default class BambuAmsHumidityModal extends Vue {
    mdiClose = mdiClose

    @Prop({ type: Boolean, default: false }) readonly value!: boolean
    @Prop({ type: String, default: '' }) readonly unitName!: string
    @Prop({ type: Number, default: null }) readonly humidity!: number | null
    @Prop({ type: Number, default: null }) readonly temperature!: number | null
    // Despite the prop name, the printer reports drying time in MINUTES
    // (Bambu's `dry_time` field), NOT seconds. Renaming the prop would
    // ripple to the panel and bambu-raker state field; instead we just
    // treat the integer as minutes here. TODO: rename to dryTimeMinutes
    // when we touch the panel-side wiring next.
    @Prop({ type: Number, default: 0 }) readonly dryTimeSeconds!: number

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
        return this.dryTimeSeconds > 0
    }

    get fillY(): number {
        if (!this.hasHumidity) return 96

        const percent = Math.max(0, Math.min(100, this.humidity as number))
        return Math.round(96 - (percent / 100) * 88)
    }

    get waveFillPath(): string {
        // Build a wavy water-surface path. The fill spans the SVG width
        // (0..80) and reaches from `fillY` down to y=96. The top edge
        // (`fillY`) gets two sinusoidal humps using cubic beziers.
        const y = this.fillY
        // Wave amplitude ~3, two humps across width 80.
        return [
            `M 0 ${y + 3}`,
            // Hump 1 up
            `C 13 ${y - 3}, 27 ${y - 3}, 40 ${y + 3}`,
            // Hump 2 up
            `C 53 ${y + 9}, 67 ${y + 9}, 80 ${y + 3}`,
            // Down the right, across the bottom, up the left
            `L 80 96`,
            `L 0 96`,
            `Z`,
        ].join(' ')
    }

    get stateIcon(): string {
        // BS uses a red sun glyph for "drying" (heating coil active) and
        // a neutral sun for "idle". mdiWhiteBalanceSunny serves both —
        // color is applied via CSS based on the drying state.
        return mdiWhiteBalanceSunny
    }

    get stateLabel(): string {
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
        // Bambu's `dry_time` is already in minutes — see the prop's
        // comment. Format as H:MM to match the printer's own display.
        if (!this.drying) return 'Idle'

        const minutes = Math.max(0, Math.floor(this.dryTimeSeconds))
        const hours = Math.floor(minutes / 60)
        const rem = minutes % 60
        return `${hours} : ${rem.toString().padStart(2, '0')}`
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
    justify-content: flex-end;
    height: 36px;
    padding: 0 6px;
    background: #9d8c45;
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
</style>
