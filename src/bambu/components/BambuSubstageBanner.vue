<template>
    <v-card v-if="visible" outlined class="bambu-substage-banner pa-2">
        <div class="bambu-substage-banner__row">
            <v-icon :color="iconColor" size="20" class="mr-2">{{ icon }}</v-icon>
            <span class="bambu-substage-banner__label">{{ label }}</span>
            <span v-if="countdown !== null" class="bambu-substage-banner__countdown">
                · {{ countdown }}
            </span>
            <span v-if="nextLabel" class="bambu-substage-banner__next">
                <v-icon size="14" class="mx-1">{{ mdiChevronRight }}</v-icon>
                {{ nextLabel }}
            </span>
            <v-spacer />
            <!-- Silence the buzzer. Only surfaced during pause-class
                 substages — that's when the printer's beeper is
                 typically nagging. Always-visible button would be
                 dashboard clutter for routine prep transients. -->
            <v-btn
                v-if="isPause"
                x-small
                text
                color="warning"
                :loading="silencing"
                :disabled="silencing"
                class="bambu-substage-banner__silence"
                title="Silence the printer's buzzer"
                @click="onSilenceClicked">
                <v-icon size="16" left>{{ mdiBellOffOutline }}</v-icon>
                Silence
            </v-btn>
        </div>
    </v-card>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiAlertCircleOutline, mdiBellOffOutline, mdiChevronRight, mdiCog, mdiInformationOutline, mdiPause } from '@mdi/js'

// Pause-class substage codes share the same wording prefix in BS
// ("Pause ..."/"Paused ..."). Surface them visually distinctly so the
// user can spot "needs attention" states at a glance vs. routine
// prep/cleanup transients.
const PAUSE_CODES = new Set<number>([5, 6, 16, 17, 19, 20, 22, 25, 26, 27, 29, 31, 32, 33, 34])

interface SubstageView {
    current_code: number | null
    current_label: string | null
    remaining_seconds: number
    queue: number[]
    queue_labels: (string | null)[]
}

@Component
export default class BambuSubstageBanner extends Mixins(BaseMixin) {
    mdiChevronRight = mdiChevronRight
    mdiBellOffOutline = mdiBellOffOutline

    silencing = false

    async onSilenceClicked(): Promise<void> {
        this.silencing = true
        this.$store.dispatch('server/addEvent', {
            message: 'Silence buzzer (POST /server/bambu/print/buzzer/stop)',
            type: 'command',
        })
        try {
            const resp = await fetch('/server/bambu/print/buzzer/stop', { method: 'POST' })
            if (!resp.ok) {
                const text = await resp.text()
                this.$store.dispatch('server/addEvent', {
                    message: `Silence buzzer failed: HTTP ${resp.status} ${text}`,
                    type: 'response',
                })
            }
        } catch (e) {
            this.$store.dispatch('server/addEvent', {
                message: `Silence buzzer error: ${e}`,
                type: 'response',
            })
        } finally {
            this.silencing = false
        }
    }

    get substage(): SubstageView | null {
        // bambu_substage may be absent on a vanilla-Moonraker backend or
        // before the first WS frame arrives. Either way: hide.
        const s = (this.$store.state.printer as Record<string, unknown>).bambu_substage
        return (s as SubstageView | undefined) ?? null
    }

    get visible(): boolean {
        return this.substage !== null && this.substage.current_code !== null
    }

    get currentCode(): number | null {
        return this.substage?.current_code ?? null
    }

    get label(): string {
        const s = this.substage
        if (s === null) return ''
        // Fall back to a "Stage <N>" placeholder for unknown codes —
        // better than showing nothing while the backend's label table
        // catches up with new firmware.
        return s.current_label ?? `Stage ${s.current_code}`
    }

    get countdown(): string | null {
        const s = this.substage
        if (s === null || s.remaining_seconds <= 0) return null
        const m = Math.floor(s.remaining_seconds / 60)
        const sec = s.remaining_seconds % 60
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    get nextLabel(): string | null {
        const s = this.substage
        if (s === null || !s.queue_labels?.length) return null
        return s.queue_labels[0]
    }

    get isPause(): boolean {
        return this.currentCode !== null && PAUSE_CODES.has(this.currentCode)
    }

    get icon(): string {
        if (this.isPause) return mdiPause
        // Generic "informational" icon for non-pause transients (homing,
        // bed leveling, calibration). Could specialize per code later.
        return mdiCog
    }

    get iconColor(): string {
        if (this.isPause) return 'warning'
        return 'primary'
    }
}
</script>

<style scoped>
.bambu-substage-banner {
    background: rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.12);
    margin-bottom: 8px;
}

.bambu-substage-banner__row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    line-height: 24px;
}

.bambu-substage-banner__label {
    font-weight: 600;
    font-size: 14px;
}

.bambu-substage-banner__countdown {
    margin-left: 4px;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
    font-size: 13px;
}

.bambu-substage-banner__next {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    font-size: 13px;
    opacity: 0.65;
}

.bambu-substage-banner__silence {
    /* Don't expand to row-width; sit flush right via v-spacer. */
    min-width: 0 !important;
    text-transform: none !important;
    letter-spacing: normal !important;
}

html.theme--light .bambu-substage-banner {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.12);
}
</style>
