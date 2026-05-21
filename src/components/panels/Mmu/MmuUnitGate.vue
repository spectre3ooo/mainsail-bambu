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
                <!-- Bambu auto-refill peer indicator (T15). Small chain
                     icon shown when this slot has at least one peer slot
                     with the same material + color — those slots are
                     auto-refill candidates for each other when the
                     printer's `auto_switch_filament` print_option is on.
                     The tooltip lists the peer slot labels. -->
                <v-tooltip v-if="autoRefillPeerCount > 0" top open-delay="200">
                    <template #activator="{ on, attrs }">
                        <span class="bambu-refill-chip" v-bind="attrs" v-on="on">
                            <v-icon size="10">{{ mdiLinkVariant }}</v-icon>
                            <span class="bambu-refill-chip__count">{{ autoRefillPeerCount + 1 }}</span>
                        </span>
                    </template>
                    <span>
                        Auto-refill group · {{ autoRefillPeerLabels.join(', ') }}
                    </span>
                </v-tooltip>
            </div>
        </div>
        <!-- Bambu fork: per-slot Load/Unload action button removed
             until we model the "currently feeding the hotend" vs
             "present in AMS" distinction properly — `gate_status > 0`
             only tells us a roll exists in the slot, so the button
             showed "Unload" on every populated slot regardless of
             which one was actually being extruded. Backend endpoints
             (/server/bambu/ams/change_filament + /control) remain
             reachable; UI ships once load-vs-unload state is right. -->

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
import { mdiSwapHorizontal, mdiDownloadOutline, mdiEject, mdiLinkVariant } from '@mdi/js'

@Component
export default class MmuUnitGate extends Mixins(BaseMixin, MmuMixin) {
    mdiSwapHorizontal = mdiSwapHorizontal
    mdiDownloadOutline = mdiDownloadOutline
    mdiEject = mdiEject
    mdiLinkVariant = mdiLinkVariant

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

    // ---------- Bambu fork: auto-refill peer detection (T15) ----------

    /**
     * Number of OTHER slots in the same auto-refill group as this one.
     * Two slots are peers when they have the same material AND the same
     * color (within the firmware's tolerance — exact string match is
     * what BS uses for the auto-refill substitution test). Returns 0
     * when this slot is empty, unique, or we can't resolve material.
     */
    get autoRefillPeerCount(): number {
        const peers = this.autoRefillPeerGateIndexes
        return peers.length
    }

    /**
     * Slot labels (A1, B3, HT1, etc) of this slot's auto-refill peers.
     * Used in the tooltip so the user can see which other slots will
     * back this one up if it runs out.
     */
    get autoRefillPeerLabels(): string[] {
        const labels: string[] = []
        // Include THIS slot first, then peers, so the tooltip reads like
        // "Auto-refill group · B1, B3" rather than "B3" (alone, which
        // implies the peer is the only member).
        const mine = typeof this.gateName === 'string' ? this.gateName : `Gate ${this.gateIndex}`
        labels.push(mine)
        for (const peerIdx of this.autoRefillPeerGateIndexes) {
            labels.push(this.labelForGate(peerIdx))
        }
        return labels
    }

    private get autoRefillPeerGateIndexes(): number[] {
        const myMaterial = this.mmu?.gate_material?.[this.gateIndex]
        const myColor = this.mmu?.gate_color?.[this.gateIndex]
        // Empty / unknown slot → no peers. `gate_status > 0` means a roll
        // is present; we'd otherwise group all the "empty" slots together
        // as a degenerate refill chain.
        if (!myMaterial || (this.mmu?.gate_status?.[this.gateIndex] ?? 0) <= 0) {
            return []
        }
        const peers: number[] = []
        const numGates = this.mmu?.gate_material?.length ?? 0
        for (let i = 0; i < numGates; i++) {
            if (i === this.gateIndex) continue
            if ((this.mmu?.gate_status?.[i] ?? 0) <= 0) continue
            if (this.mmu.gate_material[i] !== myMaterial) continue
            // Color match: BS's auto-refill requires the colors line up.
            // Empty / missing colors compare equal (both empty) — that's
            // fine since material alone wouldn't be enough either.
            if ((this.mmu.gate_color?.[i] ?? '') !== (myColor ?? '')) continue
            peers.push(i)
        }
        return peers
    }

    private labelForGate(gateIndex: number): string {
        // Mirror the same derivation `gateName` uses for this gate.
        // Walk mmu_machine units to find which unit owns it and what its
        // position within that unit is, then format as "A1" / "HT1" / etc.
        const machine = (this.$store.state.printer as Record<string, unknown>).mmu_machine as
            | Record<string, { name?: string; first_gate?: number; num_gates?: number }>
            | undefined
        if (!machine) return `Gate ${gateIndex}`
        for (const value of Object.values(machine)) {
            if (!value || typeof value !== 'object') continue
            const first = value.first_gate ?? 0
            const count = value.num_gates ?? 0
            if (gateIndex < first || gateIndex >= first + count) continue
            const name = value.name ?? ''
            const amsMatch = name.match(/^AMS\s+([A-Z]+)$/)
            if (amsMatch) return `${amsMatch[1]}${gateIndex - first + 1}`
            if (/^Ext(\s|$)/.test(name)) return name
            return `Gate ${gateIndex}`
        }
        return `Gate ${gateIndex}`
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

.bambu-refill-chip {
    /* Tiny inline chain badge next to the slot label, signalling
       "this slot has an auto-refill peer". */
    display: inline-flex;
    align-items: center;
    gap: 1px;
    margin-left: 4px;
    padding: 0 4px;
    background: rgba(33, 150, 243, 0.18);
    color: rgba(33, 150, 243, 0.95);
    border-radius: 8px;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    height: 14px;
    align-self: center;
}

.bambu-refill-chip__count {
    /* Group size including this slot itself. "2" reads cleaner than
       "1 peer". */
    font-variant-numeric: tabular-nums;
}

</style>
