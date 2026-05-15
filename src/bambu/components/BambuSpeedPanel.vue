<template>
    <panel v-if="showPanel" :icon="mdiSpeedometer" :title="title" :collapsible="true" card-class="bambu-speed-panel">
        <v-card-text class="bambu-speed-panel__body">
            <div class="bambu-speed-disclaimer">This only takes effect during printing</div>
            <div class="bambu-speed-track" role="radiogroup" aria-label="Print speed">
                <div class="bambu-speed-line" aria-hidden="true"></div>
                <button
                    v-for="preset in presets"
                    :key="preset.level"
                    type="button"
                    role="radio"
                    :aria-checked="preset.level === currentLevel ? 'true' : 'false'"
                    :title="`${preset.label} (${preset.percent}%)`"
                    class="bambu-speed-stop"
                    :class="{
                        'bambu-speed-stop--active': preset.level === currentLevel,
                        'bambu-speed-stop--pending': preset.level === pendingLevel,
                    }"
                    @click="selectLevel(preset.level)">
                    <span class="bambu-speed-stop__dot" aria-hidden="true">
                        <v-icon v-if="preset.level === currentLevel" size="14">
                            {{ mdiMenu }}
                        </v-icon>
                    </span>
                    <span class="bambu-speed-stop__label">{{ preset.label }}</span>
                </button>
            </div>
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import { isBambuRakerBackend } from '@/bambu/detection'
import { mdiMenu, mdiSpeedometer } from '@mdi/js'

interface SpeedPreset {
    level: number
    label: string
    percent: number
}

// Bambu's published 4-position speed table. Matches the backend's
// `_LEVEL_PERCENTS` in speed_level_dispatcher.py — keep in sync.
const PRESETS: SpeedPreset[] = [
    { level: 1, label: 'Silent', percent: 50 },
    { level: 2, label: 'Standard', percent: 100 },
    { level: 3, label: 'Sport', percent: 124 },
    { level: 4, label: 'Ludicrous', percent: 166 },
]

@Component({
    components: { Panel },
})
export default class BambuSpeedPanel extends Mixins(BaseMixin) {
    mdiMenu = mdiMenu
    mdiSpeedometer = mdiSpeedometer
    presets = PRESETS

    // Optimistic UI: when the user clicks a preset we tag it as pending
    // until the printer echoes a new gcode_macro bambu_speed_level value.
    // The backend's SpeedLevelDispatcher updates state.speed_level
    // immediately on receiving the gcode, so this usually clears within
    // 100-200 ms even before the MQTT round-trip.
    pendingLevel: number | null = null

    get showPanel(): boolean {
        return this.klipperReadyForGui && this.isBambuRaker
    }

    get isBambuRaker(): boolean {
        return isBambuRakerBackend(this.$store)
    }

    get currentLevel(): number {
        const macro = this.$store.state.printer?.['gcode_macro bambu_speed_level']
        const raw = macro?.level
        const lvl = typeof raw === 'number' ? raw : Number.parseInt(raw, 10)
        return Number.isFinite(lvl) && lvl >= 1 && lvl <= 4 ? lvl : 2
    }

    get title(): string {
        const preset = this.presets.find((p) => p.level === this.currentLevel)
        return preset ? `Print Speed — ${preset.label}` : 'Print Speed'
    }

    selectLevel(level: number): void {
        if (level === this.currentLevel || level === this.pendingLevel) return
        this.pendingLevel = level
        this.$socket.emit(
            'printer.gcode.script',
            { script: `BAMBU_SPEED_LEVEL LEVEL=${level}` },
            { action: 'bambu/clearPendingSpeedLevel' }
        )
    }

    // Clear `pendingLevel` once the printer state catches up. Watch is
    // declared via Vue.observable() proxy so currentLevel changes trigger
    // it; we just clear when the new level matches what we requested.
    // (Vuex would be heavier than necessary here.)
    mounted(): void {
        this.$watch('currentLevel', (lvl: number) => {
            if (this.pendingLevel === lvl) this.pendingLevel = null
        })
    }
}
</script>

<style scoped>
.bambu-speed-panel__body {
    padding: 12px 16px 18px 16px;
}

.bambu-speed-disclaimer {
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 14px;
}

.bambu-speed-track {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0 6px;
}

/* horizontal track connecting the dots */
.bambu-speed-line {
    position: absolute;
    top: 11px; /* center of the 22px dots */
    left: 18px;
    right: 18px;
    height: 2px;
    background: rgba(255, 255, 255, 0.18);
    z-index: 0;
}

.bambu-speed-stop {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.55);
    transition: color 120ms ease;
}

.bambu-speed-stop:hover {
    color: rgba(255, 255, 255, 0.85);
}

.bambu-speed-stop__dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(40, 40, 40, 1);
    border: 2px solid rgba(255, 255, 255, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
        border-color 120ms ease,
        background 120ms ease,
        transform 120ms ease;
}

.bambu-speed-stop__label {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 500;
}

.bambu-speed-stop--active {
    color: #00ae42; /* Bambu green */
}

.bambu-speed-stop--active .bambu-speed-stop__dot {
    background: rgba(0, 174, 66, 0.18);
    border-color: #00ae42;
    transform: scale(1.05);
}

.bambu-speed-stop--active .v-icon {
    color: #00ae42 !important;
}

/* Pending = user just clicked, awaiting confirmation. Visually like
   active but slightly dimmer to convey "in flight". */
.bambu-speed-stop--pending:not(.bambu-speed-stop--active) {
    color: rgba(0, 174, 66, 0.7);
}

.bambu-speed-stop--pending:not(.bambu-speed-stop--active) .bambu-speed-stop__dot {
    background: rgba(0, 174, 66, 0.12);
    border-color: rgba(0, 174, 66, 0.7);
}

.bambu-speed-stop:focus-visible {
    outline: 2px solid rgba(0, 174, 66, 0.6);
    outline-offset: 4px;
    border-radius: 4px;
}
</style>
