<template>
    <div class="d-flex flex-column align-center">
        <div
            v-longpress:500="openContextMenu"
            class="d-flex flex-wrap mb-n2 pt-1 position-relative"
            @contextmenu.prevent="openContextMenu($event)">
            <mmu-unit-gate-spool
                class="position-relative zindex-1"
                :gate-index="gateIndex"
                :show-details="showDetails"
                :is-selected="isSelected"
                :unhighlight-spools="unhighlightSpools"
                @select-gate="selectGate" />
        </div>
        <div class="mmu-unit-box d-flex zindex-3 pb-1 pt-2 position-relative" :class="gateClass">
            <div class="d-flex w-100 gate-contents">
                <span class="gate-number rounded cursor-pointer" :class="gateNumberClass" @click="selectGate">
                    {{ gateName }}
                </span>
            </div>
        </div>
        <!-- Bambu fork: per-slot load/unload action button. Visible only
             when running against bambu-raker AND we can resolve the
             slot's (ams_id, slot_id, extruder_id) tuple from the store.
             Stays hidden on stock Klipper/Happy-Hare MMUs. -->
        <v-btn
            v-if="bambuActionVisible"
            x-small
            text
            class="bambu-gate-action mt-1 px-1"
            :loading="bambuActionLoading"
            :disabled="bambuActionLoading"
            :title="bambuIsLoaded ? 'Unload this slot' : 'Load filament from this slot'"
            @click="onBambuActionClick">
            <v-icon size="14" :color="bambuIsLoaded ? 'warning' : 'primary'">
                {{ bambuIsLoaded ? mdiEject : mdiDownloadOutline }}
            </v-icon>
            <span class="bambu-gate-action__label ml-1">
                {{ bambuIsLoaded ? 'Unload' : 'Load' }}
            </span>
        </v-btn>
        <v-menu
            v-model="contextMenu"
            transition="slide-y-transition"
            :position-x="menuX"
            :position-y="menuY"
            :close-on-content-click="false"
            absolute
            offset-y>
            <v-list dense @mouseleave="closeContextMenu">
                <v-subheader class="d-block text-subtitle-2 text-center mb-0 h-auto pb-2">
                    {{ $t('Panels.MmuPanel.Gate') }} {{ gateIndex }}
                </v-subheader>
                <v-divider class="mb-2" />
                <v-list-item v-for="(button, index) in contextMenuButtons" :key="index">
                    <v-btn
                        small
                        class="w-100"
                        :disabled="!canSend"
                        :loading="loadings.includes(button.command.toLowerCase())"
                        @click="gateCommand(button.command)">
                        <v-icon left>{{ button.icon }}</v-icon>
                        {{ button.label }}
                    </v-btn>
                </v-list-item>
            </v-list>
        </v-menu>
    </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import type { LongpressEvent } from '@/directives/longpress'
import BaseMixin from '@/components/mixins/base'
import MmuMixin, { MmuMachineUnit, TOOL_GATE_BYPASS } from '@/components/mixins/mmu'
import { mdiSwapHorizontal, mdiDownloadOutline, mdiEject } from '@mdi/js'

@Component
export default class MmuUnitGate extends Mixins(BaseMixin, MmuMixin) {
    mdiSwapHorizontal = mdiSwapHorizontal
    mdiDownloadOutline = mdiDownloadOutline
    mdiEject = mdiEject

    @Prop({ required: true }) readonly gateIndex!: number
    @Prop({ required: true }) readonly mmuMachineUnit!: MmuMachineUnit
    @Prop({ default: false }) readonly showDetails!: boolean
    @Prop({ default: false }) readonly showContextMenu!: boolean
    @Prop({ required: true }) readonly selectedGate!: number
    @Prop({ default: false }) readonly unhighlightSpools!: boolean
    @Prop({ default: false }) readonly hasBypass!: boolean

    closeTimeout: number | null = null
    contextMenu = false
    menuX = 0
    menuY = 0

    get gateName() {
        if (this.gateIndex === TOOL_GATE_BYPASS) return 'Bypass'
        // When the unit name encodes a slot prefix ("AMS A", "AMS B",
        // "AMS HT"), surface per-unit slot labels (A1..A4, B1..B4, HT1)
        // instead of the global gate number. Falls back to the gate
        // index for any unit name we don't recognize — keeps stock
        // Klipper/Happy-Hare MMUs unchanged.
        const slotLabel = this.derivedSlotLabel
        if (slotLabel !== null) return slotLabel
        return this.gateIndex
    }

    get derivedSlotLabel(): string | null {
        const name = this.mmuMachineUnit?.name
        if (!name) return null
        const amsMatch = name.match(/^AMS\s+([A-Z]+)$/)
        if (amsMatch) return `${amsMatch[1]}${this.gatePosition}`
        if (/^Ext(\s|$)/.test(name)) return name  // single-slot — no number
        return null
    }

