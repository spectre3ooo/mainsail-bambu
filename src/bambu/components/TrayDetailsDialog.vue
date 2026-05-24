<template>
    <v-dialog max-width="420" :value="dialog" @input="onDialogInput">
        <v-card v-if="tray">
            <v-card-title class="d-flex justify-space-between">
                <span>AMS {{ amsName }} · Slot {{ tray.id + 1 }}</span>
                <v-btn icon @click="$emit('close')"><v-icon>mdi-close</v-icon></v-btn>
            </v-card-title>

            <v-card-text>
                <div class="d-flex align-center mb-2">
                    <span class="swatch" :style="swatchStyle"></span>
                    <span>{{ colorName }}</span>
                    <span class="dot mx-2">·</span>
                    <span>{{ tray.material || '—' }}</span>
                    <span v-if="tray.sub_brands" class="ml-2 text-medium-emphasis">· {{ tray.sub_brands }}</span>
                </div>

                <div v-if="spoolmanSpool" class="mb-2">Spool #{{ spoolmanSpool.id }} · {{ remainingLabel }} remaining</div>
                <div v-else-if="tray.spool_id" class="mb-2 text-medium-emphasis">
                    Linked spool #{{ tray.spool_id }} (not in Spoolman cache)
                </div>

                <div v-if="hasTemps" class="mb-2">
                    Nozzle {{ tray.nozzle_temp_min }}-{{ tray.nozzle_temp_max }}°C · Bed {{ tray.bed_temp || '?' }}°C
                </div>

                <div v-if="hasRfid" class="mb-2 text-caption text-medium-emphasis">RFID: {{ tray.tag_uid }}</div>
            </v-card-text>

            <v-card-actions>
                <v-btn @click="$emit('change-spool')">Change Spool</v-btn>
                <v-btn :disabled="!tray.spool_id" @click="$emit('clear-spool')">Clear</v-btn>
                <v-spacer />
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { nameForHex } from '@/bambu/util/colorNames'

interface TrayLike {
    id: number
    global_index: number
    color_hex: string
    material: string
    sub_brands: string
    nozzle_temp_min: number
    nozzle_temp_max: number
    bed_temp: number
    tag_uid: string
    spool_id: number | null
}

interface SpoolLike {
    id: number
    remaining_weight: number | null
}

@Component({})
export default class TrayDetailsDialog extends Vue {
    @Prop({ required: true }) dialog!: boolean
    @Prop({ required: true }) tray!: TrayLike | null
    @Prop({ required: true }) amsName!: string
    @Prop({ default: null }) spoolmanSpool!: SpoolLike | null

    get swatchStyle(): Record<string, string> {
        const c = this.tray?.color_hex || '00000000'
        return {
            background: '#' + c.slice(0, 6),
            display: 'inline-block',
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.15)',
            marginRight: '8px',
        }
    }

    get colorName(): string {
        return nameForHex(this.tray?.color_hex || '')
    }

    get hasTemps(): boolean {
        return !!(this.tray && (this.tray.nozzle_temp_min || this.tray.nozzle_temp_max))
    }

    get hasRfid(): boolean {
        const uid = this.tray?.tag_uid || ''
        return !!uid && uid !== '0000000000000000'
    }

    get remainingLabel(): string {
        if (!this.spoolmanSpool) return ''
        const w = this.spoolmanSpool.remaining_weight
        return w == null ? 'unknown' : `${Math.round(w)}g`
    }

    onDialogInput(v: boolean): void {
        if (!v) this.$emit('close')
    }
}
</script>

<style scoped>
.dot {
    opacity: 0.5;
}
</style>
