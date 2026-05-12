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

                <div class="bambu-humidity-droplet" :class="dropletClass">
                    <svg viewBox="0 0 80 96" class="bambu-humidity-droplet-svg" aria-hidden="true">
                        <defs>
                            <clipPath :id="clipId">
                                <path d="M40 4 C40 4 6 44 6 68 C6 84 21 92 40 92 C59 92 74 84 74 68 C74 44 40 4 40 4 Z" />
                            </clipPath>
                        </defs>
                        <path
                            class="bambu-humidity-droplet-outline"
                            d="M40 4 C40 4 6 44 6 68 C6 84 21 92 40 92 C59 92 74 84 74 68 C74 44 40 4 40 4 Z" />
                        <rect
                            :clip-path="`url(#${clipId})`"
                            x="0"
                            :y="fillY"
                            width="80"
                            height="96"
                            class="bambu-humidity-droplet-fill" />
                    </svg>
                </div>

                <div class="bambu-humidity-state">
                    <v-icon size="18" class="bambu-humidity-state-icon">{{ stateIcon }}</v-icon>
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
import { mdiClose, mdiWhiteBalanceSunny, mdiAirHumidifier } from '@mdi/js'

@Component
export default class BambuAmsHumidityModal extends Vue {
    mdiClose = mdiClose

    @Prop({ type: Boolean, default: false }) readonly value!: boolean
    @Prop({ type: String, default: '' }) readonly unitName!: string
    @Prop({ type: Number, default: null }) readonly humidity!: number | null
    @Prop({ type: Number, default: null }) readonly temperature!: number | null
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

    get dropletClass(): string {
        return this.drying ? 'bambu-humidity-droplet--drying' : ''
    }

    get stateIcon(): string {
        return this.drying ? mdiAirHumidifier : mdiWhiteBalanceSunny
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
        if (!this.drying) return 'Idle'

        const minutes = Math.max(1, Math.ceil(this.dryTimeSeconds / 60))
        if (minutes < 60) return `${minutes} min`

        const hours = Math.floor(minutes / 60)
        const rem = minutes % 60
        return rem ? `${hours} h ${rem} min` : `${hours} h`
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
    fill: #79bff0;
    transition: y 0.6s ease;
}

.bambu-humidity-droplet--drying .bambu-humidity-droplet-fill {
    fill: #f0b270;
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