    get gateStatus() {
        return this.mmu?.gate_status[this.gateIndex] ?? 0
    }

    get gateNumberClass() {
        return {
            active: this.isSelected,
            'border-unknown': this.gateStatus < 0,
            'border-active': this.gateStatus > 0,
            bypass: this.gateIndex === TOOL_GATE_BYPASS,
        }
    }

    get isSelected() {
        return this.selectedGate === this.gateIndex
    }

    get contextMenuButtons() {
        return [
            { icon: this.mdiSwapHorizontal, command: 'MMU_SELECT', label: this.$t('Panels.MmuPanel.ButtonSelect') },
            { icon: this.mdiDownloadOutline, command: 'MMU_PRELOAD', label: this.$t('Panels.MmuPanel.ButtonPreload') },
            { icon: this.mdiEject, command: 'MMU_EJECT', label: this.$t('Panels.MmuPanel.ButtonEject') },
        ]
    }

    get gatePosition() {
        const firstGateNumber = this.mmuMachineUnit?.first_gate ?? 0

        return this.gateIndex + 1 - firstGateNumber
    }

    get firstGate() {
        return this.gatePosition === 1
    }

    get lastGate() {
        if (this.gateIndex === TOOL_GATE_BYPASS) return true

        return this.gatePosition === this.mmuMachineUnit?.num_gates && !this.hasBypass
    }

    get gateClass() {
        return {
            'left-gate': this.firstGate,
            'right-gate': this.lastGate,
        }
    }

    selectGate() {
        this.$emit('select-gate', this.gateIndex)
    }

    openContextMenu(e: MouseEvent | LongpressEvent) {
        e.preventDefault()

        if (this.gateIndex < 0 || this.gateIndex === this.selectedGate || !this.showContextMenu) return

        this.menuX = e.clientX - 20
        this.menuY = e.clientY - 20

        this.closeContextMenu()

        this.contextMenu = true
        this.closeTimeout = window.setTimeout(() => {
            this.closeContextMenu()
        }, 8000)
    }

    closeContextMenu() {
        this.clearCloseTimeout()
        this.contextMenu = false
    }

    clearCloseTimeout() {
        if (this.closeTimeout === null) return

        clearTimeout(this.closeTimeout)
        this.closeTimeout = null
    }

    mounted() {
        addEventListener('mmu-close-gate-context-menus', this.closeContextMenu)
    }

    beforeDestroy() {
        removeEventListener('mmu-close-gate-context-menus', this.closeContextMenu)
        this.clearCloseTimeout()
    }

    gateCommand(command: string) {
        this.doSend(`${command} GATE=${this.gateIndex}`, command.toLowerCase())
    }

    // ---------- Bambu fork: per-slot load/unload action ----------

    bambuActionLoading = false

    private get isBambuRaker(): boolean {
        const components = this.$store.state.server?.components
        return Array.isArray(components) && components.includes('bambu_raker')
    }

    /**
     * Resolve this gate to the Bambu MQTT command tuple needed by
     * /server/bambu/ams/change_filament. Returns null when:
     *   - Not on a bambu-raker backend
     *   - The mmu_machine unit name doesn't match a known AMS prefix
     *     ("AMS A/B/HT" → 0/1/128, "Ext L/R" → 254/255)
     *   - The bambu_ams.nozzle_view layout can't tell us which
     *     nozzle column owns this AMS unit (no extruder_id)
     *
     * Stays null on stock Klipper/Happy-Hare so the action button hides.
     */
    private get bambuSlotInfo(): { amsId: number; slotId: number; extruderId: number } | null {
        if (!this.isBambuRaker) return null
        const unit = this.mmuMachineUnit
        if (!unit?.name) return null

        let amsId: number | null = null
        // bambu-raker stamps names as "AMS A", "AMS B", "AMS HT", "Ext L", "Ext R".
        // No locale lookup — these are server-emitted, not user-facing strings.
        const amsMatch = unit.name.match(/^AMS\s+([A-Z]+)$/)
        if (amsMatch) {
            const letter = amsMatch[1]
            if (letter === 'HT') amsId = 128
            else if (letter.length === 1) amsId = letter.charCodeAt(0) - 'A'.charCodeAt(0)
        } else if (unit.name === 'Ext L' || unit.name === 'Ext' || unit.name === 'Ext.') {
            amsId = 254
        } else if (unit.name === 'Ext R') {
            amsId = 255
        }
        if (amsId === null) return null

        const firstGate = unit.first_gate ?? 0
        const slotId = this.gateIndex - firstGate
        if (slotId < 0) return null

        // Look up which column (nozzle/extruder) this AMS unit lives in.
        const bambuAms = (this.$store.state.printer as Record<string, unknown>).bambu_ams as
            | { nozzle_view?: { columns?: Array<{ extruder_id: number; units: Array<{ id: number }> }> } }
            | undefined
        const columns = bambuAms?.nozzle_view?.columns
        if (!Array.isArray(columns)) return null
        for (const col of columns) {
            if (col.units?.some((u) => u.id === amsId)) {
                return { amsId, slotId, extruderId: col.extruder_id }
            }
            // Externals attach via `column.external`, not `column.units`. The
            // 254/255 ams_id IS the side marker, so for externals we infer the
            // column from the side without scanning units.
        }
        if (amsId === 254) return { amsId, slotId: 0, extruderId: 1 }
        if (amsId === 255) return { amsId, slotId: 0, extruderId: 0 }
        return null
    }

