<template>
    <v-dialog v-model="showDialog" max-width="680" persistent>
        <v-card v-if="currentEntry" class="bambu-hms-modal">
            <v-toolbar dense flat dark color="#9d8c45" class="bambu-hms-modal__toolbar">
                <v-icon left>{{ mdiAlertCircleOutline }}</v-icon>
                <v-toolbar-title class="text-subtitle-1 font-weight-medium">Bambu printer alert</v-toolbar-title>
                <v-spacer />
                <v-chip v-if="currentEntry.code" small label color="rgba(0, 0, 0, 0.25)" text-color="white">
                    {{ currentEntry.code }}
                </v-chip>
            </v-toolbar>

            <v-card-text class="pt-5 pb-3">
                <div class="text-h6 font-weight-medium mb-2 white--text">
                    {{ currentEntry.title }}
                </div>
                <div class="bambu-hms-modal__body text-body-1 text--secondary">
                    {{ currentEntry.description }}
                </div>
                <v-alert v-if="currentEntry.source === 'print_stats'" dense text type="warning" class="mt-4 mb-0">
                    This alert came from <code>print_stats.state</code> because no Bambu announcement entry was active.
                </v-alert>
            </v-card-text>

            <v-card-actions class="bambu-hms-modal__actions px-6 pb-5 pt-2">
                <v-btn v-if="currentEntry.url" text color="success" :href="currentEntry.url" target="_blank" rel="noopener">
                    <v-icon left small>{{ mdiLinkVariant }}</v-icon>
                    Troubleshooting
                </v-btn>
                <v-spacer />
                <v-btn text @click="dismissModal">Dismiss</v-btn>
                <v-btn
                    v-if="canResumePrint"
                    color="success"
                    :loading="loadings.includes('bambuHmsResumePrint')"
                    @click="resumePrint">
                    <v-icon left small>{{ mdiPlay }}</v-icon>
                    Resume
                </v-btn>
                <v-btn
                    v-if="canCancelPrint"
                    outlined
                    color="error"
                    :loading="loadings.includes('bambuHmsCancelPrint')"
                    @click="cancelPrint">
                    <v-icon left small>{{ mdiStop }}</v-icon>
                    Cancel print
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { isBambuRakerBackend } from '@/bambu/detection'
import { mdiAlertCircleOutline, mdiLinkVariant, mdiPlay, mdiStop } from '@mdi/js'
import type { ServerAnnouncementsStateEntry } from '@/store/server/announcements/types'

interface BambuModalEntry {
    id: string
    source: string
    title: string
    description: string
    code: string | null
    url: string
}

@Component
export default class HmsAnnouncementModal extends Mixins(BaseMixin) {
    mdiAlertCircleOutline = mdiAlertCircleOutline
    mdiLinkVariant = mdiLinkVariant
    mdiPlay = mdiPlay
    mdiStop = mdiStop

    showDialog = false
    dismissedModalIds: string[] = []

    get isBambuRaker(): boolean {
        return isBambuRakerBackend(this.$store)
    }

    get announcementEntries(): ServerAnnouncementsStateEntry[] {
        return this.$store.getters['server/announcements/getAnnouncements'] ?? []
    }

    get activeAnnouncementEntries(): BambuModalEntry[] {
        if (!this.isBambuRaker) return []

        const printErrors = this.announcementEntries.filter((entry) => entry.source === 'bambu_print_error')
        const highHmsWarnings = this.announcementEntries.filter(
            (entry) => entry.source === 'bambu_hms' && entry.priority === 'high'
        )

        return [...printErrors, ...highHmsWarnings].map((entry) => this.toModalEntry(entry))
    }

    get activeModalEntries(): BambuModalEntry[] {
        const entries = this.activeAnnouncementEntries
        if (entries.length > 0) return entries

        const fallback = this.fallbackPrintStatsEntry
        return fallback ? [fallback] : []
    }

    get activeModalEntryIds(): string {
        return this.activeModalEntries.map((entry) => entry.id).join('|')
    }

    get currentEntry(): BambuModalEntry | null {
        return this.activeModalEntries.find((entry) => !this.dismissedModalIds.includes(entry.id)) ?? null
    }

    get currentEntryId(): string {
        return this.currentEntry?.id ?? ''
    }

    get fallbackPrintStatsEntry(): BambuModalEntry | null {
        if (!this.isBambuRaker || this.printer_state !== 'error') return null

        const message = this.$store.state.printer.print_stats?.message?.trim() ?? ''
        if (message === '') return null

        return {
            id: `print_stats_error:${message}`,
            source: 'print_stats',
            title: 'Printer reported an error',
            description: message,
            code: null,
            url: '',
        }
    }

    get canResumePrint(): boolean {
        return this.printer_state === 'paused'
    }

    get canCancelPrint(): boolean {
        const filename = this.$store.state.printer.print_stats?.filename ?? ''
        return filename !== '' && ['printing', 'paused', 'error'].includes(this.printer_state)
    }

    @Watch('activeModalEntryIds', { immediate: true })
    activeModalEntryIdsChanged(): void {
        const activeIds = this.activeModalEntries.map((entry) => entry.id)
        this.dismissedModalIds = this.dismissedModalIds.filter((id) => activeIds.includes(id))
        this.syncDialogVisibility()
    }

    @Watch('currentEntryId')
    currentEntryIdChanged(): void {
        this.syncDialogVisibility()
    }

    dismissModal(): void {
        if (this.currentEntry) this.dismissedModalIds = [...this.dismissedModalIds, this.currentEntry.id]
        this.showDialog = false
        this.$nextTick(() => this.syncDialogVisibility())
    }

    resumePrint(): void {
        this.$socket.emit('printer.print.resume', {}, { loading: 'bambuHmsResumePrint' })
    }

    cancelPrint(): void {
        this.$socket.emit('printer.print.cancel', {}, { loading: 'bambuHmsCancelPrint' })
    }

    private syncDialogVisibility(): void {
        this.showDialog = this.currentEntry !== null
    }

    private toModalEntry(entry: ServerAnnouncementsStateEntry): BambuModalEntry {
        return {
            id: entry.entry_id,
            source: entry.source,
            title: entry.title,
            description: entry.description,
            code: this.formatCode(entry),
            url: entry.url,
        }
    }

    private formatCode(entry: ServerAnnouncementsStateEntry): string | null {
        const printError = /^PE_([0-9a-fA-F]{8})$/.exec(entry.entry_id)
        if (printError) return `${printError[1].slice(0, 4)}-${printError[1].slice(4)}`.toUpperCase()

        const hmsCode = /^[0-9a-fA-F]{4}_[0-9a-fA-F]{4}_[0-9a-fA-F]{4}_[0-9a-fA-F]{4}$/.exec(
            entry.entry_id
        )
        if (hmsCode) return entry.entry_id.toUpperCase()

        const textCode = /\b[0-9a-fA-F]{4}-[0-9a-fA-F]{4}\b/.exec(`${entry.title} ${entry.description}`)
        return textCode?.[0].toUpperCase() ?? null
    }
}
</script>

<style scoped>
.bambu-hms-modal {
    background: #232323;
}

.bambu-hms-modal__toolbar {
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.bambu-hms-modal__body {
    line-height: 1.55;
    white-space: pre-wrap;
}

.bambu-hms-modal__actions {
    flex-wrap: wrap;
    gap: 8px;
}
</style>