    get bambuIsLoaded(): boolean {
        // Aligns with the existing `gate_status` array — non-zero means
        // a tray is registered in this slot. Driven by translate_mmu's
        // empty-detection (which already collapses stale externals).
        return (this.mmu?.gate_status?.[this.gateIndex] ?? 0) > 0
    }

    get bambuActionVisible(): boolean {
        if (this.gateIndex === TOOL_GATE_BYPASS) return false
        // Don't show on slots that have neither material to unload NOR
        // material to load (truly empty slots can still load if the user
        // puts a roll in). For now: always show when we can resolve the
        // slot info — Load for empty, Unload for loaded.
        return this.bambuSlotInfo !== null
    }

    async onBambuActionClick() {
        const info = this.bambuSlotInfo
        if (info === null) return
        const isUnload = this.bambuIsLoaded
        // For unload we don't need slot_id at all (firmware uses the
        // currently-loaded source on extruder_id); pass slot_id=null so
        // the backend sends the 255/255 sentinel pair.
        const body: Record<string, number | null> = {
            ams_id: info.amsId,
            extruder_id: info.extruderId,
            slot_id: isUnload ? null : info.slotId,
        }
        const verb = isUnload ? 'unload' : 'load'
        const label = isUnload ? 'Unload' : `Load slot ${this.bambuSlotName}`
        this.bambuActionLoading = true
        this.$store.dispatch('server/addEvent', {
            message: `${label} (POST /server/bambu/ams/change_filament)`,
            type: 'command',
        })
        try {
            const resp = await fetch('/server/bambu/ams/change_filament', {
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
                    message: `${label}: printer accepted (watch substage banner for progress)`,
                    type: 'response',
                })
            }
        } catch (e) {
            this.$store.dispatch('server/addEvent', {
                message: `${verb} request error: ${e}`,
                type: 'response',
            })
        } finally {
            this.bambuActionLoading = false
        }
    }

    private get bambuSlotName(): string {
        // Use the same derived label the dashboard shows (A1, B3, HT1)
        // so the log line is unambiguous.
        return typeof this.gateName === 'string' ? this.gateName : `gate ${this.gateIndex}`
    }
}
</script>

<style scoped>
.zindex-1 {
    z-index: 1;
}

.zindex-3 {
    z-index: 3;
}

.gate-number {
    margin-left: 2px;
    border: 2px solid #808080;
    width: 80%;
    position: relative;
    z-index: 4;
    text-align: center;
    color: #c0c0c0;
    font-weight: bold;
    line-height: 16px;
    font-size: 14px;
}

html.theme--light .gate-number {
    color: #5d5d5d;
}

.gate-number.active {
    color: #000000;
    background-color: limegreen;
}

.gate-number.bypass {
    font-size: 10px;
    text-transform: uppercase;
    width: 90%;
    border-color: transparent !important;
}

.gate-number.border-active {
    border-color: green;
}

.gate-number.border-unknown {
    border-color: orange;
}

.mmu-unit-box {
    box-shadow: inset 0 4px 4px -4px #ffffff80;
    background-image: linear-gradient(to bottom, #3c3c3c 0%, #2c2c2c 100%);
    border-radius: 0 0 8px 8px;
    justify-content: center;
    width: 100%;
}

html.theme--light .mmu-unit-box {
    box-shadow: inset 0 4px 4px -4px #ffffff80;
    background-image: linear-gradient(to bottom, #c0c0c0 0%, #f0f0f0 100%);
}

.left-gate {
    border-radius: 8px 0 0 0;
    margin-left: -16px;
    width: calc(100% + 16px);
}

.left-gate .gate-contents {
    margin-left: 16px;
}

.right-gate {
    border-radius: 0 8px 0 0;
    margin-right: -16px;
    width: calc(100% + 16px);
}

.right-gate .gate-contents {
    margin-right: 16px;
}

.left-gate.right-gate {
    border-radius: 8px 8px 0 0;
    width: calc(100% + 32px);
    margin-right: -16px;
}

.bambu-gate-action {
    /* Visually quieter than primary action buttons — this is per-slot
       and shouldn't dominate the spool tile. */
    min-width: 0 !important;
    height: 22px !important;
    letter-spacing: normal !important;
    text-transform: none !important;
    font-size: 11px;
    opacity: 0.85;
}

.bambu-gate-action__label {
    line-height: 1;
}
</style>
